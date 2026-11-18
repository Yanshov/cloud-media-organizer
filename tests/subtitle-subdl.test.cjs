const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), zlib = require('node:zlib');
const source = fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part = (a,b) => { const start=source.indexOf(a),end=source.indexOf(b,start); assert.ok(start>=0&&end>start,a); return source.slice(start,end); };
const language = 'zh-cn,zh-tw,zh';
const text = '1\n00:00:01,000 --> 00:03:00,000\n合成中文字幕 Test\n', body = new TextEncoder().encode(text);
const movie = () => ({node:{name:'电影.2000.mkv'},parsed:{query:'电影',year:2000,tv:false},sources:[],candidates:[]});
const sub = (name,extras={}) => ({name,url:'/subtitle/'+encodeURIComponent(name),language:'ZH',releases:[name.replace(/\.(?:srt|ass|zip)$/i,'')],...extras});
function load(extras={}) {
    const ctx=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,Blob,DecompressionStream,Date,sleep:async()=>{},paced:(_ms,fn)=>fn,...extras});
    vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    function subtitleRemoteJson(', '    function subtitleDrive('),ctx); return ctx;
}
function crc32(bytes) { let n=0xffffffff;for(const byte of bytes){n^=byte;for(let b=0;b<8;b++) n=n>>>1^(n&1?0xedb88320:0);}return (n^0xffffffff)>>>0; }
function zip(entries, method=8) {
    const chunks=[],directory=[];let offset=0;
    for(const [name,text] of entries) {
        const data=Buffer.from(text),compressed=method===8?zlib.deflateRawSync(data):data,n=Buffer.from(name),local=Buffer.alloc(30),central=Buffer.alloc(46);
        local.writeUInt32LE(0x04034b50);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt32LE(crc32(data),14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
        central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt32LE(crc32(data),16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);
        chunks.push(local,n,compressed);directory.push(central,n);offset+=30+n.length+compressed.length;
    }
    const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
    return new Uint8Array(Buffer.concat([...chunks,dir,end]));
}
async function localArchives() {
    const ctx = load();
    vm.runInContext(part('    async function readSubtitleImport(', '    function initSubtitles('),ctx);
    const local = (name,bytes) => ({name,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer});
    const safe = zip([['Subs/电影.2000.简体.srt',text],['README.txt','notes'],['Cover.jpg','image data']]);
    const [item] = await ctx.readSubtitleImport([local('字幕.zip',safe)],()=>{});
    assert.equal(item.name,'电影.2000.简体.srt');
    assert.equal(ctx.subtitleValidateContent(movie(),item.bytes,item.ext,language).text,text);

    const reject = async (bytes,pattern) => {
        const [archive,standalone] = await ctx.readSubtitleImport([local('坏包.zip',bytes),local('电影.2000.srt',body)],()=>{});
        assert.match(archive.error,pattern);
        assert.equal(standalone.ext,'srt');
    };
    for (const name of ['../电影.srt','/根目录/电影.srt','C:\\电影.srt','内层.zip']) {
        await reject(zip([[name,text]]),/不安全路径|嵌套/);
    }
    await reject(zip([['Subs/A.srt',text],['subs/a.srt',text]]),/重复或冲突/);
    await reject(zip([['Subs',text],['Subs/A.srt',text]]),/目录路径冲突/);
    const encrypted = zip([['a.srt',text]]);
    const centralOffset = bytes => new DataView(bytes.buffer,bytes.byteOffset).getUint32(bytes.length-6,true);
    const central = centralOffset(encrypted);
    encrypted[central+8] |= 1;
    await reject(encrypted,/加密/);
    const damaged = zip([['a.srt',text],['b.srt',text]],0);
    damaged[30 + 'a.srt'.length] ^= 1;
    await reject(damaged,/不完整/);
    await reject(new Uint8Array(4),/不完整/);
    await reject(zip(Array.from({length:201},(_,i)=>['caption'+i+'.srt',text])),/200/);
    await reject(zip([['a.srt','中'.repeat(1500000)]]),/4 MiB/);
    await reject(zip([['a.srt','中'.repeat(120000)]]),/压缩比/);
    const expanded = zip(Array.from({length:9},(_,i)=>['item'+i+'.srt',text]));
    const view = new DataView(expanded.buffer);
    let offset = centralOffset(expanded);
    for (let i=0;i<9;i++) {
        const header = view.getUint32(offset+42,true);
        view.setUint32(offset+20,32768,true);
        view.setUint32(offset+24,4*1024*1024,true);
        offset += 46 + view.getUint16(offset+28,true);
        // The first eight entries instead keep valid local data and header sizes.
        if (i < 8) {
            view.setUint32(header+18,32768,true);
            view.setUint32(header+22,4*1024*1024,true);
        }
    }
    // A compressed archive can claim much more data than it contains. Reject its structure before decoding.
    await reject(expanded,/不完整/);
    const noisy = Buffer.alloc(3750000);
    let random = 2463534242;
    for (let i=0;i<noisy.length;i++) {
        random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
        noisy[i] = i % 12 === 0 ? random & 0xff : 65;
    }
    await reject(zip(Array.from({length:9},(_,i)=>['entry'+i+'.srt',noisy])),/累计解压大小/);
    await assert.rejects(ctx.readSubtitleImport([local('字幕.zip',safe)],()=>{throw Error('已停止');}),/已停止/);
    const [oversize] = await ctx.readSubtitleImport([{name:'过大.zip',size:16*1024*1024+1,arrayBuffer:()=>assert.fail('Must check before reading')}],()=>{});
    assert.match(oversize.error,/16 MiB/);
    console.log('PASS local ZIP limits, CRC, independent-file recovery and bounded extraction');
}
async function searchAndTransfer() {
    const requests=[],logs=[];let response={status:true,totalPages:1,subtitles:[
        sub('电影.2000.简体&英文.srt'), sub('电影.2000.繁体.srt',{language:'ZH_BG'}),sub('电影2.2000.srt'),sub('电影.1999.srt'),sub('无关作品.2000.srt'),sub('电影.S01E01.srt'),sub('电影.2000.srt',{language:'DE'}),sub('电影.2000.rar'),
        sub('123.zip',{releases:['电影.2000'],unpack_files:[{name:'电影.2000.简体.srt',url:'/unpacked/file.srt'}]}),
        sub('456.zip',{releases:['电影.2000']})]};let transfer=body;
    const ctx=load({GM_xmlhttpRequest:o=>{requests.push(o);if(new URL(o.url).hostname==='api.subdl.com')o.onload({status:200,responseText:JSON.stringify(response)});else o.onload({status:200,response:transfer.buffer});}});
    const service=ctx.createSubtitleService({log:(a,b)=>logs.push(a+' '+b)}),config={language,subdlKey:'secret-key'},r=movie();
    let candidates=await service.subdlSearch(r,config);
    assert.equal(candidates.length,4,'Strict title, sequel, year, episode, language and format filtering');
    const query=new URL(requests[0].url).searchParams;assert.equal(query.get('film_name'),'电影');assert.equal(query.get('languages'),'ZH,ZH_BG');assert.equal(query.get('unpack'),'1');assert.equal(query.get('type'),'movie');assert.equal(query.get('bazarr'),null,'Do not impersonate Bazarr');
    assert.ok(requests[0].anonymous);assert.equal(requests[0].headers.Authorization,undefined);assert.ok(logs.every(line=>!line.includes('secret-key')));
    assert.ok(candidates.every(c=>c.titleMatched));r.candidates=candidates;ctx.selectSubtitleCandidate(r,language);assert.match(r.selectedCandidate.name,/简体&英文/);
    const fetched=await service.fetchFile(r.selectedCandidate,config);assert.equal(ctx.subtitlePayload(fetched.bytes,fetched.result.ext,language),text);
    const download=requests.at(-1);assert.equal(new URL(download.url).hostname,'dl.subdl.com');assert.equal(download.anonymous,true);assert.deepEqual(Object.keys(download.headers),[]);assert.ok(!download.url.includes('secret-key'));
    await service.subdlSearch(r,config);assert.equal(requests.filter(o=>new URL(o.url).hostname==='api.subdl.com').length,1);
    const archive=candidates.find(c=>c.ext==='zip');transfer=zip([['电影.2000.繁体.srt',text],['电影.2000.简体&英文.srt',text],['电影2.2000.简体.srt',text]]);
    const unpacked=await service.fetchFile(archive,config);assert.match(unpacked.result.fileName,/简体&英文/);assert.equal(unpacked.result.ext,'srt');assert.equal(ctx.subtitlePayload(unpacked.bytes,'srt',language),text);
    service.logout();transfer=new TextEncoder().encode('<html>access denied</html>');await assert.rejects(service.fetchFile(archive,config),/ZIP/);
    service.logout();response={status:true,totalPages:10,subtitles:Array.from({length:30},(_,i)=>sub('电影.2000.简体.srt',{url:'/same/'+i}))};
    const before=requests.length;await service.subdlSearch(movie(),config);assert.equal(requests.length-before,2,'At most two pages');
    service.logout();response={status:false,statusCode:403,error:'not_authorized'};await assert.rejects(service.subdlSearch(movie(),config),e=>e.status===403);
    service.logout();response={status:false,error:"Can't find movie"};assert.equal((await service.subdlSearch(movie(),config)).length,0);
    service.logout();response={status:true,subtitles:[],results:[{type:'movie',tmdb_id:999,year:2000}]};
    await assert.rejects(service.subdlSearch({...movie(),parsed:{...movie().parsed,tmdbId:10}},config),/编号/);
    console.log('PASS SubDL: API parameters, strict matches, direct unpack links, ZIP download/preference/validation, page/cache bounds, errors and credential isolation (mocked API, synthetic subtitles)');
}
async function nameFallback() {
    let mode = 'alias';
    const requests = [], foundWork = {tmdb_id:10,name:'Film',type:'movie',year:2000};
    const ctx = load({GM_xmlhttpRequest:request => {
        const query = new URL(request.url).searchParams;
        requests.push(query.get('tmdb_id') || query.get('film_name'));
        const fixture = mode === 'blocked' ? {status:false,error:'not_authorized'}
            : mode === 'wrong' ? {status:true,results:[{...foundWork,tmdb_id:11},foundWork],subtitles:[sub('电影.2000.简体.srt')]}
            : query.get('film_name') === 'Film' ? {status:true,results:[foundWork,{...foundWork,tmdb_id:11}],subtitles:[sub('电影.2000.简体.srt')]}
                : {status:true,subtitles:[]};
        request.onload({status:200,responseText:JSON.stringify(fixture)});
    }});
    const config = {language,subdlKey:'key'}, target = movie(), service = ctx.createSubtitleService();
    Object.assign(target.parsed,{tmdbId:10,aliases:['Film']});
    assert.equal((await service.subdlSearch(target,config)).length,1);
    assert.deepEqual(requests,['10','电影','Film']);
    for (const [next,expected] of [['wrong',/编号/],['blocked',/403/]]) {
        mode = next; requests.length = 0; service.logout();
        await assert.rejects(service.subdlSearch(target,config),expected);
        assert.deepEqual(requests,['10']);
    }
}
async function episodesAndArchives() {
    let data={status:true,subtitles:[sub('pack.zip',{releases:['剧名'],unpack_files:[{name:'剧名.S02E01.简体.srt',url:'/s1',season:2,episode:1},{name:'剧名.S02E02.简体.srt',url:'/s2',season:2,episode:2}]})]};
    const ctx=load({GM_xmlhttpRequest:o=>o.onload({status:200,responseText:JSON.stringify(data)})}),service=ctx.createSubtitleService(),config={language,subdlKey:'test'};
    const r={...movie(),parsed:{query:'剧名',year:2000,tv:true,season:2,episode:1}};
    const candidates=await service.subdlSearch(r,config);assert.equal(candidates.length,1);assert.match(candidates[0].name,/E01/);
    service.logout();data={status:true,subtitles:[sub('pack.zip',{releases:['剧名'],unpack_files:[
        {name:'剧名.S02E01.简体.srt',url:'/unknown-season',season:0,episode:0},
        {name:'剧名.S02E01.简体.srt',url:'/conflicting-season',season:1,episode:1}
    ]})]};
    const unknownSeason=await service.subdlSearch(r,config);assert.equal(unknownSeason.length,1,'Unknown season metadata may use the exact filename; conflicting positive seasons remain rejected');assert.match(unknownSeason[0].url,/unknown-season/);
    const archive={...candidates[0],name:'pack.zip',ext:'zip',subdlFields:['剧名']};
    for(const method of [0,8]) {
        const file=await ctx.subtitleSubdlArchive(zip([['剧名.S02E02.简体.srt',text],['剧名.S02E01.简体.srt',text],['剧名.S02E01-E02.简体.srt',text]],method),archive,language);
        assert.equal(file.name,'剧名.S02E01.简体.srt');assert.equal(new TextDecoder().decode(file.bytes),text);
    }
    await assert.rejects(ctx.subtitleSubdlArchive(zip([['剧名.S02E02.简体.srt',text]]),archive,language),/没有通过/);
    const bad=zip([['剧名.S02E01.简体.srt',text]],0);bad[30+Buffer.byteLength('剧名.S02E01.简体.srt')]^=1;
    await assert.rejects(ctx.subtitleSubdlArchive(bad,archive,language),/不完整/);
    const encrypted=zip([['剧名.S02E01.简体.srt',text]]);const end=encrypted.length-22,v=new DataView(encrypted.buffer),start=v.getUint32(end+16,true);v.setUint16(start+8,0x801,true);
    await assert.rejects(ctx.subtitleSubdlArchive(encrypted,archive,language),/没有通过/);
    await assert.rejects(ctx.subtitleSubdlArchive(zip([['剧名.S02E01.简体.srt',text]]),archive,language,()=>{throw Error('已停止')}),/已停止/);
    console.log('PASS SubDL episodes/archives: exact episode only, stored/deflated ZIP, CRC/encryption rejection and cancellation');
}
async function orchestration() {
    const ctx=load(),calls=[],config={language,thunder:true,subdl:true,subdlKey:'key',open:true,key:'token'},good={source:'SubDL',name:'电影.2000.简体.srt',language:'zh-cn',titleMatched:true};
    const service={thunderSearch:async()=>{calls.push('thunder');return []},subdlSearch:async()=>{calls.push('subdl');return [good]},search:async()=>{calls.push('open');return []}};
    const r=movie();await ctx.searchSubtitleSources(r,config,service,{});assert.deepEqual(calls,['thunder','subdl']);assert.equal(r.selectedCandidate,good);assert.ok(r.sources.find(s=>s.name==='OpenSubtitles').deferred);
    good.downloadFailed=true;await ctx.searchSubtitleSources(r,config,service,{},()=>{},()=>{},true);assert.deepEqual(calls,['thunder','subdl','open']);
    const paused=new Map();service.searchUnavailable=n=>paused.get(n);service.pauseSearchSource=(n,e)=>paused.set(n,e);service.subdlSearch=async()=>{calls.push('bad-key');throw Object.assign(Error('Not authorized'),{status:403})};
    await ctx.searchSubtitleSources(movie(),config,service,{});await ctx.searchSubtitleSources(movie(),config,service,{});assert.equal(calls.filter(c=>c==='bad-key').length,1,'Invalid key pauses remaining batch');
    console.log('PASS SubDL orchestration: after Thunder, reliable deferral, download fallback and invalid-key batch pause');
}
(async()=>{await localArchives();await searchAndTransfer();await nameFallback();await episodesAndArchives();await orchestration();})().catch(e=>{console.error(e);process.exitCode=1});
