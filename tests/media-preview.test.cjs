const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a, b) => {
    const start = source.indexOf(a), end = source.indexOf(b, start);
    assert.ok(start >= 0 && end > start, a);
    return source.slice(start, end);
};

function fixture() {
    const elements = Object.fromEntries(['runMedia', 'mediaPreview', 'mediaRecordState'].map(id => [id, {disabled: true, textContent: ''}]));
    const state = {locks: [], messages: [], preparations: 0, writes: 0, owner: null};
    const claim = (pane, busy) => {
        if (busy && state.owner && state.owner !== pane) throw Error('another task is active');
        if (busy) state.owner = pane;
        else if (state.owner === pane) state.owner = null;
    };
    const ctx = vm.createContext({
        rows: [{include: true, ready: true, destination: 'Movie.2000.mkv', node: {id: 'v', path: 'old.mkv'}, subtitles: [{id: 's', name: 'old.zh-cn.srt', suffix: '.zh-cn'}]}],
        cancelled: false, batch: null, batchWriter: null, reused: 0, history:null, previewRevision:'',
        ui: {busy: busy => claim('media', busy), get: id => {assert.ok(elements[id], 'Unexpected UI dependency: ' + id); return elements[id];}},
        otherUi: {busy: busy => claim('subtitles', busy)},
        updateControls: busy => {state.locks.push(busy); elements.runMedia.disabled = busy || !ctx.batch;},
        meter: () => {}, stopMeter: () => {}, render: () => {},
        progress: message => state.messages.push(message), log: message => state.messages.push(message),
        checkStopped: () => {if (ctx.cancelled) throw Error('stopped');},
        readyRow: row => row.ready, validateEpisode: async () => {},
        mediaFileMetadata: async () => ({size: 100, md5: 'a'.repeat(32)}),
        mediaRecords: {remember: () => {}, save: () => {}, count: () => 1},
        mediaSubtitleLinks: () => ({linked:new Map([['v',[{id:'s',name:'old.zh-cn.srt',suffix:'.zh-cn'}]]])}),
        source: {children: async () => []}, targetSession: {parent: 'root'}, targetPath: 'library',
        mediaPath: row => row.destination, mediaStem: value => value.replace(/\.[^.]+$/, ''),
        relativeParts: value => value.split('/'), mediaWorkCounts: () => {},
        mediaOrganizerWriter: () => ({prepare: async () => {state.preparations++; return [];}, execute: async () => {state.writes++;}})
    });
    vm.runInContext(
        part('    function createPanelTask(', '    function panelControls(') +
        part('    async function forEachConcurrent(', '    function cachedDriveChildren(') +
        part('    function cachedDriveChildren(', '    function titleKey(') +
        '\nconst runTask = createPanelTask(ui, updateControls); this.runOther = createPanelTask(otherUi, () => {});\n' +
        part('        const invalidate =', '        let mediaBusy =') +
        part('        const refreshPreview =', '        const editRows =') +
        part('        const generatePreview =', "        if (flow) {\n            ui.get('previewMedia').onclick") +
        '\nthis.refresh = refreshPreview; this.checkStale = refreshStalePreview;', ctx);
    return {ctx, state, elements};
}

(async () => {
    const {ctx, state, elements} = fixture();
    await ctx.refresh();
    assert.deepEqual(Array.from(ctx.batch, item => item.destination), ['Movie.2000.mkv', 'Movie.2000.zh-cn.srt']);
    assert.ok(ctx.batchWriter); assert.equal(elements.runMedia.disabled, false);
    assert.match(elements.mediaPreview.textContent, /library\/Movie.2000.zh-cn.srt/);
    assert.equal(state.preparations, 1); assert.equal(state.writes, 0, 'Preview must never execute writes');
    ctx.rows[0].destination = 'Renamed.2000.mkv';
    await ctx.refresh();
    assert.equal(ctx.batch[0].destination, 'Renamed.2000.mkv');
    assert.doesNotMatch(elements.mediaPreview.textContent, /Movie\.2000/);

    ctx.rows.push({include: true, ready: false, node: {id: 'pending', path: 'unknown.mkv'}});
    await ctx.refresh();
    assert.equal(ctx.batch.length, 2, 'Unconfirmed video does not block the ready group');
    assert.ok(state.messages.some(message => message.includes('待确认，已跳过')));

    ctx.source.children = async () => [{name: 'Renamed.2000.mkv', id: 'other'}];
    await ctx.refresh();
    assert.equal(ctx.batch, null); assert.equal(ctx.batchWriter, null);
    assert.equal(elements.runMedia.disabled, true); assert.equal(elements.mediaPreview.textContent, '');
    assert.ok(state.messages.some(message => message.includes('同名冲突')));

    ctx.source.children = async () => [];
    await ctx.refresh();
    let entered, finish;
    const reading = new Promise(resolve => {entered = resolve;});
    const inFlight = new Promise(resolve => {finish = resolve;});
    ctx.mediaOrganizerWriter = () => ({prepare: async () => {entered(); await inFlight; return [];}});
    const interrupted = ctx.refresh();
    await reading;
    // A second event in the same pane must not replace or unlock the running task.
    await ctx.refresh();
    ctx.cancelled = true;
    assert.equal(state.owner, 'media');
    await assert.rejects(ctx.runOther(() => assert.fail('conflicting task started')), /another task is active/);
    assert.equal(elements.runMedia.disabled, true);
    finish(); await interrupted;
    assert.equal(ctx.batch, null); assert.equal(ctx.batchWriter, null);
    assert.equal(elements.runMedia.disabled, true); assert.equal(state.locks.at(-1), false);
    assert.match(state.messages.at(-1), /stopped/);
    assert.equal(await ctx.runOther(() => 'resumed'), 'resumed');

    ctx.cancelled = false;
    ctx.mediaOrganizerWriter = () => ({prepare: async () => []});
    await ctx.refresh();
    ctx.source.children = async () => {throw Error('listing failed');};
    await ctx.refresh();
    assert.equal(ctx.batch, null); assert.equal(elements.runMedia.disabled, true);
    assert.equal(state.locks.at(-1), false); assert.match(state.messages.at(-1), /listing failed/);
    assert.equal(state.writes, 0);
    console.log('PASS media preview: direct refresh, video/subtitle destinations, edits, pending rows, conflicts, cancellation and failures; no stale executable plan or drive writes');
})().catch(error => {console.error(error); process.exitCode = 1;});
