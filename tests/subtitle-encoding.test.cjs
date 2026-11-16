const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const context = vm.createContext({TextDecoder});
vm.runInContext(source.slice(source.indexOf('    const SUBTITLE_LIMIT'), source.indexOf('    function subtitleLanguageMatch(')), context);
const check = (bytes, ext) => {
    context.bytes = bytes; context.ext = ext;
    return vm.runInContext('subtitlePayload(bytes, ext, "zh-cn,zh-tw,zh")', context);
};
// Encoding fixtures below are synthetic and reproducible; no third-party subtitle files are bundled.
const srt = '1\r\n00:00:01,000 --> 00:00:03,000\r\n测试字幕 Test\r\n';
const le = Buffer.from(srt, 'utf16le');
const be = Buffer.from(le).swap16();
for (const [encoding, bytes] of [
    ['UTF-8', Buffer.from(srt)],
    ['UTF-8 BOM', Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(srt)])],
    ['UTF-16 LE BOM', Buffer.concat([Buffer.from([0xff,0xfe]),le])],
    ['UTF-16 BE BOM', Buffer.concat([Buffer.from([0xfe,0xff]),be])],
    ['UTF-16 LE without BOM', le],
    ['UTF-16 BE without BOM', be],
    ['GB18030', Buffer.concat([Buffer.from('1\n00:00:01,000 --> 00:00:03,000\n'),Buffer.from([0xd6,0xd0,0xce,0xc4])])]
]) {
    assert.match(check(bytes, 'srt'), /测试字幕|中文/);
    console.log(`PASS ${encoding}`);
}
for (const bytes of [Buffer.from('<html>error</html>'), Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('<html>error</html>','utf16le')]), Buffer.from('not a subtitle')]) {
    assert.throws(() => check(bytes, 'srt'), /不是可识别/);
}
console.log('PASS error pages and non-subtitle content remain rejected');
