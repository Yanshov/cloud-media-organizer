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
const config = {language, thunder: true};
const row = episode => ({node: {name: `瑞克和莫蒂.2013.S01E${String(episode).padStart(2, '0')}.mkv`},
    parsed: {query: '瑞克和莫蒂', year: 2013, tv: true, season: 1, episode, tmdbId: 42}});
const packs = [101, 102].map(id => ({id, native_name: '瑞克和莫蒂 第一季/Rick and Morty S01', lang: {langlist: {langchs: true}},
    filelist: Array.from({length: 11}, (_, index) => ({f: `Rick.and.Morty.2013.S01E${String(index + 1).padStart(2, '0')}.简体&英文.ass`}))}));

(async () => {
    const thunderRequests = [];
    const thunder = load({subtitleRemoteJson: async raw => {
        thunderRequests.push(raw);
        assert.ok(raw.includes('xunlei.com'), 'A reliable cached Thunder episode must not query another provider');
        return {code: 0, data: packs[0].filelist.map((entry, index) => ({name: entry.f, ext: 'ass', url: `https://subtitle.example/${index}.ass`, languages: ['简体', '英语']}))};
    }});
    const thunderService = thunder.createSubtitleService();
    for (let episode = 1; episode <= 11; episode++) {
        const target = row(episode);
        target.parsed.aliases = ['Rick and Morty'];
        await thunder.searchSubtitleSources(target, config, thunderService, {});
        assert.equal(target.selectedCandidate.source, '迅雷');
        assert.match(target.selectedCandidate.name, new RegExp(`S01E${String(episode).padStart(2, '0')}\\.`));
        assert.equal(target.sources.filter(source => source.name === '迅雷').length, 1);
    }
    assert.ok(thunderRequests.length > 0); assert.equal(thunderRequests.length, 1, 'Other exact episodes in a Thunder response need no repeated title search');
    for (const patch of [{year: 2014}, {tmdbId: 43}, {season: 2}, {query: '另一部剧'}, {query: ''}, {episode: 12}, {episode: undefined}, {endEpisode: 3}]) {
        const target = row(2); target.parsed.aliases = ['Rick and Morty']; Object.assign(target.parsed, patch);
        assert.equal((await thunderService.thunderCachedEpisode(target, config)).length, 0, JSON.stringify(patch));
    }
    assert.equal(thunderRequests.length, 1);
    assert.equal((await thunderService.thunderCachedEpisode(row(2), config)).length, 0, 'An earlier episode\'s confirmed English alias must not become an unverified alias for another row');
    const failedThunder = row(2); failedThunder.parsed.aliases = ['Rick and Morty'];
    await thunder.searchSubtitleSources(failedThunder, config, thunderService, {});
    failedThunder.candidates.forEach(candidate => {candidate.downloadFailed = true;});
    await thunder.searchSubtitleSources(failedThunder, config, thunderService, {}, () => {}, () => {}, true);
    assert.equal(thunderRequests.length, 3, 'Failed cached downloads query the two previously untried names for episode 2');
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
    console.log('PASS episode fast path: multi-episode Thunder responses reuse episode matches; cache-only misses make no HTTP requests; title/year/season/episode/TMDB boundaries, failed download fallback, cancellation/logout and query/AI timing retained (mocked responses)');
})().catch(error => {console.error(error); process.exitCode = 1;});
