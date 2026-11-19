const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const language = 'zh-cn,zh-tw,zh';
const body = new TextEncoder().encode('1\n00:00:01,000 --> 00:00:03,000\n中文字幕\n');
const build = path.join(__dirname, '../cloud-media-organizer-v3.user.js');
const cases = [
    {id:'ordinary', query:'标准电影', title:'标准电影', aliases:['Normal Movie'], year:2000},
    {id:'regional', query:'地區譯名', title:'Regional Movie', aliases:['地区片名','Regional Movie'], matchAlias:true, year:2010},
    {id:'numeric', query:'2046', title:'2046', aliases:[], year:2004},
    {id:'year', query:'同名电影', title:'同名电影', aliases:[], year:2000, subtitle:'同名电影.1999.简体.srt', reject:true},
    {id:'sequel', query:'电影', title:'电影', aliases:[], year:2000, subtitle:'电影2.2000.简体.srt', reject:true},
    {id:'special', query:'龙骑特别篇', title:'龙骑特别篇', aliases:[], year:2002},
    {id:'season', query:'系列剧', title:'系列剧', year:2020, season:2, episode:1, subtitle:'系列剧.S01E01.简体.srt', reject:true},
    {id:'range', query:'合并剧', title:'合并剧', year:2020, season:1, episode:1, endEpisode:2, reject:true},
    {id:'correction', query:'混乱文件名', title:'正式片名', year:2003, folder:'正式片名', needsAI:true},
    {id:'ambiguous', query:'未知片名', title:'另一部影片', year:2003, folder:'正式片名', needsAI:true, reject:true},
    {id:'manual', query:'待确认影片', title:'待确认影片', year:2003, subtitle:'待确认影片.英语.srt', manual:true},
    {id:'quality', query:'清晰度电影', title:'清晰度电影', year:2010, subtitle:'清晰度电影.2010.1080p.简体.srt'}
];

function scenario(bundle, fixture) {
    const script = fs.readFileSync(bundle,'utf8');
    const end = script.lastIndexOf("    if (location.hostname === 'www.guangyapan.com')");
    assert.ok(end > 0);
    const metrics = {sourceRequests:0,metadataRequests:0,aiCalls:0,downloads:0};
    const work = {id:12,media_type:'movie',title:fixture.title,release_date:fixture.year + '-01-01'};
    const remote = async raw => {
        const term = new URL(raw).searchParams.get('name');
        metrics.sourceRequests++;
        if ((fixture.needsAI || fixture.matchAlias) && term !== fixture.title) return {code:0,data:[]};
        const subtitle = fixture.subtitle || fixture.title + '.' + fixture.year + '.简体.srt';
        return {code:0,data:[{name:subtitle,url:'https://example.com/' + fixture.id + '.srt'}]};
    };
    const ctx = vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,Date,Intl,setTimeout,clearTimeout,
        window:{fetch:()=>assert.fail('Fixture made an external request')},GM_getValue:(_key,fallback)=>fallback,GM_setValue:()=>assert.fail('No persistent identity write'),
        GM_xmlhttpRequest:request=>{metrics.downloads++;request.onload({status:200,response:body.buffer});},
        remote, metadata:()=>({search:async query=>{metrics.metadataRequests++;return query === work.title ? [work] : [];},
            get:async()=>{metrics.metadataRequests++;return work;}})});
    vm.runInContext(script.slice(0,end) + `\nsubtitleRemoteJson = remote; tmdbClient = metadata;
        this.api = {createSubtitleService, searchSubtitleSources, subtitleValidateContent,
        correction:typeof createSubtitleWorkCorrection === 'function' ? createSubtitleWorkCorrection : null,
        apply:typeof applySubtitleWorkCorrection === 'function' ? applySubtitleWorkCorrection : null};})();`,ctx);
    return {api:ctx.api,metrics};
}

async function run(bundle, enableAI) {
    const start = Date.now();
    const totals = {identified:0,candidates:0,downloadable:0,simulatedFills:0,wrong:0,manual:0,sourceRequests:0,metadataRequests:0,aiCalls:0};
    const outcomes = {};
    for (const fixture of cases) {
        const {api,metrics} = scenario(bundle,fixture);
        const row = {node:{name:fixture.query + '.' + fixture.year + '.720p.mkv',folders:fixture.folder ? [fixture.folder] : []},
            parsed:{query:fixture.query,year:fixture.year,aliases:fixture.aliases || [],tv:fixture.season != null,
                season:fixture.season,episode:fixture.episode,endEpisode:fixture.endEpisode}};
        const service = api.createSubtitleService(), config = {language,thunder:true}, noop = () => {};
        await api.searchSubtitleSources(row,config,service);
        if (enableAI && api.correction) {
            const correct = api.correction({correctSubtitleWork:async payload=>{
                metrics.aiCalls++;
                assert.equal(payload.work.year,fixture.year);
                return {id:null,title:fixture.title};
            }},'fixture-key');
            await api.apply(row,correct,config,service,noop,noop);
        }
        if (!fixture.reject && (!fixture.needsAI || row.parsed.tmdbId === '12')) totals.identified++;
        if (row.candidates.length) totals.candidates++;
        if (row.candidates.length && !row.selectedCandidate) totals.manual++;
        if (row.selectedCandidate) {
            if (fixture.reject) totals.wrong++;
            else {
                const {bytes,result} = await service.fetchFile(row.selectedCandidate,config);
                totals.downloadable++;
                const validated = api.subtitleValidateContent(row,bytes,result.ext,language);
                assert.match(validated.text,/中文字幕/);
                totals.simulatedFills++;
            }
        }
        for (const key of ['sourceRequests','metadataRequests','aiCalls']) totals[key] += metrics[key];
        outcomes[fixture.id] = {...metrics,selected:!!row.selectedCandidate};
    }
    return {totals,outcomes,elapsedMs:Date.now() - start};
}

async function correctionGuards() {
    const fixture = cases.find(item => item.id === 'correction');
    const {api,metrics} = scenario(build,fixture);
    const make = () => ({node:{name:'混乱文件名.2003.mkv',folders:['正式片名']},
        parsed:{query:'混乱文件名',year:2003},sources:[{name:'迅雷',count:0}],candidates:[]});
    let calls = 0;
    const correct = api.correction({correctSubtitleWork:async()=>{calls++;return {id:null,title:fixture.title};}},'fixture-key');
    for (const patch of [{embedded:{chinese:true}},{selectedCandidate:{}},{writeBlocked:true},
        {sources:[{name:'迅雷',paused:'HTTP 429'}]},{sources:[{name:'迅雷',error:'HTTP 401'}]},
        {sources:[{name:'迅雷',count:0,downloadErrors:['failed']}]}]) {
        assert.equal(await correct({...make(),...patch},()=>{}),null);
    }
    assert.equal(calls,0); assert.equal(metrics.metadataRequests,0);
    let cancelled = false;
    const stopped = api.correction({correctSubtitleWork:async()=>{cancelled = true; return {id:null,title:fixture.title};}},'fixture-key');
    const target = make();
    await assert.rejects(stopped(target,()=>{if (cancelled) throw Error('stopped');}),/stopped/);
    assert.equal(target.parsed.tmdbId,undefined);
    await Promise.all([correct(make(),()=>{}),correct(make(),()=>{})]);
    assert.equal(calls,1,'Same work uses one correction decision per batch');
}

(async () => {
    const rules = await run(build,false), ai = await run(build,true);
    await correctionGuards();
    assert.equal(rules.totals.aiCalls,0);
    assert.equal(rules.outcomes.ordinary.sourceRequests,1);
    assert.equal(rules.outcomes.regional.sourceRequests,2);
    assert.equal(rules.totals.wrong,0); assert.equal(ai.totals.wrong,0);
    assert.equal(ai.outcomes.ordinary.aiCalls,0);
    assert.equal(ai.outcomes.correction.aiCalls,1);
    assert.equal(ai.outcomes.correction.selected,true);
    assert.equal(ai.outcomes.ambiguous.selected,false);
    assert.equal(ai.totals.simulatedFills,rules.totals.simulatedFills + 1);
    if (process.env.CMO_SUBTITLE_BASELINE) {
        const baseline = await run(process.env.CMO_SUBTITLE_BASELINE,false);
        console.log('Baseline',baseline.totals,'ms',baseline.elapsedMs);
    }
    console.log('Rules',rules.totals,'ms',rules.elapsedMs);
    console.log('Rules + AI',ai.totals,'ms',ai.elapsedMs);
    console.log('PASS subtitle optimization: fixed fixture comparison, bounded requests and verified correction');
})().catch(error=>{console.error(error);process.exitCode=1;});
