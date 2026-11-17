const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a,b) => { const start = source.indexOf(a), end = source.indexOf(b,start); assert.ok(start >= 0 && end > start,a); return source.slice(start,end); };
const language = 'zh-cn,zh-tw,zh', bytes = new TextEncoder().encode('1\n00:00:01,000 --> 00:03:00,000\n合成对白：我是另一部电影的人物。\n');
const storage = new Map(), logs = [];
const ctx = vm.createContext({URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob, Date,
    sleep:async()=>{}, paced:(_ms,fn)=>fn, GM_getValue:(k,d)=>storage.get(k) ?? d, GM_setValue:(k,v)=>storage.set(k,v)});
vm.runInContext(part('    function evict(', '    function nonNegativeInteger(') + part('    function subtitleMd5(', '    function subtitleDownloadUrl(') + part('    function subtitleDownloadUrl(', '    function subtitleInventory('),ctx);
const log = (event,detail) => logs.push(event+' '+detail);
const sub = {id:'s', size:bytes.length, md5:ctx.subtitleMd5(bytes), name:'小丑2.2024.zh-cn.srt'};
const row = () => ({node:{id:'v', parentId:'p', name:'小丑2.2024.mkv', size:100000, md5:'b'.repeat(32)}, parsed:{query:'小丑2',year:2024,tv:false}, subtitles:[{...sub}]});
const makeDrive = () => ctx.subtitleDrive({session:{provider:'123',token:'test-account'},source:{}});

async function durationAndCache() {
    const r = row(), drive = makeDrive(); let reads = 0;
    drive.read = async()=>{reads++;return bytes};
    await ctx.inspectExistingSubtitles(r,drive,language,log);
    assert.equal(r.complete,true); assert.equal(r.verification.work.status,'unconfirmed');
    assert.match(r.searchMessage,/无时长参考/); assert.match(r.searchMessage,/作品归属未确认/); assert.match(r.searchMessage,/未核对音画同步/);
    await ctx.inspectExistingSubtitles(r,drive,language,log); assert.equal(reads,1,'Matching policy, video and content reuse cache');
    assert.ok(logs.some(message=>/已核验记录复用/.test(message)));
    assert.equal(drive.verified.get(sub,language,r).context,ctx.subtitleVerificationContext(r));
    await ctx.inspectExistingSubtitles(r,drive,language,log,()=>{}, {force:true}); assert.equal(reads,2,'Explicit review rereads unchanged subtitle');
    const reloaded = makeDrive(); reloaded.read = drive.read;
    await ctx.inspectExistingSubtitles(r,reloaded,language,log); assert.equal(reads,2,'Persisted current-policy record survives reload');
    r.parsed.runtimeSeconds = 138*60;
    await ctx.inspectExistingSubtitles(r,reloaded,language,log); assert.equal(reads,3,'New runtime invalidates no-runtime record');
    assert.equal(r.complete,false); assert.equal(r.pendingVerification,true); assert.match(r.error,/字幕不完整/);
    assert.throws(()=>ctx.subtitleValidateContent(r,bytes,'srt',language,log),/字幕不完整/,'Existing and new downloads share validator');
    assert.ok(logs.some(message=>/字幕结束 180.0 秒.*8280.0 秒.*TMDB/.test(message)));
    delete r.parsed.runtimeSeconds; r.node.durationSeconds = 100;
    await ctx.inspectExistingSubtitles(r,reloaded,language,log); assert.equal(r.complete,true,'Drive duration is used when present');
    assert.match(r.searchMessage,/长度下限通过/);
    r.parsed.runtimeSeconds = 9000;
    await ctx.inspectExistingSubtitles(r,reloaded,language,log); assert.equal(r.complete,true,'Known drive duration takes precedence over TMDB');
    const before = reads;
    r.node.id = 'other-video'; await ctx.inspectExistingSubtitles(r,reloaded,language); assert.equal(reads,before+1,'Same subtitle linked to another video must be reread');
    r.parsed.tmdbId = '42'; await ctx.inspectExistingSubtitles(r,reloaded,language); assert.equal(reads,before+2,'Work identity changes invalidate cache');
    const key = [...storage.keys()].find(key=>key.startsWith('cross-drive-subtitle-verified-v1:'));
    storage.set(key,[[JSON.stringify(['s',sub.size,sub.md5]),{time:Date.now(),encoding:'UTF-8',language}]]);
    const legacy = makeDrive(); legacy.read = drive.read;
    await ctx.inspectExistingSubtitles(r,legacy,language); assert.equal(reads,before+3,'Legacy format-only records cannot bypass new policy');
    assert.ok(!JSON.stringify([...storage]).includes('test-account'),'Stored account identity is a digest');
    legacy.verified.clear(); assert.equal(legacy.verified.get(sub,language,r),undefined);
}

async function bodyReview() {
    const r = row(), drive = makeDrive(); let calls = 0, reads = 0;
    drive.read = async()=>{reads++;return bytes};
    const reviewer = ctx.createSubtitleBodyReviewer({reviewSubtitleBody:async payload=>{
        calls++; assert.equal(payload.work.query,'小丑2'); assert.ok(payload.excerpts.join('').length <= 6000);
        return {verdict:'different',confidence:.99,evidence:'另一部电影的人物',reason:'合成样例指向另一部作品'};
    }},log);
    await ctx.inspectExistingSubtitles(r,drive,language,log,()=>{}, {force:true,review:reviewer});
    assert.equal(calls,1); assert.equal(r.complete,false); assert.equal(r.pendingVerification,true); assert.match(r.error,/其他作品/);
    await ctx.inspectExistingSubtitles(r,drive,language,log); assert.equal(reads,1,'Remembered explicit mismatch stays blocked without a new AI call'); assert.equal(r.complete,false);
    const uncertain = ctx.createSubtitleBodyReviewer({reviewSubtitleBody:async()=>({verdict:'same',confidence:.99,evidence:'模型编造的证据',reason:'猜测'})},log);
    await ctx.inspectExistingSubtitles(r,drive,language,log,()=>{}, {force:true,review:uncertain});
    assert.equal(r.complete,true); assert.equal(r.verification.work.status,'unconfirmed','Unsupported model assertions remain unconfirmed');
    const supported = ctx.createSubtitleBodyReviewer({reviewSubtitleBody:async()=>({verdict:'same',confidence:.96,evidence:'另一部电影的人物',reason:'合成确认样例'})},log);
    await ctx.inspectExistingSubtitles(r,drive,language,log,()=>{}, {force:true,review:supported});
    assert.equal(r.verification.work.status,'supported'); assert.match(r.searchMessage,/AI 支持.*非实证/); assert.match(r.searchMessage,/未核对音画同步/);
    assert.match(ctx.subtitleSearchSummary([r]),/AI 支持 1/);
    const unsupported = ctx.createSubtitleBodyReviewer({reviewSubtitleBody:async()=>({verdict:'different',confidence:.5,evidence:'另一部电影的人物',reason:'低置信度'})},log);
    assert.equal((await unsupported(r,new TextDecoder().decode(bytes),'srt')).status,'unconfirmed');
    let brokenCalls = 0;
    const broken = ctx.createSubtitleBodyReviewer({reviewSubtitleBody:async()=>{brokenCalls++; throw Object.assign(Error('bad JSON'),{aiParse:true})}},log);
    for (let i=0;i<3;i++) await broken(r,new TextDecoder().decode(bytes),'srt');
    assert.equal(brokenCalls,2,'Two consecutive parse failures stop subsequent body AI requests');
    let malformedCalls = 0;
    const malformed = ctx.createSubtitleBodyReviewer({reviewSubtitleBody:async()=>{malformedCalls++;return malformedCalls === 1 ? null : {}}},log);
    for (let i=0;i<3;i++) await malformed(r,new TextDecoder().decode(bytes),'srt');
    assert.equal(malformedCalls,2,'Invalid fields also count as consecutive parse failures');
    const stopped = ctx.createSubtitleBodyReviewer({reviewSubtitleBody:async()=>{throw Error('must not request')}},log,()=>{throw Error('已停止')});
    await assert.rejects(stopped(r,new TextDecoder().decode(bytes),'srt'),/已停止/);
    await assert.rejects(ctx.inspectExistingSubtitles(r,{read:async()=>{throw Object.assign(Error('auth'),{stop:true})}},language,log,()=>{},{force:true}),/auth/);
}

function dialogue() {
    const ass = '[Script Info]\nTitle: 中文元数据不算对白\n[Events]\nFormat: Start, End, Text\n  Dialogue: 0:00:00.00,0:03:00.00,{\\b1}合成中文\\NEnglish dialogue\n';
    assert.equal(ctx.subtitleDialogue(ass,'ass'),'合成中文 English dialogue');
    assert.equal(ctx.subtitleEndTime(ass,'ass'),180);
    assert.doesNotThrow(()=>ctx.subtitleValidateContent(row(),new TextEncoder().encode(ass),'ass',language));
    assert.throws(()=>ctx.subtitlePayload(new TextEncoder().encode(ass.replace('合成中文','Hello')),'ass',language),/未检测到中文/,'Chinese metadata does not count as Chinese dialogue');
    const long = '合成台词'.repeat(10000); let excerpts;
    return ctx.createSubtitleBodyReviewer({reviewSubtitleBody:async payload=>{excerpts=payload.excerpts;return {verdict:'uncertain',confidence:0,evidence:'',reason:'不足'}}})(row(),long,'srt').then(()=>{
        assert.ok(excerpts.join('').length <= 6000,'AI body payload is bounded');
    });
}

async function actualAIClient() {
    const api = vm.createContext({URL,GM_xmlhttpRequest:request=>{
        const body=JSON.parse(request.data); assert.equal(body.response_format.type,'json_object');
        assert.ok(body.messages[0].content.includes('不可信数据')); assert.ok(body.messages[0].content.includes('不能判断音画同步'));
        request.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:'<think>ignore</think>{"verdict":"uncertain","confidence":0,"evidence":"","reason":"证据不足"}'}}]})});
    }});
    vm.runInContext(part('    function mediaAIEndpoint(', '    function validateMediaAIIdentity('),api);
    const result=await api.createMediaAI({base:'https://ai.example/v1',model:'test',key:'fake'}).reviewSubtitleBody({work:{query:'小丑2'},excerpts:['合成样例']});
    assert.equal(result.verdict,'uncertain');
}

(async()=>{await durationAndCache();await bodyReview();await dialogue();await actualAIClient();console.log('PASS existing subtitle review: shared duration checks, honest evidence states, policy/video/runtime cache binding, forced reread, persistent mismatch, bounded AI excerpts/evidence/breaker, ASS dialogue fields and cancellation (synthetic content, mocked APIs)')})().catch(error=>{console.error(error);process.exitCode=1});
