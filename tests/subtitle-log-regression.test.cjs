const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part=(a,b,source=script)=>source.slice(source.indexOf(a),source.indexOf(b));
const config={language:'zh-cn,zh-tw,zh'};
const valid=new TextEncoder().encode('1\n00:00:01,000 --> 00:00:03,000\n中文字幕 Test\n');
function load(extra={},source=script){
 const ctx=vm.createContext({URL,URLSearchParams,Date,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,
  paced:(_ms,fn)=>fn,sleep:async()=>{},GM_getValue:(_k,v)=>v,GM_setValue:()=>{},...extra});
 vm.runInContext(source.slice(source.indexOf('    function evict('),source.indexOf('    function nonNegativeInteger(')) + part('    function subtitleDownloadUrl(','    function subtitleDrive(',source),ctx);return ctx;
}
const row=episode=>({node:{id:'v'+episode,parentId:'p',size:100000,name:`Love, Death & Robots.2019.S01E${String(episode).padStart(2,'0')}.mp4`},parsed:{query:'Love, Death & Robots',year:2019,tv:true,season:1,episode}});
async function names(){
 const ctx=load(),parsed=row(1).parsed;
 const tagged='[V2][简体中英ASS]Love.Death.and.Robots.S01E01.WEBDL.FIX字幕侠 - 副本.ass';
 for(const name of [tagged,'Love.Death.and.Robots.S01E01.Sonnies.Edge.1080p.NF.WEB-DL.DDP5.1.x264-NTG.ass','[繁体中英SRT]Love.Death.and.Robots.S01E01.WEBDL.FIX字幕侠.srt']){
  assert.equal(ctx.subtitleWorkIdentity(parsed,[],name).titleMatched,true,name);
 }
 for(const name of ['Love.Death.and.Robots.2.S01E01.chs.ass','[Another Show]Love.Death.and.Robots.S01E01.chs.ass','Love.Death.and.Robots.2024.S01E01.chs.ass'])assert.equal(ctx.subtitleWorkIdentity(parsed,[],name).titleMatched,false,name);
 assert.equal(ctx.subtitleWorkIdentity({...parsed,query:'Love Death Robots'},[],'Love.Death.and.Robots.S01E01.chs.ass').titleMatched,false,'Do not erase meaningful and');
 ctx.VERSION='test';ctx.subtitleRemoteJson=async()=>({data:[{attributes:{language:'zh-cn',feature_details:{title:'Love Death and Robots',feature_type:'Episode',season_number:1,episode_number:1},files:[{file_id:1,file_name:tagged}]}}]});
 assert.equal((await ctx.createSubtitleService().search(row(1),{...config,key:'test'}))[0].titleMatched,true,'OpenSubtitles uses the same title normalization');
 console.log('PASS log regression: actual Love/Death filenames and OpenSubtitles share title normalization; wrong title, sequel and year stay unconfirmed');
}
function loadDrive(ctx,context){
 vm.runInContext(part('    function subtitleMd5(','    function subtitleDownloadUrl('),ctx);
 vm.runInContext(part('    function subtitleDrive(','    function subtitleInventory('),ctx);
 return context ? ctx.subtitleDrive(context,async()=>{}) : null;
}
async function auth(){
 let calls=0,providerCalls=0;const ctx=load({requestJson:async()=>{calls++;throw Object.assign(Error('HTTP 401'),{status:401,stop:true})}});
 const drive=loadDrive(ctx,{session:{provider:'光鸭',token:'test'},source:{children:async()=>{throw Error('Must not list after auth failure')}}});
 const service={thunderSearch:async()=>{providerCalls++;return []}};
 const r=row(1);await ctx.searchSubtitleSources(r,{...config,thunder:true},service,drive);assert.equal(calls,0);assert.equal(providerCalls,1,'Subtitle searches use title providers without reading video bytes');
 await assert.rejects(drive.read({id:'s',name:'test.srt',size:valid.length,md5:'a'.repeat(32)}),e=>e.phase==='drive-auth');await assert.rejects(drive.save(row(1),'test.srt',valid),e=>e.phase==='drive-auth');assert.equal(calls,1,'Known invalid drive session makes no further network calls');
 const providerError={thunderSearch:async()=>{throw Object.assign(Error('Provider HTTP 401'),{status:401,stop:true})}};
 const other=row(2);await ctx.searchSubtitleSources(other,{...config,thunder:true},providerError,{});assert.equal(ctx.subtitleSearchState(other),'missing');assert.match(other.searchMessage,/查询有失败/);
 // Source directory auth errors share the same fatal boundary.
 let lists=0;const listed=loadDrive(ctx,{session:{provider:'123',token:'test'},source:{children:async()=>{lists++;throw Object.assign(Error('API code 110'),{stop:true})}}});
 await assert.rejects(listed.save(row(1),'test.srt',valid),e=>e.phase==='drive-auth'&&e.stop);await assert.rejects(listed.save(row(2),'test.srt',valid),e=>e.phase==='drive-auth');assert.equal(lists,1);
 console.log('PASS log drive auth: title search makes no video-byte request; real subtitle read 401 stops later writes; directory auth and isolated provider errors remain guarded');
}
async function uiAuth(){
 const elements=new Map();let apiCalls=0,searches=0,downloads=0;
 const element=()=>({value:'',checked:false,disabled:false,hidden:false,dataset:{},style:{},children:[],textContent:'',append(...c){this.children.push(...c)},appendChild(c){this.children.push(c)},replaceChildren(...c){this.children=c},querySelectorAll(){return []}});
 const videos=[row(1).node,row(2).node].map(n=>({...n,folders:[],path:n.name}));
 const ctx=load({requestJson:async()=>{apiCalls++;throw Object.assign(Error('HTTP 401'),{stop:true,status:401})},document:{createElement:element},makePanel:(_title,html)=>{
  for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=element();el.checked=/\bchecked\b/.test(tag[0]);el.disabled=/\bdisabled\b/.test(tag[0]);elements.set(tag[1],el)}
  return {get:id=>elements.get(id),moveSettings(){},openSettings(){},busy(){}};
 },mediaContext:async()=>({selected:videos,session:{provider:'光鸭',token:'test'},source:{},path:'剧集'}),selectedTreeCache:{stale:true},
 collectMediaSelection:async()=>({videos,linked:new Map()}),parseMediaName:name=>row(Number(name.match(/E(\d+)/)[1])).parsed,mediaBonusName:()=>false,mediaRecords:{get:()=>null}});
 loadDrive(ctx,null); // Install actual drive factory without invoking its operations.
  ctx.createSubtitleService=()=>({thunderSearch:async()=>{searches++;return []},fetchFile:async()=>{downloads++;throw Error('Must not download')}});
 vm.runInContext(part('    function subtitleInventory(','    if (location.hostname'),ctx);ctx.initSubtitles();
  await elements.get('readSubtitles').onclick();assert.equal(searches,2);assert.equal(apiCalls,0);assert.match(elements.get('subtitleLog').value,/查找结束/);
  await elements.get('readSubtitles').onclick();assert.equal(searches,4);assert.equal(apiCalls,0);
  await elements.get('fillSubtitles').onclick();assert.equal(downloads,0);assert.equal(apiCalls,0);
  console.log('PASS log UI integration: title search starts after inventory without video sampling; repeat search and empty fill make no unrelated drive requests');
}
async function uiStop(){
  const elements=new Map();let downloads=0,saves=0;
 const element=()=>({value:'',checked:false,disabled:false,hidden:false,dataset:{},style:{},children:[],textContent:'',append(...c){this.children.push(...c)},appendChild(c){this.children.push(c)},replaceChildren(...c){this.children=c},querySelectorAll(){return []}});
 const videos=[row(1).node,row(2).node].map(n=>({...n,folders:[],path:n.name}));
 const ctx=load({document:{createElement:element},makePanel:(_title,html)=>{
  for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=element();el.checked=/\bchecked\b/.test(tag[0]);el.disabled=/\bdisabled\b/.test(tag[0]);elements.set(tag[1],el)}
  return {get:id=>elements.get(id),moveSettings(){},openSettings(){},busy(){}};
 },mediaContext:async()=>({selected:videos,source:{},path:'剧集'}),selectedTreeCache:{stale:true},
 collectMediaSelection:async()=>({videos,linked:new Map()}),parseMediaName:name=>row(Number(name.match(/E(\d+)/)[1])).parsed,mediaBonusName:()=>false,mediaRecords:{get:()=>null},
  subtitleDrive:()=>({assertReady(){},reconcile:async()=>[],save:async()=>{saves++}})});
  ctx.createSubtitleService=()=>({thunderSearch:async r=>[1,2,3].map(id=>({source:'迅雷',fileId:id,name:`Love.Death.and.Robots.S01E0${r.parsed.episode}.简体&英文.ass`,language:'zh-cn',bilingual:true,titleMatched:true})),fetchFile:async()=>{downloads++;throw Object.assign(Error('限流重试已停止'),{stop:true})}});
 vm.runInContext(part('    function subtitleInventory(','    if (location.hostname'),ctx);ctx.initSubtitles();
 await elements.get('readSubtitles').onclick();assert.match(elements.get('subtitleSummary').textContent,/没有字幕 2/);
  await elements.get('fillSubtitles').onclick();assert.equal(downloads,1,'Do not burn siblings or later videos');assert.equal(saves,0);
 assert.match(elements.get('subtitleLog').value,/补齐中断/);assert.ok(!elements.get('subtitleLog').value.includes('[候选失败]'));
 assert.match(elements.get('subtitleSummary').textContent,/没有字幕 2/);
 console.log('PASS log UI stop: fatal download error pauses on first candidate; no sibling failures, deferred queries or uploads; remaining work is not attempted');
}
(async()=>{await names();await auth();await uiAuth();await uiStop()})().catch(e=>{console.error(e);process.exitCode=1});
