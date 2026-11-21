const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a,b) => { const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start,a);return source.slice(start,end); };
const language = 'zh-cn,zh-tw,zh';
const valid = new TextEncoder().encode('1\n00:00:01,000 --> 00:00:03,000\n中文字幕 Test\n');
const load = (extras={}) => {
    const context=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Date,
        paced:(_delay,fn)=>fn,sleep:async()=>{},GM_getValue:(_key,value)=>value,GM_setValue(){},...extras});
    vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    function subtitleRemoteJson(', '    function subtitleDrive('),context);
    return context;
};
const row = () => ({node:{name:'电影.2000.mkv'},parsed:{query:'电影.2000',year:2000,tv:false},candidates:[],sources:[]});
const file = (name,extras={}) => ({name,ext:name.split('.').pop(),url:'https://subtitle.v.geilijiasu.com/'+encodeURIComponent(name),languages:['简体'],...extras});

async function searchAndDownloads() {
    let response={code:0,data:[
        file('电影.2000.ass',{languages:['简体\\u0026英语']}),
        file('电影.2000.繁体.srt'),
        file('电影.2000.英文.srt',{languages:['英语']}),
        file('电影.1999.srt'),file('电影2.2000.srt'),file('电影.S01E01.srt'),
        file('电影.2000.zip'),file('电影.2000.srt',{url:'javascript:alert(1)'}),
        null,file('电影.2000.ass',{languages:['简体\\u0026英语']})
    ]};
    const requests=[],transfers=[],logs=[];
    let html=false;
    const ctx=load({GM_xmlhttpRequest:options=>{
        if(new URL(options.url).hostname==='api-shoulei-ssl.xunlei.com') {
            requests.push(options);options.onload({status:200,responseText:JSON.stringify(response)});
        } else {transfers.push(options);options.onload({status:200,response:(html?new TextEncoder().encode('<html>下载错误</html>'):valid).buffer});}
        return {abort(){}};
    }});
    const service=ctx.createSubtitleService(),r=row(),config={language};
    let candidates=await service.thunderSearch(r,config,message=>logs.push(message));
    assert.equal(new URL(requests[0].url).pathname,'/oracle/subtitle');
    assert.equal(new URL(requests[0].url).searchParams.get('name'),'电影','Search omits filename year');
    assert.equal(requests[0].method,'GET');assert.equal(requests[0].anonymous,true);
    assert.match(requests[0].headers['User-Agent'],/^XLPlayer\//);assert.equal(requests[0].headers.Authorization,undefined);
    assert.equal(candidates.length,3,'Wrong year, sequel, TV episodes, archives, unsafe URLs and duplicates excluded');
    assert.equal(candidates[0].name,'电影.2000.ass');assert.equal(candidates[0].language,'zh-cn');assert.equal(candidates[0].bilingual,true);
    assert.equal(candidates[1].language,'zh-tw','Explicit filename language overrides generic metadata');
    assert.equal(candidates[2].language,'en');assert.ok(!candidates.some(c=>c.name==='电影2.2000.srt'),'Conflicting sequel cannot reach AI or automatic selection');
    assert.equal(candidates[0].titleMatched,true);assert.match(logs[0],/电影\.2000\.ass/);
    r.candidates=candidates;ctx.selectSubtitleCandidate(r,language);assert.equal(r.selectedCandidate,candidates[0]);
    const fetched=await service.fetchFile(candidates[0],config);
    assert.equal(fetched.result.url,candidates[0].url);assert.equal(fetched.result.ext,'ass');assert.equal(requests.length,1,'Direct downloads need no detail API');
    assert.equal(transfers[0].anonymous,true);assert.deepEqual(Object.keys(transfers[0].headers),[],'No provider/drive credentials on subtitle downloads');
    const srt=await service.download({...candidates[0],ext:'srt'},config);assert.equal(srt.allowHttp,true);
    assert.match(ctx.subtitleValidateContent(r,fetched.bytes,'srt',language).text,/中文字幕/);
    html=true;const rejected=await service.fetchFile(candidates[0],config);
    assert.throws(()=>ctx.subtitleValidateContent(r,rejected.bytes,'srt',language),/不是可识别/,'Downloaded HTML is never accepted as subtitle text');
    await service.thunderSearch(r,config);assert.equal(requests.length,1,'Repeated title query reuses parsed response cache');
    service.logout();await service.thunderSearch(r,config);assert.equal(requests.length,2,'Logout clears search cache');
    service.logout();response={code:0,data:[file('电影.2000.ass',{languages:['英语'],simple_name:'中英[ASS]电影.2000.ass'})]};
    candidates=await service.thunderSearch(r,config);assert.equal(candidates[0].bilingual,true,'simple_name supplements incomplete language metadata');
    service.logout();response={code:0,data:Array.from({length:80},(_,i)=>file('电影.2000.简体.'+i+'.srt'))};
    assert.equal((await service.thunderSearch(r,config)).length,60,'Bounded candidate count');
    console.log('PASS thunder search/download: real response fields, year-free GET and player UA, language metadata, strict identity, cache, direct bytes and HTML rejection');
}

async function episodesAndErrors() {
    const requests=[];
    let body={code:0,data:[file('剧名.2021.S02E01.简体.srt'),file('剧名.S02E02.简体.srt'),file('剧名.S01E01.简体.srt'),file('剧名.S02E01-E02.srt'),file('剧名.简体.srt'),file('剧名.待确认版本.S02E01.简体.srt'),file('别的剧.S02E01.简体.srt')]};
    const ctx=load({GM_xmlhttpRequest:options=>{requests.push(options);options.onload({status:200,responseText:typeof body==='string'?body:JSON.stringify(body)});return {abort(){}};}});
    const service=ctx.createSubtitleService(),r={...row(),parsed:{query:'剧名',year:2020,tv:true,season:2,episode:1}};
    const candidates=await service.thunderSearch(r,{language});
    assert.equal(new URL(requests[0].url).searchParams.get('name'),'剧名 S02E01');assert.equal(candidates.length,3);
    assert.equal(candidates[0].titleMatched,true,'Later season year only allowed with exact season/episode');
    assert.equal(candidates[1].titleMatched,false);assert.match(candidates[1].matchReason,/季集/);assert.equal(candidates[2].titleMatched,false);
    await assert.rejects(service.thunderSearch({...r,parsed:{...r.parsed,episode:null}},{language}),/缺少明确季集/);
    await assert.rejects(service.thunderSearch({...r,parsed:{...r.parsed,endEpisode:2}},{language}),/合并多集/);
    await assert.rejects(service.thunderSearch(row(),{language},()=>{},()=>{throw Error('已停止')}),/已停止/);assert.equal(requests.length,1);
    service.logout();body='<html>验证码</html>';
    await assert.rejects(service.thunderSearch(row(),{language}),/未返回 JSON/);
    body={code:503,result:'temporarily unavailable'};await assert.rejects(service.thunderSearch(row(),{language}),/temporarily unavailable/);
    body={code:0,data:{}};await assert.rejects(service.thunderSearch(row(),{language}),/返回异常/);
    body={code:0,data:[]};assert.equal((await service.thunderSearch(row(),{language})).length,0,'Failed responses never poison cache');
    let cancelled=false;
    const stopped=load({GM_xmlhttpRequest:options=>{cancelled=true;options.onload({status:200,responseText:'{"code":0,"data":[]}'});return {abort(){}};}});
    await assert.rejects(stopped.createSubtitleService().thunderSearch(row(),{language},()=>{},()=>{if(cancelled)throw Error('已停止')}),/已停止/);
    console.log('PASS thunder safety: exact episode filtering, unknown episodes stay manual, missing/multi-episode refusal, cancellation, HTML/API/shape errors and retryable cache');
}

async function sourceDiagnostics() {
    const key = 'mock-key-secret';
    const ctx = load();
    ctx.subtitleRemoteJson = async raw => {
        const name = new URL(raw).searchParams.get('name');
        if (name === 'Film') throw Object.assign(Error('429 https://download.example/private.srt?signature=mock-signature api_key=' + key), {status:429});
        return {code:0,data:[file('电影.1999.srt'),file('电影.2000.简体.srt')]};
    };
    const r = row(); r.parsed.aliases = ['Film'];
    await ctx.searchSubtitleSources(r,{language:'en',thunder:true,key},ctx.createSubtitleService());
    const result = r.sources[0];
    assert.equal(result.rawCount,2); assert.equal(result.count,1); assert.equal(result.excluded.年份,1);
    assert.match(result.paused,/429/); assert.match(result.queries[1].error,/429/);
    assert.doesNotMatch(JSON.stringify(result), /mock-key-secret|mock-signature|private\.srt/);
    assert.equal(ctx.subtitleSearchState(r),'choice');
    assert.equal(ctx.subtitleCoverageState({...r,coverageUnconfirmed:true}),'unconfirmed');
    await ctx.searchSubtitleSources(r,{language,thunder:true},{thunderSearch:async()=>[]});
    assert.equal(ctx.subtitleSearchState(r),'notFound');
    assert.match(r.searchMessage,/已查询来源未找到匹配项/);
    console.log('PASS source diagnostics: raw counts, exclusions, partial failure, pause reason and redaction');
}

async function releaseEpisodeMatching() {
    const release = episode => '[DBD-Raws][Yuukoku no Moriarty][' + String(episode).padStart(2,'0') + '][1080P][BDRip][HEVC-10bit][FLAC]';
    const files = Array.from({length:24}, (_, i) => file(release(i + 1)+'.scjp.ass',{languages:[]}));
    const chinese = file(release(13)+'.tcjp.ass',{languages:[]});
    const otherFiles = [
        file(release(13).replace('[DBD-Raws]','[Other-Raws]')+'.scjp.ass'),
        file(release(13).replace('[1080P]','[720P]')+'.scjp.ass'),
        file(release(13).replace('Moriarty','Moriarty Yuri no Tsuioku')+'.scjp.ass'),
        file(release(13)+'.S02E13.scjp.ass'),
        file(release(13)+'.Extra.scjp.ass')
    ];
    const requests = [], ctx = load({GM_xmlhttpRequest:options=>{
        requests.push(new URL(options.url).searchParams.get('name'));
        options.onload({status:200,responseText:JSON.stringify({code:0,data:[...files,chinese,...otherFiles]})});
        return {abort(){}};
    }});
    vm.runInContext(part('    const MEDIA_VIDEO', '    // A special episode is still part') +
        part('    function mediaSubtitleSuffix(', '    async function mediaFileMetadata('),ctx);
    const service = ctx.createSubtitleService();
    const config = {language,thunder:true};
    const makeRow = episode => ({node:{name:release(episode)+'.mkv'},
        parsed:{query:'忧国的莫里亚蒂',aliases:['Yuukoku no Moriarty'],tv:true,season:1,episode}});
    for (let i = 1; i <= files.length; i++) {
        const target = makeRow(i);
        await ctx.searchSubtitleSources(target,config,service);
        assert.deepEqual(Array.from(target.autoCandidates,candidate=>candidate.name),i === 13 ? [files[i - 1].name,chinese.name] : [files[i - 1].name]);
        assert.equal(target.selectedCandidate.language,'zh-cn');
    }
    assert.equal(requests.length,1,'Other matching episodes reuse the provider response');
    assert.equal(ctx.subtitleFileInfo(chinese.name).language,'zh-tw');
    assert.equal(ctx.mediaSubtitleSuffix(release(13)+'.mkv',chinese.name),'.tcjp');

    const renamed = makeRow(13);
    renamed.node = {name:'忧国的莫里亚蒂.2020.S01E13.1080p.mkv',originalName:renamed.node.name};
    const backup = {source:'SubDL',name:'Moriarty.the.Patriot.S01E13.cht.ass',language:'zh-tw',titleMatched:true};
    service.subdlCachedEpisode = async () => [backup];
    const providers = {...config,subdl:true,subdlKey:'fixture'};
    await ctx.searchSubtitleSources(renamed,providers,service);
    assert.equal(renamed.selectedCandidate,backup);
    backup.downloadFailed = true;
    await ctx.searchSubtitleSources(renamed,providers,service,()=>{},()=>{},true);
    assert.equal(renamed.selectedCandidate?.name,files[12].name,'SubDL download failure falls back to the same release and episode');
    const wrongEpisode = makeRow(13);
    wrongEpisode.parsed.episode = 14;
    await ctx.searchSubtitleSources(wrongEpisode,config,service);
    assert.equal(wrongEpisode.selectedCandidate,null);
    console.log('PASS Thunder bracket episodes: all 24 logged filenames match, wrong releases and episodes stay unconfirmed, and fallback works after renaming');
}

async function sourceOrder() {
    const ctx=load(),calls=[],mono={source:'SubDL',name:'电影.2000.简体.srt',language:'zh-cn',titleMatched:true};
    const bilingual={source:'迅雷',name:'电影.2000.繁体&英文.ass',language:'zh-tw',bilingual:true,titleMatched:true};
    const config={subdl:true,subdlKey:'test',thunder:true,open:true,key:'test',language};
    const service={subdlSearch:async()=>{calls.push('subdl');return [mono]},thunderSearch:async()=>{calls.push('thunder');return [bilingual]},search:async()=>{calls.push('open');return []}};
    let r=row();await ctx.searchSubtitleSources(r,config,service);
    assert.deepEqual(calls,['thunder']);assert.equal(r.selectedCandidate,bilingual,'Bilingual thunder outranks simplified monolingual SubDL');
    assert.deepEqual(Array.from(r.sources.filter(s=>s.deferred),s=>s.name),['SubDL','OpenSubtitles']);
    calls.length=0;service.thunderSearch=async()=>{calls.push('thunder');return [{...bilingual,bilingual:false}]};
    await ctx.searchSubtitleSources(row(),config,service);assert.deepEqual(calls,['thunder'],'Reliable monolingual thunder also makes zero SubDL requests');
    service.thunderSearch=async()=>{calls.push('thunder');return [bilingual]};
    calls.length=0;service.subdlSearch=async()=>{calls.push('subdl');return [{...mono,bilingual:true}]};
    r=row();await ctx.searchSubtitleSources(r,config,service);assert.deepEqual(calls,['thunder']);assert.ok(r.sources.find(s=>s.name==='SubDL').deferred);r.candidates.forEach(c=>c.downloadFailed=true);
    await ctx.searchSubtitleSources(r,config,service,()=>{},()=>{},true);
    assert.deepEqual(calls,['thunder','subdl'],'Download fallback stops as soon as a reliable alternative is found');
    await ctx.searchSubtitleSources(r,config,service,()=>{},()=>{},true);assert.equal(calls.length,2,'Repeated resume makes no request after the deferred fallback was checked');
    calls.length=0;service.subdlSearch=async()=>{calls.push('subdl');return []};service.thunderSearch=async()=>{calls.push('thunder');throw Object.assign(Error('HTTP 429'),{status:429})};
    r=row();await ctx.searchSubtitleSources(r,config,service);
    assert.deepEqual(calls,['thunder','subdl','open']);assert.equal(r.sources.find(s=>s.name==='迅雷').error,'HTTP 429');
    assert.equal(ctx.subtitleSearchState(r),'failed');
    assert.match(r.searchMessage,/查询有失败/);
    console.log('PASS subtitle provider order: Thunder/SubDL/OpenSubtitles ranking, deferred fallback, one-time resume and isolated source failure');
}

async function thunderOnlyUI() {
    const elements=new Map(),stored=new Map([['cross-drive-subtitle-settings',{subdl:false,open:false}]]);
    const element=()=>({value:'',checked:false,disabled:false,hidden:false,style:{},dataset:{},textContent:'',children:[],append(...c){this.children.push(...c)},appendChild(c){this.children.push(c)},replaceChildren(...c){this.children=c},querySelectorAll(){return []}});
    const video={id:'v',parentId:'p',name:'电影.2000.mkv',folders:[],path:'电影.2000.mkv',size:1000};
    let searches=0,saves=0, checks=0, embedded, selected='picked';
    const ctx=load({GM_getValue:(key,def)=>stored.has(key)?stored.get(key):def,GM_setValue:(key,value)=>stored.set(key,value),document:{createElement:element},
        makePanel:(_title,html)=>{for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const e=element();e.checked=/\bchecked\b/.test(tag[0]);elements.set(tag[1],e);}return {get:id=>elements.get(id),moveSettings(){},openSettings(){},busy(){}}},
        mediaContext:async()=>({selected:[{...video,id:selected}],session:{parent:'root',token:'fixture'},source:{},path:'电影'}),collectMediaSelection:async()=>{checks++;return {videos:[video],linked:new Map()};},mediaFileHistory:()=>null,
        parseMediaName:()=>row().parsed,mediaRecords:{get:()=>null},mediaBonusName:()=>false,mediaStem:name=>name.replace(/\.[^.]+$/,''),
        subtitleDrive:()=>({reconcile:async()=>[],inspectEmbedded:async()=>embedded,save:async()=>{saves++;return {id:'s'}}}),
        GM_xmlhttpRequest:options=>{assert.equal(elements.get('useThunder').disabled,true,'Source switch locked throughout search/download');
            if(new URL(options.url).hostname==='api-shoulei-ssl.xunlei.com'){searches++;options.onload({status:200,responseText:JSON.stringify({code:0,data:[file('电影.2000.简体&英文.ChsEngA',{ext:'srt'}),file('电影.2000.简体&英文.srt')]})});}
            else options.onload({status:200,response:valid.buffer});return {abort(){}};}
    });
    vm.runInContext(part('    function createPanelTask(', '    function panelControls(')+part('    function subtitleInventory(', '    if (location.hostname'),ctx);ctx.initSubtitles();
    assert.equal(elements.get('useThunder').checked,true,'New source defaults on with older preferences');
    await elements.get('readSubtitles').onclick();assert.equal(searches,1);assert.match(elements.get('subtitleSummary').textContent,/缺可用字幕 1/);
    assert.match(elements.get('subtitleLog').value,/启用来源：迅雷/);assert.equal(elements.get('useThunder').disabled,false);
    assert.equal(elements.get('fillSubtitles').disabled,false,'An unusable first source name must allow automatic fallback');
    await elements.get('fillSubtitles').onclick();assert.equal(saves,1);assert.match(elements.get('subtitleSummary').textContent,/有字幕 1/);
    assert.match(elements.get('subtitleLog').value,/候选失败.*字幕原名不可用/);
    embedded={chinese:true,message:'有内嵌中文字幕，跳过补齐'};
    assert.equal(checks,1);
    selected = 'embedded';
    await elements.get('readSubtitles').onclick();
    assert.equal(searches,1,'Chinese track prevents searching');
    assert.equal(checks,2,'A new selection is checked once');
    assert.match(elements.get('subtitleProgress').textContent,/全部已补齐/);
    await elements.get('readSubtitles').onclick();
    assert.equal(checks,2,'Repeated searches reuse complete inventory for the same selection');
    assert.equal(saves,1,'Chinese track prevents writing');
    assert.equal(elements.get('fillSubtitles').disabled,true);
    const view=elements.get('subtitleView');
    assert.equal(view.value,'incomplete');
    assert.equal(elements.get('subtitleRows').children.length,0,'Chinese track is excluded from the default results');
    view.value='all'; view.onchange();
    const card = elements.get('subtitleRows').children[0];
    const subtitleText = card.children.find(child => child.className === 'subtitle-result').children[0];
    assert.ok([subtitleText, ...subtitleText.children].some(node => node.textContent.includes('内嵌中文 · 已补齐')));
    view.value='incomplete';view.onchange();
    assert.equal(elements.get('subtitleRows').children.length,0,'Chinese track is excluded from incomplete results');
    for (const message of ['未发现内嵌中文字幕','未读取到 MKV 字幕轨']) {
        embedded={chinese:false,message};
        selected = message;
        await elements.get('readSubtitles').onclick();
        assert.equal(searches,1,'Search reuses the prior source response');
        assert.equal(elements.get('fillSubtitles').disabled,false,'No Chinese track leaves the video eligible for fill');
        assert.match(elements.get('subtitleSummary').textContent,/缺可用字幕 1/);
    }
    elements.get('useThunder').checked=false;await elements.get('saveSubtitleSettings').onclick();assert.equal(stored.get('cross-drive-subtitle-settings').thunder,false);
    ctx.initSubtitles();assert.equal(elements.get('useThunder').checked,false,'Explicit off preference survives reload');
    console.log('PASS thunder-only UI: no key or video sample, busy lock, search/download/save flow and explicit disabled preference');
}

(async()=>{await searchAndDownloads();await episodesAndErrors();await releaseEpisodeMatching();await sourceDiagnostics();await sourceOrder();await thunderOnlyUI()})().catch(error=>{console.error(error);process.exitCode=1});
