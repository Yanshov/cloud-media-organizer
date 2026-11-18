const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const bootstrap = script.indexOf("    if (location.hostname === 'www.guangyapan.com')");
assert.ok(bootstrap > 0);
const exposes = 'globalThis.api = { pan123Source, guangyaSource, directoryResolver, guangyaAuthHeaders, requestJson };';
const md5 = 'a'.repeat(32);

function providers(fetch) {
    const context = vm.createContext({
        URL, URLSearchParams, TextEncoder, AbortController, setTimeout, clearTimeout,
        window: { fetch }, GM_getValue: (_key, fallback) => fallback
    });
    vm.runInContext(script.slice(0, bootstrap) + exposes + '})();', context);
    return context.api;
}

function json(data) {
    return { ok: true, json: async () => data };
}

const base123 = 'https://api.123278.com/b/api';
const headers123 = { Authorization: 'Bearer mocked-123', platform: 'web', 'app-version': '3', LoginUuid: 'mocked-uuid' };

async function pan123Listing(denySecondPage) {
    const requests = [];
    const api = providers(async (url, options) => {
        const request = new URL(url);
        assert.equal(request.origin + request.pathname, base123 + '/file/list/new');
        assert.equal(request.searchParams.get('parentFileId'), '42');
        assert.equal(request.searchParams.get('limit'), '100');
        assert.equal(options.credentials, 'omit');
        assert.deepEqual(options.headers, headers123);
        requests.push([request.searchParams.get('Page'), request.searchParams.get('next')]);
        if (requests.length === 1) return json({
            code: 0,
            data: { InfoList: [{ FileId: 7, FileName: 'movie.mkv', Type: 0, Size: '12', Etag: md5, S3KeyFlag: 'sample' }], Next: 7, Total: 2 }
        });
        assert.equal(requests.length, 2);
        if (denySecondPage) return { ok: false, status: 403 };
        return json({ code: 200, data: { InfoList: [{ FileId: '8', FileName: 'season', Type: 1 }], Next: 8, Total: 2 } });
    });
    const drive = api.pan123Source({ base: base123, parent: '42', headers: headers123 });
    assert.equal(drive.parentId, '42');
    if (denySecondPage) {
        await assert.rejects(drive.children({ id: drive.parentId }), error => error.stop === true && error.status === 403);
    } else {
        const nodes = await drive.children({ id: drive.parentId });
        assert.deepEqual(Array.from(nodes, node => [node.key, node.id, node.name, node.directory, node.size, node.md5, node.s3keyFlag]), [
            ['7', '7', 'movie.mkv', false, 12, md5, 'sample'],
            ['8', '8', 'season', true, null, undefined, undefined]
        ]);
    }
    assert.deepEqual(requests, [['1', '0'], ['2', '7']]);
}

async function guangyaListing(usingResolver, denySecondPage) {
    const requests = [];
    const api = providers(async (url, options) => {
        const request = new URL(url);
        assert.equal(request.origin, 'https://api.guangyapan.com');
        assert.equal(request.pathname, '/userres/v1/file/get_file_list');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.Authorization, 'Bearer mocked-guangya');
        assert.equal(options.headers.dt, '4');
        assert.match(options.headers['Content-Type'], /^application\/json/);
        const payload = JSON.parse(options.body);
        assert.equal(payload.parentId, '');
        assert.equal(payload.pageSize, 100);
        requests.push(payload.page);
        if (payload.page === 0) return json({
            data: { list: [{ fileId: 71, fileName: 'movie.mkv', resType: 1, fileSize: '12', md5 }], total: 2 }
        });
        assert.equal(payload.page, 1);
        if (denySecondPage) return json({ code: 403, message: 'permission denied' });
        return json({ data: { list: [{ fileId: '72', fileName: 'season', resType: 2 }], total: 2 } });
    });
    const post = (endpoint, body) => api.requestJson('https://api.guangyapan.com' + endpoint, {
        method: 'POST', headers: api.guangyaAuthHeaders('mocked-guangya'), body: JSON.stringify(body)
    });
    const read = usingResolver
        ? () => api.directoryResolver('0', post)('season')
        : () => api.guangyaSource('mocked-guangya', false).children({ id: '0' });
    if (denySecondPage) {
        await assert.rejects(read(), error => error.stop === true && /403/.test(error.message));
    } else if (usingResolver) {
        assert.equal(await read(), '72');
    } else {
        const nodes = await read();
        assert.deepEqual(Array.from(nodes, node => [node.key, node.id, node.name, node.directory, node.size, node.md5]), [
            ['71', '71', 'movie.mkv', false, 12, md5],
            ['72', '72', 'season', true, null, undefined]
        ]);
    }
    assert.deepEqual(requests, [0, 1]);
}

Promise.all([
    pan123Listing(false), pan123Listing(true),
    guangyaListing(false, false), guangyaListing(false, true),
    guangyaListing(true, false), guangyaListing(true, true)
]).then(() => {
    console.log('PASS drive provider contracts: 123 cursor and Guangya offsets, normalized file metadata, authorization failure on page two, no directory creation');
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
