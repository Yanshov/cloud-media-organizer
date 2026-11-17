const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const prefix = 'Obesity.The.Post.Mortem.720p.WEB.h264-spamTV.';
const names = ['简体&英文.ass','简体&英文.srt','简体.ass','简体.srt','繁体&英文.ass','繁体&英文.srt','繁体.ass','繁体.srt','英文.srt'].map(suffix => prefix + suffix);
const requests = [], transfers = [];
let searchHasFiles = true, detailFails = false, nativeName = '肥胖症:尸检/Obesity: The Post Mortem';
const contents = new TextEncoder().encode('1\n00:00:01,000 --> 00:00:03,000\n测试字幕 Test\n');
const context = vm.createContext({URL, URLSearchParams, Uint8Array, ArrayBuffer, TextDecoder, Blob,
    paced: (_delay, fn) => fn,
    GM_xmlhttpRequest: options => {
        transfers.push(options);
        options.onload({status:200, response:contents.buffer});
        return {abort() {}};
    },
    subtitleRemoteJson: async (url, options) => {
        const parsed = new URL(url);
        requests.push({url:parsed, options});
        if (url.includes('/search?')) return {status:0, sub:{subs:[{id:123, native_name:nativeName, videoname:'不知道', lang:{langlist:{langchs:true,langcht:true,langeng:true}}, ...(searchHasFiles ? {filelist:names.map(f => ({f,s:'318KB'}))} : {})}]}};
        if (url.includes('/detail?')) {
            if (detailFails) throw Error('HTTP 509');
            return {status:0, sub:{subs:[{id:123, filelist:names.map((f, i) => ({f,s:'318KB',url:'http://file0.assrt.net/onthefly/123/' + i + '?_=1&-=signed&api=1'}))}]}};
        }
        if (url.includes('subapi.php')) return [];
        throw Error('Unexpected request');
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
    const config = {assrtToken:'test-token', language:'zh-cn,zh-tw,zh'};
    const row = {node:{name:'肥胖症：尸检.2016.mkv'}, parsed:{query:'肥胖症：尸检.2016', year:2016, tv:false}};
    const log = [];
    const candidates = await service.assrtSearch(row, config, message => log.push(message));
    assert.equal(requests[0].url.searchParams.get('q'), '肥胖症 尸检');
    assert.equal(row.parsed.query, '肥胖症：尸检.2016', 'Outbound cleanup must not alter the identity title');
    assert.equal(requests[0].url.searchParams.get('filelist'), '1');
    assert.equal(requests.length, 1, 'File list in search must avoid extra detail requests');
    assert.deepEqual(Array.from(candidates, c => c.name), names);
    assert.equal(candidates.length, 9, 'Nine files must produce nine selectable resources');
    assert.ok(log[0].includes(names[8]));
    assert.ok(candidates.every(c => !c.release.includes('不知道')));
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
    assert.equal(download.fileName, names[5], 'Manual choice must download that exact file');
    assert.equal(download.url, 'http://file0.assrt.net/onthefly/123/5?_=1&-=signed&api=1');
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
    assert.equal(run('subtitleDownloadUrl("//file0.assrt.net/file.srt", {allowHttp:true,base:"https://assrt.net/"})'), 'https://file0.assrt.net/file.srt');
    context.bytes = new TextEncoder().encode('<html>download error</html>');
    assert.throws(() => run('subtitlePayload(bytes, "srt", "zh")'), /不是可识别/);
    searchHasFiles = false;
    nativeName = '肥胖症:尸检 S01E02';
    const mismatch = {parsed:{query:'肥胖症:尸检', tv:true, season:1, episode:1}};
    const mismatchCandidates = await service.assrtSearch(mismatch, config);
    assert.equal(mismatchCandidates.length, 0, 'Explicit wrong episodes must be excluded entirely');
    assert.ok(requests.some(request => request.url.pathname.endsWith('/detail')), 'Missing search file list must fall back to detail');
    detailFails = true;
    const fallback = await service.assrtSearch(mismatch, config);
    assert.equal(fallback[0].detailError, 'HTTP 509');
    assert.equal(pick(fallback).selectedCandidate, null);
    await service.shooterHash('test-hash', row.node.name);
    assert.equal(new URLSearchParams(requests.at(-1).options.body).get('pathinfo'), row.node.name);
    console.log('PASS: 9 real resource names; bilingual > simplified > traditional; exact selected download; HTTP GET transfer and text validation; secure upload unchanged; detail fallback; episode guard; shooter original filename');
})().catch(error => { console.error(error); process.exitCode = 1; });
