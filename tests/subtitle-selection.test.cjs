const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
assert.doesNotMatch(source,/shooter\.cn|shooterHash|useShooter|cross-drive-subtitle-shooter-default-v1/i,'Retired provider has no runtime or permission hooks');
assert.doesNotMatch(source,/async sample\(row/,'Subtitle scans no longer sample video bytes');
const prefix = 'Obesity.The.Post.Mortem.720p.WEB.h264-spamTV.';
const names = ['简体&英文.ass','简体&英文.srt','简体.ass','简体.srt','繁体&英文.ass','繁体&英文.srt','繁体.ass','繁体.srt','英文.srt'].map(suffix => prefix + suffix);
const requests = [], transfers = [];
let responseNames = names;
const mockUrl = index => 'http://subtitles.example/file/' + index + '?_=1&-=signed&api=1';
const contents = new TextEncoder().encode('1\n00:00:01,000 --> 00:00:03,000\n测试字幕 Test\n');
const context = vm.createContext({URL, URLSearchParams, Uint8Array, ArrayBuffer, TextDecoder, Blob,
    paced: (_delay, fn) => fn,
    sleep: async () => {},
    GM_xmlhttpRequest: options => {
        transfers.push(options);
        options.onload({status:200, response:contents.buffer});
        return {abort() {}};
    },
    subtitleRemoteJson: async url => {
        requests.push(new URL(url));
        return {code:0,data:responseNames.map((name,index)=>({name,url:mockUrl(index)}))};
    }
});
vm.runInContext(source.slice(source.indexOf('    function evict('),source.indexOf('    function nonNegativeInteger(')) + source.slice(source.indexOf('    function subtitleDownloadUrl('), source.indexOf('    function subtitleDrive(')), context);
const run = code => vm.runInContext(code, context);
const pick = (candidates, language = 'zh-cn,zh-tw,zh') => {
    context.row = {node:{name:'肥胖症：尸检.2016.mkv'}, candidates:[...candidates], sources:[]};
    context.language = language;
    run('selectSubtitleCandidate(row, language)');
    return context.row;
};
(async () => {
    const service = run('createSubtitleService()');
    const config = {language:'zh-cn,zh-tw,zh'};
    const row = {node:{name:'肥胖症：尸检.2016.mkv'}, parsed:{query:'Obesity: The Post Mortem', year:2016, tv:false}};
    const candidates = await service.thunderSearch(row, config);
    assert.ok(requests.every(request => request.hostname.endsWith('xunlei.com')));
    assert.deepEqual(Array.from(candidates, candidate => candidate.name), names);
    assert.equal(candidates.length, 9, 'Nine files must produce nine selectable resources');
    assert.equal(candidates[0].bilingual, true);
    assert.equal(candidates[4].language, 'zh-tw');
    assert.equal(candidates[8].language, 'en', 'English file must not inherit Chinese package language');
    const selected = pick(candidates);
    assert.equal(selected.selectedCandidate.name, names[0]);
    assert.equal(run('subtitleSearchState(row)'), 'ready');
    assert.ok(run('subtitleSearchMessage(row)').includes(names[0]));
    assert.ok(run('subtitleCandidateLabel(row.selectedCandidate)').includes('双语 · 简体中文'));
    assert.ok(!selected.autoCandidates.some(c => c.name === names[8]));
    assert.equal(pick(candidates.filter(c => !c.bilingual)).selectedCandidate.name, names[2], 'No bilingual: pick simplified');
    assert.equal(pick(candidates.filter(c => c.language === 'zh-tw' && !c.bilingual)).selectedCandidate.name, names[6], 'Only traditional: pick traditional');
    assert.equal(pick(candidates.filter(c => c.language !== 'zh-cn' || !c.bilingual)).selectedCandidate.name, names[4], 'Traditional bilingual precedes simplified monolingual');
    assert.equal(pick(candidates, 'en').selectedCandidate.name, names[8]);
    assert.equal(pick(candidates, 'zh-cn').selectedCandidate.name, names[0]);
    const download = await service.download(candidates[5], config);
    assert.equal(download.url, mockUrl(5), 'Manual choice must download that exact file');
    assert.equal(download.allowHttp, true);
    context.download = download;
    const bytes = await run('subtitleBinary(download.url, {allowHttp:download.allowHttp})');
    assert.equal(transfers[0].url, download.url);
    assert.equal(transfers[0].anonymous, true);
    assert.deepEqual(Object.keys(transfers[0].headers), []);
    context.bytes = bytes;
    assert.ok(run('subtitlePayload(bytes, "srt", "zh-cn,zh-tw,zh")').includes('测试字幕'));
    assert.throws(() => run('subtitleBinary(download.url)'), /不支持/);
    assert.throws(() => run('subtitleBinary(download.url, {allowHttp:true,method:"PUT",bytes})'), /不支持/);
    assert.throws(() => run('subtitleBinary(download.url, {allowHttp:true,headers:{Authorization:"secret"}})'), /不支持/);
    assert.throws(() => run('subtitleDownloadUrl("javascript:alert(1)", {allowHttp:true})'), /不支持/);
    assert.throws(() => run('subtitleDownloadUrl("http://user:password@example.com/file.srt", {allowHttp:true})'), /不支持/);
    assert.equal(run('subtitleDownloadUrl("//subtitles.example/file.srt", {allowHttp:true,base:"https://subtitles.example/"})'), 'https://subtitles.example/file.srt');
    context.bytes = new TextEncoder().encode('<html>download error</html>');
    assert.throws(() => run('subtitlePayload(bytes, "srt", "zh")'), /不是可识别/);
    responseNames = ['Obesity.The.Post.Mortem.S01E02.简体.srt'];
    const mismatch = {parsed:{query:'Obesity: The Post Mortem', tv:true, season:1, episode:1}};
    assert.equal((await service.thunderSearch(mismatch, config)).length, 0, 'Explicit wrong episodes must be excluded entirely');
    console.log('PASS subtitle selection: language ranking, selected file URL, secure HTTP GET transfer, body validation and exact episode guard');
})().catch(error => { console.error(error); process.exitCode = 1; });
