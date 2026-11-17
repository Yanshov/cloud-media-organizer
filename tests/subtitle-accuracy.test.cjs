const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a,b) => { const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start,a);return source.slice(start,end); };
const ctx = vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Date});
vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    function subtitleDownloadUrl(', '    function subtitleDrive('),ctx);
assert.equal(ctx.titleKey('Joker: Folie à Deux'),ctx.titleKey('Joker.Folie.a.Deux'));
assert.equal(ctx.titleKey('仮面ライダー'),'仮面ライダー');
assert.equal(ctx.titleKey('中文'),'中文');
const joker={query:'小丑2',year:2024,aliases:['Joker: Folie à Deux'],runtimeSeconds:138*60};
assert.equal(ctx.subtitleWorkIdentity(joker,[],'Joker.Folie.a.Deux.2024.简体&英文.srt').titleMatched,true);
const logs=[], log=(event,text)=>logs.push(event+' '+text);
const srt=end=>'1\n00:00:01,000 --> '+end+'\n中文合成测试字幕\n';
const sized=(length,end)=>srt(end)+'a'.repeat(length-Buffer.byteLength(srt(end)));
assert.equal(Buffer.byteLength(sized(3381,'00:03:00,000')),3381);
assert.throws(()=>ctx.subtitleCheckDuration({node:{name:'小丑2.mkv'},parsed:joker},sized(3381,'00:03:00,000'),'srt',log),/字幕不完整/);
assert.equal(ctx.subtitleEndTime('WEBVTT\n\n00:01.000 --> 01:05.500\n测试','vtt'),65.5);
assert.equal(ctx.subtitleEndTime('[Events]\nFormat: Layer, Start, End, Text\nDialogue: 0,0:00:01.00,1:40:02.50,中文,comma','ass'),6002.5);
ctx.subtitleCheckDuration({node:{name:'未知.mkv'},parsed:{}},srt('00:03:00,000'),'srt',log);
assert.ok(logs.some(line=>/无时长参考.*跳过/.test(line)));
assert.ok(logs.some(line=>/180.0 秒.*8280.0 秒.*TMDB/.test(line)));
const filter=(query,name)=>ctx.subtitleCandidateFilter({query,tv:false},[],name);
for(const [query,name] of [
    ['假面骑士极狐','[60帧蓝光剪辑]假面骑士海帕甲斗.合集重制版.ass'],
    ['假面骑士极狐','【超燃MAD】假面骑士极狐.ass'],
    ['假面骑士极狐','假面骑士亚极陀 - 07.ass'],
    ['龙骑特别篇：13骑士','[DBD-Raws][假面骑士龙骑][13].ass']
]) assert.ok(filter(query,name).excluded,name);
assert.equal(filter('假面骑士极狐','18F440E6'+'0'.repeat(32)+'.ssa').opaque,true);
// Run the production fill handler, with synthetic downloaded bodies and no drive mutations.
async function candidateFallback() {
    const r={node:{name:'路西法.2019.mkv'},parsed:{query:'路西法',year:2019,runtimeSeconds:120*60},subtitles:[],sources:[],complete:false};
    const candidates=[{source:'迅雷',name:'短字幕.srt'},{source:'迅雷',name:'路西法印度版.Lucifer.2019.Malayalam.CHS.srt'}];
    r.selectedCandidate=candidates[0];r.autoCandidates=candidates;
    const calls=[],saved=[],elements={fillSubtitles:{}},logs=[];
    Object.assign(ctx,{inventory:[r],mediaStem:name=>name.replace(/\.[^.]+$/,''),ui:{get:id=>elements[id]||(elements[id]={})},settings:()=>({language:'zh-cn,zh-tw,zh'}),lock(){},check(){},status(){},meter(){},render(){},diag:(a,b)=>logs.push(a+' '+b),
        drive:{assertReady(){},save:async(row,name,bytes)=>{saved.push(bytes);return {name};}},
        service:{fetchFile:async c=>{calls.push(c.name);return {result:{ext:'srt'},bytes:new TextEncoder().encode(c===candidates[0]?sized(8385,'00:03:00,000'):srt('01:50:00,000'))};}}});
    vm.runInContext(part("        ui.get('fillSubtitles').onclick =", "        ui.get('searchSubtitles').onclick"),ctx);
    await elements.fillSubtitles.onclick();
    assert.deepEqual(calls,candidates.map(c=>c.name));assert.equal(saved.length,1);assert.equal(r.complete,true);
    assert.ok(logs.some(line=>/候选失败.*字幕不完整/.test(line)));
}
candidateFallback().then(()=>console.log('PASS subtitle accuracy: real resource filters, Latin accents/kana, subtitle timing and production candidate fallback')).catch(error=>{console.error(error);process.exitCode=1;});
