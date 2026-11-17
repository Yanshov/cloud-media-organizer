const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start,a);return source.slice(start,end)};
const ctx=vm.createContext({Date,Uint8Array,TextEncoder,TextDecoder,sleep:async()=>{}});
vm.runInContext(part('    function paced(', '    function nonNegativeInteger(')+part('    function subtitleDownloadUrl(', '    function subtitleDrive(')+part('    function subtitleSearchGroups(', '    function initSubtitles('),ctx);
const gate=()=>{let release;const promise=new Promise(resolve=>release=resolve);return {promise,release}};
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve()};
async function limitsAndDrain() {
    const active=new Set(),pending=[],seen=[],completed=[];let max=0;
    const work=ctx.forEachConcurrent([0,1,2,3,4,5],3,async i=>{seen.push(i);active.add(i);max=Math.max(max,active.size);const hold=gate();pending[i]=hold;await hold.promise;active.delete(i);completed.push(i)});
    await flush();assert.deepEqual(seen,[0,1,2]);pending[1].release();await flush();assert.deepEqual(seen,[0,1,2,3]);assert.equal(active.size,3);
    pending[0].release();pending[2].release();pending[3].release();await flush();pending[4].release();pending[5].release();await work;assert.equal(max,3);assert.equal(completed.length,6);
    const auth=Object.assign(Error('登录失效'),{phase:'drive-auth'}),first=gate(),second=gate(),started=[],writes=[];let settled=false;
    const failure=ctx.forEachConcurrent([0,1,2],2,async(i,check)=>{started.push(i);if(i===0){await first.promise;throw auth}await second.promise;check();writes.push(i)});
    const result=failure.then(()=>{settled=true},error=>{settled=true;assert.equal(error,auth)});
    first.release();await flush();assert.equal(settled,false,'UI task must drain in-flight work before unlocking');assert.deepEqual(started,[0,1]);
    second.release();await result;assert.deepEqual(writes,[],'No late row writes after another worker fails');
    let cancelled=false;const stop=gate(),calls=[];
    const task=ctx.forEachConcurrent([0,1,2],2,async(i,check)=>{calls.push(i);await stop.promise;check()},()=>{if(cancelled)throw Error('已停止')});
    const rejection=assert.rejects(task,/已停止/);cancelled=true;stop.release();await rejection;assert.deepEqual(calls,[0,1]);
    console.log('PASS concurrency pool: real overlap capped at 3, refill, stop/auth halt new work, drain active tasks and reject late writes');
}
async function seasonPipeline() {
    const row=(name,season,episode)=>({node:{name},parsed:{query:name,tv:season!=null,year:2020,season,episode},sources:[],candidates:[]});
    const rows=[row('剧甲',1,1),row('剧甲',1,2),row('剧甲',1,3),row('剧乙',1,1),row('电影',null,null)],groups=ctx.subtitleSearchGroups(rows);
    assert.deepEqual(Array.from(groups,g=>g.length),[3,1,1]);
    const first=gate(),other=gate(),calls=[],seasonCache=new Set();let active=0,max=0;
    const service={thunderCachedEpisode:async r=>seasonCache.has(r.parsed.query)?[{source:'迅雷',name:r.node.name,language:'zh-cn',titleMatched:true}]:[],thunderSearch:async r=>{
        calls.push(r.node.name);active++;max=Math.max(max,active);if(r.node.name==='剧甲')await first.promise;else await other.promise;
        active--;seasonCache.add(r.parsed.query);return [{source:'迅雷',name:r.node.name,language:'zh-cn',titleMatched:true}];
    }};
    const work=ctx.forEachConcurrent(groups,2,async(group,verify)=>{for(const r of group)await ctx.searchSubtitleSources(r,{language:'zh-cn,zh-tw,zh',thunder:true},service,{},()=>{},verify)});
    await flush();assert.deepEqual(calls,['剧甲','剧乙']);other.release();await flush();assert.deepEqual(calls,['剧甲','剧乙','电影']);first.release();await work;
    assert.equal(max,2);assert.equal(calls.filter(n=>n==='剧甲').length,1,'Same season is sequential and reuses the first episode response');assert.ok(rows.every(r=>r.selectedCandidate));
    console.log('PASS search pipeline: 2 independent works overlap, same-season episodes reuse cache without repeated requests');
}
async function aiQueue() {
    const row=()=>({node:{name:'电影.mkv'},parsed:{query:'电影'},candidates:[{source:'迅雷',name:'另一译名.简体.srt',language:'zh-cn'}]});
    const wait=gate();let calls=0,active=0,max=0;
    const ai={disambiguateSubtitle:async()=>{calls++;active++;max=Math.max(max,active);await wait.promise;active--;throw Object.assign(Error('bad JSON'),{aiParse:true})}};
    const review=ctx.createSubtitleReviewer(ai,'zh-cn');const rows=[row(),row(),row()];
    const tasks=rows.map(r=>review(r,r.candidates));await flush();assert.equal(calls,1);wait.release();await Promise.all(tasks);assert.equal(calls,2);assert.equal(max,1);
    calls=0;const bodyReview=ctx.createSubtitleBodyReviewer({reviewSubtitleBody:async()=>{calls++;throw Object.assign(Error('bad JSON'),{aiParse:true})}});
    await Promise.all([row(),row(),row()].map(r=>bodyReview(r,'1\n00:00:01,000 --> 00:00:03,000\n合成对白\n','srt')));assert.equal(calls,2);
    console.log('PASS AI queue: concurrent callers are serialized; third candidate/body review makes zero model calls after 2 parse failures');
}
(async()=>{await limitsAndDrain();await seasonPipeline();await aiQueue()})().catch(e=>{console.error(e);process.exitCode=1});
