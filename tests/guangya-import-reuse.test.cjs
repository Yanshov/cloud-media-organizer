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
const file = (name, parent = '') => ({name, path: [parent, name].filter(Boolean).join('/'), type: 'file', md5: 'a'.repeat(32), size: 100});
const changed = node => ({...node, md5: 'b'.repeat(32)});
function fixture(children, submit = async () => ({status: 'saved', message: 'saved'})) {
    const state = {reads: 0, submissions: 0, logs: [], stopped: false};
    const ctx = vm.createContext({sleep: async () => {}, importFile: async (...args) => {state.submissions++; return submit(...args);}});
    vm.runInContext(
        part('    function hasFileMetadata(', '    function ready(') +
        part('    function relativeParts(', '    function normalizeFiles(') +
        part('    async function runGuangyaImportFiles(', '    function initGuangya('), ctx);
    const run = (files, ensure = async value => value || 'root') => ctx.runGuangyaImportFiles(
        files, 'root', async () => {}, ensure,
        {children: async folder => {state.reads++; return children(folder, state);}},
        message => state.logs.push(message),
        () => {if (state.stopped) throw Object.assign(Error('stopped'), {stop: true});});
    return {state, run};
}

(async () => {
    const files = Array.from({length: 50}, (_, index) => file(index + '.mkv'));
    let current = files;
    const repeated = fixture(async () => current);
    let counts = await repeated.run(files);
    assert.equal(counts.skipped, 50); assert.equal(repeated.state.reads, 1);
    assert.equal(repeated.state.submissions, 0);
    assert.match(repeated.state.logs.at(-1), /读取 1 次，复用已有项 49 次/);
    current = [changed(files[0])];
    counts = await repeated.run([files[0]]);
    assert.equal(counts.failed, 1); assert.equal(repeated.state.reads, 2, 'Each batch starts fresh');

    const a = file('a.mkv'), b = file('b.mkv'), fresh = file('new.mkv');
    const appeared = fixture(async (_folder, state) => state.reads === 1 ? [a] : [a, changed(b)]);
    counts = await appeared.run([a, b]);
    assert.equal(appeared.state.reads, 2); assert.equal(appeared.state.submissions, 0);
    assert.equal(counts.skipped, 1); assert.equal(counts.failed, 1, 'Cached absence must not allow a conflicting new file to be overwritten');

    for (const status of ['saved', 'pending', 'miss', 'throw']) {
        const afterWrite = fixture(async (_folder, state) => state.reads < 3 ? [a, b] : [a, changed(b)], async () => {
            if (status === 'throw') throw Error('outcome unknown');
            return {status, message: status};
        });
        counts = await afterWrite.run([a, fresh, b]);
        assert.equal(afterWrite.state.reads, 3, status + ': writes invalidate positive lookups too');
        assert.equal(afterWrite.state.submissions, 1);
        assert.equal(counts.skipped, 1); assert.equal(counts.failed, status === 'throw' ? 2 : 1);
        if (status !== 'throw') assert.equal(counts[{saved: 'saved', pending: 'pending', miss: 'missed'}[status]], 1);
    }

    const directory = fixture(async (_folder, state) => state.reads === 1 ? [a, b] : [a, changed(b)]);
    counts = await directory.run([a, {type: 'directory', path: 'new-folder'}, b]);
    assert.equal(directory.state.reads, 2); assert.equal(counts.directories, 1); assert.equal(counts.failed, 1);

    const ids = [];
    const parents = fixture(async ({id}) => {ids.push(id); return [file('same.mkv', id)];});
    counts = await parents.run([file('same.mkv', 'A'), file('same.mkv', 'B'), file('same.mkv', 'A')]);
    assert.deepEqual(ids, ['A', 'B', 'A']); assert.equal(counts.skipped, 3);

    for (const conflicting of [[a, a], [{...a, size: 101}], [changed(a)], [{...a, directory: true}]]) {
        const guarded = fixture(async () => conflicting);
        counts = await guarded.run([a]);
        assert.equal(counts.failed, 1); assert.equal(guarded.state.submissions, 0);
    }
    const missingMetadata = fixture(async () => [{name: a.name}]);
    counts = await missingMetadata.run([a]);
    assert.equal(counts.skipped, 1); assert.equal(missingMetadata.state.submissions, 0);
    assert.ok(missingMetadata.state.logs.some(message => message.includes('内容无法核对')));

    const retryRead = fixture(async (_folder, state) => {if (state.reads === 1) throw Error('read failed'); return [b];});
    counts = await retryRead.run([a, b]);
    assert.equal(retryRead.state.reads, 2); assert.equal(counts.failed, 1); assert.equal(counts.skipped, 1);

    const cancelled = fixture(async (_folder, state) => {state.stopped = true; return [];});
    counts = await cancelled.run([a, b]);
    assert.equal(cancelled.state.reads, 1); assert.equal(cancelled.state.submissions, 0); assert.equal(counts.processed, 1);
    const auth = fixture(async () => {throw Object.assign(Error('auth'), {stop: true});});
    counts = await auth.run([a, b]);
    assert.equal(auth.state.reads, 1); assert.equal(auth.state.submissions, 0); assert.equal(counts.processed, 1);
    console.log('PASS Guangya import reuse: 50 existing files use 1 listing; fresh absence checks, all write outcomes/directory/batch invalidation, parent isolation, conflicts, missing metadata, read failures, cancellation and authorization stop preserved (mocked API)');
})().catch(error => {console.error(error); process.exitCode = 1;});
