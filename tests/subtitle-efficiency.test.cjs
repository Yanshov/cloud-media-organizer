const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part=(a,b)=>script.slice(script.indexOf(a),script.indexOf(b));
const config={subdl:true,subdlKey:'test',open:true,key:'open-test',thunder:true,language:'zh-cn,zh-tw,zh'};
function load(extra={},source=script) {
 const ctx=vm.createContext({URL,URLSearchParams,Date,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,Blob,
  paced:(_ms,fn)=>fn,sleep:async()=>{},GM_getValue:(_key,value)=>value,GM_setValue:()=>{},...extra});
 vm.runInContext(source.slice(source.indexOf('    function evict('),source.indexOf('    function nonNegativeInteger(')) + source.slice(source.indexOf('    function subtitleDownloadUrl('),source.indexOf('    function subtitleDrive(')),ctx);return ctx;
}
const row=(query='瑞克和莫蒂',season=1,episode=1,year=2013)=>({node:{name:`${query}.${year}.S${season}E${episode}.mkv`},parsed:{query,year,tv:true,season,episode}});
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
 const mono={source:'SubDL',name:'瑞克和莫蒂.S01E01.简体.ass',language:'zh-cn',bilingual:false,titleMatched:true};
 const service={thunderSearch:async()=>{calls.push('thunder');return [bilingual]},subdlSearch:async()=>{calls.push('subdl');return [mono]},search:async()=>{calls.push('open');return []}};
 await ctx.searchSubtitleSources(r,config,service);assert.deepEqual(calls,['thunder']);assert.equal(r.sources.filter(s=>s.deferred).length,2);
 r.candidates.forEach(c=>c.downloadFailed=true);await ctx.searchSubtitleSources(r,config,service,()=>{},()=>{},true);assert.deepEqual(calls,['thunder','subdl']);assert.ok(r.sources.some(s=>s.name==='OpenSubtitles'&&s.deferred));assert.equal(r.candidates.length,2);assert.equal(r.selectedCandidate.source,'SubDL');
 await ctx.searchSubtitleSources(r,config,service,()=>{},()=>{},true);assert.equal(calls.length,2,'Repeated resume adds no provider query after the first fallback');
 calls.length=0;service.thunderSearch=async()=>{calls.push('thunder');return []};service.subdlSearch=async()=>{calls.push('subdl');return [{...mono}]};await ctx.searchSubtitleSources(row(),config,service);assert.deepEqual(calls,['thunder','subdl'],'Title sources run in order without video sampling');
  calls.length=0;service.subdlSearch=async()=>[{...mono,titleMatched:false}];await ctx.searchSubtitleSources(row(),config,service);assert.deepEqual(calls,['thunder','open'],'Unconfirmed title keeps searching later sources');
  calls.length=0;service.subdlSearch=async()=>[{...mono,language:'en',name:'Rick.and.Morty.S01E01.eng.srt',bilingual:false}];await ctx.searchSubtitleSources(row(),{...config,language:'en'},service);assert.equal(calls.length,1,'Reliable English stops duplicate English queries');
 console.log('PASS efficiency sources: title providers run in order; reliable candidates defer later calls; failed downloads resume deferred providers once; unconfirmed and English cases remain covered');
}
async function fillFallback({hasSeasonPack = false, packDownloadFails = false} = {}) {
 const elements=new Map(),calls=[],valid=new TextEncoder().encode('1\n00:00:01,000 --> 00:20:03,000\n中文字幕 Test\n');let saves=0;
 const element=()=>({value:'',checked:false,disabled:false,hidden:false,dataset:{},style:{},children:[],textContent:'',append(...children){this.children.push(...children)},appendChild(child){this.children.push(child)},replaceChildren(...children){this.children=children},querySelectorAll(){return []}});
 const videoName = '风骚律师.2015.S06E06.1080p.mkv';
 const video={id:'v',name:videoName,size:10000,folders:[],path:videoName};
 const bi={source:'SubDL',name:'tt3032476.S06E06.fixture.ZH.srt',ext:'srt',language:'zh-cn',titleMatched:true};
 const thunder={...bi,source:'迅雷',name:'Better.Call.Saul.S06E06.2160p.WEB.H265-PECULATE.简体.srt'};
 const assrt={...bi,source:'射手网',name:'Better.Call.Saul.S06E06.简体.srt'};
 let seasonPack = hasSeasonPack ? [assrt] : [];
 const ctx=load({document:{createElement:element},makePanel:(_title,html)=>{
  for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=element();el.checked=/\bchecked\b/.test(tag[0]);el.disabled=/\bdisabled\b/.test(tag[0]);elements.set(tag[1],el)}
  return {get:id=>elements.get(id),moveSettings(){},openSettings(){},busy(){}};
 },mediaContext:async()=>({selected:[video],session:{parent:'root',token:'fixture'},source:{},path:'剧集'}),mediaFileHistory:()=>null, selectedTreeCache:{stale:true},
 collectMediaSelection:async()=>({videos:[video],linked:new Map()}),parseMediaName:()=>row('风骚律师',6,6,2015).parsed,mediaBonusName:()=>false,mediaRecords:{get:()=>null},mediaStem:name=>name.replace(/\.[^.]+$/,''),
 subtitleDrive:()=>({reconcile:async()=>[],save:async(_row,name)=>{saves++;calls.push('save');return {id:'s',name}}})});
 ctx.createSubtitleService=()=>({
  thunderCachedEpisode:async()=>hasSeasonPack ? [thunder] : [],
  assrtCachedEpisode:()=>seasonPack,
  thunderSearch:async()=>{calls.push('thunder');return [thunder]},
  subdlSearch:async()=>{calls.push('subdl');return [bi]},
  fetchFile:async candidate=>{
   calls.push('download-'+candidate.source);
   const invalid = candidate === thunder || candidate === assrt && packDownloadFails;
   return {result:{ext:'srt'},bytes:invalid ? Uint8Array.of(0xff,0xff,0xff) : valid};
  }
 });
 vm.runInContext(part('    function createPanelTask(', '    function panelControls(')+part('    function subtitleInventory(', '    if (location.hostname'),ctx);ctx.initSubtitles();elements.get('subdlKey').value='test';elements.get('useSubdl').checked=true;
 if (hasSeasonPack) elements.get('assrtKey').value='fixture';
 const expected = hasSeasonPack ? [] : ['thunder'];
 await elements.get('readSubtitles').onclick();
 assert.deepEqual(calls, expected);
 // Searching subtitles for another season can reset the service's prepared season cache.
 seasonPack = [];
 expected.push('download-迅雷');
 if (hasSeasonPack) expected.push('download-射手网');
 if (!hasSeasonPack || packDownloadFails) expected.push('subdl','download-SubDL');
 expected.push('save');
 await elements.get('fillSubtitles').onclick();
 assert.deepEqual(calls,expected);
 assert.equal(saves,1);
 assert.match(elements.get('subtitleSummary').textContent,/有字幕 1/);
 assert.match(elements.get('subtitleLog').value,/候选失败[^\n]*字幕文本解码失败/);
 if (hasSeasonPack) assert.match(elements.get('subtitleLog').value,/整季备选[^\n]*射手网/);
 console.log('PASS efficiency fill integration:', expected.join(' → '));
}
(async()=>{
 years();
 await sources();
 await fillFallback();
 await fillFallback({hasSeasonPack:true});
 await fillFallback({hasSeasonPack:true,packDownloadFails:true});
})().catch(e=>{console.error(e);process.exitCode=1});
