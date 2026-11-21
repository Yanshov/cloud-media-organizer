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
    const elements = Object.fromEntries(['runMedia', 'mediaPreview', 'mediaPreviewPanel'].map(id => [id, {disabled: true, textContent: ''}]));
    const state = {locks: [], messages: [], preparations: 0, writes: 0, owner: null};
    const claim = (pane, busy) => {
        if (busy && state.owner && state.owner !== pane) throw Error('another task is active');
        if (busy) state.owner = pane;
        else if (state.owner === pane) state.owner = null;
    };
    const ctx = vm.createContext({
        flow: {
            requireScope: async () => {},
            videoStates: () => new Map(ctx.rows.map(row => [row.node.id,
                {canOrganize:row.ready,blocker:'作品匹配未确认'}])),
            sameSubtitles: () => true,
            coverage: () => 'complete',
            previewShown: () => {}
        },
        rows: [{include: true, ready: true, destination: 'Movie.2000.mkv', node: {id: 'v', path: 'old.mkv'}, subtitles: [{id: 's', name: 'old.zh-cn.srt', suffix: '.zh-cn'}]}],
        cancelled: false, batch: null, batchWriter: null, history:null, previewRevision:'',
        ui: {busy: busy => claim('media', busy), get: id => {assert.ok(elements[id], 'Unexpected UI dependency: ' + id); return elements[id];}},
        otherUi: {busy: busy => claim('subtitles', busy)},
        updateControls: busy => {state.locks.push(busy); elements.runMedia.disabled = busy || !ctx.batch;},
        meter: () => {}, stopMeter: () => {}, render: () => {},
        progress: message => state.messages.push(message), log: message => state.messages.push(message),
        checkStopped: () => {if (ctx.cancelled) throw Error('stopped');},
        readyRow: row => row.ready,
        mediaFileMetadata: async () => ({size: 100, md5: 'a'.repeat(32)}),
        mediaRecords: {remember: () => {}, save: () => {}},
        mediaSubtitleLinks: () => ({linked:new Map([['v',[{id:'s',name:'old.zh-cn.srt',suffix:'.zh-cn'}]]])}),
        source: {children: async () => []}, targetSession: {parent: 'root'}, targetPath: 'library',
        relativeParts: value => value.split('/'),
        mediaOrganizerWriter: () => ({prepare: async () => {state.preparations++; return [];}, execute: async () => {state.writes++;}})
    });
    vm.runInContext(
        part('    const MEDIA_VIDEO', '    function mediaSeasonNumber(') +
        part('    function mediaCategory(', '    function mediaSubtitleSuffix(') +
        part('    function createPanelTask(', '    function panelControls(') +
        part('    async function forEachConcurrent(', '    function cachedDriveChildren(') +
        part('    function cachedDriveChildren(', '    function titleKey(') +
        '\nconst runTask = createPanelTask(ui, updateControls); this.runOther = createPanelTask(otherUi, () => {});\n' +
        part('        const invalidate =', '        let mediaBusy =') +
        part('        const generatePreview =', "        ui.get('previewMedia').onclick") +
        '\nthis.generate = generatePreview; this.checkStale = refreshStalePreview;', ctx);
    const standardPath = ctx.mediaPath;
    ctx.mediaPath = row => row.destination ?? standardPath(row);
    return {ctx, state, elements};
}

(async () => {
    const {ctx, state, elements} = fixture();
    await ctx.generate();
    assert.deepEqual(Array.from(ctx.batch, item => item.destination), ['Movie.2000.mkv', 'Movie.2000.zh-cn.srt']);
    assert.ok(ctx.batchWriter); assert.equal(elements.runMedia.disabled, false);
    assert.match(elements.mediaPreview.textContent, /library\/Movie.2000.zh-cn.srt/);
    assert.equal(state.preparations, 1); assert.equal(state.writes, 0, 'Preview must never execute writes');
    ctx.rows[0].destination = 'Renamed.2000.mkv';
    await ctx.generate();
    assert.equal(ctx.batch[0].destination, 'Renamed.2000.mkv');
    assert.doesNotMatch(elements.mediaPreview.textContent, /Movie\.2000/);

    ctx.rows.push({include: true, ready: false, node: {id: 'pending', path: 'unknown.mkv'}});
    await ctx.generate();
    assert.equal(ctx.batch.length, 2, 'Unconfirmed video does not block the ready group');
    assert.ok(state.messages.some(message => message.includes('预览跳过：') && message.includes('作品匹配未确认')));

    ctx.source.children = async () => [{name: 'Renamed.2000.mkv', id: 'other'}];
    await ctx.generate();
    assert.equal(ctx.batch, null); assert.equal(ctx.batchWriter, null);
    assert.equal(elements.runMedia.disabled, true); assert.equal(elements.mediaPreview.textContent, '');
    assert.ok(state.messages.some(message => message.includes('同名冲突')));

    ctx.source.children = async () => [];
    await ctx.generate();
    let entered, finish;
    const reading = new Promise(resolve => {entered = resolve;});
    const inFlight = new Promise(resolve => {finish = resolve;});
    ctx.mediaOrganizerWriter = () => ({prepare: async () => {entered(); await inFlight; return [];}});
    const interrupted = ctx.generate();
    await reading;
    // A second event in the same pane must not replace or unlock the running task.
    await ctx.generate();
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
    await ctx.generate();
    ctx.source.children = async () => {throw Error('listing failed');};
    await ctx.generate();
    assert.equal(ctx.batch, null); assert.equal(elements.runMedia.disabled, true);
    assert.equal(state.locks.at(-1), false); assert.match(state.messages.at(-1), /listing failed/);
    assert.equal(state.writes, 0);
    const resolution = fixture();
    Object.assign(resolution.ctx.rows[0], {destination:undefined, title:'Movie', year:'2000', type:'movie'});
    resolution.ctx.rows[0].node.name = 'Movie.2000.3840×2160.4K.mkv';
    await resolution.ctx.generate();
    assert.deepEqual(Array.from(resolution.ctx.batch, item => item.destination), [
        '电影/Movie.2000/Movie.2000.2160p.mkv', '电影/Movie.2000/Movie.2000.2160p.zh-cn.srt'
    ]);
    Object.assign(resolution.ctx.rows[0], {title:'美国众神', year:'2017', type:'tv', category:'剧集', season:3, episode:8});
    resolution.ctx.rows[0].node.name = 'American.Gods.S03E08.1080p.mkv';
    await resolution.ctx.generate();
    assert.deepEqual(Array.from(resolution.ctx.batch, item => item.destination), [
        '剧集/美国众神.2017.1080p/Season 03/美国众神.2017.S03E08.1080p.mkv',
        '剧集/美国众神.2017.1080p/Season 03/美国众神.2017.S03E08.1080p.zh-cn.srt'
    ]);
    for (const [input,expected] of [
        ['Series.S01E02E03.1080P.mkv','Series.2024.S01E02E03.1080p.mkv'],
        ['Series.S01E02E03.720p.1080p.mkv','Series.2024.S01E02E03.mkv'],
        ['Series.S01E02E03.2048kbps.mkv','Series.2024.S01E02E03.mkv']
    ]) {
        const row = {node:{name:input},title:'Series',year:'2024',type:'tv',category:'剧集',season:1,episode:2,endEpisode:3};
        const resolutionSuffix = expected.includes('.1080p.') ? '.1080p' : '';
        assert.equal(resolution.ctx.mediaPath(row),'剧集/Series.2024' + resolutionSuffix + '/Season 01/' + expected);
    }


    const merged = fixture();
    merged.ctx.rows.push({include:true,ready:true,destination:'Other.mkv',node:{id:'bad',path:'bad.mkv'}});
    merged.ctx.mediaFileMetadata = async node => {
        if (node.id === 'bad') throw Error('文件元数据不可用');
        return {size:100,md5:'a'.repeat(32)};
    };
    await merged.ctx.generate();
    assert.deepEqual(Array.from(merged.ctx.batch,item=>item.videoId),['v','v']);
    assert.ok(merged.state.messages.some(message=>message.includes('bad.mkv') && message.includes('文件元数据不可用')));
    assert.equal(merged.state.writes,0,'Mixed preview remains read-only');
    merged.ctx.flow.videoStates = ()=>new Map(merged.ctx.rows.map(row=>[row.node.id,{canOrganize:false,blocker:'作品资料缺失'}]));
    await merged.ctx.generate();
    assert.equal(merged.ctx.batch,null);
    assert.ok(merged.state.messages.some(message=>message.includes('作品资料缺失（2 项）')));
    console.log('PASS media preview: video/subtitle destinations, edits, pending rows, conflicts, cancellation and failures; no stale executable plan or drive writes');
})().catch(error => {console.error(error); process.exitCode = 1;});
