const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const script = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a, b) => {
    const start = script.indexOf(a), end = script.indexOf(b, start);
    assert.ok(start >= 0 && end > start, a);
    return script.slice(start, end);
};
function load(extra = {}) {
    const ctx = vm.createContext({URL, URLSearchParams, Date, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob,
        sleep: async () => {}, paced: (_ms, fn) => fn, ...extra});
    vm.runInContext(part('    function evict(', '    function nonNegativeInteger(') +
        part('    function subtitleDownloadUrl(', '    function subtitleDrive('), ctx);
    return ctx;
}
const language = 'zh-cn,zh-tw,zh';
const config = {language, assrt: true, assrtToken: 'test', thunder: true, shooter: true};
const row = episode => ({node: {name: `瑞克和莫蒂.2013.S01E${String(episode).padStart(2, '0')}.mkv`},
    parsed: {query: '瑞克和莫蒂', year: 2013, tv: true, season: 1, episode, tmdbId: 42}});
const packs = [101, 102].map(id => ({id, native_name: '瑞克和莫蒂 第一季/Rick and Morty S01', lang: {langlist: {langchs: true}},
    filelist: Array.from({length: 11}, (_, index) => ({f: `Rick.and.Morty.2013.S01E${String(index + 1).padStart(2, '0')}.简体&英文.ass`}))}));

(async () => {
    const requests = [], logs = []; let samples = 0;
    const ctx = load({subtitleRemoteJson: async raw => {
        requests.push(raw);
        if (raw.includes('shooter.cn')) return [];
        if (raw.includes('xunlei.com')) return {code: 0, data: []};
        assert.ok(raw.includes('/sub/search'), 'Cache probe must never fetch package details');
        return {status: 0, sub: {subs: packs}};
    }});
    const service = ctx.createSubtitleService();
    const drive = {sample: async () => {samples++; return 'four-block-hash';}};
    const search = target => ctx.searchSubtitleSources(target, config, service, drive, (...args) => logs.push(args));
    await search(row(1));
    assert.equal(samples, 1); assert.equal(requests.length, 3, 'First episode still tries hash, thunder, then Assrt');
    for (let episode = 2; episode <= 11; episode++) {
        const target = row(episode);
        await search(target);
        assert.ok(target.selectedCandidate);
        assert.match(target.selectedCandidate.name, new RegExp(`S01E${String(episode).padStart(2, '0')}\\.`));
        assert.equal(target.sources.filter(source => source.name === 'Assrt 片名搜索').length, 1);
        assert.ok(target.sources.find(source => source.name === '射手').deferred, 'Hash source remains available for download fallback');
    }
    assert.equal(samples, 1); assert.equal(requests.length, 3, 'Ten later episodes add no hash sampling or source HTTP calls');
    assert.equal(logs.filter(([tag]) => tag === '整季快速命中').length, 10);

    const before = requests.length;
    for (const patch of [{year: 2014}, {tmdbId: 43}, {season: 2}, {query: '另一部剧'}, {query: ''}, {episode: 12}, {episode: undefined}, {endEpisode: 3}]) {
        const target = row(2); Object.assign(target.parsed, patch);
        assert.equal((await service.assrtCachedEpisode(target, config)).length, 0, JSON.stringify(patch));
    }
    assert.equal((await service.assrtCachedEpisode(row(2), {...config, assrtToken: 'other-account'})).length, 0);
    assert.equal(requests.length, before, 'Cache misses never issue searches or detail requests');
    await assert.rejects(async () => service.assrtCachedEpisode(row(2), config, () => {}, () => {throw Error('stopped');}), /stopped/);

    const fallback = row(2);
    await search(fallback);
    fallback.candidates.forEach(candidate => {candidate.downloadFailed = true;});
    await ctx.searchSubtitleSources(fallback, config, service, drive, () => {}, () => {}, true);
    assert.equal(samples, 2); assert.equal(requests.length, before + 2, 'Failed cached downloads resume hash and thunder without retrying the failed Assrt files');
    assert.equal(fallback.selectedCandidate, null);
    assert.equal(logs.filter(([tag]) => tag === '整季快速命中').length, 11);

    await search(row(12));
    assert.equal(samples, 3, 'An episode missing from the pack still follows the normal hash-first flow');
    const invalidEpisode = row(2); invalidEpisode.parsed.episode = undefined;
    await search(invalidEpisode);
    assert.equal(samples, 4, 'Unknown episode does not fail the batch in the cache preflight');

    service.logout();
    const afterLogout = requests.length;
    assert.equal((await service.assrtCachedEpisode(row(2), config)).length, 0);
    assert.equal(requests.length, afterLogout, 'Logout removes the season cache');

    const thunderRequests = []; let thunderSamples = 0;
    const thunder = load({subtitleRemoteJson: async raw => {
        thunderRequests.push(raw);
        if (raw.includes('shooter.cn')) return [];
        assert.ok(raw.includes('xunlei.com'), 'A reliable cached Thunder episode must not search Assrt');
        return {code: 0, data: packs[0].filelist.map((entry, index) => ({name: entry.f, ext: 'ass', url: `https://subtitle.example/${index}.ass`, languages: ['简体', '英语']}))};
    }});
    const thunderService = thunder.createSubtitleService();
    for (let episode = 1; episode <= 11; episode++) {
        const target = row(episode);
        target.parsed.aliases = ['Rick and Morty'];
        await thunder.searchSubtitleSources(target, config, thunderService, {sample: async () => {thunderSamples++; return 'hash';}});
        assert.equal(target.selectedCandidate.source, '迅雷');
        assert.match(target.selectedCandidate.name, new RegExp(`S01E${String(episode).padStart(2, '0')}\\.`));
        assert.equal(target.sources.filter(source => source.name === '迅雷').length, 1);
    }
    assert.equal(thunderSamples, 1); assert.equal(thunderRequests.length, 3, 'Other exact episodes in a Thunder response need neither resampling nor another title search');
    for (const patch of [{year: 2014}, {tmdbId: 43}, {season: 2}, {query: '另一部剧'}, {query: ''}, {episode: 12}, {episode: undefined}, {endEpisode: 3}]) {
        const target = row(2); target.parsed.aliases = ['Rick and Morty']; Object.assign(target.parsed, patch);
        assert.equal((await thunderService.thunderCachedEpisode(target, config)).length, 0, JSON.stringify(patch));
    }
    assert.equal(thunderRequests.length, 3);
    assert.equal((await thunderService.thunderCachedEpisode(row(2), config)).length, 0, 'An earlier episode\'s confirmed English alias must not become an unverified alias for another row');
    const failedThunder = row(2); failedThunder.parsed.aliases = ['Rick and Morty'];
    const thunderDrive = {sample: async () => {thunderSamples++; return 'hash';}};
    await thunder.searchSubtitleSources(failedThunder, {...config, assrt: false}, thunderService, thunderDrive);
    failedThunder.candidates.forEach(candidate => {candidate.downloadFailed = true;});
    await thunder.searchSubtitleSources(failedThunder, {...config, assrt: false}, thunderService, thunderDrive, () => {}, () => {}, true);
    assert.equal(thunderSamples, 2); assert.equal(thunderRequests.length, 4, 'Failed cached Thunder downloads resume the deferred hash lookup without retrying the failed files');
    assert.equal(failedThunder.selectedCandidate, null);
    thunderService.logout();
    assert.equal((await thunderService.thunderCachedEpisode(row(2), config)).length, 0);

    let now = 1000;
    const timing = load({Date: {now: () => now}}), timedLogs = [];
    const timedRow = row(1);
    await timing.searchSubtitleSources(timedRow, {language, thunder: true, reviewCandidates: async () => {now += 3000;}}, {
        thunderSearch: async () => {now += 2000; return [{source: '迅雷', name: '待确认.srt', language: 'zh-cn'}];}
    }, {}, (...args) => timedLogs.push(args));
    assert.ok(timedLogs.some(([tag, message]) => tag === '来源耗时' && message.includes('查询 2.0 秒，候选判断 3.0 秒')));
    console.log('PASS episode fast path: Assrt packs and multi-episode Thunder responses use one hash lookup for 11 episodes; cache-only misses make no HTTP requests; title/year/season/episode/TMDB/account boundaries, deferred download fallback, cancellation/logout, and separate query/AI timing retained (mocked responses)');
})().catch(error => {console.error(error); process.exitCode = 1;});
