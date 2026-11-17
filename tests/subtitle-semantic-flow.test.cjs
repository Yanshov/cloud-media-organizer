const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('cloud-media-organizer-v3.user.js','utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i);return source.slice(i,j)};
const language='zh-cn,zh-tw,zh';
const load=extras=>{const ctx=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Date,
    paced:(_ms,fn)=>fn,sleep:async()=>{},GM_getValue:(_k,d)=>d,GM_setValue(){},...extras});
    vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    function subtitleRemoteJson(', '    function subtitleDrive('),ctx);return ctx;};
const row=()=>({node:{name:'假面骑士极狐：4位王者与黑狐.2023.mkv'},parsed:{query:'假面骑士极狐：4位王者与黑狐',year:2023,tv:false,aliases:['Kamen Rider Geats: 4 Aces and the Black Fox']},candidates:[],sources:[]});
const file=(name,n)=>({name,ext:'ass',url:'https://example.com/'+n,languages:['简体']});
const realName='[KRSUB][Kamen Rider Geats Movie - 4 Aces and the Black Fox][BDRIP][1080p][x265_FLAC][CHS-SCLA].ass';
(async()=>{
    const requests=[],payloads=[],logs=[];
    const ctx=load({GM_xmlhttpRequest:r=>{requests.push(r.url);assert.match(r.url,/xunlei/);r.onload({status:200,responseText:JSON.stringify({code:0,data:[
        file('其他作品A.ass',1),file('其他作品B.ass',2),file('其他作品C.ass',3),file(realName,4),file(realName,5),
        file('假面骑士亚极陀 - 07.ass',6),file('错误年份.2020.ass',7)]})})}});
    const service=ctx.createSubtitleService(),r=row();
    const reviewer=ctx.createSubtitleReviewer({disambiguateSubtitle:async payload=>{payloads.push(payload);return {index:payload.candidates.find(c=>c.name===realName).index,confidence:.96,reason:'完整副标题一致，Movie 为包装词'};}},language,(...a)=>logs.push(a.join(' ')));
    const config={thunder:true,assrt:true,assrtToken:'test',shooter:true,language,reviewCandidates:reviewer};
    await ctx.searchSubtitleSources(r,config,service,{sample:async()=>{throw Error('Must not sample')}});
    assert.equal(payloads.length,1);assert.equal(payloads[0].candidates.length,4,'Distinct raw names beyond the first three reach AI; duplicates collapse');
    assert.equal(ctx.subtitleCandidateFilter({query:'假面骑士龙骑剧场版 最后的篇章',year:2002,tv:false},[],"[SV-MirrorWorld] Kamen Rider Ryuki - Episode Final (Directors Cut) [E79807B6]_字幕01.ENG.ass",true).excluded,undefined,'Release checksum is not an episode number');
    assert.ok(payloads[0].work.aliases.includes('Kamen Rider Geats: 4 Aces and the Black Fox'));
    assert.equal(r.selectedCandidate.name,realName);assert.equal(r.aiSuggested,true);assert.equal(requests.length,1,'AI confirms thunder before Assrt or shooter');
    assert.ok(logs.some(line=>line.includes('完整副标题一致')));
    ctx.selectSubtitleCandidate(r,language);assert.equal(r.selectedCandidate.name,realName,'AI decision survives ranking');
    r.selectedCandidate.downloadFailed=true;ctx.selectSubtitleCandidate(r,language);assert.equal(r.selectedCandidate,null,'Failed AI selection is not selected again');
    for(const [query,name] of [['疾速追杀2','疾速追杀.2017.srt'],['小丑','小丑2.2019.srt']]) {
        const target={parsed:{query,year:name.includes('2017')?2017:2019,tv:false},node:{name:query+'.mkv'},candidates:[{name,release:'',language:'zh-cn'}]};
        assert.equal(ctx.subtitleAICandidate({index:0,confidence:1},target,language),null,'AI cannot override an explicit sequel conflict');
    }
    const hash={source:'迅雷',name:'a'.repeat(40)+'.ass',opaque:true,language:'zh-cn'};
    let aiCalls=0, sampleCalls=0;
    const uncertain=row();
    await ctx.searchSubtitleSources(uncertain,{thunder:true,shooter:true,language,reviewCandidates:ctx.createSubtitleReviewer({disambiguateSubtitle:async()=>{aiCalls++;}},language)},
        {thunderSearch:async()=>[hash],shooterHash:async()=>[]},{sample:async()=>{sampleCalls++;return 'hash'}});
    assert.equal(aiCalls,0,'Opaque names are not sent for guessing');assert.equal(sampleCalls,1,'Uncertain results cannot block shooter');
    let attempts=0;const failureLogs=[];
    const broken=ctx.createSubtitleReviewer({disambiguateSubtitle:async()=>{attempts++;throw Object.assign(Error('empty'),{aiParse:true})}},language,(...a)=>failureLogs.push(a.join(' ')));
    for(let i=0;i<3;i++){const target=row();target.candidates=[{source:'迅雷',name:'Different Translation.ass',language:'zh-cn'}];await broken(target,target.candidates);}
    assert.equal(attempts,2);assert.ok(failureLogs.some(line=>line.includes('已停用')));
    let chunks=0;const many=row();many.candidates=Array.from({length:45},(_,i)=>({source:'迅雷',name:'Alternative '+i+'.ass',language:'zh-cn'}));
    await ctx.createSubtitleReviewer({disambiguateSubtitle:async payload=>{chunks++;assert.ok(payload.candidates.length<=20);return {index:null,confidence:0,reason:'无法确认'}}},language)(many,many.candidates);
    assert.equal(chunks,3,'Every distinct candidate is considered in bounded batches');
    const alternate='Kamen Rider Amazons The Movie - The Last Judgement.srt';let alternateCalls=0;
    const assrt=load({GM_xmlhttpRequest:r=>{assert.match(r.url,/assrt/);r.onload({status:200,responseText:JSON.stringify({status:0,sub:{subs:[{id:1,native_name:'Alternative release',lang:{langlist:{langchs:true}},filelist:[{f:alternate,s:30000}]}]}})});}});
    const alternativeRow=row();alternativeRow.parsed={query:'假面骑士Amazons:最后的审判',year:2018,tv:false,aliases:['Kamen Rider Amazons The Movie: The Final Judgment']};
    await assrt.searchSubtitleSources(alternativeRow,{assrt:true,assrtToken:'test',shooter:true,language,reviewCandidates:assrt.createSubtitleReviewer({disambiguateSubtitle:async p=>{alternateCalls++;assert.equal(p.candidates[0].name,alternate);return {index:p.candidates[0].index,confidence:.95};}},language)},assrt.createSubtitleService(),{sample:async()=>{throw Error('Confirmed Assrt must defer shooter')}});
    assert.equal(alternateCalls,1);assert.equal(alternativeRow.selectedCandidate.name,alternate,'Assrt also preserves alternate translations for AI');
    let assrtCalls=0,thunderCalls=0,shooterCalls=0;const waits=[];
    const limited=load({sleep:async ms=>waits.push(ms),GM_xmlhttpRequest:r=>{
        if(r.url.includes('xunlei')){thunderCalls++;r.onload({status:200,responseText:JSON.stringify({code:0,data:[]})});}
        else if(r.url.includes('assrt')){assrtCalls++;r.onload({status:509,responseText:'limited'});}
        else {shooterCalls++;r.onload({status:200,responseText:'[]'});}
    }});
    const limitedService=limited.createSubtitleService();limitedService.resetSearchBatch();
    for(const q of ['甲','乙']){const target=row();target.parsed.query=q;await limited.searchSubtitleSources(target,{thunder:true,assrt:true,assrtToken:'test',shooter:true,language},limitedService,{sample:async()=> 'hash'});}
    assert.equal(assrtCalls,1,'First 509 pauses Assrt for remaining videos');assert.equal(thunderCalls,2);assert.equal(shooterCalls,2);
    assert.equal(waits.length,0,'No quota sleeps in search chain');assert.ok(limitedService.searchUnavailable('Assrt 片名搜索'));
    limitedService.resetSearchBatch();assert.equal(limitedService.searchUnavailable('Assrt 片名搜索'),undefined,'New search resets batch suspension; server cooldown remains enforced');
    console.log('PASS semantic flow: logged Geats name reaches AI before deferral, all batches, dedup, sequel guards, failed download exclusion, opaque fallback, AI breaker and nonblocking 509');
})().catch(e=>{console.error(e);process.exitCode=1});
