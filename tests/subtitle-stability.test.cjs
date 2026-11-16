const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const script=fs.readFileSync(require('node:path').join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part=(a,b)=>script.slice(script.indexOf(a),script.indexOf(b));
const valid=new TextEncoder().encode('1\n00:00:01,000 --> 00:00:04,000\n测试字幕 Test\n');
function load(extra={}) {
 const ctx=vm.createContext({URL,URLSearchParams,Date,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,DataView,Blob,
  paced:(_ms,fn)=>fn,sleep:async()=>{},GM_getValue:(_key,value)=>value,GM_setValue:()=>{},...extra});
 vm.runInContext(part('    function subtitleDownloadUrl(', '    function subtitleDrive('),ctx);return ctx;
}
const config={assrtToken:'test',language:'zh-cn,zh-tw,zh'};
const makeRow=(query='路西法',year=2019)=>({node:{name:query+'.'+year+'.mkv'},parsed:{query,year,tv:false}});
async function pagination() {
 const calls=[],logs=[],fileLogs=[];
 const wrong=Array.from({length:15},(_,i)=>({id:100+i,native_name:'路西法/Lucifer',lang:{langlist:{langchs:true}},filelist:Array.from({length:120},(_,j)=>({f:`Lucifer.S01E02.2019.track${j}_[spa].srt`}))}));
 const good=[{id:500,native_name:'路西法/Lucifer',lang:{langlist:{langchs:true}},filelist:[{f:'Lucifer.2019.简&英.ass'},{f:'track36_[chi].srt'},{f:'track3_[eng].srt'},...['spa','fin','fil','heb','hun','may','nob','rum','swe','ukr','cze','dan','gre','baq','glg','hrv','cat','tam','tel'].map(code=>({f:`track5_[${code}].srt`}))]},
 {id:501,native_name:'路西法/Lucifer',lang:{langlist:{langchs:true}},filelist:[{f:'Lucifer.2019.简体&英文.srt'}]}];
 const ctx=load({subtitleRemoteJson:async raw=>{const u=new URL(raw);calls.push(u);return {status:0,sub:{subs:u.searchParams.get('pos')==='0'?wrong:good}}},record:(...args)=>logs.push(args)});
 const service=vm.runInContext('createSubtitleService({log:record})',ctx),row=makeRow();
 const candidates=await service.assrtSearch(row,config,message=>fileLogs.push(message));
 assert.deepEqual(calls.map(u=>u.searchParams.get('pos')),['0','15']);
 assert.ok(calls.every(u=>u.searchParams.get('q')==='路西法'),'Search terms have no release year');
 assert.equal(candidates.length,4);assert.ok(candidates.every(c=>c.titleMatched));
 assert.equal(candidates.find(c=>c.name.includes('[chi]')).language,'zh');
 assert.equal(candidates.find(c=>c.name.includes('[eng]')).language,'en');
 assert.equal(candidates[0].bilingual,true);assert.equal(candidates[0].language,'zh-cn');
 row.candidates=candidates;ctx.row=row;vm.runInContext('selectSubtitleCandidate(row,"zh-cn,zh-tw,zh")',ctx);
 assert.equal(row.selectedCandidate.name,'Lucifer.2019.简&英.ass');
 assert.ok(logs.length+fileLogs.length<10,'1800 irrelevant files must not create 1800 log lines');
 assert.ok(logs.at(-1)[1].includes('1819'));
 const snapshots=calls.length;await service.assrtSearch(makeRow(),config);assert.equal(calls.length,snapshots,'Search pages reused in current service');
 console.log('PASS stability pagination: first 15 irrelevant TV packages skipped; page two finds movie; 1800 episode/19 foreign files excluded; bracket chi/eng and 简&英 parsed; concise logs; cache; no year in search');
}
async function limits() {
 let calls=0;const logs=[];
 const packs=Array.from({length:15},(_,i)=>({id:i+1,native_name:'不确定的片名',lang:{langlist:{langchs:true}},filelist:Array.from({length:120},(_,j)=>({f:`Unrelated.Title${j}.2019.chs.srt`}))}));
 const ctx=load({subtitleRemoteJson:async raw=>{calls++;return {status:0,sub:{subs:new URL(raw).searchParams.get('pos')==='0'?packs:[]}}},record:(...args)=>logs.push(args)});
 const service=vm.runInContext('createSubtitleService({log:record})',ctx);
 const candidates=await service.assrtSearch(makeRow(),config);assert.equal(candidates.length,60);assert.equal(calls,2);
 assert.ok(!candidates.some(c=>c.titleMatched));assert.ok(!logs.some(l=>l[0]==='候选待确认'));
 let n=0;
 const deep=load({subtitleRemoteJson:async()=>({status:0,sub:{subs:Array.from({length:15},()=>({id:++n,native_name:'错片',filelist:[{f:'Wrong.2018.chs.srt'}]}))}})});
 assert.equal((await vm.runInContext('createSubtitleService()',deep).assrtSearch(makeRow(),config)).length,0);assert.equal(n,75,'Pagination cannot exceed 5 pages per term');
 console.log('PASS stability bounds: at most 60 ambiguous files, 5 pages per term, no per-file mismatch log flood');
}
function identities() {
 const ctx=load();
 const check=(parsed,fields,name)=>{Object.assign(ctx,{parsed,fields,name});return vm.runInContext('subtitleWorkIdentity(parsed,fields,name)',ctx)};
 for(const [parsed,fields,name] of [
  [{query:'至暗时刻',year:2017},['至暗时刻/Darkest Hour'],'【SSK字幕组】至暗时刻 Darkest.Hour.2017.1080p 繁体 双语字幕.srt'],
  [{query:'银翼杀手',year:1982},['银翼杀手/Blade Runner'],'银翼杀手.杜比视界.Blade.Runner.1982.chs.srt'],
  [{query:'小丑2',year:2024,aliases:['小丑2：双重妄想','Joker: Folie à Deux','Joker Folie a Deux']},['小丑2：双重妄想/Joker Folie a Deux'],'Joker.Folie.a.Deux.2024.chs&eng.ass'],
  [{query:'指环王3：王者无敌',year:2003,aliases:['魔戒3：王者归来','The Lord of the Rings: The Return of the King']},['魔戒3：王者归来'],'The.Lord.of.the.Rings.The.Return.of.the.King.2003.chs.srt']
 ]) assert.equal(check(parsed,fields,name).titleMatched,true,name);
 assert.equal(check({query:'小丑2',year:2024,aliases:['Joker Folie a Deux']},['小丑2/Jester 2'],'Jester.2.2025.chs.srt').titleMatched,false);
 assert.equal(check({query:'银翼杀手',year:1982},['银翼杀手2049/Blade Runner 2049'],'Blade.Runner.2049.chs.srt').titleMatched,false);
 assert.equal(check({query:'指环王3：王者无敌',year:2003,aliases:['魔戒3：王者归来']},['魔戒2：双塔奇兵'],'魔戒2：双塔奇兵.2002.chs.srt').titleMatched,false);
 const real=new TextEncoder().encode('[Script Info]\nTitle: Synthetic test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,测试字幕 Test\n');ctx.real=real;
 assert.ok(vm.runInContext('subtitlePayload(real,"ass","zh-cn,zh-tw,zh")',ctx).includes('[Events]'));
 console.log('PASS stability identity: uploader prefixes, Dolby labels and trusted TMDB aliases accepted; wrong sequel/year still rejected; synthetic ASS passes body validation');
}
async function transfers() {
 let calls=0,downloads=0,mode='expired';const logs=[];
 const ctx=load({GM_xmlhttpRequest:opts=>{calls++;queueMicrotask(()=>mode==='expired'&&calls===1?opts.onload({status:403}):mode==='493'?opts.onload({status:493}):opts.onload({status:200,response:valid.buffer}));return {abort(){}}}});
 const service=vm.runInContext('createSubtitleService()',ctx);
 service.download=async()=>{downloads++;return {url:'https://file0.assrt.net/fresh'+downloads,ext:'srt'}};
 const candidate={source:'Assrt',assrtId:1},data=await service.fetchFile(candidate,config,(...args)=>logs.push(args));
 assert.equal(data.bytes.length,valid.length);assert.equal(downloads,2);assert.equal(calls,2);assert.equal(logs.length,1);
 calls=downloads=0;mode='493';await assert.rejects(service.fetchFile(candidate,config),/单文件提取失败.*493/);assert.equal(calls,1);assert.equal(downloads,1,'493 must move to another candidate instead of repeating same bad extraction');
 calls=0;ctx.url='https://file0.assrt.net/test';await assert.rejects(vm.runInContext('subtitleBinary(url)',ctx),error=>error.status===493&&error.phase==='transfer');
 let apiCalls=0;const retry=load({subtitleRemoteJson:async()=>{if(++apiCalls===1)throw Error('字幕来源请求超时（30 秒）');return {status:0,sub:{subs:[]}}}});
 await vm.runInContext('createSubtitleService()',retry).assrtSearch(makeRow(),config);assert.equal(apiCalls,2);
 console.log('PASS stability transfer: signed 403 refreshes URL once; 493 skips broken file; HTTP status/phase preserved; transient API timeout retries once');
}
async function drives() {
 let details=0,gets=0,transfers=0,waits=0,apiFatal=false;
 const md5=crypto.createHash('md5').update(valid).digest('hex'),video={id:'v',parentId:'p',name:'电影.2019.mkv',size:100000},sub={id:'s',parentId:'p',name:'电影.2019.zh-cn.srt',size:valid.length};
 const ctx=load({requestJson:async()=>{gets++;if(apiFatal)throw Object.assign(Error('HTTP 401'),{stop:true});return {code:0,data:{signedURL:'https://drive.example/fresh'+gets}}},guangyaCode:r=>r.code,
  GM_xmlhttpRequest:o=>{transfers++;queueMicrotask(()=>o.onload(transfers===1?{status:401}:{status:200,response:valid.buffer}));return {abort(){}}},
  context:{session:{provider:'光鸭',token:'test'},source:{children:async()=>[video,sub],metadata:async()=>{details++;return {size:valid.length,md5}}}},wait:async()=>{waits++}});
 vm.runInContext(part('    function subtitleMd5(', '    function subtitleDownloadUrl('),ctx);
 vm.runInContext(part('    function subtitleDrive(', '    function subtitleInventory('),ctx);
 const drive=vm.runInContext('subtitleDrive(context,wait)',ctx);
 await drive.save({node:video},sub.name,valid);assert.equal(details,1);assert.equal(transfers,0);assert.equal(gets,0,'Exact hash and size from detail avoids redundant readback/upload');
 await drive.read(sub);assert.equal(gets,2);assert.equal(transfers,2);assert.equal(waits,1,'Signed file 401 refreshes address');
 apiFatal=true;gets=transfers=waits=0;await assert.rejects(drive.read(sub),e=>e.stop&&/获取网盘下载地址失败/.test(e.message));assert.equal(gets,1);assert.equal(transfers,0);assert.equal(waits,0,'API auth failure stops immediately');
 console.log('PASS stability drive: exact file-detail MD5 and size avoid readback; signed URL 401 refreshes; API authentication 401 stops without pointless retries');
}
(async()=>{await pagination();await limits();identities();await transfers();await drives()})().catch(e=>{console.error(e);process.exitCode=1});
