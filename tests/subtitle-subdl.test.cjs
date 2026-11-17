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
    const ctx=load(),calls=[],config={language,thunder:true,subdl:true,subdlKey:'key',assrt:true,assrtToken:'token'},good={source:'SubDL',name:'电影.2000.简体.srt',language:'zh-cn',titleMatched:true};
    const service={thunderSearch:async()=>{calls.push('thunder');return []},subdlSearch:async()=>{calls.push('subdl');return [good]},assrtSearch:async()=>{calls.push('assrt');return []}};
    const r=movie();await ctx.searchSubtitleSources(r,config,service,{});assert.deepEqual(calls,['thunder','subdl']);assert.equal(r.selectedCandidate,good);assert.ok(r.sources.find(s=>s.name==='Assrt 片名搜索').deferred);
    good.downloadFailed=true;await ctx.searchSubtitleSources(r,config,service,{},()=>{},()=>{},true);assert.deepEqual(calls,['thunder','subdl','assrt']);
    const paused=new Map();service.searchUnavailable=n=>paused.get(n);service.pauseSearchSource=(n,e)=>paused.set(n,e);service.subdlSearch=async()=>{calls.push('bad-key');throw Object.assign(Error('Not authorized'),{status:403})};
    await ctx.searchSubtitleSources(movie(),config,service,{});await ctx.searchSubtitleSources(movie(),config,service,{});assert.equal(calls.filter(c=>c==='bad-key').length,1,'Invalid key pauses remaining batch');
    console.log('PASS SubDL orchestration: after Thunder, reliable deferral, download fallback and invalid-key batch pause');
}
(async()=>{await searchAndTransfer();await episodesAndArchives();await orchestration();})().catch(e=>{console.error(e);process.exitCode=1});
