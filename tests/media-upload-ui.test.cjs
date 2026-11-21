const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a,b) => { const start=source.indexOf(a), end=source.indexOf(b,start); assert.ok(start>=0 && end>start,a); return source.slice(start,end); };
const load = (code, extras={}) => { const ctx=vm.createContext({TextEncoder,TextDecoder,URL,atob,Uint8Array,Date,GM_getValue:(_key,def)=>def,GM_setValue:()=>{},...extras}); vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+code,ctx); return ctx; };
const md5 = bytes => crypto.createHash('md5').update(bytes).digest('hex');
const language='zh-cn,zh-tw,zh';
const valid=Buffer.from('1\n00:00:01,000 --> 00:00:03,000\n中文字幕 Test\n');

function types() {
    const ctx=load(part('    function mediaCandidatePreference(', '    function mediaWorkCounts('));
    const cases=[
        [{workVideoCount:1,season:1,episode:3},'tv'],
        [{workVideoCount:1,aiType:'tv'},'tv'],
        [{workVideoCount:1},''],
        [{workVideoCount:12},''],
        [{type:'movie',match:'movie:1',season:1,episode:3,aiType:'tv'},'movie'],
        [{aiType:'movie'},'movie'],
        [{aiType:'movie',explicitSeason:0},''],
        [{aiType:'movie',explicitEpisode:3},'']
    ];
    for(const [row,type] of cases) {ctx.row=row; const result=vm.runInContext('mediaCandidatePreference(row)',ctx); assert.equal(result.type,type); if(row.aiType==='movie' && (row.explicitSeason!=null || row.explicitEpisode!=null)) assert.equal(result.conflict,true);}
    console.log('PASS media types: single episode and AI TV retained; count alone never decides; confirmed choice wins; conflicting hints require confirmation');
}

async function tmdbSearchAndEpisodeAliases() {
    let calls=0;
    const clientContext=load(part('    const tmdbClients =', '    function mediaGuangyaPost('),{
        paced:(_delay,fn)=>fn,
        requestJson:async raw=>{calls++;const page=Number(new URL(raw).searchParams.get('page')||1);return {results:[{id:page,media_type:'movie',title:'Film'}],total_pages:5};}
    });
    const client=clientContext.tmdbClient('fixture-token');
    const early=await client.search('Film',results=>results.length===1);assert.equal(early.length,1);assert.equal(calls,1,'Unique first-page match stops pagination');
    calls=0;const later=await client.search('Other',results=>results.length>=3);assert.equal(later.length,3);assert.equal(calls,3,'Search continues only until callback accepts accumulated results');
    const episodeContext=load(part('    async function mediaSeasonEpisodes(', '    function tmdbClient('));
    const season=await episodeContext.mediaSeasonEpisodes({get:async(path,params={})=>params.language==='en-US'?{episodes:[{episode_number:1,name:'Crimson Sky'}]}:{air_date:'2024-01-01',episodes:[{episode_number:1,name:'血色天空'}]}},42,1);
    assert.equal(season.year,'2024');assert.deepEqual(Array.from(season.episodes[0].aliases),['血色天空','Crimson Sky']);
    const fallback=await episodeContext.mediaSeasonEpisodes({get:async(_path,params={})=>{if(params.language)throw Error('English unavailable');return {episodes:[{episode_number:1,name:'血色天空'}]}}},42,1);
    assert.deepEqual(Array.from(fallback.episodes[0].aliases),['血色天空'],'English lookup failure retains local season results');
    const mismatched = await episodeContext.mediaSeasonEpisodes({
        get:async (_path, params = {}) => ({episodes:[params.language
            ? {id:2, episode_number:1, name:'Other Episode'}
            : {id:1, episode_number:1, name:'血色天空'}]})
    },42,1);
    assert.deepEqual(Array.from(mismatched.episodes[0].aliases),['血色天空'],'A different episode ID cannot supply an alias');
    console.log('PASS TMDB efficiency and episodes: unique match stops page fetches; English episode aliases augment Chinese names; English lookup failure falls back');
}

async function aiFallbackGuards() {
    const media=load(part('    function validateMediaAIIdentity(', '    async function identifyMediaAIFiles('));
    assert.equal(media.mediaNeedsAI({matchFailure:'unmatched'}),true);
    assert.equal(media.mediaNeedsAI({matchFailure:'lookup-error'}),false);
    assert.equal(media.mediaNeedsAI({matchFailure:'ambiguous'}),true);
    assert.equal(media.mediaNeedsAI({matchFailure:'unmatched',detail:{id:1}}),false);
    let captured;
    const ai=load(part('    function mediaAIEndpoint(', '    function validateMediaAIIdentity('),{
        GM_xmlhttpRequest:options=>{captured=JSON.parse(options.data);options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:'{"index":1,"confidence":0.96}'}}]})});}
    });
    const result=await ai.createMediaAI({base:'https://ai.example/v1',key:'secret',model:'test'}).disambiguateSubtitle({work:{title:'片名'},candidates:[{index:1,name:'subtitle.srt'}]});
    const keyCheck=load(part('    function mediaAIEndpoint(', '    function validateMediaAIIdentity('),{
        GM_xmlhttpRequest:options=>{assert.equal(options.headers.Authorization,'Bearer valid-secret');options.onload({status:401,responseText:JSON.stringify({error:{message:'Authentication failed for valid-secret'}})});}
    });
    assert.equal(keyCheck.normalizeMediaAIKey('  Bearer valid-secret  '),'valid-secret');
    assert.equal(keyCheck.migrateMediaAISettings({provider:'deepseek',model:'deepseek-chat',key:'Bearer valid-secret'}).model,'deepseek-flash');
    assert.equal(keyCheck.migrateMediaAISettings({provider:'deepseek',base:'https://api.deepseek.com/v1',model:'deepseek-chat',key:'secret'}).base,'https://api.deepseek.com');
    assert.equal(keyCheck.migrateMediaAISettings({provider:'deepseek',model:'deepseek-chat',key:'Bearer valid-secret'}).key,'valid-secret');
    await assert.rejects(keyCheck.createMediaAI({base:'https://api.deepseek.com',key:'Bearer valid-secret',model:'deepseek-flash'}).ask({test:true}),error=>error.status===401&&/Authentication failed/.test(error.message)&&!error.message.includes('valid-secret'));
    assert.deepEqual({...result},{index:1,confidence:0.96});assert.equal(captured.max_tokens,2000);assert.match(captured.messages[0].content,/只能返回输入中的候选 index/);
    assert.match(captured.messages[0].content,/rejected/,'AI schema includes explicit per-candidate rejections');
    await ai.createMediaAI({base:'https://ai.example/v1',key:'secret',model:'test'}).ask({mode:'per_file',samples:[{name:'unknown.mkv',subtitleTitleHints:['Doctor Who Special']}]});
    assert.match(captured.messages[0].content,/字幕标题线索只用于辅助识别/);
    const candidate={language:'zh-cn',name:'Series.S01E01.1080p.srt',release:'Series',titleMatched:false};
    const subtitle=load(part('    function subtitleFileInfo(', '    function subtitleSearchSummary('));
    const row={node:{name:'Series.S01E01.1080p.mkv'},parsed:{query:'Series',tv:true,year:'2020',season:1,episode:1,tmdbId:'42'},candidates:[candidate]};
    assert.equal(subtitle.subtitleAICandidate({index:0,confidence:.95},row,'zh-cn,zh-tw,zh'),candidate);
    assert.equal(subtitle.subtitleAICandidate({index:0,confidence:.89},row,'zh-cn'),null);
    assert.equal(subtitle.subtitleAICandidate({index:0,confidence:.95},row,'en'),null);
    assert.equal(subtitle.subtitleAICandidate({index:9,confidence:1},row,'zh-cn'),null);
    row.node.name='Series.S01E01.720p.mkv';assert.equal(subtitle.subtitleAICandidate({index:0,confidence:1},row,'zh-cn'),candidate,'Resolution difference alone cannot reject an AI candidate');
    row.node.name='Series.S01E01.1080p.mkv';
    for(const name of ['Other.2021.S01E01.srt','Other.S02E01.srt','Other.S01E02.srt','Other.S01E01-E02.srt','Other.简体.srt']) {
        candidate.name=name;assert.equal(subtitle.subtitleAICandidate({index:0,confidence:1},row,'zh-cn'),null,name);
    }
    candidate.name='Other.S01E01.srt';candidate.workIdentity={tv:true,tmdbId:'99',season:1,episode:1};
    assert.equal(subtitle.subtitleAICandidate({index:0,confidence:1},row,'zh-cn'),null,'Conflicting TMDB ID cannot be overridden');
    candidate.workIdentity={tv:true,tmdbId:'42',season:1,episode:2};
    assert.equal(subtitle.subtitleAICandidate({index:0,confidence:1},row,'zh-cn'),null,'Conflicting API episode cannot be overridden by filename');
    candidate.name='Other.简体.srt';candidate.workIdentity.episode=1;
    assert.equal(subtitle.subtitleAICandidate({index:0,confidence:1},row,'zh-cn'),candidate,'Confirmed API episode permits a generic subtitle filename');
    candidate.hardMismatch=true;assert.equal(subtitle.subtitleAICandidate({index:0,confidence:1},row,'zh-cn'),null);delete candidate.hardMismatch;
    row.parsed={query:'Film',year:'2000',tmdbId:'42'};candidate.workIdentity={tv:false,tmdbId:'42',year:2001};
    assert.equal(subtitle.subtitleAICandidate({index:0,confidence:1},row,'zh-cn'),null,'API year conflict survives generic filename');
    candidate.workIdentity.year=2000;candidate.name='Other.1999.srt';
    assert.equal(subtitle.subtitleAICandidate({index:0,confidence:1},row,'zh-cn'),null,'Filename year still checked with matching API metadata');
    candidate.name='Other.2000.srt';assert.equal(subtitle.subtitleAICandidate({index:0,confidence:1},row,'zh-cn'),candidate);
    assert.equal(candidate.titleMatched,false,'AI suggestions never change deterministic identity flags');
    console.log('PASS AI fallback guards: unmatched and ambiguous media rows qualify; candidate index, confidence, language, version, year, episode and TMDB conflicts checked');
}

async function mediaFallbackFlow() {
    const calls=[],groups=new Map(['Known','Unmatched','Ambiguous','Offline',''].map((query,index)=>[index,[{node:{id:String(index),name:query||'unknown.mkv',parentId:'p'},query,sourceYear:'2000'}]]));
    const context=load(part('    function mediaTheatricalQuery(', '    function subtitleWorkIdentity(')+part('    function validateMediaAIIdentity(', '    async function identifyMediaAIFiles(')+part('        async function matchGroup(', "        ui.get('scanMedia').onclick"),{
        groups,flow:{requestRender(){}},checkStopped(){},progress(){},meter(){},log(){},readyRow:row=>!!row.detail,key:value=>value.toLowerCase(),aiSettings:()=>({enabled:true}),mediaCandidatePreference:()=>({type:'movie'}),
        client:{search:async query=>{calls.push('tmdb:'+query);if(query==='Offline')throw Error('HTTP 503');if(query==='Unmatched')return [];return Array.from({length:query==='Ambiguous'?2:1},(_,index)=>({id:index+1,media_type:'movie',title:query,release_date:'2000-01-01'}))}},
        choose:async(row,match)=>{row.detail={id:match};row.match=match},validateEpisode:async()=>{},createMediaAI:()=>({}),
        identifyMediaAIFiles:async rows=>{calls.push('ai:'+rows[0].node.name);return rows.map(()=>({title:'Recovered',type:'movie',year:'2000',episodes:[]}))}
    });
    vm.runInContext('async function scanGroups(){let matched=0;'+part('                await batchStage([...groups.values()]', '                checkStopped();\n                mediaWorkCounts(rows);')+'}',context);
    await context.scanGroups();
    assert.deepEqual(calls.slice().sort(),['tmdb:Known','tmdb:Unmatched','ai:Unmatched','tmdb:Recovered','tmdb:Ambiguous','ai:Ambiguous','tmdb:Recovered','tmdb:Offline','ai:unknown.mkv','tmdb:Recovered'].sort());
    assert.ok(calls.indexOf('tmdb:Unmatched') < calls.indexOf('ai:Unmatched'));
    assert.equal(groups.get(0)[0].aiAssisted,false);assert.equal(groups.get(1)[0].aiAssisted,true);assert.equal(groups.get(2)[0].aiAssisted,true);assert.equal(groups.get(3)[0].matchFailure,'lookup-error');assert.equal(groups.get(4)[0].aiAssisted,true);
    context.client.search = async query => {
        if (query !== '作品 银色之翼') return [];
        return [{id:1,media_type:'movie',title:query,release_date:'2000-01-01'},
            {id:2,media_type:'tv',name:query,first_air_date:'2000-01-01'},
            {id:3,media_type:'movie',title:query,release_date:'2004-01-01'}];
    };
    for (const [year,match] of [['2000','movie:1'],['',''],['2005','']]) {
        const row = {node:{name:'剧场版 作品 银色之翼.mkv'},sourceYear:year};
        await context.matchGroup([row],'剧场版 作品 银色之翼');
        assert.equal(row.match,match);
    }
    console.log('PASS media scan flow: normal TMDB first; AI handles unmatched/ambiguous titles; recovered title rechecked; network failures stay manual');
}

async function subtitleIdentityHandoff() {
    const events=[], media={node:{id:'v',name:'Film.2000.mkv'},query:'Film',sourceYear:'2000'};
    const inspect=load(part('            flow.inspect = async (context,collected) => {','            flow.syncWorks ='),{
        flow:{},inventory:[{node:media.node,media}],context:{},updateIdentity:()=>events.push('identity'),
        checkDirectory:async()=>{events.push('coverage');return true;},check:()=>{}
    });
    inspect.flow.resolveSubtitleWorks=async(rows)=>{assert.equal(rows[0].media,media);events.push('subtitle-handoff');};
    vm.runInContext(part('            flow.inspect = async (context,collected) => {','            flow.syncWorks ='),inspect);
    assert.equal(await inspect.flow.inspect(inspect.context,{}),true);
    assert.deepEqual(events,['identity','coverage','subtitle-handoff'],'Trusted subtitle identity runs after the directory coverage check');
    assert.equal(inspect.flow.registryReady,true);

    let accepted=0, refreshed=0;
    const recovery=load(part('        async function recoverWorkFromSubtitle(row, verify) {','        ui.get(\'scanMedia\').onclick'),{
        flow:{
            coverage:()=> 'complete',
            subtitleWorkHints:()=>({type:'movie',year:'2000',queries:['Film 2000']}),
            acceptSubtitleWork:()=>{accepted++;},requestRender:()=>{refreshed++;}
        },client:{},meter(){},log(){},mediaCandidatePreference:()=>({type:'movie'}),
        readyRow:row=>!!row.match&&!!row.detail&&!row.error,
        matchGroup:async([row],query)=>Object.assign(row,{query,title:'Film',year:'2000',type:'movie',match:'movie:7',detail:{id:7},error:''}),
        batchStage:async(items,_stage,_log,work,verify)=>{for(const item of items)await work(item,verify);},
        checkStopped:()=>{}
    });
    const row={node:media.node,media:{...media,detail:{id:3},match:'movie:3',error:'季集校验失败',matchFailure:'unmatched'},sourceYear:'2000',include:true};
    recovery.inventory=[{node:media.node,media:row.media}];
    vm.runInContext(part('        async function recoverWorkFromSubtitle(row, verify) {','        ui.get(\'scanMedia\').onclick'),recovery);
    await recovery.flow.resolveSubtitleWorks(recovery.inventory,()=>{});
    assert.equal(recovery.readyRow(row.media),true);
    assert.equal(accepted,1);assert.equal(refreshed,1);
    console.log('PASS merged identity handoff: coverage check precedes subtitle recovery; confirmed work is synchronized and cards refresh');
    subtitleIdentityHints();
    await subtitleIdentityRecheck();
}

function subtitleIdentityHints() {
    const ctx=load(part('    function subtitleOrganizeHints(', '    async function savePanelSubtitle('),{
        parseMediaName:()=>({query:'Series Special',year:'2005',tv:true,season:0,episode:1,endEpisode:null}),
        subtitleCandidateFilter:parsed=>({titleMatched:parsed.query==='Series Special'}),
        subtitleQueryTitle:(title,year)=>title+' '+year
    });
    const sub={id:'s',name:'Series.Special.S00E01.zh.srt'};
    const row={complete:false,identityClues:[sub],verifiedSubtitle:null,verifiedSubtitleCandidate:null,subtitles:[sub],parsed:{query:'Bad Video Name',year:'2024',tv:true,season:1},media:{explicitSeason:null,explicitEpisode:null,explicitYear:null}};
    const hint=ctx.subtitleOrganizeHints(row);
    assert.equal(hint.type,'tv');assert.equal(hint.year,'2005');assert.deepEqual(Array.from(hint.queries),['Series Special 2005']);assert.equal(hint.season,0);assert.equal(hint.episode,1);
    row.media.explicitYear='2024';assert.equal(ctx.subtitleOrganizeHints(row),null,'Explicit video year conflict blocks identity recovery');
    console.log('PASS subtitle identity clues: unconfirmed content can seed title/type/season hints but explicit year conflict blocks it');
}

async function subtitleIdentityRecheck() {
    const first={node:{id:'a'},title:'New Film',year:'2000',type:'movie',match:'movie:2',detail:{id:2}};
    const second={node:{id:'b'},title:'Unchanged',year:'2001',type:'movie',match:'movie:3',detail:{id:3}};
    const rows=[
        {node:first.node,media:first,parsed:{query:'Old Film',year:'1990',tv:false,tmdbId:'1',workResolved:true},subtitles:[{id:'s1',name:'New.Film.2000.srt'}],complete:true},
        {node:second.node,media:second,parsed:{query:'Unchanged',year:'2001',tv:false,tmdbId:'3',workResolved:true},subtitles:[{id:'s2',name:'Unchanged.2001.srt'}],complete:true}
    ];
    let reread=0,rendered=0,invalidated=0;
    const context=load(part('            flow.syncWorks = async', '            flow.interrupt ='),{
        flow:{invalidate:()=>invalidated++},inventory:rows,awaitingCheck:()=>false,
        updateIdentity:row=>Object.assign(row.parsed,{query:row.media.title,year:row.media.year,tv:false,tmdbId:row.media.match.split(':')[1],workResolved:true}),
        subtitleCandidateFilter:()=>({titleMatched:true}),parseMediaName:()=>({season:null,episode:null,endEpisode:null}),
        drive:{},settings:()=>({language:'zh-cn'}),diag(){},check(){},
        inspectExistingSubtitles:async draft=>{reread++;assert.equal(draft.parsed.query,'New Film');draft.complete=true;draft.searchMessage='核验通过';},render:()=>rendered++
    });
    vm.runInContext(part('            flow.syncWorks = async', '            flow.interrupt ='),context);
    await context.flow.syncWorks([first],true,()=>{});
    assert.equal(reread,1,'Only changed video is reread');assert.equal(rows[0].complete,true);assert.equal(rows[0].identityRecheck,false);
    assert.equal(rows[1].parsed.query,'Unchanged');assert.equal(invalidated,1);assert.equal(rendered,1);
    console.log('PASS single-video identity recheck: changed work invalidates stale preview and rereads only its linked subtitles');
}

function aiProviderKey() {
    const values={mediaAIProvider:{value:'qwen'},mediaAIKey:{value:'secret'},mediaAIBase:{value:''},mediaAIModel:{value:''},mediaAIState:{textContent:''}};
    const handler=part("        ui.get('mediaAIProvider').onchange", "        ui.get('mediaAIModelSelect').onchange");
    const ctx=load(handler,{ui:{get:id=>values[id]},aiPresets:{qwen:{base:'https://api.example',model:'qwen-model',link:'https://example'}},updateAILink(){},showAIModels(){},invalidate(){}});
    values.mediaAIProvider.onchange();assert.equal(values.mediaAIKey.value,'secret');assert.equal(values.mediaAIBase.value,'https://api.example');assert.equal(values.mediaAIModel.value,'qwen-model');
    console.log('PASS AI provider switching: key remains while provider presets update');
}

async function subtitles() {
    const ctx=load(part('    function subtitleDownloadUrl(', '    function subtitleDrive('),{Blob});
    const video={id:'v',parentId:'p',name:'电影.2000.mkv',size:10000};
    const mono={source:'SubDL',name:'电影.2000.简体.srt',language:'zh-cn',titleMatched:true};
    const bilingual={source:'迅雷',name:'电影.2000.简体&英文.ass',language:'zh-cn',bilingual:true,titleMatched:true};
    let calls=[],stop=false;
    const row=()=>({node:video,parsed:{query:'电影',year:2000},candidates:[],sources:[]});
    const service={thunderSearch:async()=>{calls.push('thunder');return [bilingual]},subdlSearch:async()=>{calls.push('subdl');return [mono]},search:async()=>{calls.push('open');return []}};
    let r=row();
    await ctx.searchSubtitleSources(r,{thunder:true,subdl:true,subdlKey:'k',open:false,language},service);
    assert.deepEqual(calls,['thunder']);assert.equal(r.selectedCandidate,bilingual);
    bilingual.downloadFailed=true;await ctx.searchSubtitleSources(r,{thunder:true,subdl:true,subdlKey:'k',open:false,language},service,()=>{},()=>{},true);assert.equal(r.selectedCandidate,mono);delete bilingual.downloadFailed;
    assert.deepEqual(calls,['thunder','subdl']);
    calls=[];service.thunderSearch=async()=>{calls.push('thunder');return []};service.search=async()=>{calls.push('open');return [bilingual]};service.subdlSearch=async()=>{calls.push('subdl');throw Object.assign(Error('HTTP 509'),{status:509})};
    r=row();await ctx.searchSubtitleSources(r,{thunder:true,subdl:true,subdlKey:'k',open:true,key:'k',language},service);
    assert.equal(r.sources.find(s=>s.name==='SubDL').error,'HTTP 509');assert.equal(r.selectedCandidate,bilingual);assert.equal(calls.at(-1),'open');
    calls=[];service.subdlSearch=async()=>{calls.push('subdl');stop=true;return []};
    await assert.rejects(ctx.searchSubtitleSources(row(),{thunder:true,subdl:true,subdlKey:'k',language},service,()=>{},()=>{if(stop)throw Error('已停止')}),/已停止/);
    assert.deepEqual(calls,['thunder','subdl']);
    r=row();await ctx.searchSubtitleSources(r,{language},service);assert.equal(ctx.subtitleSearchState(r),'unsearched');assert.match(ctx.subtitleSearchMessage(r),/尚未查询/);
    r=row();await ctx.searchSubtitleSources(r,{subdl:true,language},service);assert.equal(ctx.subtitleSearchState(r),'unsearched');assert.match(ctx.subtitleSearchMessage(r),/未配置密钥/);

    vm.runInContext(part('    function subtitleInventory(', '    function initSubtitles('),ctx);
    Object.assign(ctx,{parseMediaName:()=>({query:'电影',year:2000}),mediaBonusName:()=>false,mediaRecords:{get:()=>null}});
    const sub={id:'s',name:'电影.2000.zh-cn.srt'};
    const collected={videos:[{...video,folders:[],path:video.name}],linked:new Map([['v',[sub]]])};
    r=ctx.subtitleInventory(collected)[0];assert.equal(r.complete,false,'Language filename is not proof of content');
    await ctx.inspectExistingSubtitles(r,{read:async()=>valid},language);assert.equal(r.complete,true);
    for(const bytes of [Buffer.alloc(0),Buffer.from('<html>错误页面</html>'),Buffer.from('random 中文')]) {
        r={subtitles:[sub],node:video};await ctx.inspectExistingSubtitles(r,{read:async()=>bytes},language);assert.equal(r.complete,false);
    }
    r={subtitles:[sub],node:video};await ctx.inspectExistingSubtitles(r,{read:async()=>{throw Error('连接失败')}},language);assert.equal(r.complete,false);assert.equal(ctx.subtitleSearchState(r),'unsearched');assert.match(r.searchMessage,/读取失败/);
    r={subtitles:[sub,{...sub,name:'another.srt'}],node:video};let read=0;
    await ctx.inspectExistingSubtitles(r,{read:async()=>++read===1?Promise.reject(Error('连接失败')):valid},language);assert.equal(r.complete,true);
    r={subtitles:[{name:'untagged.srt'}],node:video};await ctx.inspectExistingSubtitles(r,{read:async()=>valid},'zh-cn');assert.equal(r.complete,false);
    await assert.rejects(ctx.inspectExistingSubtitles({subtitles:[sub],node:video},{read:async()=>valid},language,()=>{},()=>{throw Error('已停止')}),/已停止/);
    console.log('PASS subtitles: all enabled sources queried and bilingual wins; failed source fallback; stop propagation; skipped/missing-key states; existing tagged subtitles require valid body; unreadable files pause filling');
}

async function receipts() {
    const video={id:'v',parentId:'p',name:'电影.2000.mkv',size:10000};
    const sub={id:'s',name:'电影.2000.zh-cn.srt',size:valid.length};
    for(const scenario of ['read-failure','network-submission','rejected-api','rejected-http','mismatch','listing-failure','other-account','cancel']) {
        const storage=new Map();let uploads=0,exists=false,broken=true,cancel=false,first=true;
        const ctx=load(part('    function subtitleDrive(', '    function subtitleInventory('),{
            sleep:async()=>{},paced:(_ms,fn)=>fn,selectedTreeCache:null,SUBTITLE_LIMIT:16*1024*1024,subtitleDownloadUrl:u=>u,subtitleMd5:md5,
            apiCode:r=>r.code??0,apiError:(_stage,r)=>Object.assign(Error('API '+r.code),{stop:r.code===403}),
            GM_getValue:(key,def)=>storage.has(key)?structuredClone(storage.get(key)):def,GM_setValue:(key,val)=>storage.set(key,structuredClone(val)),
            subtitleBinary:async()=>{if(scenario==='cancel' && broken){cancel=true;throw Error('连接失败')} if(broken && scenario==='read-failure')throw Error('连接失败'); return scenario==='mismatch' && broken ? Buffer.from('wrong'):valid;},
            requestJson:async(url)=>{
                if(url.endsWith('/file/upload_request')) {
                    uploads++;
                    if(first){first=false;
                        if(scenario==='rejected-api')return {code:403};
                        if(scenario==='rejected-http')throw Object.assign(Error('HTTP 403'),{status:403,stop:true});
                        if(scenario==='network-submission')throw Error('连接失败');
                    }
                    exists=true;return {code:0,data:{Reuse:true}};
                }
                if(url.endsWith('/file/download_info'))return {data:{DownloadUrl:'https://drive.example/file'}};
                throw Error('Unexpected '+url);
            }
        });
        const context={session:{provider:'123',token:'account-one',base:'https://www.123pan.com',headers:{}},source:{children:async()=>{if(exists && broken && scenario==='listing-failure')throw Error('连接失败');return exists?[video,sub]:[video]}}};
        ctx.context=context;
        const make=()=>vm.runInContext('subtitleDrive(context)',ctx);
        let drive=make();
        const check=()=>{if(cancel)throw Error('已停止')};
        if(scenario==='other-account') {
            // Leave an unresolved receipt in account one, then prove account two does not consume it.
            ctx.subtitleBinary=async()=>{throw Error('连接失败')};
        }
        await assert.rejects(drive.save({node:video},sub.name,valid,()=>{},check),error=>{
            if(scenario==='cancel')return /已停止/.test(error.message) && error.pendingUpload===true;
            if(scenario.startsWith('rejected'))return !error.pendingUpload;
            return error.pendingUpload===true;
        });
        assert.equal(uploads,1);
        assert.equal([...storage.values()][0].length,scenario.startsWith('rejected')?0:1);
        assert.ok([...storage.keys()].every(key=>!key.includes('account-one')),'No token in persisted key');
        drive=make();cancel=false;
        if(scenario.startsWith('rejected')) {
            broken=false;await drive.save({node:video},sub.name,valid);assert.equal(uploads,2,'Explicit rejection allows corrected retry');
        } else if(scenario==='other-account') {
            ctx.context={...context,session:{...context.session,token:'account-two'}};const other=make();assert.equal((await other.reconcile({node:video})).length,0);assert.equal([...storage.values()][0].length,1);continue;
        } else {
            await assert.rejects(drive.save({node:video},sub.name,valid),error=>error.pendingUpload===true || scenario==='cancel');
            assert.equal(uploads,1,'Persisted receipt prevents repeated mutation');
            broken=false;exists=true;ctx.subtitleBinary=async()=>valid;
            const recovered=await drive.reconcile({node:video});assert.equal(recovered[0].id,'s');assert.equal([...storage.values()][0].length,0);
            await drive.save({node:video},sub.name,valid);assert.equal(uploads,1);
        }
    }
    let writes=0,uploads=0;
    const ctx=load(part('    function subtitleDrive(', '    function subtitleInventory('),{
        sleep:async()=>{},paced:(_ms,fn)=>fn,selectedTreeCache:null,SUBTITLE_LIMIT:16*1024*1024,subtitleDownloadUrl:u=>u,subtitleMd5:md5,
        apiCode:()=>0,GM_getValue:()=>[],GM_setValue:()=>{if(++writes===1)throw Error('存储空间不足')},
        subtitleBinary:async()=>valid,requestJson:async url=>{if(url.endsWith('/file/upload_request')){uploads++;return {data:{Reuse:true}}}return {data:{DownloadUrl:'https://drive.example/sub'}}}
    });
    ctx.context={session:{provider:'123',token:'test',base:'https://example.com',headers:{}},source:{children:async()=>uploads?[video,sub]:[video]}};
    const drive=vm.runInContext('subtitleDrive(context)',ctx);
    await assert.rejects(drive.save({node:video},sub.name,valid),/本次未上传/);assert.equal(uploads,0);
    await drive.save({node:video},sub.name,valid);assert.equal(uploads,1,'Failed pre-submission persistence must not leave an in-memory lock');
    console.log('PASS upload receipts: persists across controller reload; no repeated upload after uncertain submission/readback/cancel; mismatch and failed listing remain pending; successful recheck clears receipt; definite API/HTTP rejection allows retry; account isolation');
}

function treeFixture(numeric=false,nested=false) {
    const id=v=>numeric?Number(v):v;
    const folder={id:id('10'),parentId:id('0'),name:'旧片名',directory:true,path:'旧片名'};
    const season={id:id('11'),parentId:folder.id,name:'Season 1',directory:true,path:'旧片名/Season 1'};
    const parent=nested?season:folder;
    const video={id:id('20'),parentId:parent.id,name:'video.mkv',directory:false,size:100,md5:'a'.repeat(32),ancestors:nested?[folder,season]:[folder]};
    const attachment={id:id('21'),parentId:parent.id,name:'poster.jpg',directory:false,size:10,md5:'b'.repeat(32)};
    const nodes=[folder,...(nested?[season]:[]),video,attachment];const mutations=[];
    const children=async({id:parentId})=>nodes.filter(n=>n.parentId===parentId).map(n=>({...n}));
    const ctx=load(part('    function mediaOrganizerWriter(', '    const mediaStandardFolder'),{
        MEDIA_VIDEO:/\.(mkv|mp4)$/i,MEDIA_SUB:/\.(ass|srt)$/i,mediaFileHistory:()=>null,mediaSubtitleLinks:()=>({linked:new Map()}),
        mediaExistingCategory:parts=>parts[0]==='电影',relativeParts:p=>p.split('/').filter(Boolean),
        recycleMedia:async folder=>{assert.ok(!nodes.some(n=>n.parentId===folder.id));nodes.splice(nodes.findIndex(n=>n.id===folder.id),1);},
        hasFileMetadata:n=>!!n.md5,mediaFileMetadata:async n=>n,sleep:async()=>{},paced:(_ms,fn)=>fn,apiCode:()=>0,
        requestJson:async(url,opts)=>{const body=JSON.parse(opts.body);mutations.push([url,body]);
            if(url.endsWith('/file/rename')) nodes.find(n=>n.id===body.fileId).name=body.fileName;
            else if(url.endsWith('/file/mod_pid'))for(const n of body.fileIdList)nodes.find(node=>node.id===n.FileId).parentId=body.parentFileId;
            else if(url.endsWith('/file/upload_request')) nodes.push({id:id(String(100+mutations.length)),parentId:body.parentFileId,name:body.fileName,directory:true});
            else throw Error('Unexpected '+url);
            return {};
        }
    });
    ctx.context={session:{provider:'123',base:'https://test',parent:id('0'),headers:{}},source:{children}};
    const writer=vm.runInContext('mediaOrganizerWriter(context.session,context.source)',ctx);
    const item={node:{...video},videoId:video.id,destination:nested?'电影/新片名.2000/Season 01/new.mkv':'电影/新片名.2000/new.mkv'};
    return {writer,item,nodes,mutations,folder,attachment,video,season,source:ctx.context.source};
}

async function folders() {
    const direct = treeFixture(false,true);
    direct.source.parentId = direct.season.id;
    direct.source.breadcrumbs = [direct.folder,direct.season];
    direct.item.node.ancestors = [];
    direct.nodes.splice(direct.nodes.indexOf(direct.attachment),1);
    await direct.writer.prepare([direct.item]);
    await direct.writer.validate();
    await direct.writer.execute(direct.item);
    assert.equal(await direct.writer.recycleEmptySeasonSources(()=>{},()=>{}),2,'Directly selected episodes leave neither the empty source season nor the empty work folder');
    for(const keepAttachment of [false,true]){
        const f=treeFixture(false,true);
        f.folder.depth=0; f.season.depth=1;
        f.nodes.push({id:'cat',parentId:'0',name:'电影',directory:true},{id:'work',parentId:'cat',name:'新片名.2000',directory:true},{id:'season',parentId:'work',name:'Season 01',directory:true});
        if(!keepAttachment) f.nodes.splice(f.nodes.indexOf(f.attachment),1);
        await f.writer.prepare([f.item]); await f.writer.validate(); await f.writer.execute(f.item);
        assert.equal(await f.writer.recycleEmptySeasonSources(()=>{},()=>{}),keepAttachment?0:2);
        assert.equal(f.nodes.includes(f.folder),keepAttachment);
        assert.equal(f.video.parentId,'season');
    }
    for (const missing of [['md5'],['size'],['md5','size']]) {
        const f=treeFixture();
        f.item.node.ancestors=[];
        for(const key of missing){ delete f.item.node[key]; delete f.video[key]; }
        await f.writer.prepare([f.item]); await f.writer.validate(); await f.writer.execute(f.item);
        assert.equal(f.video.name,'new.mkv');
        assert.notEqual(f.video.parentId,f.folder.id);
    }
    for(const field of ['size','md5']){
        const f=treeFixture();
        delete f.item.node[field==='size'?'md5':'size'];
        f.video[field]=field==='size'?101:'c'.repeat(32);
        await assert.rejects(f.writer.execute(f.item),/预览后原文件发生变化/);
        assert.equal(f.mutations.length,0);
    }
    for(const numeric of [false,true])for(const nested of [false,true]) {
        const f=treeFixture(numeric,nested);const plans=await f.writer.prepare([f.item]);
        assert.ok(plans.length);assert.ok(plans.some(p=>p.contents.some(n=>n.name==='poster.jpg')),'Preview includes unlinked attachment');
        await f.writer.validate();await f.writer.execute(f.item);
        assert.equal(f.nodes.find(n=>n.id===f.video.id).name,'new.mkv');assert.equal(f.nodes.find(n=>n.id===f.attachment.id).parentId,f.attachment.parentId);
        assert.ok(f.mutations.some(([url,b])=>url.endsWith('/file/mod_pid') && b.fileIdList.some(n=>n.FileId===f.folder.id)),JSON.stringify({numeric,nested,mutations:f.mutations}));
    }
    for(const change of ['added','renamed','changed-size','removed']) {
        const f=treeFixture();await f.writer.prepare([f.item]);
        if(change==='added')f.nodes.push({id:'99',parentId:f.folder.id,name:'late.srt',size:1});
        if(change==='renamed')f.nodes.find(n=>n.id===f.attachment.id).name='changed.jpg';
        if(change==='changed-size')f.nodes.find(n=>n.id===f.attachment.id).size++;
        if(change==='removed')f.nodes.splice(f.nodes.findIndex(n=>n.id===f.attachment.id),1);
        await assert.rejects(f.writer.validate(),/预览后发生变化/);assert.equal(f.mutations.length,0);
    }
    const f=treeFixture();f.nodes.push({...f.video,id:'other',name:'unselected.mkv'});assert.equal((await f.writer.prepare([f.item])).length,0,'Unselected video prevents folder move');
    // Removing that other video after preview must not invent a new whole-folder operation.
    f.nodes.splice(f.nodes.findIndex(n=>n.id==='other'),1);await f.writer.validate();await f.writer.execute(f.item);
    assert.equal(f.nodes.find(n=>n.id===f.folder.id).name,'旧片名');
    const merge=treeFixture();merge.nodes.push({id:'cat',parentId:'0',name:'电影',directory:true},{id:'target',parentId:'cat',name:'新片名.2000',directory:true});
    assert.equal((await merge.writer.prepare([merge.item])).length,0,'Existing target uses file merge, so no whole-folder preview');
    await merge.writer.validate();await merge.writer.execute(merge.item);assert.equal(merge.nodes.find(n=>n.id===merge.video.id).parentId,'target');assert.equal(merge.nodes.find(n=>n.id===merge.attachment.id).parentId,merge.folder.id);
    const late=treeFixture();await late.writer.prepare([late.item]);late.nodes.push({id:'cat',parentId:'0',name:'电影',directory:true},{id:'target',parentId:'cat',name:'新片名.2000',directory:true});
    await assert.rejects(late.writer.execute(late.item),/预览后出现同名项目/);assert.equal(late.mutations.length,0);
    const changedTarget=treeFixture();
    await changedTarget.writer.prepare([changedTarget.item]);
    changedTarget.nodes.push({id:'late-cat',parentId:'0',name:'电影',directory:true});
    await assert.rejects(changedTarget.writer.validate(),/整理目标已变化/);
    assert.equal(changedTarget.mutations.length,0);
    const stopped=treeFixture();let cancel=false;await stopped.writer.prepare([stopped.item],()=>{if(cancel)throw Error('已停止')});cancel=true;
    await assert.rejects(stopped.writer.validate(),/已停止/);assert.equal(stopped.mutations.length,0);
    const parallel = treeFixture();
    const items = Array.from({length:12},(_,i) => {
        const node = {...parallel.video,id:'parallel-'+i,name:'old-'+i+'.mkv',ancestors:[]};
        parallel.nodes.push(node);
        return {node:{...node},videoId:node.id,destination:'电影/并发.2000/new-'+i+'.mkv'};
    });
    await parallel.writer.prepare(items);
    await parallel.writer.validate();
    const ctx = load('');
    await ctx.forEachConcurrent(items,8,item => parallel.writer.execute(item));
    for (const folder of ['电影','并发.2000']) {
        const creates = parallel.mutations.filter(([url,body]) => url.endsWith('/file/upload_request') && body.fileName === folder);
        assert.equal(creates.length,1,'Concurrent files share one creation for '+folder);
    }
    const folder = parallel.nodes.find(node => node.name === '并发.2000');
    assert.equal(parallel.nodes.filter(node => node.parentId === folder.id).length,12);
    console.log('PASS folder plans: twelve concurrent files share directory creation; complete attachment preview; numeric/string IDs; work plus season folder moves; added/renamed/changed/removed descendants block before mutation; unselected video prevents folder binding; cancellation');
}

async function cleanup() {
    const nodes=[{id:'v',name:'movie.mkv'},{id:'s',name:'movie.zh-cn.srt'},{id:'f',name:'font.otf'},{id:'a',name:'字体包.zip'},{id:'i',name:'poster.jpg'},{id:'b',name:'花絮.mkv'}];
    const ctx=load(part('    const mediaPlaybackAttachment', '    async function removeMediaNonstandard('),{MEDIA_VIDEO:/\.mkv$/,MEDIA_SUB:/\.(srt|ass|ssa|sub|idx|vtt)$/i,mediaBonusName:n=>n.startsWith('花絮'),matchSelected:nodes=>nodes});
    const source={parentId:'p',children:async()=>nodes};
    const protectedPlan=await ctx.planMediaCleanup([{}],source,undefined,{extras:true});assert.deepEqual(Array.from(protectedPlan,n=>n.id),['i','b']);
    const all=await ctx.planMediaCleanup([{}],source,undefined,{extras:true,includeSubtitles:true});assert.deepEqual(Array.from(all,n=>n.id),['s','f','a','i','b']);
    const button={},messages=[];let deletes=0;
    const handler = part("        ui.get('runEmpty').onclick =", "        ui.get('mediaAIProvider').onchange");
    const lifecycle = part('    function createPanelTask(', '    function panelControls(');
    const locks = [];
    const run=load(lifecycle + '\nconst runTask = createPanelTask(ui, () => {});\n' + handler,{ui:{get:()=>button,busy: value => locks.push(value)},emptyPlan:[{path:'a'},{path:'b'}],emptySession:{},emptySource:{},flow:{reset(){}},checkStopped(){},
        invalidate(){},meter(){},log:m=>messages.push(m),progress:m=>messages.push(m),
        removeMediaNonstandard:async()=>{deletes++;throw Object.assign(Error('HTTP 403'),{stop:true})}
    });
    await button.onclick();assert.equal(deletes,2);assert.ok(messages.some(m=>m.includes('清理中断')));
    run.emptyPlan = [{path:'c'}];
    run.progress = () => {throw Error('render failed');};
    await assert.rejects(button.onclick(), /render failed/);
    assert.deepEqual(locks, [true, false, true, false]);
    console.log('PASS cleanup: subtitles, font files and named font packs preserved by default; explicit include restores full attachment cleaning');
}

async function subtitleUI() {
    const elements=new Map();
    const element=tag=>({tag,value:'',checked:false,disabled:false,hidden:false,dataset:{},style:{},children:[],textContent:'',append(...children){this.children.push(...children)},appendChild(child){this.children.push(child)},replaceChildren(...children){this.children=children},querySelectorAll(selector){return this.children.flatMap(child=>[...(child.tag===selector?[child]:[]),...child.querySelectorAll(selector)]);}});
    const get=id=>{assert.ok(elements.has(id),'Missing UI element '+id);return elements.get(id)};
    const video={id:'v',name:'电影.2000.mkv',size:10000,folders:[],path:'电影.2000.mkv'};
    const sub={id:'s',name:'电影.2000.zh-cn.srt'};
    let broken=true,hasSubtitle=true,queries=0,saves=0,reads=0,aliasCalls=0,panelMarkup='',movedSettings=[],aiConfig={},aiCandidates=false,readBytes=valid,recovered=[];
    const downloads=[];
    const ctx=load(part('    function subtitleDownloadUrl(', '    function subtitleDrive('));
    vm.runInContext(part('    function paced(', '    function evict(')+part('    function cachedDriveChildren(', '    function titleKey('),ctx);
    Object.assign(ctx,{mediaAIEndpoint:()=> 'https://ai.example/v1/chat/completions',document:{createElement:element},makePanel:(_title,html)=>{
        panelMarkup=html;
        for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=element();el.checked=/\bchecked\b/.test(tag[0]);el.disabled=/\bdisabled\b/.test(tag[0]);elements.set(tag[1],el)}
        return {get,moveSettings(ids){movedSettings.push(...ids)},openSettings(){},busy(){}};
    },mediaContext:async()=>({selected:[video],session:{parent:'root',token:'fixture'},source:{children:async()=>[video,...(hasSubtitle?[sub]:[])]},path:'电影'}),mediaFileHistory:()=>null,
    mediaSubtitleLinks:()=>({linked:new Map([['v',hasSubtitle?[sub]:[]]])}),
    collectMediaSelection:async()=>({videos:[video],linked:new Map([['v',hasSubtitle?[sub]:[]]])}),
    parseMediaName:()=>({query:'电影',year:2000}),mediaBonusName:()=>false,mediaRecords:{get:()=>({query:'电影',year:2000,type:'movie',match:'movie:7'})},mediaStem:name=>name.replace(/\.[^.]+$/,''),
    GM_getValue:(key,def)=>key==='cross-drive-tmdb-key'?'fixture-key':key==='cross-drive-media-ai'?aiConfig:def,
    tmdbClient:()=>({get:async(path,params)=>{aliasCalls++;assert.equal(path,'/movie/7');assert.ok(params.append_to_response === 'alternative_titles' || params.language === 'en-US');return {id:7,title:'电影完整名',original_title:'Film',release_date:'2000-01-01',alternative_titles:{titles:[{iso_3166_1:'TW',title:'电影别名'},{iso_3166_1:'FR',title:'Un film'}]}}}}),
    createSubtitleService:()=>({thunderSearch:async row=>{queries++;assert.equal(row.parsed.query,'电影');assert.ok(row.parsed.aliases.includes('Film'));assert.ok(row.parsed.aliases.includes('电影别名'));assert.ok(!row.parsed.aliases.includes('Un film'));if(aiCandidates)return [{source:'迅雷',name:'Different.Translation.简体.srt',ext:'srt',release:'First release',language:'zh-cn',titleMatched:false},{source:'迅雷',name:'Another.Translation.简体.srt',ext:'srt',release:'Second release',language:'zh-cn',titleMatched:false}];return ['A1.srt','A2.srt','B.srt'].map(name=>({source:'迅雷',name,ext:'srt',language:'zh-cn',titleMatched:true}))},fetchFile:async candidate=>{downloads.push(candidate.name);if(candidate.name==='A1.srt')throw Error('下载失败');return {result:{url:'https://example.com/subtitle',ext:'srt'},bytes:valid}}}),
    subtitleBinary:async()=>valid,
    subtitleDrive:()=>({sample:async()=>'',read:async()=>{reads++;if(broken)throw Error('连接失败');return readBytes},reconcile:async()=>recovered,save:async()=>{saves++;hasSubtitle=true;throw Object.assign(Error('上传已提交，核验连接失败'),{pendingUpload:true})}})
    });
    vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/works.js'),'utf8')+part('    function createPanelTask(', '    function panelControls(')+part('    function subtitleInventory(', '    if (location.hostname').replace("        ui.get('stopSubtitles').onclick", "        globalThis.checkInventory = () => runTask(checkDirectory,true);\n        ui.get('stopSubtitles').onclick"),ctx);
    ctx.initSubtitles();
    const audit = async () => {
        const view = get('subtitleView'); const saved = view.value;
        view.value = 'all'; view.onchange();
        const button = get('subtitleRows').querySelectorAll('button').find(item => item.textContent === '复查已有字幕');
        assert.ok(button); await button.onclick(); view.value = saved; view.onchange();
    };
    assert.doesNotMatch(panelMarkup,/重搜未完成项|复制完整报告|复制未补齐路径/);assert.match(panelMarkup,/id="openSubtitlesSettings"/);assert.match(panelMarkup,/id="subtitleAccountSettings"/);
    const openSettings=panelMarkup.slice(panelMarkup.indexOf('<details id="openSubtitlesSettings"'),panelMarkup.indexOf('<label>字幕语言'));
    assert.match(openSettings,/useOpenSubtitles[\s\S]*openSubtitlesKey[\s\S]*subtitleAccountSettings/);assert.doesNotMatch(openSettings,/^<details[^>]*\bopen\b/);
    assert.deepEqual(Array.from(movedSettings),['subtitleSettings','openSubtitlesSettings']);
    await ctx.checkInventory();
    assert.match(get('subtitleSummary').textContent,/检查未确认 1/);assert.equal(queries,0);assert.equal(get('fillSubtitles').disabled,true);assert.equal(elements.has('recheckSubtitles'),false);
    broken=false;await ctx.checkInventory();assert.match(get('subtitleSummary').textContent,/有字幕 1/);assert.equal(queries,0);assert.equal(reads,2);
    await audit();assert.equal(reads,3);assert.equal(queries,0);assert.equal(get('subtitleView').value,'incomplete');assert.match(get('subtitleLog').value,/作品归属和音画同步未确认/);
    aiConfig={enabled:true,base:'https://ai.example',model:'test'};
    ctx.createMediaAI=()=>({reviewSubtitleBody:async()=>({verdict:'different',confidence:.99,evidence:'中文字幕 Test',reason:'合成错片证据'})});
    await audit();assert.match(get('subtitleSummary').textContent,/没字幕 1/);assert.equal(queries,0);assert.equal(get('fillSubtitles').disabled,true);
    aiConfig={};recovered=[sub];readBytes=Buffer.from('<html>not a subtitle</html>');hasSubtitle=false;
    await ctx.checkInventory();assert.match(get('subtitleSummary').textContent,/有字幕 0/);assert.equal(queries,0,'Recovered upload must pass body validation, not merely receipt reconciliation');
    recovered=[];readBytes=valid;
    hasSubtitle=false;await ctx.checkInventory();await get('readSubtitles').onclick();assert.equal(queries,1);assert.equal(get('fillSubtitles').disabled,false);
    await get('fillSubtitles').onclick();assert.equal(saves,1);assert.match(get('subtitleProgress').textContent,/未补齐 1/);assert.equal(get('fillSubtitles').disabled,true);
    assert.deepEqual(downloads,['A1.srt','A2.srt'],'Failed downloads fall back to the next candidate');assert.equal(aliasCalls,2,'Shared work detail and English aliases are fetched once then persisted');
    await get('fillSubtitles').onclick();assert.equal(saves,1,'Pending upload cannot be refilled');
    await ctx.checkInventory();assert.match(get('subtitleSummary').textContent,/有字幕 1/);assert.equal(saves,1);assert.equal(queries,1,'Recheck only reads drive inventory');
    hasSubtitle=false;aiConfig={enabled:true,base:'https://ai.example',model:'test'};
    ctx.createMediaAI=()=>({disambiguateSubtitle:async payload=>{assert.equal(payload.candidates.length,2);assert.equal(payload.work.tmdbId,'7');return {index:1,confidence:.96}}});
    aiCandidates=true;await ctx.checkInventory();
    await get('readSubtitles').onclick();assert.equal(get('fillSubtitles').disabled,false);assert.match(get('subtitleLog').value,/AI 字幕建议.*Another\.Translation/);
    console.log('PASS subtitle UI flow: readable and missing coverage, trusted TMDB aliases, failed candidate fallback, and pending upload recovery without duplicate writes');
}

async function guangyaReceipts() {
    const video={id:'v',parentId:'p',name:'电影.mkv',size:10000}, sub={id:'s',name:'电影.zh-cn.srt',size:valid.length};
    for(const scenario of ['reuse-success','oss-success','read-failure','rejected','post-task-failure','missing-task']) {
        const storage=new Map();let creates=0,puts=0,exists=false,broken=true;
        const ctx=load(part('    function subtitleDrive(', '    function subtitleInventory('),{
            crypto:crypto.webcrypto,btoa,sleep:async()=>{},paced:(_ms,fn)=>fn,API:{create:'/create',info:'/info'},taskIdOf:data=>data?.taskId,
            guangyaCode:r=>r.code??0,apiCode:r=>r.code??0,apiError:(_s,r)=>Object.assign(Error('API '+r.code),{stop:r.code===403}),
            selectedTreeCache:null,SUBTITLE_LIMIT:16*1024*1024,subtitleDownloadUrl:u=>u,subtitleMd5:md5,
            GM_getValue:(k,d)=>storage.get(k)||d,GM_setValue:(k,v)=>storage.set(k,structuredClone(v)),
            requestJson:async(url)=>{
                if(url.endsWith('/create')){creates++;if(scenario==='rejected')return {code:403};exists=true;
                    return {code:scenario==='oss-success'?0:156,data:scenario==='missing-task'?{}:{taskId:'t',provider:1,bucketName:'bucket',objectPath:'sub.srt',endPoint:'oss.example.com',creds:{accessKeyID:'fake',secretAccessKey:'fake',sessionToken:'fake'}}};}
                if(url.endsWith('/info')){if(scenario==='post-task-failure' && broken)throw Object.assign(Error('HTTP 403'),{stop:true});return {data:{fileId:'s'}};}
                if(url.endsWith('/get_res_download_url'))return {data:{signedURL:'https://download.example/file'}};
                throw Error('Unexpected '+url);
            },
            subtitleBinary:async(_url,opts)=>{if(opts?.method==='PUT'){puts++;return Buffer.alloc(0)}if(scenario==='read-failure' && broken)throw Error('连接失败');return valid;}
        });
        ctx.context={session:{provider:'光鸭',token:'guangya-account'},source:{children:async()=>exists?[video,sub]:[video]}};
        const drive=vm.runInContext('subtitleDrive(context)',ctx);
        if(scenario.endsWith('success')) {assert.equal((await drive.save({node:video},sub.name,valid)).id,'s');assert.equal(puts,scenario==='oss-success'?1:0);}
        else {
            await assert.rejects(drive.save({node:video},sub.name,valid),e=>scenario==='rejected'?!e.pendingUpload:e.pendingUpload && (scenario!=='post-task-failure'||e.stop));
            assert.equal([...storage.values()][0].length,scenario==='rejected'?0:1);
            if(scenario!=='rejected'){broken=false;const recovered=await vm.runInContext('subtitleDrive(context)',ctx).reconcile({node:video});assert.equal(recovered[0].id,'s');}
        }
        assert.equal(creates,1);assert.equal([...storage.values()][0].length,0);
    }
    console.log('PASS Guangya: rapid upload and signed OSS byte upload; readback failure, missing task and accepted-task auth failure retain receipt; explicit rejection clears receipt; recheck recovers with one create only');
}

(async()=>{types();aiProviderKey();await tmdbSearchAndEpisodeAliases();await aiFallbackGuards();await mediaFallbackFlow();await subtitleIdentityHandoff();await subtitles();await receipts();await folders();await cleanup();await subtitleUI();await guangyaReceipts();})().catch(e=>{console.error(e);process.exitCode=1;});
