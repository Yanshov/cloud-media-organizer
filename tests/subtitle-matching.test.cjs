const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a,b) => {
    const start = source.indexOf(a), end = source.indexOf(b,start);
    assert.ok(start >= 0 && end > start,a);
    return source.slice(start,end);
};
const language = 'zh-cn,zh-tw,zh', config = {assrtToken:'mock',language};
function load(extra = {}) {
    const ctx = vm.createContext({URL,URLSearchParams,Date,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,
        paced:(_ms,fn)=>fn,sleep:async()=>{},GM_getValue:(_key,value)=>value,GM_setValue(){},...extra});
    vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')
        + part('    function subtitleDownloadUrl(', '    function subtitleDrive(')
        + fs.readFileSync(path.join(__dirname,'../src/works.js'),'utf8'),ctx);
    return ctx;
}
const row = (query='指环王2：双塔奇兵',year=2002,aliases=[]) => ({node:{name:query+'.'+year+'.mkv'},parsed:{query,year,aliases,tv:false}});
const pack = (id,native_name,names,videoname='') => ({id,native_name,videoname,lang:{langlist:{langchs:true}},filelist:names.map(f=>({f}))});
function identityAndLanguages() {
    const ctx = load(), match = (parsed,fields,name) => ctx.subtitleWorkIdentity(parsed,fields,name);
    const target = row().parsed;
    assert.equal(match(target,['指环王：双塔奇兵'],'指环王：双塔奇兵.2002.chs.srt').titleMatched,true,'Number stripped only before a subtitle');
    assert.equal(match(target,['指环王：双塔奇兵/The Lord of the Rings: The Two Towers'],'The.Lord.of.the.Rings.The.Two.Towers.2002.chs.srt').titleMatched,true,'Variant also learns the package English alias');
    const mixed = match(target,[], '[指环王2：双塔奇兵].The.Lord.Of.The.Rings.The.Two.Towers.2002.BluRay.1080p.x264-CHD.中文.srt');
    assert.equal(mixed.titleMatched,true);
    assert.ok(mixed.aliases.includes(ctx.titleKey('The Lord Of The Rings The Two Towers')),'Learn English half from exact Chinese half');
    const reverse = match({query:'The Lord Of The Rings The Two Towers',year:2002},[], '[指环王2：双塔奇兵].The.Lord.Of.The.Rings.The.Two.Towers.2002.chs.srt');
    assert.equal(reverse.titleMatched,true,'Either script can be the trusted half');
    for (const [query,other] of [['疾速追杀2','疾速追杀'],['疾速追杀','疾速追杀2'],['小丑','小丑2'],['小丑2','小丑']]) {
        assert.equal(match({query},[other],other+'.chs.srt').titleMatched,false,query+' must not become '+other);
    }
    assert.equal(match(target,['指环王2：双塔奇兵'],'指环王2：双塔奇兵.2003.chs.srt').hardMismatch,true);
    assert.equal(match(target,['指环王2：双塔奇兵.2003'],'01.chs.srt').hardMismatch,true);
    assert.equal(match(target,['指'],'Schmigadoon.2002.chs.srt').related,false,'An abbreviated package label cannot make an unrelated filename relevant');
    assert.equal(ctx.subtitleQueryTitle('银翼杀手2049.2017',2017),'银翼杀手2049');
    const foreign = {German:'de',Spanish:'es',French:'fr',Italian:'it',Portuguese:'pt',Russian:'ru',Japanese:'ja',Korean:'ko',Arabic:'ar',Thai:'th',Vietnamese:'vi',Indonesian:'id',Dutch:'nl',Polish:'pl',Turkish:'tr',Hindi:'hi',Greek:'el',Hebrew:'he',Finnish:'fi',Estonian:'et',Hungarian:'hu',Swedish:'sv',Danish:'da',Norwegian:'no',Czech:'cs',Romanian:'ro'};
    for (const [name,code] of Object.entries(foreign)) assert.equal(ctx.subtitleFileInfo('10_'+name+'.srt','zh-cn').language,code,name);
    assert.equal(ctx.subtitleFileInfo('Film.简体&英文.ass','zh-tw').language,'zh-cn');
    console.log('PASS matching identity: numbered subtitles, mixed-script alias learning, sequel/year guards and all 26 foreign language names');
}
async function realLogSamples() {
    const tlf = 'The.Lord.of.the.Rings.The.Two.Towers.2002.EE.BDRip.X264.iNT-TLF';
    const chd = '[指环王2：双塔奇兵].The.Lord.Of.The.Rings.The.Two.Towers.2002.BluRay.1080p.DTSMA.2Audio.x264-CHD';
    const samples = [
        pack(1,'魔戒2：双塔奇兵/魔戒二部曲：双塔奇兵/魔戒二部曲：双城奇谋/指环王2：双塔奇谋/The Lord of the Rings: The Two Towers（加长版）', [tlf+'.chs.srt',tlf+'.cht.srt',tlf+'.eng.srt'],tlf),
        pack(2,'The lord of the ring/魔戒1-3/指环王1-3',[chd+'.中文.srt',chd+'.中英文双语.srt',
            '[指环王3：王者无敌].The.Lord.Of.The.Rings.The.Return.of.the.King.2003.BluRay.1080p.DTSMA.2Audio.x264-CHD.英文.srt',
            '[指环王1：护戒使者].The.Lord.Of.The.Rings.The.Fellowship.of.the.Ring.2001.BluRay.1080p.DTSHD-MA.DualAudio.x264-CHD.中英文双语.srt'])
    ];
    for (const sample of samples) {
        // TLF uses another Chinese translation; supply the English original verified by TMDB below.
        const ctx = load({subtitleRemoteJson:async()=>({status:0,sub:{subs:[sample]}})}), r = row(undefined,undefined,sample.id===1?['The Lord of the Rings: The Two Towers']:[]);
        r.candidates = await ctx.createSubtitleService().assrtSearch(r,config); ctx.selectSubtitleCandidate(r,language);
        assert.ok(r.selectedCandidate,'Real TLF/CHD resource must auto-select');
        assert.ok(r.selectedCandidate.language==='zh-cn' || r.selectedCandidate.bilingual);
        assert.ok(r.candidates.every(c=>c.titleMatched && !/\.200[13]\./.test(c.name)));
        if (sample.id===2) assert.equal(r.selectedCandidate.bilingual,true,'CHD bilingual outranks plain Chinese');
    }
    console.log('PASS matching log samples: TLF simplified and CHD bilingual auto-select; other trilogy years excluded');
}
async function queryFallbacks() {
    const queries=[];
    const ctx = load({subtitleRemoteJson:async raw=>{
        const q = new URL(raw).searchParams.get('q'); queries.push(q);
        return {status:0,sub:{subs:q==='Eight Immortals' ? [pack(5,'Eight Immortals',['Eight.Immortals.2026.chs.srt'])] : []}};
    }});
    const service=ctx.createSubtitleService(), r=row('八仙！',2026,['Eight Immortals']);
    r.candidates=await service.assrtSearch(r,config); ctx.selectSubtitleCandidate(r,language);
    assert.deepEqual(queries,['八仙','Eight Immortals']); assert.ok(r.selectedCandidate);
    assert.equal(r.parsed.query,'八仙！','Identity title is untouched');
    await service.assrtSearch(row('八仙！',2026,['Eight Immortals']),config);
    assert.equal(queries.length,2,'Each fallback uses the normal search-page cache');
    const dirty='片名！：＂（）｜＠～＾／＜＞＝＊!"()|@~^/<> =*“”';
    const punctuation=load({subtitleRemoteJson:async raw=>{const q=new URL(raw).searchParams.get('q');assert.equal(q,'片名');return {status:0,sub:{subs:[]}}}});
    await punctuation.createSubtitleService().assrtSearch(row(dirty),config);
    const manualQueries=[];
    const manual=load({subtitleRemoteJson:async raw=>{const q=new URL(raw).searchParams.get('q');manualQueries.push(q);return {status:0,sub:{subs:q==='指环王2'?[pack(10,'指环王2：双塔奇兵',['指环王2：双塔奇兵.2002.chs.srt'])]:[]}}}});
    const m=row(undefined,undefined,['The Lord of the Rings The Two Towers']);
    m.candidates=await manual.createSubtitleService().assrtSearch(m,config);manual.selectSubtitleCandidate(m,language);
    assert.deepEqual(manualQueries,['指环王2 双塔奇兵','The Lord of the Rings The Two Towers','指环王2']);
    assert.equal(m.candidates.length,1);assert.equal(m.selectedCandidate,null);
    assert.equal(m.candidates[0].mainTitleFallback,true);assert.equal(m.candidates[0].titleMatched,false);
    assert.equal(manual.subtitleAICandidate({index:0,confidence:1},m,language),null,'Main-title fallback must also require confirmation when AI is enabled');
    let pageCalls=0;
    const bounded=load({subtitleRemoteJson:async raw=>{const u=new URL(raw);pageCalls++;return {status:0,sub:{subs:Array.from({length:15},(_,i)=>pack(u.searchParams.get('q')+u.searchParams.get('pos')+i,'错片.1990',['错片.1990.chs.srt']))}}}});
    await bounded.createSubtitleService().assrtSearch(row(undefined,undefined,['English Original']),config);
    assert.equal(pageCalls,15,'Every one of three search terms has its own five-page bound');
    console.log('PASS matching queries: fullwidth/ASCII punctuation removed only outbound; English then main-title fallback; cached pages, per-term bound and manual-only main fallback');
}
async function unrelatedCandidates() {
    const logs=[], noise=['里番合集','动画 OP ED 合集','Schmigadoon'];
    const items=noise.map((name,i)=>pack(i+1,name,Array.from({length:30},(_,j)=>`${name}.${j}.2002.chs.srt`)));
    items.push(pack(9,'指环王2：双塔奇兵 候选合集',Array.from({length:65},(_,j)=>`指环王2：双塔奇兵.待确认版本${j}.2002.chs.srt`)));
    const ctx=load({subtitleRemoteJson:async()=>({status:0,sub:{subs:items}})});
    const found=await ctx.createSubtitleService({log:(...args)=>logs.push(args)}).assrtSearch(row(),config);
    assert.equal(found.length,60,'Unrelated resources do not consume the 60 related-uncertain slots');
    assert.ok(found.every(c=>!noise.some(name=>c.name.includes(name)) && !c.titleMatched));
    assert.match(logs.at(-1)[1],/内容 60，无关 30/);assert.match(logs.at(-1)[1],/待确认上限 5/);
    const failed=load({subtitleRemoteJson:async raw=>new URL(raw).pathname.endsWith('/detail')?Promise.reject(Error('HTTP 509')):{status:0,sub:{subs:[{id:1,native_name:'Schmigadoon'}]}}});
    assert.equal((await failed.createSubtitleService().assrtSearch(row(),config)).length,0,'Unrelated detail errors do not become choices');
    console.log('PASS matching relevance: hentai, anime OP/ED and Schmigadoon excluded and counted before uncertain cap; unrelated detail failure excluded');
}
async function tmdbAliases() {
    const ctx=load(), calls=[];
    vm.runInContext('const tmdbClients = new Map();'+part('    function tmdbClient(', '    function mediaGuangyaPost('),ctx);
    const hit={id:121,media_type:'movie',title:'指环王2：双塔奇兵',original_title:'The Lord of the Rings: The Two Towers',release_date:'2002-12-18'};
    let results=[hit],english={id:121,title:hit.original_title,release_date:hit.release_date};
    ctx.requestJson=async raw=>{const u=new URL(raw);calls.push(u);return u.pathname.endsWith('/search/multi')?{results,total_pages:1}:u.searchParams.get('language')==='en-US'?english:results[0]};
    const parsed=row().parsed;
    assert.equal(await ctx.resolveMediaWork(parsed,'mock-key'),true);
    assert.ok(parsed.aliases.includes(hit.original_title));assert.equal(parsed.tmdbId,'121','Unique exact name, type and year now use the shared confirmed work identity');
    assert.equal(await ctx.resolveMediaWork(row().parsed,'mock-key'),true);assert.equal(calls.length,3,'Real tmdbClient search/detail caches reused');
    assert.equal(calls[2].searchParams.get('language'),'en-US');
    assert.equal(await ctx.resolveMediaWork(row().parsed,''),true,'Confirmed persistent metadata works without another API request');assert.equal(calls.length,3,'No key skips TMDB');
    assert.equal(await ctx.resolveMediaWork({query:hit.title},'mock-key'),false);assert.equal(calls.length,3,'No known year cannot verify');
    for (const [name,list] of [
        ['ambiguous',[hit,{...hit,id:122}]],['year conflict',[{...hit,release_date:'2003-01-01'}]],
        ['wrong title',[{...hit,title:'指环王',original_title:'Other'}]],['wrong media type',[{...hit,media_type:'tv',first_air_date:'2002-01-01'}]]
    ]) {
        ctx.mediaWorkLibrary.instance=null;results=list;const r=row().parsed;
        assert.equal(await ctx.resolveMediaWork(r,name),false,name);assert.equal(r.aliases.length,0,name);
    }
    ctx.mediaWorkLibrary.instance=null;results=[hit];english={...english,id:122};await assert.rejects(ctx.resolveMediaWork(row().parsed,'bad-detail'),/编号或年份/);
    english={id:121,title:hit.original_title,release_date:'2003-01-01'};await assert.rejects(ctx.resolveMediaWork(row().parsed,'bad-year'),/编号或年份/);
    english={id:121,title:hit.original_title,release_date:hit.release_date};
    const stopped=row().parsed;
    await assert.rejects(ctx.resolveMediaWork(stopped,'stopped',()=>{throw Error('已停止')}),/已停止/);assert.equal(stopped.aliases.length,0);
    results=[{id:20,media_type:'tv',name:'测试剧',original_name:'Test Show',first_air_date:'2020-01-01'}];
    english={id:20,name:'Test Show',first_air_date:'2020-01-01'};
    const tv={query:'测试剧',year:2020,tv:true};assert.equal(await ctx.resolveMediaWork(tv,'tv-key'),true);assert.ok(tv.aliases.includes('Test Show'));
    console.log('PASS matching TMDB aliases: unique same-type/title/year, English names, real client cache, no-key skip, ambiguous/year/type/ID rejection and cancellation');
}
(async()=>{identityAndLanguages();await realLogSamples();await queryFallbacks();await unrelatedCandidates();await tmdbAliases()})().catch(error=>{console.error(error);process.exitCode=1});
