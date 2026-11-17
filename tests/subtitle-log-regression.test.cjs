const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part=(a,b,source=script)=>source.slice(source.indexOf(a),source.indexOf(b));
const config={assrt:true,assrtToken:'test',shooter:true,language:'zh-cn,zh-tw,zh'};
const valid=new TextEncoder().encode('1\n00:00:01,000 --> 00:00:03,000\n中文字幕 Test\n');
function load(extra={},source=script){
 const ctx=vm.createContext({URL,URLSearchParams,Date,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,
  paced:(_ms,fn)=>fn,sleep:async()=>{},GM_getValue:(_k,v)=>v,GM_setValue:()=>{},...extra});
 vm.runInContext(source.slice(source.indexOf('    function evict('),source.indexOf('    function nonNegativeInteger(')) + part('    function subtitleDownloadUrl(','    function subtitleDrive(',source),ctx);return ctx;
}
const row=episode=>({node:{id:'v'+episode,parentId:'p',size:100000,name:`Love, Death & Robots.2019.S01E${String(episode).padStart(2,'0')}.mp4`},parsed:{query:'Love, Death & Robots',year:2019,tv:true,season:1,episode}});
async function names(){
 const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/love-death-names.json'),'utf8')).packs;
 const ctx=load(),parsed=row(1).parsed;
 const tagged='[V2][简体中英ASS]Love.Death.and.Robots.S01E01.WEBDL.FIX字幕侠 - 副本.ass';
 for(const name of [tagged,'Love.Death.and.Robots.S01E01.Sonnies.Edge.1080p.NF.WEB-DL.DDP5.1.x264-NTG.ass','[繁体中英SRT]Love.Death.and.Robots.S01E01.WEBDL.FIX字幕侠.srt']){
  assert.equal(ctx.subtitleWorkIdentity(parsed,[],name).titleMatched,true,name);
 }
 for(const name of ['Love.Death.and.Robots.2.S01E01.chs.ass','[Another Show]Love.Death.and.Robots.S01E01.chs.ass','Love.Death.and.Robots.2024.S01E01.chs.ass'])assert.equal(ctx.subtitleWorkIdentity(parsed,[],name).titleMatched,false,name);
 assert.equal(ctx.subtitleWorkIdentity({...parsed,query:'Love Death Robots'},[],'Love.Death.and.Robots.S01E01.chs.ass').titleMatched,false,'Do not erase meaningful and');
 let calls=0;const logs=[];
 ctx.subtitleRemoteJson=async raw=>{calls++;assert.equal(new URL(raw).searchParams.get('q'),'Love, Death & Robots S01E01');return {status:0,sub:{subs:fixtures}}};
 const service=ctx.createSubtitleService({log:(...args)=>logs.push(args)});
 for(let ep=1;ep<=4;ep++){
  const r=row(ep);r.candidates=await service.assrtSearch(r,config);ctx.selectSubtitleCandidate(r,config.language);
  assert.ok(r.selectedCandidate,r.node.name);assert.equal(r.selectedCandidate.language,'zh-cn');assert.equal(r.selectedCandidate.bilingual,true);
  assert.ok(r.candidates.every(c=>c.name.includes(`S01E${String(ep).padStart(2,'0')}`)),'Exact episode retained');
  assert.equal(r.selectedCandidate.name,fixtures.flatMap(p=>p.filelist).find(f=>f.f===r.selectedCandidate.name).f,'Actual name preserved');
 }
 assert.equal(calls,1);assert.equal(logs.filter(l=>l[0]==='Assrt 整季复用').length,3);
 ctx.VERSION='test';ctx.subtitleRemoteJson=async()=>({data:[{attributes:{language:'zh-cn',feature_details:{title:'Love Death and Robots',feature_type:'Episode',season_number:1,episode_number:1},files:[{file_id:1,file_name:tagged}]}}]});
 assert.equal((await ctx.createSubtitleService().search(row(1),{...config,key:'test'}))[0].titleMatched,true,'OpenSubtitles uses the same title normalization');
 console.log('PASS log regression: actual Love/Death resource and file names cover the previously reported mismatch; &/and + version/language tags fixed; observed E01-E04 need 1 search/3 season hits, select simplified bilingual; wrong title/sequel/year remain unconfirmed');
}
async function cooldown(){
 let now=1000000,calls=0,mode='limit',cancel=false;const logs=[],waits=[];
 class FakeDate extends Date{static now(){return now}}
 const remote=async raw=>{calls++;if(mode==='limit')throw Object.assign(Error('HTTP 509'),{status:509});return {status:0,sub:{subs:[{id:1,filelist:[{f:'Love.Death.and.Robots.S01E01.chs.ass',url:'https://file0.assrt.net/test'}]}]}}};
 const ctx=load({Date:FakeDate,subtitleRemoteJson:remote}),service=ctx.createSubtitleService({check:()=>{if(cancel)throw Error('已停止')},wait:async ms=>{waits.push(ms);now+=ms},log:(...a)=>logs.push(a)});
 await assert.rejects(service.assrtSearch(row(1),config),/限流重试已停止/);assert.equal(calls,3);
 const blockedAt=now;await assert.rejects(service.assrtSearch(row(2),config),/仍在冷却/);assert.equal(calls,3);
 mode='ok';const result=await service.download({source:'Assrt',assrtId:1,parsed:row(1).parsed},config);
 assert.equal(result.ext,'ass');assert.equal(calls,4);assert.equal(now-blockedAt,180000);assert.equal(logs.filter(l=>l[0]==='Assrt 下载等待').length,1);assert.ok(waits.every(ms=>ms<=500));
 // If the provider remains limited, the batch must stop rather than reject every sibling file.
 now+=60001;mode='limit';await assert.rejects(service.download({source:'Assrt',assrtId:2,parsed:row(1).parsed},config),e=>e.stop&&e.assrtCooldown);
 const before=calls;cancel=false;const cancelService=ctx.createSubtitleService({check:()=>{if(cancel)throw Error('已停止')},wait:async ms=>{now+=ms;if(mode==='cancel')cancel=true}});
 await assert.rejects(cancelService.assrtSearch(row(1),config),/限流重试已停止/);mode='cancel';
 const beforeCancel=calls;await assert.rejects(cancelService.download({source:'Assrt',assrtId:1,parsed:row(1).parsed},config),/已停止/);assert.equal(calls,beforeCancel);assert.ok(beforeCancel>before);
 console.log('PASS log cooldown: search stays fail-fast; download waits existing cooldown once in cancellable 500ms steps, then fetches selected file; renewed quota exhaustion stops batch; cancellation makes no new request');
}
async function details(){
 let now=100000,calls=0,transfers=0;const urls=[];
 class FakeDate extends Date{static now(){return now}}
 const files=(n)=>[1,2].map(ep=>({f:`Love.Death.and.Robots.S01E0${ep}.简体&英文.ass`,url:`https://file0.assrt.net/${n}/${ep}`}));
 const ctx=load({Date:FakeDate,subtitleRemoteJson:async()=>({status:0,sub:{subs:[{id:1,filelist:files(++calls)}]}}),GM_xmlhttpRequest:o=>{urls.push(o.url);queueMicrotask(()=>o.onload(++transfers===1?{status:403}:{status:200,response:valid.buffer}));return {abort(){}}}});
 const service=ctx.createSubtitleService({wait:async ms=>{now+=ms}}),candidate=ep=>({source:'Assrt',assrtId:1,parsed:row(ep).parsed,assrtFileName:files(0)[ep-1].f});
 await service.download(candidate(1),config);await service.download(candidate(2),config);assert.equal(calls,1,'Same resource serves different exact episode files');
 const data=await service.fetchFile(candidate(1),config);assert.equal(data.bytes.length,valid.length);assert.equal(calls,2,'403 invalidates cached detail and refreshes');assert.deepEqual(urls,['https://file0.assrt.net/1/1','https://file0.assrt.net/2/1']);
 await service.download(candidate(2),{...config,assrtToken:'other'});assert.equal(calls,3,'No cross-account URL reuse');
 now+=60001;await service.download(candidate(1),config);assert.equal(calls,4,'TTL expires');
 service.logout();await service.download(candidate(1),config);assert.equal(calls,5,'Logout clears details');
 console.log('PASS log detail cache: same package reuses fresh details across episode files; exact file choice retained; signed 403 forces new URL; account isolation, 60s TTL and logout verified');
}
function loadDrive(ctx,context){
 vm.runInContext(part('    function subtitleMd5(','    function subtitleDownloadUrl('),ctx);
 vm.runInContext(part('    function subtitleDrive(','    function subtitleInventory('),ctx);
 return context ? ctx.subtitleDrive(context,async()=>{}) : null;
}
async function auth(){
 let calls=0,providerCalls=0;const ctx=load({requestJson:async()=>{calls++;throw Object.assign(Error('HTTP 401'),{status:401,stop:true})}});
 const drive=loadDrive(ctx,{session:{provider:'光鸭',token:'test'},source:{children:async()=>{throw Error('Must not list after auth failure')}}});
 const service={assrtSearch:async()=>[],shooterHash:async()=>{providerCalls++;return []}};
 const r=row(1);await assert.rejects(ctx.searchSubtitleSources(r,config,service,drive),e=>e.phase==='drive-auth'&&e.stop&&/重新检查目录/.test(e.message));assert.equal(calls,1);assert.equal(providerCalls,0);assert.match(r.error,/网盘登录失效或权限不足/);
 await assert.rejects(drive.sample(row(2)),e=>e.phase==='drive-auth');await assert.rejects(drive.save(row(1),'test.srt',valid),e=>e.phase==='drive-auth');assert.equal(calls,1,'Known invalid drive session makes no further network calls');
 const providerError={...service,assrtSearch:async()=>{throw Object.assign(Error('Provider HTTP 401'),{status:401,stop:true})}};
 const other=row(2);await ctx.searchSubtitleSources(other,config,providerError,{sample:async()=> 'hash'});assert.equal(providerCalls,1,'Provider auth errors still permit other sources');
 // Source directory auth errors share the same fatal boundary.
 let lists=0;const listed=loadDrive(ctx,{session:{provider:'123',token:'test'},source:{children:async()=>{lists++;throw Object.assign(Error('API code 110'),{stop:true})}}});
 await assert.rejects(listed.save(row(1),'test.srt',valid),e=>e.phase==='drive-auth'&&e.stop);await assert.rejects(listed.save(row(2),'test.srt',valid),e=>e.phase==='drive-auth');assert.equal(lists,1);
 console.log('PASS log drive auth: real drive API 401 propagates through shooter sampling; records useful error; later sample/save make zero requests; directory code 110 stops too; subtitle provider 401 retains source fallback');
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
 ctx.createSubtitleService=()=>({assrtSearch:async()=>{searches++;return []},shooterHash:async()=>{throw Error('Must not query shooter')},fetchFile:async()=>{downloads++;throw Error('Must not download')}});
 vm.runInContext(part('    function subtitleInventory(','    if (location.hostname'),ctx);ctx.initSubtitles();elements.get('assrtToken').value='test';elements.get('useThunder').checked=false;
 await elements.get('readSubtitles').onclick();assert.equal(searches,1);assert.equal(apiCalls,1);assert.match(elements.get('subtitleLog').value,/查找中断.*网盘登录失效或权限不足/);assert.ok(!elements.get('subtitleLog').value.includes('Love, Death & Robots.2019.S01E02.mp4 · 射手'));
 await elements.get('searchSubtitles').onclick();assert.equal(searches,1);assert.equal(apiCalls,1);
 await elements.get('fillSubtitles').onclick();assert.equal(downloads,0);assert.equal(apiCalls,1);assert.match(elements.get('subtitleProgress').textContent,/重新检查目录/);
 console.log('PASS log UI integration: 2-video search halts on first drive auth failure; repeated search/fill do not query providers, download files or upload with known invalid session; actionable status shown');
}
async function uiCooldown(){
 const elements=new Map();let downloads=0,samples=0,saves=0;
 const element=()=>({value:'',checked:false,disabled:false,hidden:false,dataset:{},style:{},children:[],textContent:'',append(...c){this.children.push(...c)},appendChild(c){this.children.push(c)},replaceChildren(...c){this.children=c},querySelectorAll(){return []}});
 const videos=[row(1).node,row(2).node].map(n=>({...n,folders:[],path:n.name}));
 const ctx=load({document:{createElement:element},makePanel:(_title,html)=>{
  for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=element();el.checked=/\bchecked\b/.test(tag[0]);el.disabled=/\bdisabled\b/.test(tag[0]);elements.set(tag[1],el)}
  return {get:id=>elements.get(id),moveSettings(){},openSettings(){},busy(){}};
 },mediaContext:async()=>({selected:videos,source:{},path:'剧集'}),selectedTreeCache:{stale:true},
 collectMediaSelection:async()=>({videos,linked:new Map()}),parseMediaName:name=>row(Number(name.match(/E(\d+)/)[1])).parsed,mediaBonusName:()=>false,mediaRecords:{get:()=>null},
 subtitleDrive:()=>({assertReady(){},reconcile:async()=>[],sample:async()=>{samples++;return 'hash'},save:async()=>{saves++}})});
 ctx.createSubtitleService=()=>({assrtSearch:async r=>[1,2,3].map(id=>({source:'Assrt',assrtId:id,name:`Love.Death.and.Robots.S01E0${r.parsed.episode}.简体&英文.ass`,language:'zh-cn',bilingual:true,titleMatched:true})),fetchFile:async()=>{downloads++;throw Object.assign(Error('限流重试已停止'),{assrtCooldown:true,stop:true})}});
 vm.runInContext(part('    function subtitleInventory(','    if (location.hostname'),ctx);ctx.initSubtitles();elements.get('assrtToken').value='test';elements.get('useThunder').checked=false;
 await elements.get('readSubtitles').onclick();assert.match(elements.get('subtitleSummary').textContent,/可补齐 2/);
 await elements.get('fillSubtitles').onclick();assert.equal(downloads,1,'Do not burn siblings or later videos');assert.equal(samples,0);assert.equal(saves,0);
 assert.match(elements.get('subtitleLog').value,/下载暂停/);assert.ok(!elements.get('subtitleLog').value.includes('[候选失败]'));
 assert.match(elements.get('subtitleSummary').textContent,/可补齐 2/);assert.match(elements.get('subtitleSummary').textContent,/失败 0/);
 console.log('PASS log UI cooldown: renewed rate limit pauses on first candidate; no sibling failures, deferred queries or uploads; both videos remain ready with zero failed count');
}
(async()=>{await names();await cooldown();await details();await auth();await uiAuth();await uiCooldown()})().catch(e=>{console.error(e);process.exitCode=1});
