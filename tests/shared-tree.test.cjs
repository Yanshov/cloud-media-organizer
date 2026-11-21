const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const bootstrap = script.lastIndexOf("    if (location.hostname === 'www.guangyapan.com') {");
assert.ok(bootstrap > 0);
const context = vm.createContext({
    window: {fetch: () => assert.fail('Unexpected real request')},
    GM_getValue: (_key, fallback) => fallback,
    setTimeout, clearTimeout
});
vm.runInContext(script.slice(0, bootstrap) + '\nthis.scan = {collectTree, collectMediaSelection};\n})();', context);
const {collectTree, collectMediaSelection} = context.scan;

const md5 = 'A'.repeat(32);
const directory = (id, name) => ({key: String(id), id: String(id), name, directory: true});
const file = (id, name, metadata = {}) => ({key: String(id), id: String(id), name, directory: false, ...metadata});

async function deepSelection() {
    const folders = Array.from({length: 160}, (_, i) => directory(100 + i, `目录${i}`));
    const root = folders[0], leaf = folders.at(-1), other = directory(300, '其他目录');
    const video = file(401, '电影.mkv', {md5, size: 0});
    const subtitle = file(402, '电影.zh-cn.srt');
    const skipped = file(403, '说明.txt');
    const otherVideo = file(404, video.name, {md5, size: 12});
    const lists = new Map([['0', [root]]]);
    for (let i = 0; i < folders.length - 1; i++) lists.set(folders[i].id, [folders[i + 1]]);
    lists.get(root.id).push(other);
    lists.set(leaf.id, [root, video, subtitle, skipped]);
    lists.set(other.id, [folders[1], otherVideo]);
    const reads = [], details = [];
    const source = {
        parentId: '0',
        async children({id}) { reads.push(id); return lists.get(id); },
        async metadata({id}) {
            details.push(id);
            if (id === subtitle.id) return {md5, size: 15, gcid: 'b'.repeat(40), cid: 'c'.repeat(40)};
        }
    };
    const folderPaths = folders.map((_, i) => folders.slice(0, i + 1).map(node => node.name).join('/'));
    const videoPath = `${folderPaths.at(-1)}/${video.name}`;
    const subtitlePath = `${folderPaths.at(-1)}/${subtitle.name}`;
    const otherPath = `${root.name}/${other.name}`;
    const expectedReads = [...folders.map(node => node.id), other.id];
    const exportProgress = [];
    const manifest = await collectTree([root, root], source, state => exportProgress.push(state), '媒体');
    assert.deepEqual(reads.slice().sort(),expectedReads.slice().sort(), 'Traversal must read each directory once even when an ancestor is referenced again');
    assert.deepEqual(details, [subtitle.id, skipped.id]);
    assert.equal(manifest.directories, folders.length + 1);
    assert.equal(manifest.files, 3);
    assert.deepEqual(Array.from(manifest.skipped), [`媒体/${folderPaths.at(-1)}/${skipped.name}`]);
    assert.deepEqual(Array.from(manifest.entries, entry => entry.path),
        [...folderPaths, videoPath, subtitlePath, otherPath, `${otherPath}/${otherVideo.name}`].map(item => '媒体/' + item));
    assert.deepEqual({...manifest.entries[folders.length]}, {path: '媒体/' + videoPath, md5: md5.toLowerCase(), size: 0});
    assert.deepEqual({...manifest.entries[folders.length + 1]}, {
        path: '媒体/' + subtitlePath, md5: md5.toLowerCase(), size: 15, gcid: 'B'.repeat(40), cid: 'C'.repeat(40)
    });
    assert.ok(exportProgress.some(state => state.path === '媒体/' + root.name && state.directories === 1));

    reads.length = details.length = 0;
    const scanned = await collectMediaSelection([{id: root.id}, {names: [root.name]}], source);
    assert.deepEqual(reads.slice().sort(),['0',...expectedReads].sort(), 'Sibling subtitles reuse the directory listing from this scan');
    assert.deepEqual(details, [], 'Media inventory uses directory data and defers file metadata');
    assert.deepEqual(Array.from(scanned.videos, node => node.path), [videoPath, `${otherPath}/${otherVideo.name}`]);
    const [deepVideo] = scanned.videos;
    assert.deepEqual(Array.from(deepVideo.folders), folders.map(node => node.name));
    assert.deepEqual(Array.from(deepVideo.ancestors, entry => [entry.id, entry.parentId, entry.path, entry.depth]),
        folders.map((node, i) => [node.id, folders[i - 1]?.id ?? '0', folderPaths[i], i]));
    const [linked] = scanned.linked.get(video.id);
    assert.equal(linked.path, subtitlePath);
    assert.equal(linked.suffix, '.zh-cn');
    assert.equal(linked.id, subtitle.id);
    assert.equal(scanned.linked.get(otherVideo.id).length, 0, 'Same title in a different directory must not claim the subtitle');
}

async function interruptedTraversal(scan, fromSelection, stop) {
    const first = directory(1, '待返回'), later = directory(2, '之后的目录');
    let entered, complete, fail;
    const started = new Promise(resolve => { entered = resolve; });
    const reading = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    const reads = [], details = [];
    const source = {
        parentId: '0',
        async children({id}) {
            reads.push(id);
            if (id === '0') return [first, later];
            if (id === first.id) { entered(); return reading; }
            return [];
        },
        async metadata({id}) { details.push(id); }
    };
    let stopped = false;
    const error = stop ? Error('已停止') : Object.assign(Error('HTTP 403'), {status: 403, stop: true});
    const result = scan([first, later], source, () => { if (stopped) throw error; });
    const label = `${fromSelection ? 'Media selection' : 'Manifest export'} should report ${stop ? 'Stop' : 'permission failure'}`;
    const rejected = assert.rejects(result, caught => caught === error, label);
    await Promise.race([started, rejected.then(() => assert.fail('Task failed before starting the child request'))]);
    const expected = fromSelection ? ['0',first.id,later.id] : [first.id,later.id];
    assert.deepEqual(reads, expected);
    if (stop) {
        stopped = true;
        complete([file(3, '未读取元数据.mkv')]);
    } else fail(error);
    await rejected;
    assert.deepEqual(reads, expected, 'Later directories must not be requested after stopping or failing');
    assert.deepEqual(details, [], 'A response arriving after Stop must not trigger metadata reads');
}

async function traversalFailureSummary() {
    const log = [];
    const permission = Object.assign(Error('返回码 509'), {status:509});
    const root = directory(1, '根目录');
    const source = {
        parentId:'0',
        async children({id}) {
            if (id === root.id) return [directory(2,'读取失败'),directory(3,'同层目录')];
            throw permission;
        }
    };
    await assert.rejects(collectTree([root],source,undefined,'',undefined,message => log.push(message)), error => error === permission);
    assert.equal(log.length,1,'Traversal reports once across all layers');
    assert.match(log[0],/总量 3.*成功 1 · 失败 2.*限流 1/,'One repeated error contributes only once to the rate-limit count');
}

(async () => {
    await deepSelection();
    await traversalFailureSummary();
    for (const stop of [false, true]) {
        await interruptedTraversal((roots, source, check) => collectTree(roots, source, undefined, '', check), false, stop);
        await interruptedTraversal((roots, source, check) => collectMediaSelection(roots, source, undefined, check), true, stop);
    }
    console.log('PASS shared traversal: depth-first order, cycles and repeated IDs, export metadata, media ancestry and subtitle pairing, in-flight permission failure and cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
