const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = path.join(__dirname, '../src');
const modules = JSON.parse(fs.readFileSync(path.join(source, 'modules.json'), 'utf8'));
const body = modules
    .filter((name) => name !== 'bootstrap.js')
    .map((name) => fs.readFileSync(path.join(source, name), 'utf8'))
    .join('\n');

/** Loads the userscript's matching functions with isolated settings. */
function loadMatcher(storage = new Map()) {
    return vm.runInNewContext(
        '(() => {\n' +
            body +
            '\nreturn { subtitleEpisodeIdentity, subtitleArchiveChoices, matchSubtitleImport, rememberSubtitleEpisodeMapping };\n})()',
        {
            window: { fetch },
            GM_getValue: (key, fallback) => storage.get(key) ?? fallback,
            GM_setValue: (key, value) => storage.set(key, value),
        }
    );
}

const special = {
    node: { name: "Haven't.You.Heard.I'm.Sakamoto.S00E01.1080p.BluRay.mkv" },
    parsed: {
        tv: true,
        tmdbId: '65944',
        query: '在下坂本，有何贵干？',
        aliases: ['坂本ですが？'],
        year: '2016',
        workResolved: true,
        season: 0,
        episode: 1,
        seasons: [
            { season_number: 0, episode_count: 1, name: 'Specials' },
            { season_number: 1, episode_count: 12, name: 'Season 1' },
        ],
    },
};
const regular = {
    node: { name: 'Youkoso.Jitsuryoku.Shijou.Shugi.no.Kyoushitsu.e.S04E10.mkv' },
    parsed: {
        tv: true,
        tmdbId: '72517',
        query: '欢迎来到实力至上主义的教室',
        aliases: ['Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e'],
        workResolved: true,
        season: 4,
        episode: 10,
        seasons: [12, 13, 13, 16].map((episode_count, index) => ({
            season_number: index + 1,
            episode_count,
            name: 'Season ' + (index + 1),
        })),
    },
};

/** Gets the online archive selections for a single member. */
function onlineChoices(matcher, row, name, context = {}) {
    return matcher.subtitleArchiveChoices(
        { files: [{ name, path: name, ext: 'ass', length: 1024 }] },
        { parsed: row.parsed, titleMatched: true, language: 'zh', ...context },
        'zh'
    );
}

test('the verified Sakamoto release number maps to the special in all three paths', () => {
    const matcher = loadMatcher();
    const name = '[ReinForce] Sakamoto desu ga - 13 (BDRip 1920x1080 x264 FLAC).ass';
    const archive = '在下坂本，有何贵干？ 1-13 BDRip Sub.rar';
    const result = matcher.subtitleEpisodeIdentity(name, special.parsed);
    assert.equal(result.sourceSeason, null);
    assert.equal(result.sourceEpisode, 13);
    assert.equal(result.evidence, 'release-mapping');
    assert.equal(result.matched, true);
    assert.equal(matcher.matchSubtitleImport(name, [special], archive, { manual: true }).row, special);
    assert.equal(onlineChoices(matcher, special, name).length, 1);
    assert.equal(matcher.subtitleEpisodeIdentity('Sakamoto desu ga - 01.ass', special.parsed).matched, false);
    assert.equal(
        matcher.subtitleEpisodeIdentity('Sakamoto desu ga S01E13.ass', special.parsed).matched,
        false
    );
    assert.equal(matcher.subtitleEpisodeIdentity(name, { ...special.parsed, tmdbId: '0' }).matched, false);
});

test('number-only subtitles use package context while other titles remain unmatched', () => {
    const matcher = loadMatcher();
    const name = '第10话.ass';
    const archive = '欢迎来到实力至上主义的教室.zip';
    assert.equal(matcher.matchSubtitleImport(name, [regular], archive, { manual: true }).row, regular);
    assert.equal(
        matcher.matchSubtitleImport(name, [regular], '本地字幕.zip', { manual: true }).needsIdentity,
        true
    );
    assert.equal(onlineChoices(matcher, regular, name, { archiveSeason: 4 }).length, 1);
    assert.equal(onlineChoices(matcher, regular, name).length, 0);
    const wrong = 'Completely Different Series - 10.zh-CN.ass';
    const unmatched = matcher.matchSubtitleImport(wrong, [regular], archive, { manual: true });
    assert.ok(unmatched.reason);
    assert.equal(unmatched.row, undefined);
    assert.equal(onlineChoices(matcher, regular, wrong, { archiveSeason: 4 }).length, 0);
});

test('explicit season conflicts are preserved and absolute numbering resolves both endpoints', () => {
    const matcher = loadMatcher();
    const name = 'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e S03E10.zh-CN.ass';
    const match = matcher.matchSubtitleImport(name, [regular], '字幕 S04.zip', { manual: true });
    assert.equal(match.outOfScope, true);
    assert.equal(onlineChoices(matcher, regular, name, { archiveSeason: 4 }).length, 0);
    const absolute = matcher.subtitleEpisodeIdentity(
        'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e - 48.ass',
        regular.parsed
    );
    assert.equal(absolute.sourceEpisode, 48);
    assert.equal(absolute.episode, 10);
    assert.equal(absolute.endEpisode, 10);
    assert.equal(absolute.matched, true);
});

test('a manual mapping survives reload and is scoped to the work and release filename', () => {
    const storage = new Map();
    const matcher = loadMatcher(storage);
    const row = {
        ...special,
        parsed: { ...special.parsed, tmdbId: '12345', aliases: ['Sakamoto desu ga'] },
    };
    const name = '[AnotherRelease] Sakamoto desu ga - 13.zh-CN.ass';
    assert.equal(matcher.subtitleEpisodeIdentity(name, row.parsed).matched, false);
    matcher.rememberSubtitleEpisodeMapping(name, row.parsed);
    const reloaded = loadMatcher(storage);
    assert.equal(reloaded.subtitleEpisodeIdentity(name, row.parsed).evidence, 'manual-mapping');
    assert.equal(reloaded.subtitleEpisodeIdentity(name, row.parsed).matched, true);
    assert.equal(reloaded.subtitleEpisodeIdentity(name, { ...row.parsed, tmdbId: '54321' }).matched, false);
    assert.equal(
        reloaded.subtitleEpisodeIdentity(name.replace('AnotherRelease', 'Other'), row.parsed).matched,
        false
    );
});

test('a season subfolder disambiguates an archive that spans multiple seasons', () => {
    const matcher = loadMatcher();
    const name = '[Moozzi2] Saiki Kusuo no Sainan - 10 (BD 1920x1080 x.264 Flac).sc.ass';
    const row = {
        node: { name: 'Saiki.Kusuo.no.Sainan.S02E10.mkv' },
        parsed: {
            ...regular.parsed,
            tmdbId: '67676',
            query: '齐木楠雄的灾难',
            aliases: ['Saiki Kusuo no Sainan'],
            season: 2,
            seasons: [
                { season_number: 1, episode_count: 24 },
                { season_number: 2, episode_count: 24 },
            ],
        },
    };
    const archive = 'Saiki Kusuo no Sainan S1-S2.zip';
    assert.equal(
        matcher.matchSubtitleImport(name, [row], archive, {
            manual: true,
            path: 'Saiki Kusuo no Sainan S1-S2/S2/' + name,
        }).row,
        row
    );
    assert.equal(
        matcher.matchSubtitleImport(name, [row], archive, {
            manual: true,
            path: 'Saiki Kusuo no Sainan S1-S2/S1/' + name,
        }).outOfScope,
        true
    );
});
