const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('cloud-media-organizer-v3.user.js','utf8');
const part = (a,b) => source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const language = 'zh-cn,zh-tw,zh';
function load(extra = {}) {
    const ctx = vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,Blob,Date,
        sleep:async()=>{},paced:(_ms,fn)=>fn,...extra});
    vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    function subtitleRemoteJson(', '    function subtitleDrive('),ctx);
    Object.assign(ctx,extra);
    return ctx;
}
const row = episode => ({node:{name:`剧名.2020.S01E${String(episode).padStart(2,'0')}.mkv`},
    parsed:{query:'剧名',year:2020,tv:true,season:1,episode,tmdbId:'42'},sources:[],candidates:[]});
const body = n => `1\n00:00:01,000 --> 00:20:00,000\n第${n}集的合成中文字幕\n`;
function zip(entries) {
    const parts=[],directory=[]; let offset=0;
    for (const [name,text] of entries) {
        const n=Buffer.from(name),bytes=Buffer.from(text),local=Buffer.alloc(30),central=Buffer.alloc(46);
        let crc=0xffffffff; for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc>>>1^(crc&1?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
        local.writeUInt32LE(0x04034b50);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(n.length,26);
        central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x800,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);
        parts.push(local,n,bytes);directory.push(central,n);offset+=30+n.length+bytes.length;
    }
    const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
    return new Uint8Array(Buffer.concat([...parts,dir,end]));
}
async function seasonArchive() {
    const queries=[],downloads=[],logs=[];
    const bytes=zip([['02.zh-cn.srt',body(2)],['剧名.S01E03.简体.srt',body(3)],['Season 02/01.zh-cn.srt',body('错误季')],['Extras/01.zh-cn.srt',body('花絮')]]);
    const pack={name:'剧名.S01.zip',url:'/pack.zip',language:'ZH',season:1,full_season:true,releases:['剧名 S01']};
    const ctx=load({GM_xmlhttpRequest:o=>{
        const u=new URL(o.url);
        if(u.hostname==='api.subdl.com') {
            queries.push(u);o.onload({status:200,responseText:JSON.stringify({status:true,results:[{tmdb_id:42,type:'tv'}],subtitles:u.searchParams.has('episode_number')?[]:[pack]})});
        } else {downloads.push(u);o.onload({status:200,response:bytes.buffer});}
    }});
    const service=ctx.createSubtitleService({log:(a,b)=>logs.push([a,b])}),config={language,subdl:true,subdlKey:'private'};
    const rows=[row(1),row(2),row(3)];
    await service.prepareSeason(rows,config);
    assert.equal(queries.length,1);assert.equal(queries[0].searchParams.get('full_season'),'1');assert.equal(queries[0].searchParams.get('episode_number'),null);
    assert.equal(downloads.length,1,'ZIP indexed once even when first episode is missing');
    await service.prepareSeason(rows,config);assert.equal(queries.length,1);assert.equal(downloads.length,1);
    for (const r of rows) await ctx.searchSubtitleSources(r,config,service);
    assert.equal(rows[0].selectedCandidate,null,'Other-season and extra files must not fill the missing episode');
    assert.ok(rows[1].selectedCandidate);assert.ok(rows[2].selectedCandidate);
    assert.equal(queries.length,3,'Only missing E01 gets an ID query and a bounded name fallback'); assert.ok(queries.slice(1).every(url=>url.searchParams.get('episode_number')==='1'));
    for(const r of rows.slice(1)) {
        const data=await service.fetchFile(r.selectedCandidate,config);
        assert.equal(new TextDecoder().decode(data.bytes),body(r.parsed.episode));
    }
    assert.equal(downloads.length,1,'All selected episodes reuse the downloaded archive');
    const before=queries.length;
    assert.equal((await service.subdlCachedEpisode({...row(2),parsed:{...row(2).parsed,season:2}},config)).length,0);
    assert.equal((await service.subdlCachedEpisode(row(2),{...config,subdlKey:'other'})).length,0);
    assert.equal(queries.length,before,'Cache probes cannot issue network calls or cross keys/seasons');
    await assert.rejects(service.fetchFile(rows[1].selectedCandidate,config,()=>{},()=>{throw Error('已停止')}),/已停止/);
    assert.equal(downloads.length,1);
    service.logout();assert.equal((await service.subdlCachedEpisode(row(2),config)).length,0);
    console.log('PASS season plan: one season request/one ZIP for several episodes, missing-first-episode fallback only, numeric filenames, wrong-season/extras rejection, key isolation, stop and logout');
}
async function seasonLists() {
    const requests=[];
    const ctx=load({subtitleRemoteJson:async raw=>{
        const name=new URL(raw).searchParams.get('name'); requests.push(name);
        const episode=name==='剧名 S01'?1:2;
        return {code:0,data:[{name:'剧名.S01E0'+episode+'.简体.srt',ext:'srt',url:'https://example.com/'+episode+'.srt',languages:['简体']}]};
    }}),service=ctx.createSubtitleService(),config={language,thunder:true};
    const rows=[row(1),row(2)];
    for(const target of rows) target.parsed.aliases=['Series','第三名称'];
    await service.prepareSeason(rows,config);
    assert.deepEqual(requests,['剧名 S01','Series S01'],'First-episode hit does not stop a season search');
    assert.equal((await service.thunderCachedEpisode(rows[1],config)).length,1);
    await ctx.searchSubtitleSources(rows[1],config,service); assert.equal(requests.length,2,'The second episode reuses the season list');
    console.log('PASS seasonal file lists: first-episode hit still queries an alias for missing episodes');
}
async function namesAndConcurrency() {
    const pending=[],started=[];let stopped=false;
    const ctx=load({subtitleRemoteJson:raw=>new Promise((resolve,reject)=>{started.push(new URL(raw).searchParams.get('name'));pending.push({resolve,reject});})});
    const service=ctx.createSubtitleService(),r={node:{name:'电影.mkv'},parsed:{query:'中文电影',tv:false,year:2020,aliases:['日本語の映画','Film','第四别名']}};
    const work=service.thunderSearch(r,{language},()=>{},()=>{if(stopped)throw Error('已停止')});
    for(let i=0;i<60;i++)await Promise.resolve();
    assert.deepEqual(started,['中文电影']);
    pending[0].resolve({code:0,data:[]}); for(let i=0;i<60;i++) await Promise.resolve();
    assert.deepEqual(started,['中文电影','日本語の映画']);
    pending[1].resolve({code:0,data:[{name:'日本語の映画.2020.简体.srt',url:'https://example.com/a.srt'}]});
    const candidates=await work; assert.equal(candidates.length,1); assert.ok(candidates[0].titleMatched);
    assert.equal(started.length,2,'Reliable alias defers the third name');
    await service.thunderSearch(r,{language}); assert.equal(started.length,2,'Both queries are cached');
    const next=service.thunderSearch({...r,parsed:{...r.parsed,query:'新片',aliases:['新しい映画','New film']}},{language},()=>{},()=>{if(stopped)throw Error('已停止')});
    const rejection=assert.rejects(next,/已停止/); for(let i=0;i<60;i++)await Promise.resolve();
    stopped=true; pending[2].resolve({code:0,data:[]}); await rejection;
    assert.equal(started.length,3,'Stop waits for the active request and prevents aliases');
    console.log('PASS sequential aliases: bounded requests, cache reuse and cancellation drain');
}
async function unpackedSeason() {
    let searches=0;
    const ctx=load({subtitleRemoteJson:async()=>{searches++;return {status:true,subtitles:[{name:'剧名.S01.zip',language:'ZH',season:1,full_season:true,releases:['剧名 S01'],unpack_files:[
        {name:'02.srt',season:1,episode:2,url:'/2'},
        {name:'03.srt',season:1,episode:2,url:'/bad-number'},
        {name:'剧名.S01E02.srt',season:1,episode:3,url:'/bad-metadata'}
    ]}]};}}),service=ctx.createSubtitleService(),config={language,subdl:true,subdlKey:'key'};
    await service.prepareSeason([row(1),row(2)],config);
    const found=await service.subdlCachedEpisode(row(2),config);
    assert.equal(searches,2,'Only the missing first episode triggers the name fallback after the ID search');assert.equal(found.length,1);assert.equal(found[0].name,'02.srt');assert.ok(found[0].titleMatched);
    console.log('PASS unpacked full seasons: independent file metadata maps numbered files, conflicting numbers and episode metadata rejected');
}
(async()=>{await seasonArchive();await seasonLists();await namesAndConcurrency();await unpackedSeason();})().catch(error=>{console.error(error);process.exitCode=1});
