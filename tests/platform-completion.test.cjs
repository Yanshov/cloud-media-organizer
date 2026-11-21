const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'cloud-media-organizer-v3.user.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
function core(extra={}) {
 const ctx=vm.createContext({URL,URLSearchParams,Request,Headers,AbortController,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Date,
  setTimeout,clearTimeout,window:{fetch:async()=>{throw Error('Unmocked network prohibited')}},GM_getValue:(_k,v)=>v,GM_setValue(){},...extra});
 const end=script.indexOf("    if (location.hostname === 'www.guangyapan.com')");
 vm.runInContext(script.slice(0,end)+`globalThis.api={importFile,guangyaListPage,directoryResolver,pan123Node,installHooks,mediaContext,requestJson,requestGuangya,checkJsonTask,currentGuangyaFolder,current123Parent,currentBaiduPath,export123ParentPath,mediaClassificationRoot,initManifestImporter,inspectRequest,apiCode,guangyaCode,apiError,normalized:normalizeFiles,getCapture:()=>({...capture}),setStopped:value=>{jsonTaskStopped=value},setFetch:fn=>{}};})();`,ctx);
 return ctx;
}
async function hooks(){
 for (const platform of ['光鸭','123']) {
  let network=0;const sent=[];
  class XHR {open(...args){sent.push(['open',...args])}setRequestHeader(...args){sent.push(['header',...args])}send(body){sent.push(['send',body])}}
  const href=platform==='光鸭'?'https://www.guangyapan.com/#/home/all/42-test':'https://www.123pan.com/?homeFilePath=0,42';
  const location=new URL(href);const page={Headers,XMLHttpRequest:XHR,fetch:async()=>{network++;return 'original'},localStorage:{getItem:()=>''}};
  const ctx=core({window:page,location}),api=ctx.api;api.installHooks();
  const url=platform==='光鸭'?'https://api.guangyapan.com/userres/v1/file/get_file_list':'https://www.123pan.com/b/api/file/list/new';
  const body=platform==='光鸭'?{parentId:'42'}:{parentFileId:'42'};
  assert.equal(await page.fetch(url,{headers:{Authorization:'Bearer first'},body:JSON.stringify(body)}),'original');
  const field=platform==='光鸭'?'token':'token123';assert.equal(api.getCapture()[field],'first');
  await page.fetch(new Request(url,{method:'POST',headers:new Headers({Authorization:'Bearer refreshed','Content-Type':'application/json'}),body:JSON.stringify(body)}));
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(api.getCapture()[field],'refreshed');
  const xhr=new XHR();xhr.open('POST',url);xhr.setRequestHeader('Authorization','Bearer xhr-session');xhr.send(JSON.stringify(body));
  assert.equal(api.getCapture()[field],'xhr-session');assert.equal(sent.filter(x=>x[0]==='send').length,1);
  await page.fetch('https://unrelated.example/api/file/list',{headers:{Authorization:'Bearer unrelated'}});assert.equal(api.getCapture()[field],'xhr-session');
  if(platform==='123'){assert.equal(api.getCapture().base123,'https://www.123pan.com/b/api');assert.equal(api.current123Parent(),'42')}
  else assert.equal(api.currentGuangyaFolder().id,'42');
  assert.equal(network,3);
 }
 console.log('PASS platform hooks: fetch strings, Request/Headers, XHR, refreshed tokens; original calls preserved; unrelated origins ignored; exact API base/current folder recovered');
}
async function imports(){
 const ctx=core(),api=ctx.api,file={name:'test.mkv',path:'test.mkv',size:1,md5:'a'.repeat(32)};
 let creates=0,polls=0;const post=async endpoint=>{
  if(endpoint.endsWith('get_res_center_token')){creates++;return {code:156,data:{taskId:'t'}}}
  polls++;return polls<3?{code:147}:{data:{fileId:'7',fileName:file.name,fileSize:1,md5:file.md5,parentId:'42'}};
 };
 const result=await api.importFile(file,'42',post,async()=>{});assert.equal(result.status,'saved');assert.equal(creates,1);assert.equal(polls,3);
 let submitted=0;const pending=await api.importFile(file,'42',async()=>{submitted++;throw Error('Response lost after submission')});assert.equal(pending.status,'pending');assert.equal(submitted,1);
 const listing=await api.guangyaListPage(async()=>({data:{list:[],total:0}}),'42',1);assert.equal(listing.items.length,0);
 const node=api.pan123Node({FileId:1,FileName:'empty',Type:0,Size:0,Etag:'a'.repeat(32)});assert.equal(node.size,0);
 console.log('PASS v3 regressions: Guangya 147 actually polls until confirmed, omitted code accepted, no blind create retry, zero-byte 123 file retained');
}
async function stop(){
 let calls=0;const ctx=core({window:{fetch:async()=>{calls++;return {ok:true,json:async()=>({code:0})}}}});
 ctx.api.setStopped(true);await assert.rejects(ctx.api.requestJson('https://api.guangyapan.com/create',{method:'POST'}),e=>e.stop&&e.cancelled);assert.equal(calls,0);
 ctx.api.setStopped(false);await ctx.api.requestJson('https://api.guangyapan.com/list');assert.equal(calls,1);
 console.log('PASS JSON stop: no subsequent read or write request after stop, next task can resume; in-flight requests are not blindly aborted/retried');
}
async function routes(){
 const location=new URL('https://www.123pan.com/#/home?homeFilePath=0,42,84');
 const element={'__reactFiber$mock':{memoizedProps:{rowKey:'fileId',dataSource:[],selectedItems:[85]}}};
 const {api}=core({location,document:{querySelectorAll:()=>[element]}});
 const folders={'0':[{id:'42',name:'影视库',directory:true}],'42':[{id:'84',name:'电影',directory:true}]};
 const drive={parentId:'84',children:async({id})=>folders[id]};
 assert.equal(api.current123Parent(),'84');
 assert.equal(await api.export123ParentPath(drive),'影视库/电影');
 assert.equal(api.mediaClassificationRoot(drive,'影视库/电影').id,'42');
 location.search='?homeFilePath=0,42';assert.equal(api.current123Parent(),'42');
 await assert.rejects(api.export123ParentPath(drive),/无法确认源目录路径/);
 location.href='https://pan.baidu.com/disk/main?path=%2Fother#/index?path=%2Ffolder%2F';
 assert.equal(api.currentBaiduPath(),'/folder');
 location.href='https://pan.baidu.com/disk/main#path=%2Fflat';
 assert.equal(api.currentBaiduPath(),'/flat');
 location.href='https://www.guangyapan.com/#/home/all/42-library/84-%E7%94%B5%E5%BD%B1/85-name-with-dashes';
 api.inspectRequest('https://api.guangyapan.com/userres/v1/file/get_file_list',new Headers({Authorization:'Bearer mock'}),'{"parentId":"85"}');
 const media=await api.mediaContext('光鸭');
 assert.equal(media.path,'library/电影/name-with-dashes');assert.equal(media.selected[0].id,'85');
 assert.equal(api.mediaClassificationRoot(media.source,media.path).id,'0');
 assert.equal(api.mediaClassificationRoot(media.source,'云添加').path,'');
 location.hash='#/home/all/42-library/%ZZ';assert.equal(api.currentGuangyaFolder(),null);
 console.log('PASS shared routes: hash formats, query priority, exact media roots and malformed Guangya paths');
}
async function manifestUI(){
 for(const provider of ['百度','123']){
  const elements=new Map(),writes=[],video={id:'v',key:'v',name:'small.txt',size:2,md5:'a'.repeat(32),directory:false};
  let lists123=0;
  const ui={get:id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:''});return elements.get(id)},busy(){}};
  const start=script.indexOf('    function initManifestImporter('),end=script.indexOf('    function installHooks(',start);
  const ctx=vm.createContext({URL,URLSearchParams,location:{origin:'https://pan.baidu.com'},sleep:async()=>{},panelControls:()=>[],appendLog(){},checkJsonTask(){},normalizeFiles:x=>x,relativeParts:x=>x.split('/'),
   current123Parent:()=> '42',currentBaiduPath:()=>'/target',recover123Session:()=>({base:'https://www.123pan.com/b/api',headers:{}}),getBdstoken:async()=> 'test',paced:(_ms,f)=>f,
   pan123Source:()=>({children:async()=>{lists123++;return writes.length?[video]:[]}}),baiduSource:()=>({children:async()=>[]}),apiCode:r=>r.code,nonNegativeInteger:Number,hasFileMetadata:()=>true,existingFileMessage:()=>'',
   requestJson:async(url,options)=>{writes.push({url,body:options.body});return provider==='123'?{code:0,data:{Reuse:true}}:{errno:0}}
  });
  vm.runInContext(script.slice(script.indexOf('    async function forEachConcurrent('),script.indexOf('    function titleKey('))+script.slice(start,end),ctx);ctx.initManifestImporter(provider,ui);
  ui.get('json').value=JSON.stringify([{name:'small.txt',path:'small.txt',size:2,md5:'a'.repeat(32)}]);await ui.get('transfer').onclick();
  assert.equal(writes.length,1,provider);assert.ok(!writes[0].url.includes('userres'),provider+' must not use Guangya endpoints');
  if(provider==='123'){
   assert.equal(JSON.parse(writes[0].body).parentFileId,'42');assert.match(writes[0].url,/\/b\/api\/file\/upload_request$/);
   assert.equal(lists123,2,'Reuse the initial listing before upload and refresh it for readback');
   assert.match(ui.get('progress').textContent,/确认复用 1/);
  }
  else{assert.equal(new URLSearchParams(writes[0].body).get('path'),'/target/small.txt');assert.match(writes[0].url,/\/api\/rapidupload\?/)}
 }
 console.log('PASS JSON UI: pasted manifest imports directly; Baidu/123 use their own endpoints and current folder, not hard-coded root or Guangya API');
}
async function guangyaExisting(){
 const elements=new Map(),logs=[];let submissions=0,children=[],reads=0;
 const ui={get:id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,checked:false,textContent:''});return elements.get(id)},busy(){},onActivate(){}};
 const base=core().api;
 const start=script.indexOf('    function initGuangya('),end=script.indexOf('    const MEDIA_VIDEO',start);
 const ctx=vm.createContext({URL,VERSION:version,makePanel:()=>ui,bindExportHistory(){},panelControls:()=>[],capture:{token:'test'},jsonTaskStopped:false,currentGuangyaFolder:()=>({id:'42',path:'target'}),
  page:{addEventListener(){},history:{pushState(){},replaceState(){}}},appendLog:(_ui,message)=>logs.push(message),normalizeFiles:x=>x,alignGuangyaImport:files=>({files,alignedPath:''}),
  paced:(_ms,fn)=>fn,requestGuangya:base.requestGuangya,checkJsonTask:base.checkJsonTask,directoryResolver:()=>async()=> '42',guangyaSource:()=>({children:async()=>{reads++;return children}}),relativeParts:value=>value.split('/'),
  existingFileMessage:(node,file)=>{if(node.directory||node.size!==file.size||node.md5!==file.md5)throw Error('同名内容不同，未覆盖');return '已有相同文件，跳过'},
  importFile:async()=>{submissions++;return {status:'saved',message:'confirmed'}},sleep:async()=>{}});
 vm.runInContext(script.slice(script.indexOf('    async function forEachConcurrent('),script.indexOf('    function cachedDriveChildren('))+script.slice(script.indexOf('    async function runGuangyaImportFiles('),start)+script.slice(start,end),ctx);ctx.initGuangya();
 const file={path:'test.mkv',name:'test.mkv',md5:'a'.repeat(32),size:1};
 ui.get('json').value=JSON.stringify([file]);ui.get('syncExisting').checked=false;
 children=[{...file,id:'x'}];await ui.get('start').onclick();assert.equal(submissions,0);assert.match(ui.get('progress').textContent,/同名跳过 1/);
 children=[{...file,id:'x',md5:'b'.repeat(32)}];await ui.get('start').onclick();assert.equal(submissions,0);assert.ok(logs.some(l=>l.includes('未覆盖')));
 children=[];await ui.get('start').onclick();assert.equal(submissions,1);assert.equal(reads,3);
 base.setStopped(true);await ui.get('start').onclick();assert.equal(submissions,1);assert.equal(reads,3);
 assert.ok(logs.some(message => message.includes('导入中断')));
 console.log('PASS ordinary Guangya import: fresh destination lookup; same file skipped, conflicting content never submitted, absent file submitted once');
}
function startup(){
 const boot=fs.readFileSync(path.join(root,'src/bootstrap.js'),'utf8');
 for(const [hostname,expected] of [['www.guangyapan.com',['hooks','ready']],['www.123pan.com',['hooks','ready']],['pan.baidu.com',['ready']]]){
  const calls=[],callbacks=[];const ctx=vm.createContext({location:{hostname},installHooks:()=>calls.push('hooks'),ready:fn=>{calls.push('ready');callbacks.push(fn)},is123Host:h=>h.includes('123pan'),initGuangya:()=>calls.push('json'),initExporter:()=> 'panel',initManifestImporter:()=>calls.push('json'),initMergedMedia:()=>calls.push('merged')});
  vm.runInContext(boot,ctx);assert.deepEqual(calls,expected);callbacks.forEach(fn=>fn());assert.deepEqual(calls.slice(expected.length),hostname==='pan.baidu.com'?['json']:['json','merged']);
 }
 for(const navigator of [
  {userAgentData:{mobile:true}}, {userAgent:'Mozilla/5.0 (Linux; Android 15)'}, {userAgent:'Mozilla/5.0 (iPhone)'},
  {userAgent:'Mozilla/5.0 (iPad)'}, {userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel',maxTouchPoints:5}
 ]) vm.runInNewContext(script,{navigator,window:{get fetch(){assert.fail('Mobile must exit before initializing the script');}}});
 const desktop=core({navigator:{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',maxTouchPoints:10}});
 assert.ok(desktop.api,'Touch-capable PCs still initialize');
 assert.doesNotMatch(script,/@container(max-width:760px)/,'Mobile layout is removed');
 const names=[...script.matchAll(/^    (?:async )?function (\w+)\(/gm)].map(m=>m[1]);assert.equal(new Set(names).size,names.length,'No duplicate function declarations');
 assert.ok(script.includes('id="subtitleViewChoice" value="choice"'));assert.ok(script.includes('// @version      '+version));
 assert.doesNotMatch(script,/字幕校对|subtitleSyncTab|initSubtitleSync|suggestSubtitleSync/,'The installable script must omit subtitle alignment');
 assert.match(script,/id="settingsBasics"/,'Window and appearance share the compact basic settings column');
 assert.equal((script.match(/<summary>导入清单<\/summary>/g)||[]).length,2,'Both import implementations expose one combined entry');
 assert.match(script,/<input id="syncExisting" type="checkbox">/,'Replacing old copies is opt-in');
 console.log('PASS complete startup: hooks before DOM ready; merged media panel on 123/Guangya; JSON on all three; no duplicate declarations; choice filter and version present');
}
(async()=>{await hooks();await imports();await stop();await routes();await manifestUI();await guangyaExisting();startup()})().catch(e=>{console.error(e);process.exitCode=1});
