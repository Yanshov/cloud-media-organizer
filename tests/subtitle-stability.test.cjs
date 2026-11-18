const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const script=fs.readFileSync(require('node:path').join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part=(a,b)=>script.slice(script.indexOf(a),script.indexOf(b));
const valid=new TextEncoder().encode('1\n00:00:01,000 --> 00:00:04,000\n测试字幕 Test\n');
function load(extra={}) {
 const ctx=vm.createContext({URL,URLSearchParams,Date,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,DataView,Blob,
  paced:(_ms,fn)=>fn,sleep:async()=>{},GM_getValue:(_key,value)=>value,GM_setValue:()=>{},...extra});
 vm.runInContext(part('    function evict(', '    function nonNegativeInteger(') + part('    function subtitleDownloadUrl(', '    function subtitleDrive('),ctx);return ctx;
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
(async()=>{identities();await drives()})().catch(e=>{console.error(e);process.exitCode=1});
