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
const language = 'zh-cn,zh-tw,zh';
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
(async()=>{identityAndLanguages();await tmdbAliases()})().catch(error=>{console.error(error);process.exitCode=1});
