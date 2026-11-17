const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part=(a,b)=>script.slice(script.indexOf(a),script.indexOf(b));
const config={assrt:true,assrtToken:'test',open:true,key:'open-test',thunder:true,language:'zh-cn,zh-tw,zh'};
function load(extra={},source=script) {
 const ctx=vm.createContext({URL,URLSearchParams,Date,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,
  paced:(_ms,fn)=>fn,sleep:async()=>{},GM_getValue:(_key,value)=>value,GM_setValue:()=>{},...extra});
 vm.runInContext(source.slice(source.indexOf('    function evict('),source.indexOf('    function nonNegativeInteger(')) + source.slice(source.indexOf('    function subtitleDownloadUrl('),source.indexOf('    function subtitleDrive(')),ctx);return ctx;
}
const row=(query='瑞克和莫蒂',season=1,episode=1,year=2013)=>({node:{name:`${query}.${year}.S${season}E${episode}.mkv`},parsed:{query,year,tv:true,season,episode}});
const packs=(season=1,episodes=11)=>[1,2].map(id=>({id:season*100+id,native_name:`瑞克和莫蒂 第${season}季/Rick and Morty S${String(season).padStart(2,'0')}`,
 videoname:`Rick.and.Morty.S${String(season).padStart(2,'0')}.1080p.BluRay`,lang:{langlist:{langchs:true}},
 filelist:Array.from({length:episodes},(_,i)=>({f:`Rick.and.Morty.${2013+season-1}.S${String(season).padStart(2,'0')}E${String(i+1).padStart(2,'0')}.1080p.简体&英文.ass`,s:'300KB'}))}));
async function regression() {
 let calls=0; const fixtures=packs();fixtures[0].native_name='瑞克和莫蒂 第一季';
 fixtures[1].native_name='Rick and Morty S01/瑞克和莫蒂 第一季/瑞克和莫迪';
 const respond=async raw=>{calls++;assert.equal(new URL(raw).searchParams.get('q'),'瑞克和莫蒂 S01E01');return {status:0,sub:{subs:fixtures}}};
 const ctx=load({subtitleRemoteJson:respond}),service=ctx.createSubtitleService();
 const found=await service.assrtSearch(row(),config);assert.equal(calls,1);assert.equal(found.length,2);assert.ok(found.every(c=>c.titleMatched&&c.bilingual));
 for(let episode=2;episode<=11;episode++) {
  const r=row('瑞克和莫蒂',1,episode);r.candidates=await service.assrtSearch(r,config);ctx.selectSubtitleCandidate(r,config.language);
  assert.ok(r.selectedCandidate);assert.ok(r.candidates.every(c=>c.name.includes(`E${String(episode).padStart(2,'0')}.`)));
 }
 assert.equal(calls,1,'Eleven episodes share one search, no broad-title fallback');
 console.log('PASS efficiency regression: Regression: S01/第一季 identities give exact bilingual matches; 11 episodes use 1 search');
}
async function batch() {
 const filenames=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/tv-names.json'),'utf8'));
 assert.equal(filenames.length,136);const rows=filenames.map(name=>{const m=name.match(/^(.*)\.(\d{4})\.S(\d+)E(\d+)\./);return {...row(m[1],Number(m[3]),Number(m[4]),Number(m[2])),node:{name}}});
 const calls=[],logs=[],seasons=new Map();
 for(const r of rows){const key=JSON.stringify([r.parsed.query,r.parsed.season]);if(!seasons.has(key))seasons.set(key,[]);seasons.get(key).push(r);}
 const ctx=load({subtitleRemoteJson:async raw=>{
  const u=new URL(raw);calls.push(u);assert.ok(!u.searchParams.get('q').includes('2013')&&!u.searchParams.get('q').includes('2019'));
  const m=u.searchParams.get('q').match(/^(.*) S(\d+)E(\d+)$/);assert.ok(m,'Only episode-specific search needed');
  const group=seasons.get(JSON.stringify([m[1],Number(m[2])])),first=group[0].parsed;
  return {status:0,sub:{subs:[{id:calls.length,native_name:first.query+` S${m[2]}`,lang:{langlist:{langchs:true}},filelist:group.map(r=>({f:`${r.parsed.query}.${Number(r.parsed.year)+r.parsed.season-1}.S${String(r.parsed.season).padStart(2,'0')}E${String(r.parsed.episode).padStart(2,'0')}.简体&英文.ass`}))}]}};
 }}),service=ctx.createSubtitleService({log:(...args)=>logs.push(args)});
 for(const r of rows) {r.candidates=await service.assrtSearch(r,config);ctx.selectSubtitleCandidate(r,config.language);assert.ok(r.selectedCandidate,r.node.name);assert.equal(r.candidates.length,1);}
 assert.equal(calls.length,seasons.size);assert.equal(logs.filter(l=>l[0]==='Assrt 整季复用').length,136-seasons.size);
 console.log(`PASS efficiency 136-video log fixture: ${seasons.size} seasons, ${calls.length} search requests, ${136-seasons.size} cache hits; every episode selects only its own file (mocked full-season packages)`);
}
async function isolation() {
 let calls=0,details=0,cancel=false;const fixture=packs()[0];delete fixture.filelist;
 const ctx=load({subtitleRemoteJson:async raw=>{calls++;const u=new URL(raw);if(u.pathname.endsWith('/detail')){details++;return {status:0,sub:{subs:[packs()[0]]}}}return {status:0,sub:{subs:[fixture]}};}});
 const service=ctx.createSubtitleService();await service.assrtSearch(row(),config);assert.equal(calls,2);assert.equal(details,1);
 const next=await service.assrtSearch(row('瑞克和莫蒂',1,2),config);assert.equal(calls,2);assert.equal(next.length,1);assert.ok(next[0].name.includes('E02.'));
 const check=()=>{if(cancel)throw Error('已停止')};cancel=true;await assert.rejects(service.assrtSearch(row('瑞克和莫蒂',1,3),config,()=>{},check),/已停止/);assert.equal(calls,2);
 cancel=false;
 const before=calls;await service.assrtSearch(row(),{...config,assrtToken:'another-account'});assert.ok(calls>before,'No sharing across accounts');
 const afterToken=calls;await service.assrtSearch(row('完全不同的剧'),config);assert.ok(calls>afterToken,'No sharing across series');
 const afterTitle=calls;await service.assrtSearch(row('瑞克和莫蒂',2,1),config);assert.ok(calls>afterTitle,'Missing season must query independently');
 const afterSeason=calls;await service.assrtSearch({...row(),parsed:{...row().parsed,tmdbId:999}},config);assert.equal(calls,afterSeason+1,'New confirmed TMDB identity must re-read details instead of borrowing the season cache');
 const beforeLogout=calls;service.logout();await service.assrtSearch(row(),config);assert.ok(calls>beforeLogout,'Logout clears both caches');
 const unknown=await service.assrtSearch(row('瑞克和莫蒂',1,12),config);assert.equal(unknown.length,0,'Absent episode never reuses another episode');
 console.log('PASS efficiency cache isolation: original detail fetched once; no wrong-episode/season reuse; per-account/series/season/TMDB keys; cancellation and logout; missing episodes still search');
}
function years() {
 const ctx=load(),match=(r,fields,name)=>ctx.subtitleWorkIdentity(r.parsed,fields,name);
 assert.equal(match(row('瑞克和莫蒂',2,1),['瑞克和莫蒂 第二季/Rick and Morty S02'],'Rick.and.Morty.2015.S02E01.chs.ass').titleMatched,true);
 assert.equal(match(row('瑞克和莫蒂',2,1),['瑞克和莫蒂 第二季/Rick and Morty S02'],'Rick.and.Morty.2000.S02E01.chs.ass').hardMismatch,true);
 assert.equal(match(row('瑞克和莫蒂',1,1),['瑞克和莫蒂 第一季/Rick and Morty S01'],'Rick.and.Morty.2025.S01E01.chs.ass').hardMismatch,true,'First-season conflicting year stays ambiguous');
 assert.equal(match(row('瑞克和莫蒂',2,1),['完全不同的剧/Another Show'],'Another.Show.2015.S02E01.chs.ass').titleMatched,false);
 assert.equal(match(row('瑞克和莫蒂',2,1),['瑞克和莫蒂 第二季/Rick and Morty S02'],'Rick.and.Morty.2015.chs.ass').hardMismatch,true,'No explicit episode means no year relaxation');
 assert.equal(ctx.subtitleWorkIdentity({query:'同名电影',year:2013,tv:false},['同名电影'],'同名电影.2015.chs.ass').hardMismatch,true);
 console.log('PASS efficiency TV years: later-season release year accepted with exact season/episode and work identity; pre-premiere, conflicting first-season, wrong-series, missing-episode and movie guards retained');
}
async function sources() {
 const ctx=load(),calls=[],r=row(),bilingual={source:'迅雷',name:'瑞克和莫蒂.S01E01.简体&英文.ass',language:'zh-cn',bilingual:true,titleMatched:true};
 const mono={source:'Assrt',name:'瑞克和莫蒂.S01E01.简体.ass',language:'zh-cn',bilingual:false,titleMatched:true};
 const service={thunderSearch:async()=>{calls.push('thunder');return [bilingual]},assrtSearch:async()=>{calls.push('assrt');return [mono]},search:async()=>{calls.push('open');return []}};
 await ctx.searchSubtitleSources(r,config,service,{});assert.deepEqual(calls,['thunder']);assert.equal(r.sources.filter(s=>s.deferred).length,2);
 r.candidates.forEach(c=>c.downloadFailed=true);await ctx.searchSubtitleSources(r,config,service,{},()=>{},()=>{},true);assert.deepEqual(calls,['thunder','assrt']);assert.ok(r.sources.some(s=>s.name==='OpenSubtitles'&&s.deferred));assert.equal(r.candidates.length,2);assert.equal(r.selectedCandidate.source,'Assrt');
 await ctx.searchSubtitleSources(r,config,service,{},()=>{},()=>{},true);assert.equal(calls.length,2,'Repeated resume adds no provider query after the first fallback');
 calls.length=0;service.thunderSearch=async()=>{calls.push('thunder');return []};service.assrtSearch=async()=>{calls.push('assrt');return [{...mono}]};await ctx.searchSubtitleSources(row(),config,service,{});assert.deepEqual(calls,['thunder','assrt'],'Title sources run in order without video sampling');
  calls.length=0;service.assrtSearch=async()=>[{...mono,titleMatched:false}];await ctx.searchSubtitleSources(row(),config,service,{});assert.deepEqual(calls,['thunder','open'],'Unconfirmed title keeps searching later sources');
  calls.length=0;service.assrtSearch=async()=>[{...mono,language:'en',name:'Rick.and.Morty.S01E01.eng.srt',bilingual:false}];await ctx.searchSubtitleSources(row(),{...config,language:'en'},service,{});assert.equal(calls.length,1,'Reliable English stops duplicate English queries');
 console.log('PASS efficiency sources: title providers run in order; reliable candidates defer later calls; failed downloads resume deferred providers once; unconfirmed and English cases remain covered');
}
async function refreshAndPagination() {
 let searches=0;const ctx=load({subtitleRemoteJson:async raw=>{
  searches++;const ep=Number(new URL(raw).searchParams.get('q').match(/E(\d+)$/)[1]);
  return {status:0,sub:{subs:[{...packs()[0],filelist:packs()[0].filelist.slice(0,ep).map(file=>({...file,f:file.f.replace('1080p',ep===3?'720p':'1080p')}))}]}};
 }}),service=ctx.createSubtitleService();
 await service.assrtSearch(row(),config);const updated=await service.assrtSearch(row('瑞克和莫蒂',1,2),config);
 assert.equal(searches,2);assert.equal(updated.length,1);assert.ok(updated[0].name.includes('E02.'),'A fresh list for the same package ID may fill cache misses');
 const three=await service.assrtSearch(row('瑞克和莫蒂',1,3),config);assert.equal(searches,3);assert.equal(three.length,1);
 const hd=row('瑞克和莫蒂',1,2);hd.node.name='瑞克和莫蒂.2013.S01E02.1080p.mkv';
 const recovered=await service.assrtSearch(hd,config);assert.ok(recovered.some(c=>c.name.includes('1080p')),'Incompatible cached 720p must not suppress searching for 1080p');assert.equal(searches,3,'An existing search-page cache can satisfy the fallback without another API request');
 let pages=0;const full=load({subtitleRemoteJson:async()=>{pages++;return {status:0,sub:{subs:[...packs(),...Array.from({length:13},(_,i)=>({id:1000+i,native_name:'另一部剧',filelist:[{f:'Another.Show.S09E09.chs.srt'}]}))]}}}});
 await full.createSubtitleService().assrtSearch(row(),config);assert.equal(pages,1,'A full first page with two reliable bilingual packages must not force a second page');
 console.log('PASS efficiency refresh: incomplete cached packs can refresh the same ID; incompatible cached resolution still searches; useful full first page stops immediately');
}
async function fillFallback() {
 const elements=new Map(),calls=[],valid=new TextEncoder().encode('1\n00:00:01,000 --> 00:00:03,000\n中文字幕 Test\n');let saves=0;
 const element=()=>({value:'',checked:false,disabled:false,hidden:false,dataset:{},style:{},children:[],textContent:'',append(...children){this.children.push(...children)},appendChild(child){this.children.push(child)},replaceChildren(...children){this.children=children},querySelectorAll(){return []}});
 const video={id:'v',name:'瑞克和莫蒂.2013.S01E01.mkv',size:10000,folders:[],path:'瑞克和莫蒂.2013.S01E01.mkv'};
 const bi={source:'Assrt',assrtId:1,name:'瑞克和莫蒂.S01E01.简体&英文.ass',language:'zh-cn',bilingual:true,titleMatched:true};
 const ctx=load({document:{createElement:element},makePanel:(_title,html)=>{
  for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=element();el.checked=/\bchecked\b/.test(tag[0]);el.disabled=/\bdisabled\b/.test(tag[0]);elements.set(tag[1],el)}
  return {get:id=>elements.get(id),moveSettings(){},openSettings(){},busy(){}};
 },mediaContext:async()=>({selected:[video],source:{},path:'剧集'}),selectedTreeCache:{stale:true},
 collectMediaSelection:async()=>({videos:[video],linked:new Map()}),parseMediaName:()=>row().parsed,mediaBonusName:()=>false,mediaRecords:{get:()=>null},mediaStem:name=>name.replace(/\.[^.]+$/,''),
 subtitleDrive:()=>({reconcile:async()=>[],save:async(_row,name)=>{saves++;calls.push('save');return {id:'s',name}}})});
 ctx.createSubtitleService=()=>({thunderSearch:async()=>{calls.push('thunder');return [{...bi,source:'迅雷'}]},assrtSearch:async()=>{calls.push('assrt');return [{...bi,source:'Assrt'}]},fetchFile:async c=>{calls.push('download-'+c.source);if(c.source==='迅雷')throw Error('正文无效');return {result:{ext:'srt'},bytes:valid}}});
 vm.runInContext(part('    function subtitleInventory(', '    if (location.hostname'),ctx);ctx.initSubtitles();elements.get('assrtToken').value='test';
 await elements.get('readSubtitles').onclick();assert.deepEqual(calls,['thunder']);
 await elements.get('fillSubtitles').onclick();assert.deepEqual(calls,['thunder','download-迅雷','assrt','download-Assrt','save']);assert.equal(saves,1);assert.match(elements.get('subtitleSummary').textContent,/已有\/已补齐 1/);
 assert.match(elements.get('subtitleLog').value,/来源补查/);
 console.log('PASS efficiency fill integration: failed Thunder download triggers deferred Assrt search, validates its body and uploads exactly once; no re-download of failed candidates');
}
(async()=>{await regression();await batch();await isolation();years();await sources();await refreshAndPagination();await fillFallback()})().catch(e=>{console.error(e);process.exitCode=1});
