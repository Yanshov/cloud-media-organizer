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
assert.ok(logs.some(line=>/无时长参考/.test(line)));
assert.ok(logs.some(line=>/180.0 秒.*TMDB.*8280.0 秒/.test(line)));
const ass = lines => '[Events]\nFormat: Layer, End, Start, Style, Text\n' + lines.join('\n');
const normal = 'Dialogue: 0,3:54:00.00,3:53:57.00,Default,最后一句中文,带逗号';
const cutoff = {node:{name:'双塔奇兵.mkv'},parsed:{runtimeSeconds:14100}};
const remote = '64:52:05.00';
const decorated = ass([normal, 'Comment: 0,'+remote+',0:00:00.00,Default,注释',
    'Dialogue: 0,'+remote+',0:00:00.00,Default,{\\p1}m 0 0 l 0 10']);
const timing = ctx.subtitleCheckDuration(cutoff,decorated,'ass',log);
assert.equal(timing.end,14040);
assert.equal(timing.rawEnd,233525);
assert.equal(timing.events.comment,1);
assert.equal(timing.events.drawing,1);
assert.equal(ctx.subtitleDialogue(decorated,'ass'),'最后一句中文,带逗号');
assert.throws(()=>ctx.subtitleCheckDuration(cutoff,ass([normal,'Dialogue: 0,'+remote+',64:52:00.00,Default,真实对白']),'ass',log),/时间轴.*极端/);
for (const [start,end,reason] of [['00:00:01,000','00:60:00,000','分秒越界'],
    ['-00:00:01,000','00:00:03,000','负值'],['00:00:03,000','00:00:01,000','先后颠倒'],
    ['00:00:01,000','Infinity','非有限值'],['00:00:01,000','00:00:04,abc','格式']]) {
    assert.throws(()=>ctx.subtitleCheckDuration(cutoff,'1\n'+start+' --> '+end+'\n真实对白','srt',log),error=>error.message.includes(reason));
}
const cue = 'WEBVTT\n\nNOTE 中文注释\n00:03.000 --> 00:59.000\n\nintro\n00:01.000 --> 00:03.125 align:start\n<b>测试</b>';
assert.equal(ctx.subtitleEndTime(cue,'vtt'),3.125);
assert.equal(ctx.subtitleDialogue(cue,'vtt'),'测试');
assert.equal(ctx.subtitleEndTime('[Events]\nDialogue: Marked=0,0:00:01.00,0:00:03.50,Default,,0,0,0,,测试','ssa'),3.5);
for (const [end,runtime] of [['00:23:15,700',540],['03:17:22,400',15780]]) {
    const parsed = {runtimeSeconds:runtime};
    assert.equal(ctx.subtitleCheckDuration({node:{name:'参考样例'},parsed},srt(end),'srt').evidence,'reference-difference');
}
assert.throws(()=>ctx.subtitleCheckDuration({node:{name:'视频',durationSeconds:100},parsed:{}},srt('00:03:00,000'),'srt'),/视频文件时长冲突/);
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
    const candidates=[{source:'迅雷',name:'短字幕.srt'},{source:'迅雷',name:'异常时间轴.ass'},
        {source:'迅雷',name:'路西法印度版.Lucifer.2019.Malayalam.CHS.srt'}];
    r.selectedCandidate=candidates[0];r.autoCandidates=candidates;
    const calls=[],saved=[],elements={fillSubtitles:{}},logs=[];
    Object.assign(ctx,{inventory:[r],reviewCandidates:null,mediaStem:name=>name.replace(/\.[^.]+$/,''),ui:{get:id=>elements[id]||(elements[id]={}),busy(){}},settings:()=>({language:'zh-cn,zh-tw,zh'}),check(){},status(){},meter(){},render(){},diag:(a,b)=>logs.push(a+' '+b),
        drive:{assertReady(){},save:async(row,name,bytes)=>{saved.push(bytes);return {name};}},
        service:{fetchFile:async c=>{
            calls.push(c.name);
            if (c === candidates[1]) return {result:{ext:'ass'},bytes:new TextEncoder().encode(ass([normal,'Dialogue: 0,'+remote+',64:52:00.00,Default,真实对白']))};
            return {result:{ext:'srt'},bytes:new TextEncoder().encode(c===candidates[0]?sized(8385,'00:06:16,000'):srt('01:50:00,000'))};
        }}});
    vm.runInContext(part('    function createPanelTask(', '    function panelControls(') + "const runTask = createPanelTask(ui, () => {});\n" + part("        ui.get('fillSubtitles').onclick =", "        ui.get('stopSubtitles').onclick"),ctx);
    await elements.fillSubtitles.onclick();
    assert.deepEqual(calls,candidates.map(c=>c.name));assert.equal(saved.length,1);assert.equal(r.complete,true);
    assert.ok(logs.some(line=>/候选失败.*字幕不完整/.test(line)));
    assert.ok(logs.some(line=>/候选失败.*时间轴存在极端对白范围/.test(line)));
    assert.equal(Buffer.from(saved[0]).toString(),srt('01:50:00,000'));
}
candidateFallback().then(()=>console.log('PASS subtitle accuracy: real resource filters, Latin accents/kana, subtitle timing and production candidate fallback')).catch(error=>{console.error(error);process.exitCode=1;});
