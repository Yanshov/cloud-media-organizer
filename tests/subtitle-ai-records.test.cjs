const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const src = fs.readFileSync('cloud-media-organizer-v3.user.js','utf8');
function part(a,b) { const i=src.indexOf(a), j=src.indexOf(b,i); assert.ok(i>=0 && j>i); return src.slice(i,j); }
(async () => {
  const calls=[];
  const ctx=vm.createContext({URL, location:{hostname:'example.com'}, GM_getValue:(_k,d)=>d, GM_setValue(){}, evict(){},
    mediaFileMetadata:async node=>{ calls.push(node.id); return {md5:'a'.repeat(32)}; },
    GM_xmlhttpRequest:r=>{const body=JSON.parse(r.data); calls.push(body); if(body.response_format) r.onload({status:400}); else r.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:'<think>分析…</think>{"index":0,"confidence":0.95}'}}]})});}});
  vm.runInContext(part('    function mediaAIEndpoint(', '    function validateMediaAIIdentity(')+part('    const mediaRecords =', '    function mediaCandidatePreference(')+'\nthis.records=mediaRecords;',ctx);
  assert.equal(ctx.parseMediaAIResponse('<think>分析…</think>{"index":0,"confidence":0.95}').index,0);
  assert.equal(ctx.parseMediaAIResponse('说明 ```json\n{"text":"a } \\\" b","index":0}\n```').index,0);
  assert.throws(()=>ctx.parseMediaAIResponse('bad secret123 https://example.com/path',['secret123']),e=>e.aiParse && !e.message.includes('secret123') && !e.message.includes('example.com'));
  const ai=ctx.createMediaAI({base:'https://example.com/v1',key:'secret',model:'test'});
  await ai.disambiguateSubtitle({}); await ai.disambiguateSubtitle({});
  assert.equal(calls.length,3); assert.ok(calls[0].response_format); assert.equal(calls[1].response_format,undefined); assert.equal(calls[2].response_format,undefined);
  const node={id:'1',parentId:'2',name:'a.mkv',size:20,md5:'a'.repeat(32)};
  ctx.records.remember({node,detail:{title:'A'},match:'movie:1',title:'A',type:'movie'});
  const absent={...node,md5:''}; assert.ok(await ctx.records.restore(absent,{}));
  const changed={...node,md5:'',name:'b.mkv'}; assert.equal(await ctx.records.restore(changed,{}),undefined); assert.equal(calls.filter(x=>x==='1').length,1);
  console.log('PASS AI JSON parsing, redaction, 400 fallback persistence and strict record restoration');
})().catch(e=>{console.error(e);process.exitCode=1});
