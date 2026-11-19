const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('cloud-media-organizer-v3.user.js', 'utf8');
const part = (a,b) => { const i=source.indexOf(a), j=source.indexOf(b,i); assert.ok(i>=0 && j>i); return source.slice(i,j); };
const ctx = vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Date,
    paced:(_ms,fn)=>fn,sleep:async()=>{},GM_getValue:(_k,d)=>d,GM_setValue(){}});
vm.runInContext(part('    function evict(', '    function nonNegativeInteger(') + part('    function subtitleRemoteJson(', '    function subtitleDrive('),ctx);
const language = 'zh-cn,zh-tw,zh';
const row = () => ({node:{name:'V-CINEXT 假面骑士极狐 邪魔徒·觉醒.2024.mkv'},
    parsed:{query:'V-CINEXT 假面骑士极狐 邪魔徒·觉醒',year:2024,tv:false,aliases:['Kamen Rider Geats: Jyamato Awaking']},candidates:[],sources:[]});
const file = name => ({source:'迅雷',name,release:name,language:'zh-cn',titleMatched:false});
const wrong = '【FSD】假面骑士极狐剧场版_4位王者与黑狐（中文.srt）.srt';
const reject = (index,reason='属于另一部电影') => ({index,confidence:.97,reason});
const logs = [];
const log = (...args) => logs.push(args.join(' '));
const review = fn => ctx.createSubtitleReviewer({disambiguateSubtitle:fn},language,log);

(async () => {
    // Real logged names; API/AI responses are synthetic, with no live uploads.
    const r = row(), duplicate = file(wrong), opaque = {...file('18F440E6839BFBDFFB930E7A9AEA59CA199E7CE9.ssa'),opaque:true};
    await ctx.searchSubtitleSources(r,{thunder:true,language,reviewCandidates:review(async p=>{
        assert.equal(p.candidates.length,1,'Duplicate releases share one review; opaque name is not guessed');
        return {index:null,confidence:0,reason:'四位王者与黑狐是其他电影',rejected:[reject(p.candidates[0].index)]};
    })},{thunderSearch:async()=>[file(wrong),duplicate,opaque]},log);
    assert.equal(r.candidates.length,1); assert.equal(r.candidates[0],opaque);
    assert.equal(r.sources.find(s=>s.name==='迅雷').count,1);
    assert.equal(r.sources.find(s=>s.name==='迅雷').rejected,2,'Duplicate download URLs are removed by the same explicit work rejection');
    assert.equal(ctx.subtitleSearchState(r),'unconfirmed','An opaque result is reported without asking the user to choose');
    assert.equal(r.selectedCandidate,null,'An opaque result cannot be selected automatically');
    assert.match(r.searchMessage,/AI 排除 2/);
    assert.ok(logs.some(line=>line.includes('AI 排除候选') && line.includes(wrong)));
    assert.ok(logs.some(line=>line.includes('来源判断') && line.includes('AI 排除 2，保留 1')));

    const uncertain = row(); uncertain.candidates=[file('剧场版 假面骑士OOO.srt')];
    await review(async()=>({index:null,confidence:.99,reason:'可能是其他作品，不能确认'}))(uncertain,uncertain.candidates);
    assert.equal(uncertain.candidates.length,1,'Null selection or free-form rejection prose never clears candidates');
    assert.equal(uncertain.selectedCandidate,null);

    const fallback = row(); let subdlCalls=0;
    const replacement = {...file('Kamen Rider Geats Jyamato Awaking.2024.CHS.srt'),source:'SubDL',titleMatched:true};
    await ctx.searchSubtitleSources(fallback,{thunder:true,subdl:true,subdlKey:'test',language,
        reviewCandidates:review(async p=>({index:null,confidence:0,rejected:p.candidates.map(c=>reject(c.index))}))},
        {thunderSearch:async()=>[file(wrong)],subdlSearch:async()=>{subdlCalls++;return [replacement];}},log);
    assert.equal(subdlCalls,1,'Rejecting all thunder candidates continues to SubDL');
    assert.equal(fallback.selectedCandidate,replacement);
    assert.equal(fallback.candidates.includes(replacement),true);
    assert.equal(fallback.sources.find(s=>s.name==='迅雷').count,0);
    assert.equal(ctx.subtitleSearchState(fallback),'ready');
    assert.ok(fallback.selectedCandidate);
    const absent=row();
    await ctx.searchSubtitleSources(absent,{thunder:true,language,reviewCandidates:review(async()=>({index:null,rejected:[reject(0)]}))},
        {thunderSearch:async()=>[file(wrong)]},log);
    assert.equal(ctx.subtitleSearchState(absent),'notFound','Confirmed wrong works no longer inflate manual choices');

    const invalid=row(); invalid.candidates=Array.from({length:9},(_,i)=>file('Unknown '+i+'.ass'));
    invalid.candidates[6].identityMatched=true;
    invalid.candidates[7].identityMatched=true;
    invalid.candidates[8].titleMatched=true;
    await review(async()=>({index:0,confidence:.95,rejected:[reject(0),reject(99),reject(-1),reject('1'),reject(1.5),
        {...reject(1),confidence:.89},{...reject(2),confidence:1.1},{...reject(3),reason:''},
        {...reject(4),confidence:'0.97'},{...reject(5),reason:17},reject(6),reject(7),reject(8)]}))(invalid,invalid.candidates);
    assert.equal(invalid.candidates.length,9,'Invalid, conflicting and deterministic-match rejections are ignored');
    assert.equal(invalid.candidates.some(c=>c.name==='Unknown 0.ass' && c.aiAccepted),true,'Chosen index cannot be rejected in the same response');
    const malformed=row(); malformed.candidates=[file(wrong)];
    await review(async()=>({index:null,rejected:{index:0,confidence:1,reason:'wrong'}}))(malformed,malformed.candidates);
    assert.equal(malformed.candidates.length,1,'Malformed rejection schema is not interpreted');

    const many=row(); many.candidates=Array.from({length:45},(_,i)=>file('Alternative '+i+'.ass'));
    let chunks=0;
    await review(async p=>{
        assert.equal(p.candidates[0].index,chunks*20,'Earlier removals must not shift later batch indices');
        for(const c of p.candidates) assert.equal(c.name,'Alternative '+c.index+'.ass');
        chunks++;
        return {index:chunks===3?44:null,confidence:chunks===3?.98:0,rejected:p.candidates.filter(c=>c.index!==44).map(c=>reject(c.index))};
    })(many,many.candidates);
    assert.equal(chunks,3); assert.equal(many.candidates.length,1);
    assert.equal(many.selectedCandidate.name,'Alternative 44.ass');

    const unknown=row(); unknown.candidates=[{...file('网络版 OOO·电王·ALL RIDER Let\'s GO'),language:''}];
    unknown.parsed={query:'网络版 OOO·电王',tv:false};
    await review(async()=>({index:0,confidence:.95}))(unknown,unknown.candidates);
    assert.equal(unknown.selectedCandidate,null);
    assert.match(unknown.candidates[0].matchReason,/语言未确认/);
    assert.ok(logs.some(line=>line.includes('AI 建议未采用') && line.includes('语言未确认')));
    const movie=row(); movie.parsed={query:"OOO·电王·全体骑士 Let's Go 假面骑士",year:2011,tv:false};
    movie.candidates=[{...file("网络版 OOO·电王·ALL RIDER Let's GO"),language:'zh-cn'}];
    let denial='';
    assert.equal(ctx.subtitleAICandidate({index:0,confidence:1},movie,language,reason=>denial=reason),null);
    assert.match(denial,/网络版/);
    assert.equal(ctx.subtitleCandidateFilter(movie.parsed,[],movie.candidates[0].name,true).excluded,'内容');
    assert.equal(ctx.subtitleNetworkEditionMismatch({query:'ネット版 仮面ライダー',tv:false},['ネット版 仮面ライダー']),false);
    assert.equal(ctx.subtitleNetworkEditionMismatch(movie.parsed,['Film.WEB-DL.ass']),false,'WEB-DL is a release format, not a network edition');

    const partial=row(); partial.candidates=Array.from({length:22},(_,i)=>file('Pending '+i+'.srt'));
    let calls=0;
    await review(async p=>{if(calls++)throw Error('接口超时');return {index:null,rejected:p.candidates.map(c=>reject(c.index))};})(partial,partial.candidates);
    assert.equal(partial.candidates.length,2,'A failed later request retains unreviewed candidates while applying prior explicit rejections');
    assert.equal(partial.selectedCandidate,null);
    console.log('PASS AI rejection flow: real logged titles, explicit exclusions, uncertainty retention, stable batches, fallback, language diagnostics and network edition guard (mocked responses)');
})().catch(error=>{console.error(error);process.exitCode=1;});
