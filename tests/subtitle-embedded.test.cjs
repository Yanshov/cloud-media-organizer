const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {TextDecoder, TextEncoder} = require('node:util');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'cloud-media-organizer-v3.user.js'), 'utf8');
const part = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

function element(id, content) {
    const width = content.length < 127 ? 1 : content.length < 16383 ? 2 : 3;
    const length = Buffer.alloc(width);
    length.writeUIntBE(content.length + 2 ** (7 * width), 0, width);
    return Buffer.concat([Buffer.from(id, 'hex'), length, content]);
}
const doc = element('1a45dfa3', element('4282', Buffer.from('matroska')));
const track = (...type) => element('ae', element('83', Buffer.from(type)));
const subtitle = ({tag, legacy, name, enabled} = {}) => element('ae', Buffer.concat([
    element('83', Buffer.from([17])),
    ...Object.entries({'22b59d':tag,'22b59c':legacy,'536e':name}).filter(([,value]) => value !== undefined).map(([id,value]) => element(id, Buffer.from(value))),
    ...(enabled === false ? [element('b9', Buffer.from([0]))] : [])
]));
const tracks = (...entries) => element('1654ae6b', Buffer.concat(entries));
const segment = (...elements) => Buffer.concat([doc, element('18538067', Buffer.concat(elements))]);

async function main() {
    const distant = segment(element('ec', Buffer.alloc(300000)), tracks(track(1), track(2), track(0, 17), subtitle({tag:'zh-Hans'})));
    let data = distant, mode = 'range', lookups = 0, aborts = 0;
    const ranges = [];
    const ctx = vm.createContext({URL, TextDecoder, TextEncoder, GM_getValue:(_name, fallback) => fallback,
        sleep:async () => {}, paced:(_interval, callback) => callback, guangyaAuthHeaders:() => ({}), guangyaCode:() => 0,
        requestJson:async () => { lookups++; return {data:{signedURL:'https://example.test/video'}}; },
        GM_xmlhttpRequest:options => {
            const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
            assert.ok(match, 'Never issues a full download');
            const start = Number(match[1]), end = Number(match[2]);
            ranges.push([start, end]);
            queueMicrotask(() => {
                if (mode === 'no-range') { options.onreadystatechange({readyState:2,status:200}); return; }
                const response = Uint8Array.from(data.subarray(start,end + 1)).buffer;
                options.onload({status:206,response,responseHeaders:`Content-Range: bytes ${start}-${end}/${mode === 'wrong-size' ? data.length + 1 : data.length}`});
            });
            return {abort() { aborts++; }};
        }});
    vm.runInContext(part('    function subtitleMd5(', '    function subtitleFileInfo(')
        + part('    function subtitleBinary(', '    function subtitleDecode(')
        + part('    function mkvChineseSubtitle(', '    function subtitleInventory('), ctx);
    const drive = ctx.subtitleDrive({session:{provider:'光鸭',token:'fake'},source:{}});
    const inspect = (name = 'video.MKV') => drive.inspectEmbedded({id:'x',name,size:data.length});

    assert.match((await inspect('video.mp4')).message, /非 MKV 格式，未读取视频/);
    assert.equal(lookups, 0, 'Unsupported format never asks for a download URL');
    assert.equal((await inspect()).chinese, true);
    assert.equal(lookups, 1, 'All ranges reuse the same signed URL');
    assert.deepEqual(ranges, [[0,65535],[262144,distant.length - 1]], 'Skip large elements by offset');
    data = Buffer.concat([doc, Buffer.from('1853806701ffffffffffffff', 'hex'), tracks(track(1),track(2))]);
    assert.equal((await inspect()).chinese, false, 'Unknown-length Segment is supported');
    for (const metadata of [{tag:'zh-Hant'}, {tag:'zh-CN'}, {legacy:'chi'}, {legacy:'zho'}, {tag:'und',name:'中文'}, {name:'Chinese / English'}]) {
        data = segment(tracks(subtitle({legacy:'eng'}), subtitle(metadata)));
        assert.equal((await inspect()).chinese, true, JSON.stringify(metadata));
    }
    data = segment(tracks(subtitle({tag:'en',legacy:'chi',name:'简体中文'})));
    assert.equal((await inspect()).chinese, false, 'Explicit BCP 47 tag overrides legacy language and name');
    data = segment(tracks(subtitle({legacy:'eng'}), subtitle({tag:'und',name:'SDH'}), track(17)));
    assert.deepEqual((await inspect()).chinese, false, 'English and unlabelled tracks alone do not satisfy Chinese coverage');
    data = segment(tracks(subtitle({tag:'zh-Hans',enabled:false})));
    assert.equal((await inspect()).chinese, false, 'Disabled subtitle tracks do not count');
    data = segment(tracks(element('ae', Buffer.alloc(0))));
    assert.match((await inspect()).message, /缺少有效的类型/);
    data = segment(element('ec', Buffer.from('1654ae6b83ae8183', 'hex')));
    assert.equal((await inspect()).chinese, false, 'Track-like bytes inside an unrelated element are not tracks');
    data = segment(tracks(track(17)));
    mode = 'wrong-size';
    assert.match((await inspect()).message, /片段范围不正确/);
    mode = 'no-range';
    const unsupported = await inspect();
    assert.equal(unsupported.chinese, false);
    assert.match(unsupported.message, /未提供分段读取/);
    assert.equal(aborts, 1);
    const stop = Object.assign(new Error('Stopped'), {stop:true});
    await assert.rejects(drive.inspectEmbedded({name:'video.mkv',size:data.length}, () => { throw stop; }), error => error === stop);
    console.log('PASS MKV detection: Simplified/Traditional/English, ambiguous labels, disabled tracks, malformed metadata, sparse range reads, non-MKV skips, Range refusal and cancellation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
