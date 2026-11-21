const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i,a);return source.slice(i,j)};
const load=(code,extras={})=>{const ctx=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Date,VERSION:'2.21.0',...extras});vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+code,ctx);return ctx};
const noop=()=>{};
const MEDIA_VIDEO=/\.(mkv|mp4)$/i,MEDIA_SUB=/\.(srt|ass|ssa|vtt)$/i;
const matchSelected=(nodes,selected)=>nodes.filter(n=>selected.some(s=>s.id===n.id));
const core=part('    function nonNegativeInteger(', '    function existingFileMessage(');
function languageAndLinking(){
 const ctx=load(part('    function mediaSubtitleSuffix(', '    const tmdbClients'),{MEDIA_VIDEO,MEDIA_SUB,matchSelected,mediaStem:n=>n.replace(/\.[^.]+$/,''),hasFileMetadata:()=>true});
 return (async()=>{
 const video={id:'v',name:'电影.2000.mkv'},subtitle={id:'s',name:''};
 for(const [suffix,canonical] of [['.zh-cn','.zh-cn'],['.zh.cn','.zh-cn'],['.ZH_CN','.zh-CN'],['.zh-tw.en','.zh-tw.en'],['.zh.hans','.zh-hans'],['.zh-hant','.zh-hant'],['.简体&英文','.简体.英文'],['.简英','.简英']]){
  subtitle.name='电影.2000'+suffix+'.ass';const result=ctx.mediaSubtitleSuffix(video.name,subtitle.name);assert.equal(result,canonical);
  subtitle.name='电影.2000'+result+'.ass';let reads=0;
  const drive={parentId:'p',children:async()=>{reads++;return [video,subtitle]}};
  const scan=await ctx.collectMediaSelection([video],drive);assert.equal(scan.linked.get('v').length,1);assert.equal(reads,1,'Sibling listing reused within one scan');
 }
 for(const suffix of ['2','.2001','.S01E02','.unknown'])assert.equal(ctx.mediaSubtitleSuffix(video.name,'电影.2000'+suffix+'.srt'),null);
 const original={id:'original',name:'电影.2000.zh.srt'};
 const legacy={id:'legacy',name:'different-basename.zh.synced.srt'};
 const historicalLink={videoId:'v',language:'zh',variant:'sync'};
 const history={load:()=>new Map(),get:node=>node===legacy?historicalLink:null,associated:(_record,node)=>node===video};
 const linked=ctx.mediaSubtitleLinks([video,original,legacy],'p',history).linked.get('v');
 assert.deepEqual(Array.from(linked,sub=>sub.suffix),['.zh','.zh.synced'],'Previously saved copies keep a distinct suffix during organization');
 assert.equal(ctx.mediaSubtitleSuffix(video.name,'电影.2000.zh.synced.srt'),'.zh.synced');
 let nodes=[video],reads=0;const drive={parentId:'p',children:async()=>{reads++;return nodes}};
 await ctx.collectMediaSelection([video],drive);nodes=[video,{id:'s',name:'电影.2000.zh-cn.srt'}];
 const scan=await ctx.collectMediaSelection([video],drive);assert.equal(scan.linked.get('v').length,1);assert.equal(reads,2,'Every new scan reads fresh data');
 let stopped=false;await assert.rejects(ctx.collectMediaSelection([video],drive,noop,()=>{if(stopped)throw Error('stop');stopped=true}),/stop/);
 const lang=load(part('    function subtitleDownloadUrl(', '    function subtitleDrive('));
 for(const [name,wanted,result] of [['电影.zh.cn.srt','zh-cn',true],['电影.zh-Hans.srt','zh-cn',true],['电影.zh-hant.srt','zh-tw',true],['电影.简英.ass','en',true],['电影.繁英.ass','en',true],['电影.zh-cn.srt','zh-cn,zh-tw,zh',true],['电影.en.srt','zh',false],['电影.zh-tw.srt','zh-cn',false],['untagged.srt','zh',false]])assert.equal(lang.subtitleLanguageMatch(name,wanted),result,name);
 console.log('PASS audit links: canonical/legacy language suffixes and bilingual filenames survive rename/rescan; unrelated titles stay unlinked; fresh scans plus one listing per directory; cancellation; unified language tags');
 })();
}
async function guangyaListing(){
 const ctx=load(core+part('    async function readPages(', '    function decimalId(')+part('    async function guangyaListPage(', '    function currentGuangyaFolder(')+part('    function guangyaSource(', '    function replacementJournalKey('),{
  API:{list:'/list',mkdir:'/mkdir'},paced:(_ms,fn)=>fn,guangyaCode:r=>r.code,apiError:()=>Object.assign(Error('api'),{stop:true}),readExportHistory:()=>({}),

  decimalId:v=>Number.isSafeInteger(v)&&v>=0?String(v):typeof v==='string'&&/^\d+$/.test(v)?v:null,
  relativeParts:p=>p.split('/').filter(Boolean),requestJson:async()=>({code:0,data:{list:[{fileId:12,fileName:'目录',resType:2}]}})
 });
 const src=ctx.guangyaSource('token',false);const nodes=await src.children({id:'0'});assert.equal(nodes[0].id,'12');assert.equal(nodes[0].key,'12');
 for(const data of [null,[],{list:{}},{hasMore:true},{total:2}]){
  const post=async()=>({code:0,data});await assert.rejects(ctx.guangyaListPage(post,'0',1),/格式异常|列表不完整/);
  await assert.rejects(ctx.directoryResolver('0',post)('movie'),/格式异常|列表不完整/);
 }
 for(const data of [undefined,{}, {list:[],total:0}])assert.equal((await ctx.guangyaListPage(async()=>({code:0,data}),'0',1)).items.length,0);
 let creates=0;const post=async(endpoint)=>{if(endpoint==='/mkdir'){creates++;return {code:0,data:{fileId:'77'}}}return {code:0,data:{list:[{fileId:12,fileName:'existing',resType:2}]}}};
 const ensure=ctx.directoryResolver('0',post);assert.equal(await ensure('existing'),'12');assert.equal(await ensure('new'),'77');assert.equal(await ensure('new'),'77');assert.equal(creates,1);
 const paged=await ctx.readPages((page,count)=>ctx.guangyaListPage(async()=>({code:0,data:{list:page===1?[{fileId:'1'},{fileId:'2'}]:[{fileId:'3'}],total:3}}),'0',page,count),f=>f.fileId);assert.equal(paged.length,3);
 console.log('PASS audit Guangya: numeric IDs normalized; shared listing parser rejects null/malformed/incomplete responses in reader and importer; omitted empty data supported; directory creation reused once');
}
async function replacements(){
 const files=[{path:'a.mkv',md5:'a'.repeat(32),size:1},{path:'b.mkv',md5:'b'.repeat(32),size:2},{path:'c.mkv',md5:'c'.repeat(32),size:3}];
 for(const mode of ['result-stop','throw-stop','normal']){
  let calls=0,cleanups=0,saves=0;const journal={pending:{stage:'delete-pending'}};
  const ctx=load(part('    async function runGuangyaReplacement(', '    function initGuangya('),{
   sleep:async()=>{},readReplacementJournal:()=>journal,readExportHistory:()=>({}),writeExportHistory:()=>{saves++},relativeParts:p=>p.split('/'),
   replaceGuangyaFile:async()=>{calls++;if(calls===2&&mode!=='normal'){if(mode==='throw-stop')throw Object.assign(Error('403'),{stop:true});return {status:'pending',message:'403',stop:true}}return {status:'done',message:'ok',cleanupKey:'k',deleted:true}},
   cleanupGuangyaOldDirectories:async()=>{cleanups++;return {removed:1,failed:0}}
  });
  const counts=await ctx.runGuangyaReplacement(files,{id:'0'},{actions:new Map(files.map(f=>[f.path,{kind:'replace'}]))},{},noop,noop,noop,noop);
  assert.equal(calls,3);assert.equal(cleanups,mode==='normal'?1:0);assert.equal(saves,1);assert.ok(journal.pending);
  assert.equal(counts.processed,3);
 }
 for(const phase of ['verify','delete']){
  let reads=0,deletes=0,writes=0;const journal={a:{file:files[0],newFileId:'new',directories:[{id:'dir',parentId:'p',name:'old',path:'old'}]},b:{file:files[1],newFileId:'new',directories:[]}};
  const ctx=load(part('    async function cleanupGuangyaOldDirectories(', '    async function runGuangyaReplacement('),{
   sleep:async()=>{},relativeParts:path=>path.split('/'),writeReplacementJournal:()=>{writes++},readGuangyaDestination:async()=>{reads++;if(phase==='verify')throw Object.assign(Error('403'),{stop:true});return {id:'new'}},
   removeGuangyaNode:async()=>{deletes++;throw Object.assign(Error('403'),{stop:true})}
  });
  const source={children:async({id})=>id==='p'?[{id:'dir',name:'old',directory:true}]:[]};
  const r=await ctx.cleanupGuangyaOldDirectories(new Set(['a','b']),{id:'0'},{protectedDirectories:new Set()},source,noop,journal,noop,noop);
  assert.equal(reads,2);assert.equal(deletes,phase==='verify'?0:1);assert.equal(r.failed,2);assert.equal(writes,1);assert.deepEqual(Object.keys(journal),['a','b']);
 }
 console.log('PASS audit replacements: returned and thrown stop halt file work and skip cleanup; verify/delete auth failures halt directory cleanup and retain journal; normal path still cleans and saves history');
}
function panel(){
 const elements=new Map(),locks=[];const get=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,disabled:false,textContent:'',click(){}});return elements.get(id)};
 return {get,locks,busy:v=>locks.push(v),onActivate:noop};
}
async function imports(){
 const ctx=load(part('    function initManifestImporter(', '    function installHooks('),{
  panelControls:ui=>[ui.get('manifest'),ui.get('transfer')],appendLog:noop,normalizeFiles:()=>[],current123Parent:()=> '0',recover123Session:()=>({base:'https://example.com',headers:{}}),paced:(_ms,f)=>f,pan123Source:()=>({children:async()=>[]})
 });
 const ui=panel();ctx.initManifestImporter('123',ui);
 assert.equal(await ui.get('manifest').onchange({target:{files:[]}}),undefined);assert.deepEqual(ui.locks,[]);
 await ui.get('manifest').onchange({target:{files:[{name:'list.json',text:async()=>{assert.equal(ui.get('transfer').disabled,true);return '[]'}}]}});
 assert.deepEqual(ui.locks,[true,false]);assert.equal(ui.get('transfer').disabled,false);
 ui.locks.length=0;await ui.get('manifest').onchange({target:{files:[{text:async()=>{throw Error('read broke')}}]}});assert.deepEqual(ui.locks,[true,false]);assert.match(ui.get('progress').textContent,/read broke/);
 const ui2=panel();
 const ctx2=load(part('    async function runGuangyaImportFiles(', '    function initGuangya(')+part('    function initGuangya(', '    const MEDIA_VIDEO'),{
  VERSION:'2.21.0',makePanel:()=>ui2,bindExportHistory:noop,panelControls:ui=>[ui.get('jsonFile'),ui.get('start')],capture:{token:'test'},
  currentGuangyaFolder:()=>({id:'0',path:'根目录'}),page:{addEventListener:noop,history:{pushState:noop,replaceState:noop}},appendLog:noop,jsonTaskStopped:false,
  normalizeFiles:x=>x,alignGuangyaImport:files=>({files,alignedPath:''}),paced:(_ms,f)=>f,directoryResolver:()=>async()=>'',guangyaSource:()=>({children:async()=>[]}),sleep:async()=>{}
 });
 ctx2.initGuangya();ui2.get('syncExisting').checked=false;
 await ui2.get('jsonFile').onchange({target:{files:[]}});assert.deepEqual(ui2.locks,[]);
 await ui2.get('jsonFile').onchange({target:{files:[{text:async()=>{assert.equal(ui2.get('start').disabled,true);return '[]'}}]}});
 assert.deepEqual(ui2.locks,[true,false]);assert.equal(ui2.get('start').disabled,false);
 ui2.locks.length=0;await ui2.get('jsonFile').onchange({target:{files:[{text:async()=>{throw Error('broken')}}]}});assert.deepEqual(ui2.locks,[true,false]);assert.match(ui2.get('progress').textContent,/broken/);
 console.log('PASS audit imports: one lock across file read/import, no transient unlock; both UIs release after errors/early return; cancelled file chooser does not import pasted JSON');
}
async function importRunner(){
 let stopped=false,submissions=0,directories=0;const logs=[];const valid={name:'same.mkv',path:'same.mkv',type:'file',size:1,md5:'a'.repeat(32)};
 const ctx=load(part('    async function runGuangyaImportFiles(', '    function initGuangya('),{
  relativeParts:path=>path?path.split('/'):[],existingFileMessage:(node,file)=>{if(node.md5!==file.md5)throw Error('同名内容不同，未覆盖');return '相同文件，跳过'},
  importFile:async()=>{submissions++;return {status:'pending',message:'await check'}},sleep:async()=>{},
 });
 const files=[{...valid},{...valid,name:'pending.mkv',path:'pending.mkv'},{name:'folder',path:'folder',type:'directory'},{...valid,name:'conflict.mkv',path:'conflict/conflict.mkv'}];
 const existing={children:async({id})=>id==='root'?[valid]:id==='root/conflict'?[{...valid,name:'conflict.mkv',md5:'c'.repeat(32)}]:[]};
 const ensure=async path=>{if(path==='folder')directories++;return path==='conflict'?'root/conflict':path?'root/'+path:'root'};
 const counts=await ctx.runGuangyaImportFiles(files,'root',async()=>({}),ensure,existing,(message,event)=>logs.push({message,event}),()=>{if(stopped)throw Object.assign(Error('stopped'),{stop:true,cancelled:true})});
 assert.deepEqual({...counts},{saved:0,pending:1,missed:0,failed:1,directories:1,skipped:1,processed:4});assert.equal(directories,1);assert.equal(submissions,1);assert.equal(logs.filter(x=>x.event).length,4);
 stopped=true;const before=submissions;const halted=await ctx.runGuangyaImportFiles([{...valid}],'root',async()=>({}),ensure,existing,noop,()=>{if(stopped)throw Object.assign(Error('stopped'),{stop:true,cancelled:true})});
 assert.equal(submissions,before);assert.equal(halted.processed,0);assert.equal(halted.failed,0);
 console.log('PASS Guangya import runner: same-name skip, content conflict, pending result, directories, progress events and cancellation before writes');
}
async function extras(){
 const extra={id:'e',parentId:'p',name:'Extras',directory:true},nested={id:'n',parentId:'e',name:'nested',directory:true},video={id:'v',parentId:'n',name:'main.mkv'};
 const nodes=[extra,nested,video];let removed=0;
 const ctx=load(part('    const mediaPlaybackAttachment', '    async function recycleMedia123('),{MEDIA_VIDEO,MEDIA_SUB,matchSelected,mediaBonusName:()=>false,recycleMedia:async()=>{removed++},mediaStandardNode:()=>true});
 const drive={parentId:'p',children:async({id})=>nodes.filter(n=>n.parentId===id)};
 const plan=await ctx.planMediaCleanup([extra],drive,noop,{extras:true});assert.equal(plan.length,1);assert.equal(plan[0].extraScope.ancestors.length,2);
 nested.parentId='other';await assert.rejects(ctx.removeMediaNonstandard(plan[0],{parent:'p'},drive),e=>e.retained===true);assert.equal(removed,0);
 nested.parentId='e';await ctx.removeMediaNonstandard(plan[0],{parent:'p'},drive);assert.equal(removed,1);
 await assert.rejects(ctx.planMediaCleanup([extra],drive,noop,{resolveCanonical:async()=>{throw Object.assign(Error('auth'),{stop:true})}}),/auth/);
 const visited=[];
 const named=await ctx.planMediaCleanup([extra],drive,noop,{resolveCanonical:async node=>{visited.push(node.id);return node===nested?'standard':node.name}});
 assert.deepEqual(visited,['e','n'],'A directory included as a whole prunes its descendants');
 assert.deepEqual(JSON.parse(JSON.stringify(named)),[{id:'n',name:'nested',parentId:'e',path:'Extras/nested',directory:true,expectedName:'standard'}]);
 console.log('PASS audit cleanup: nested extras reverified before deletion; naming preview prunes selected directories; fatal lookup errors propagate');
}
async function openSubtitles(){
 const requests=[];
 const ctx=load(part('    function subtitleDownloadUrl(', '    function subtitleDrive('),{sleep:async()=>{},paced:(_ms,f)=>f,subtitleRemoteJson:async(url,options)=>{requests.push({url,options});if(url.endsWith('/login'))return {token:'bearer'};return {data:[{attributes:{language:'zh-cn',release:'简体&英文',feature_details:{title:'电影',movie_name:'电影',year:2000},files:[{file_id:1,file_name:'电影.简体&英文.srt'}]}}]}}});
 const service=ctx.createSubtitleService();await service.login('u','p',{key:'A'});
 const row={parsed:{query:'电影',year:2000,tv:false}};const results=await service.search(row,{key:'A',language:'zh'});
 assert.equal(results[0].bilingual,true);assert.equal(results[0].language,'zh-cn');
 assert.equal(requests.at(-1).options.headers.Authorization,'Bearer bearer');assert.equal(requests.at(-1).options.headers['User-Agent'],'CloudMediaOrganizer v2.21.0');
 await service.search({...row,parsed:{...row.parsed,query:'另一电影'}},{key:'B',language:'zh'});assert.equal(requests.at(-1).options.headers.Authorization,undefined);
 service.logout();await service.search({...row,parsed:{...row.parsed,query:'新电影'}},{key:'A',language:'zh'});assert.equal(requests.at(-1).options.headers.Authorization,undefined);
 console.log('PASS audit OpenSubtitles: bilingual metadata; current User-Agent version; login bearer belongs to its API key and logout clears it');
}
function historyAndAI(){
 const storage=new Map(),ui=panel();
 const ctx=load(part('    function exportHistoryKey(', '    async function getBdstoken(')+part('    function validateMediaAIIdentity(', '    async function identifyMediaAIFiles('),{GM_getValue:(k,d)=>storage.has(k)?storage.get(k):d,GM_setValue:(k,v)=>storage.set(k,v)});
 const entries=[{path:'dir/a',md5:'a'.repeat(32),size:1},{path:'dir',type:'directory'}];
 let summary=ctx.exportManifestJson(ui,'123',{entries});assert.match(summary,/未变化 0 项/);assert.deepEqual(JSON.parse(ui.get('json').value),entries);
 summary=ctx.exportManifestJson(ui,'123',{entries});assert.match(summary,/未变化 2 项/);assert.deepEqual(JSON.parse(ui.get('json').value),entries);
 const result=ctx.validateMediaAIIdentity({title:'title',confidence:1,episodes:[{index:0,confidence:1,season:100,episode:1000}]});assert.equal(result.episodes.length,0);
 console.log('PASS audit history/AI: complete export preserved with exact-path unchanged counts; AI season/episode limits match naming limits');
}

async function manifests(){
 const ctx=load(part('    function nonNegativeInteger(', '    function apiCode(')+part('    async function collectTree(', '    function baiduNode('),{sleep:async()=>{}});
 const hash='A'.repeat(32),file={path:'目录/a.mkv',md5:hash,size:'0'};
 assert.equal(ctx.normalizeFiles({files:[file]})[0].md5,hash.toLowerCase());assert.equal(ctx.normalizeFiles([file])[0].size,0);
 for(const bad of [[],[{...file,path:'../a'}],[{...file,path:'/a'}],[{...file,path:'a//b'}],[{...file,size:-1}],[{...file,size:'9007199254740992'}],[{...file,md5:'wrong'}],[file,file],[{...file,path:'dir'},{...file,path:'dir/file'}]])assert.throws(()=>ctx.normalizeFiles(bad));
 assert.equal(ctx.normalizeFiles([{type:'directory',path:'dir'},{type:'directory',path:'dir'},file]).length,2);
 let calls=0;const root={key:'d',name:'目录',directory:true},valid={key:'v',name:'a.mkv',md5:hash,size:0},unknown={key:'u',name:'b.mkv'};
 const collected=await ctx.collectTree([root],{children:async()=>[valid,unknown],metadata:async()=>{calls++;return {md5:'invalid',size:1}}});
 assert.equal(collected.files,1);assert.equal(collected.directories,1);assert.equal(calls,1);assert.deepEqual(Array.from(collected.skipped),['目录/b.mkv']);assert.equal(ctx.normalizeFiles(JSON.parse(JSON.stringify(collected.entries))).length,2);
 const reports=[], downloads=[];
 ctx.GM_download=options=>{downloads.push(options);options.onload();};
 vm.runInContext(part('    function saveJsonFile(', '    function arrangeToolPane('),ctx);
 ctx.saveJsonFile(JSON.stringify(collected.entries),'manifest.json',message=>reports.push(message));
 assert.equal(downloads.length,1);
 assert.equal(downloads[0].name,'manifest.json');
 assert.match(reports.at(-1),/已保存/);
 ctx.saveJsonFile('{"files":[]}','manifest.json',message=>reports.push(message));
 assert.equal(downloads.length,1,'Invalid manifests never reach the download API');
 assert.match(reports.at(-1),/保存失败/);
 await assert.rejects(ctx.readPages(async()=>({items:[{id:'same'}],more:true}),n=>n.id),/重复/);
 await assert.rejects(ctx.readPages(async()=>({items:[],more:true}),n=>n.id),/没有进展/);
 await assert.rejects(ctx.readPages(async()=>({items:[{id:'one'}],more:false,total:2}),n=>n.id),/项目数不一致/);
 await assert.rejects(ctx.readPages(async page=>({items:[{id:String(page)}],more:true,total:page===1?3:4}),n=>n.id),/项目数发生变化/);
 console.log('PASS audit manifests: roundtrip directory/file export and JSON download; zero bytes and uppercase hashes; invalid/traversing/conflicting input rejected; missing metadata reported; pagination detects repeats, stalls, missing data and changing totals');
}

async function sharedHelpers(){
 const ctx=load(part('    const MEDIA_VIDEO', '    const tmdbClients')+part('    async function mediaSeasonEpisodes(', '    function tmdbClient(')+part('    const mediaStandardFolder', '    const mediaPlaybackAttachment')+part('    function mediaWorkCounts(', '    function initMediaOrganizer('));
 const entries=new Map([['a',1],['b',2],['c',3]]);
 ctx.evict(entries,2);assert.deepEqual([...entries.keys()],['b','c']);
 ctx.evict(entries,2);assert.equal(entries.size,2);ctx.evict(entries,0);assert.equal(entries.size,0);
 assert.equal(ctx.titleKey('Ｌｏｖｅ, Death & Robots'),ctx.titleKey('Love.Death.and.Robots'));
 assert.notEqual(ctx.titleKey('Blade Runner'),ctx.titleKey('Blade Runner 2049'));
 assert.equal(ctx.titleKey(null),'');
 assert.deepEqual({...ctx.guangyaAuthHeaders('test')},{'Content-Type':'application/json;charset=utf-8',Authorization:'Bearer test',dt:'4'});
 const rows=['Love, Death & Robots','Love.Death.and.Robots'].map((query,i)=>({query,tv:true,sourceYear:'2019',season:1,episode:i+1,node:{id:String(i),parentId:'p',name:query+'.S01E0'+(i+1)+'.mkv'}}));
 ctx.mediaWorkCounts(rows);assert.equal(rows[0].workVideoCount,2);assert.equal(rows[1].workNumberedCount,2);
 assert.equal(ctx.mediaRecognitionGroup(rows[0],false),ctx.mediaRecognitionGroup(rows[1],false));
 assert.notEqual(ctx.mediaRecognitionGroup(rows[0],false),ctx.mediaRecognitionGroup({...rows[1],sourceYear:'2020'},false));
 assert.notEqual(ctx.mediaRecognitionGroup({...rows[0],tv:false},true),ctx.mediaRecognitionGroup({...rows[1],tv:false},true));
 const detail={id:1,name:'Love, Death & Robots',original_name:'Love, Death & Robots',first_air_date:'2019-01-01'};
 const ancestor={id:'folder',name:'Love.Death.and.Robots'};
 const special={node:{name:'Rock.and.Roll.mkv',ancestors:[ancestor]}};
 const regular={...rows[0],type:'tv',detail,node:{...rows[0].node,ancestors:[ancestor]}};
 const changed=await ctx.resolveMediaSpecials([regular,special],{get:async()=>({episodes:[{name:'Rock & Roll',episode_number:1}]})});
 assert.equal(changed.length,1);assert.equal(special.season,0);assert.equal(special.episode,1);
 const episodes = Array.from({length:48},(_,index)=>({...regular,episode:index+1,node:{id:'ep-'+index,parentId:'direct',name:'Love.Death.and.Robots.S01E'+(index+1)+'.mkv'}}));
 const extra = {node:{parentId:'direct',name:'Love.Death.and.Robots.特别篇.mkv'}};
 const unrelated = {node:{parentId:'direct',name:'Other.Work.特别篇.mkv'}};
 await ctx.resolveMediaSpecials([...episodes,extra,unrelated],{get:async()=>({episodes:[{name:'Bonus Story',episode_number:1}]})});
 assert.equal(extra.match,'tv:1');assert.equal(extra.season,0);assert.equal(extra.episode,1);
 assert.ok(episodes.every(row=>row.season===1));assert.equal(unrelated.match,undefined);
 assert.equal(ctx.parseMediaName('Film.[1440p].mkv').query,'Film');
 assert.equal(ctx.parseMediaName('Film_1920x1080.mkv').query,'Film');
 const searches=[],lookups=[];
 const resolve=ctx.mediaCanonicalResolver({
    search:async query=>{searches.push(query);return [{...detail,media_type:'tv'}];},
    get:async target=>{lookups.push(target);return target.includes('/season/')?{episodes:[{episode_number:1},{episode_number:2}]}:detail;}
 });
 assert.equal(await resolve({name:'Love.Death.and.Robots.2019.S01E01.1080p.mkv'}),'Love, Death & Robots.2019.S01E01.1080p.mkv');
 assert.equal(await resolve({name:'02.mkv'},['Love.Death.and.Robots.2019','Season 01']),'Love, Death & Robots.2019.S01E02.mkv');
 assert.equal(await resolve({name:'Love.Death.and.Robots.2019.S01E01.zh-cn.ass'}),'Love, Death & Robots.2019.S01E01.zh-cn.ass');
 const episodeName = 'Love, Death & Robots.2019.S01E01.1080p.mkv';
 const subtitleName = 'Love, Death & Robots.2019.S01E01.1080p.zh-cn.ass';
 assert.equal(await resolve({name:episodeName}),episodeName,'Naming cleanup accepts the reorganized video');
 assert.equal(await resolve({name:subtitleName}),subtitleName,'Naming cleanup accepts the reorganized subtitle');
 assert.equal(ctx.mediaStandardNode({name:episodeName}),true);
 assert.equal(ctx.mediaStandardNode({name:subtitleName}),true);
 assert.equal(ctx.mediaStandardNode({name:'Love, Death & Robots.2019.S01E01.1080p'}),false);
 assert.equal(await resolve({name:'Love.Death.and.Robots.2019.S01E99.mkv'}),null);
 assert.equal(searches.length,1,'The same series shares recognition across episodes and subtitles');
 assert.deepEqual(lookups,['/tv/1','/tv/1/season/1']);
 await assert.rejects(resolve({name:'Love.Death.and.Robots.2020.mkv'}),/无法唯一确认/);
 const ambiguous=ctx.mediaCanonicalResolver({search:async()=>[detail,{...detail,id:2}].map(item=>({...item,media_type:'tv'}))});
 await assert.rejects(ambiguous({name:'Love.Death.and.Robots.2019.mkv'}),/无法唯一确认/);
 console.log('PASS shared helpers: FIFO bounds; auth headers; &/and grouping, specials and canonical aliases; numeric titles, years, ambiguity and movie isolation retained');
}

(async()=>{await sharedHelpers();await manifests();await languageAndLinking();await guangyaListing();await replacements();await imports();await importRunner();await extras();await openSubtitles();historyAndAI()})().catch(e=>{console.error(e);process.exitCode=1});
