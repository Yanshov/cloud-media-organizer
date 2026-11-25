function subtitleRemoteJson(url, options = {}) {
    const timeout = options.timeout || 30000;
    const hostname = new URL(url).hostname;
    if (!['api.opensubtitles.com', 'api-shoulei-ssl.xunlei.com', 'api.assrt.net'].includes(hostname))
        throw new Error('不支持的字幕接口地址');
    if (typeof GM_xmlhttpRequest !== 'function')
        throw new Error('需要 Tampermonkey 的跨域请求权限，请更新并保存完整脚本');
    return new Promise((resolve, reject) =>
        GM_xmlhttpRequest({
            url,
            method: options.method || 'GET',
            headers: options.headers || {},
            data: options.body,
            anonymous: true,
            timeout,
            onload: (response) => {
                let data;
                const text = response.responseText || '';
                try {
                    data = text.trim() ? JSON.parse(text) : null;
                } catch {
                    /* HTTP errors may be HTML. */
                }
                if (response.status < 200 || response.status >= 300) {
                    const error = subtitleSourceError(
                        'HTTP ' +
                            response.status +
                            (typeof data?.message === 'string' ? '：' + data.message.slice(0, 180) : '')
                    );
                    error.status = response.status;
                    const retry = String(response.responseHeaders || '')
                        .match(/^retry-after:\s*(.+)$/im)?.[1]
                        ?.trim();
                    error.retryAfterMs = retry
                        ? Math.max(
                              0,
                              /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()
                          ) || 0
                        : 0;
                    reject(error);
                    return;
                }
                if (data === undefined) {
                    reject(subtitleSourceError('字幕接口未返回 JSON（HTTP ' + response.status + '）'));
                    return;
                }
                resolve(data);
            },
            onerror: () => reject(subtitleSourceError('无法连接字幕来源，请检查网络或脚本跨域授权')),
            ontimeout: () => reject(subtitleSourceError(`字幕来源请求超时（${timeout / 1000} 秒）`)),
            onabort: () => reject(subtitleSourceError('字幕请求已取消')),
        })
    );
}
function subtitleMd5(bytes) {
    const hash = createMd5();
    hash.update(bytes);
    return hash.digest();
}
function subtitleDownloadUrl(value, { allowHttp = false, base } = {}) {
    let url;
    try {
        url = new URL(value, base);
    } catch {
        throw new Error('字幕来源未返回有效下载地址');
    }
    if (
        !(url.protocol === 'https:' || (allowHttp && url.protocol === 'http:')) ||
        url.username ||
        url.password
    )
        throw new Error('字幕来源返回了不支持的下载地址协议或内嵌账号');
    return url.href;
}
function subtitleSourceError(message, fields) {
    return Object.assign(new Error(message), { phase: 'subtitle-source', ...fields });
}
function isSubtitleSourceError(error) {
    return (
        error?.phase === 'subtitle-source' ||
        (!error?.phase && Number.isInteger(error?.status) && error.status >= 400)
    );
}
function subtitleSourcePaused(error) {
    return [429, 509].includes(error.status);
}
function subtitleFileInfo(name, fallback = '') {
    const value = String(name).normalize('NFKC').toLowerCase();
    const tag = (code) =>
        new RegExp('(?:^|[^\\p{L}\\p{N}])(?:' + code + ')(?=$|[^\\p{L}\\p{N}])', 'u').test(value);
    const simplified = /zh[._-]?(?:cn|hans)|简体|简中|简英|简[&+ ]英/.test(value) || tag('chs|sc|scjp');
    const traditional = /zh[._-]?(?:tw|hant)|繁体|繁中|繁英|繁[&+ ]英/.test(value) || tag('cht|tc|tcjp');
    const chinese = simplified || traditional || tag('zh|zho|chi') || /中文|中英|双语|简繁/.test(value);
    const english = tag('en|eng') || /英文|中英|简英|繁英|[简繁][&+ ]英/.test(value);
    // Foreign suffixes override a multilingual package's Chinese label.
    const foreign =
        value.match(/\[([a-z]{2,3})\]\.(?:srt|ass|ssa|vtt)$/)?.[1] ||
        value.match(
            /(?:\[|[._ -])(fra|fre|fr|spa|es|ger|deu|de|ita|it|por|pt|rus|ru|jpn|ja|kor|ko|ara|ar|tha|th|vie|vi|ind|id|dut|nld|nl|pol|pl|tur|tr|hin|hi)(?:\])?\.(?:srt|ass|ssa|vtt)$/
        )?.[1];
    const languages = {
        fra: 'fr',
        fre: 'fr',
        spa: 'es',
        ger: 'de',
        deu: 'de',
        ita: 'it',
        por: 'pt',
        rus: 'ru',
        jpn: 'ja',
        kor: 'ko',
        ara: 'ar',
        tha: 'th',
        vie: 'vi',
        ind: 'id',
        dut: 'nl',
        nld: 'nl',
        pol: 'pl',
        tur: 'tr',
        hin: 'hi',
    };
    const fullLanguages = {
        german: 'de',
        spanish: 'es',
        french: 'fr',
        italian: 'it',
        portuguese: 'pt',
        russian: 'ru',
        japanese: 'ja',
        korean: 'ko',
        arabic: 'ar',
        thai: 'th',
        vietnamese: 'vi',
        indonesian: 'id',
        dutch: 'nl',
        polish: 'pl',
        turkish: 'tr',
        hindi: 'hi',
        greek: 'el',
        hebrew: 'he',
        finnish: 'fi',
        estonian: 'et',
        hungarian: 'hu',
        swedish: 'sv',
        danish: 'da',
        norwegian: 'no',
        czech: 'cs',
        romanian: 'ro',
    };
    const fullLanguage = Object.keys(fullLanguages).find(tag);
    const bilingual = /中英|简英|繁英|双语|bilingual/.test(value) || tag('scjp|tcjp') || (chinese && english);
    return {
        language: simplified
            ? 'zh-cn'
            : traditional
              ? 'zh-tw'
              : chinese || bilingual
                ? 'zh'
                : english
                  ? 'en'
                  : foreign
                    ? languages[foreign] || foreign
                    : fullLanguage
                      ? fullLanguages[fullLanguage]
                      : fallback,
        bilingual,
    };
}
function subtitlePreference(candidate, language) {
    const info = subtitleFileInfo(candidate.name, candidate.language);
    if (language === 'en')
        return info.language === 'en' ? 300 : info.bilingual || candidate.bilingual ? 200 : 0;
    const chinese = ['zh-cn', 'zh-tw', 'zh'].includes(info.language);
    return (
        (chinese && (info.bilingual || candidate.bilingual) ? 400 : 0) +
        (info.language === 'zh-cn' ? 30 : info.language === 'zh-tw' ? 20 : info.language === 'zh' ? 10 : 0)
    );
}
function subtitleCandidateLabel(candidate) {
    const language =
        { 'zh-cn': '简体中文', 'zh-tw': '繁体中文', zh: '中文', en: '英文' }[candidate.language] ||
        '语言未标注';
    return [
        candidate.source,
        candidate.bilingual ? '双语' : '',
        language,
        candidate.name || candidate.release,
        candidate.fileSize || '',
        candidate.matchReason ? '待确认：' + candidate.matchReason : '',
        candidate.detailError ? '文件列表读取失败：' + candidate.detailError : '',
    ]
        .filter(Boolean)
        .join(' · ');
}
function subtitleQueryTitle(value, year = '') {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(
            year ? new RegExp('[._\\s:(\\[-]+' + String(year).replace(/\D/g, '') + '[)\\]\\s]*$') : /$^/,
            ' '
        )
        .replace(/\s+/g, ' ')
        .trim();
}
function mediaTheatricalQuery(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/^\s*(?:剧场版|劇場版)\s*[:：._ -]*/u, '')
        .replace(/[\s:：._-]*(?:剧场版|劇場版)\s*$/u, '')
        .trim();
}
const subtitleTitleKey = (value) => titleKey(String(value || '').replace(/[ː∶]/g, ':'));
// TMDB also lists these as work aliases, which carry no season number on their own.
const SUBTITLE_SEASON_ALIASES = {
    '82739:2': [
        '青春猪头少年不会梦到圣诞服女郎',
        '青春豬頭少年不會夢到聖誕服女郎',
        '青春ブタ野郎はサンタクロースの夢を見ない',
        'Rascal Does Not Dream of Santa Claus',
        'Seishun Buta Yarou wa Santa Claus no Yume wo Minai',
    ],
};
function subtitleSeasonTitles(parsed, seasonNumber = parsed.season) {
    if (!parsed.tv || !parsed.workResolved || seasonNumber == null || seasonNumber <= 0) return [];
    const season = parsed.seasons?.find((item) => item.season_number === seasonNumber);
    if (!season) return [];
    const workKey = subtitleTitleKey(parsed.query);
    const verified = SUBTITLE_SEASON_ALIASES[`${parsed.tmdbId}:${seasonNumber}`] || [];
    const label = subtitleQueryTitle(season.name, parsed.year);
    const key = subtitleTitleKey(label);
    if (
        !workKey ||
        !key ||
        key === workKey ||
        /^第[零〇一二两三四五六七八九十\d]+季$|^(?:s|season)\d*$/i.test(key) ||
        parsed.seasons.some(
            (item) => item.season_number !== seasonNumber && subtitleTitleKey(item.name) === key
        )
    )
        return verified;
    // Short season labels such as "Part 2" need the series title to identify the work.
    const qualified =
        key.startsWith(workKey) || (parsed.aliases || []).some((alias) => subtitleTitleKey(alias) === key);
    return [...verified, qualified ? label : `${parsed.query} ${label}`];
}
function subtitleReleaseChapter(parsed) {
    if (
        !parsed.tv ||
        !parsed.workResolved ||
        !(parsed.seasons || []).some(
            (season) => season.season_number > 0 && season.season_number === parsed.season
        )
    )
        return '';
    const release = parsed.videoReleaseTitle || '';
    return release &&
        ![parsed.query, ...(parsed.aliases || [])].some(
            (title) => subtitleTitleKey(title) === subtitleTitleKey(release)
        )
        ? release
        : '';
}
/** Recovers one chapter supported by different, already covered episodes of the same season. */
function subtitleSeasonRelease(rows) {
    const chapters = new Map();
    for (const row of rows) {
        const { parsed, verification } = row;
        const name = verification?.projectVideoName;
        if (!row.complete || !parsed.workResolved || !name || verification.work?.status === 'mismatch')
            continue;
        const title = subtitleQueryTitle(subtitleEpisodeName(name, parsed).title, parsed.year);
        const target = { ...parsed, videoReleaseTitle: title };
        if (!subtitleReleaseChapter(target) || !exactSubtitleEpisode(name, target)) continue;
        const match = subtitleCandidateFilter({ ...parsed, videoReleaseTitle: undefined }, [], name);
        if (match.excluded || match.hardMismatch || (!match.titleMatched && !match.related)) continue;
        const key = subtitleTitleKey(title);
        if (!chapters.has(key)) chapters.set(key, { title, episodes: new Set() });
        chapters.get(key).episodes.add(parsed.episode);
    }
    const supported = [...chapters.values()].filter((chapter) => chapter.episodes.size >= 2);
    if (supported.length === 1) return { title: supported[0].title, count: supported[0].episodes.size };
    return {
        title: '',
        reason:
            supported.length > 1
                ? '多个篇章分别得到不同集字幕支持，无法确定本次缺集所属篇章'
                : chapters.size
                  ? '同一篇章的有效线索不足两集'
                  : '已有字幕缺少可对应当前作品与季集的内部视频名',
    };
}
function subtitleWorkIdentity(parsed, fields, name) {
    const titleNumbers = String(parsed.query || '').match(/(?:19|20)\d{2}/g) || [];
    const years = (value) =>
        [
            ...String(value)
                .normalize('NFKC')
                .matchAll(/(?:^|[^\p{L}\p{N}])((?:19|20)\d{2})(?=$|[^\p{L}\p{N}])/gu),
        ]
            .map((m) => m[1])
            .filter(
                (y) =>
                    Number(y) <= new Date().getFullYear() + 1 &&
                    (!titleNumbers.includes(y) || y === String(parsed.year))
            );
    const clean = (value, isTitle = false) => {
        let text = String(value || '')
            .normalize('NFKC')
            .replace(/\.(?:srt|ass|ssa|vtt|zip|rar)$/i, '')
            .trim();
        // Strip only known version/language tags; meaningful title brackets stay intact.
        text = text.replace(
            /^(?:[\[【](?:v\d+(?:\.\d+)*|(?:简体|繁体|简中|繁中|中英|简英|繁英|chs|cht)(?:中英|双语|&英文)?(?:ass|ssa|srt|vtt)?)[\]】][. _-]*)+/i,
            ''
        );
        text = text.replace(
            /(?:[. _-]|\[)(?:chi|zho|zh|en|eng|chs|cht|zh[._-]?(?:cn|tw|hans|hant))\]?$/i,
            ''
        );
        text = text.replace(
            /^(?:【[^】]*(?:字幕组|字幕社|工作室)[^】]*】|\[[^\]]*(?:字幕组|字幕社|工作室)\])[. _-]*/i,
            ''
        );
        text = text.replace(/(?:^|[. _-])(?:杜比视界|特效字幕|双语字幕)(?=$|[. _-])/g, ' ');
        text = text.replace(
            /^(?:(?:简体|繁体|简中|繁中|中文|双语|中英|简英|繁英|chs|cht|eng)(?:双语|&英文|英文)?[. _\-]*)+/i,
            ''
        );
        if (parsed.tv && !isTitle) {
            const episode = subtitleEpisodeName(text, parsed);
            if (episode.title && episode.episode != null) text = episode.title;
        }
        // Strip release metadata, keeping numeric title tokens such as Blade Runner 2049.
        const year = !isTitle && years(text).at(-1);
        if (year) {
            const found = new RegExp('(?:^|[^\\p{L}\\p{N}])' + year + '(?=$|[^\\p{L}\\p{N}])', 'u').exec(
                text
            );
            if (found)
                text =
                    found.index === 0 && /^\d{4}/.test(found[0])
                        ? text.slice(found[0].length).replace(/^[. :_-]+/, '')
                        : text.slice(0, found.index);
        }
        text = text.split(
            /(?:^|[. _\[(-])(?:\d{3,4}p|4k|8k|BluRay|BDRip|WEB(?:[ ._-]?(?:DL|Rip))?|REMUX|HDTV|DVD(?:Rip)?|x26[45]|h[ ._-]?26[45]|HEVC|AVC|chs|cht|eng|简体|繁体|简中|繁中|中英|双语)(?=$|[. _\])&+-])/i
        )[0];
        text = text.replace(
            /(?:^|[. _-])(?:SE?\d{1,2}(?:[ ._-]*E[ ._-]*|[ ._-]+(?:EP?[ ._-]*)?)\d{1,3}|\d{1,2}x\d{1,3}|Season[ ._-]*\d{1,2}[ ._-]+\d{1,3})[\s\S]*$/i,
            ''
        );
        if (parsed.tv && !isTitle)
            text = text.replace(/(?:\s+-\s*|[ ._-]+(?:EP?|Episode)[ ._-]*)\d{1,3}(?:v\d+)?[ ._-]*$/i, '');
        if (parsed.tv)
            text = text.replace(
                /(?:[. _-]*(?:S\d{1,2}|Season[. _-]*\d{1,2}|第[零〇一二两三四五六七八九十百\d]+季))[. _-]*$/i,
                ''
            );
        return subtitleTitleKey(parsed.tv ? text : mediaTheatricalQuery(text));
    };
    const target = clean(subtitleQueryTitle(parsed.query, parsed.year), true);
    const fileYears = years(name),
        packYears = [...new Set(fields.flatMap(years))];
    const fileYear = fileYears.at(-1);
    // TV filenames use the series premiere year; later seasons have later release years.
    const laterSeason =
        parsed.tv &&
        parsed.season > 1 &&
        [name, ...fields].some((value) => exactSubtitleEpisode(value, parsed));
    const yearConflict = (year) =>
        parsed.year &&
        year &&
        String(parsed.year) !== year &&
        !(laterSeason && Number(year) >= Number(parsed.year));
    if (yearConflict(fileYear))
        return {
            titleMatched: false,
            hardMismatch: true,
            matchReason: `文件年份 ${fileYear} 与视频 ${parsed.year} 不符`,
        };
    if (!fileYear && packYears.length === 1 && yearConflict(packYears[0]))
        return {
            titleMatched: false,
            hardMismatch: true,
            matchReason: `资源年份 ${packYears[0]} 与视频 ${parsed.year} 不符`,
        };
    const variants = (value) => {
        const text = String(value || '').normalize('NFKC');
        return [text, text.replace(/^(.*?\D)\d+\s*:\s*(\S.*)$/, '$1:$2')]
            .map((value) => clean(value, true))
            .filter(Boolean);
    };
    const aliases = new Set([
        target,
        ...[
            subtitleQueryTitle(parsed.query, parsed.year),
            ...(parsed.aliases || []),
            ...subtitleSeasonTitles(parsed),
            subtitleReleaseChapter(parsed),
        ].flatMap(variants),
    ]);
    let packMatched = false;
    const splitMixed = (part) => {
        const mixed = part
            .normalize('NFKC')
            .replace(
                /^(?:【[^】]*(?:字幕组|字幕社|工作室)[^】]*】|\[[^\]]*(?:字幕组|字幕社|工作室)\])[. _-]*/i,
                ''
            )
            .trim()
            .match(/^([\p{Script=Han}\p{N}\p{P}\s]+?)[.\s]+([a-z].*)$/iu);
        return mixed ? [mixed[1], mixed[2]] : [part];
    };
    const groups = fields.map((field) =>
        String(field || '')
            .split(/[\/|\n·]/)
            .flatMap(splitMixed)
            .map((part) => clean(part))
            .filter(Boolean)
    );
    for (const parts of groups) {
        if (parts.some((part) => aliases.has(part))) {
            packMatched = true;
            // A list of several Chinese or English film titles is not a list of aliases.
            const foreign = [
                ...new Set(
                    parts.filter(
                        (part) => /[\p{Script=Han}]/u.test(part) !== /[\p{Script=Han}]/u.test(target)
                    )
                ),
            ];
            if (foreign.length === 1) aliases.add(foreign[0]);
        }
    }
    if (packMatched) {
        const foreign = [
            ...new Set(
                groups
                    .flat()
                    .filter((part) => /[\p{Script=Han}]/u.test(part) !== /[\p{Script=Han}]/u.test(target))
            ),
        ];
        if (foreign.length === 1) aliases.add(foreign[0]);
    }
    const fileTitle = clean(name);
    const numbered = fileTitle.match(/^(.*?\D)(\d{1,2})?$/);
    const unseasoned = parsed.tv && !/S\d+[ ._-]*E\d+/i.test(name);
    const fileEpisode =
        unseasoned &&
        (parseMediaName(name).episode ??
            Number(
                mediaStem(name)
                    .split(MEDIA_RELEASE_START)[0]
                    .match(/(?:^|[ ._[(\-])(\d{1,3})[ ._\])\[-]*$/)?.[1]
            ));
    const episodeNumber =
        Number.isInteger(fileEpisode) && fileEpisode > 0 && fileEpisode === Number(numbered?.[2]);
    if (
        numbered &&
        !episodeNumber &&
        [...aliases].some((alias) => {
            const targetNumbered = alias.match(/^(.*?\D)(\d{1,2})?$/);
            return (
                targetNumbered &&
                targetNumbered[1] === numbered[1] &&
                (targetNumbered[2] || '') !== (numbered[2] || '')
            );
        })
    )
        return { titleMatched: false, hardMismatch: true, matchReason: '片名续集编号不符' };
    const fileParts = splitMixed(name)
        .map((part) => clean(part))
        .filter(Boolean);
    const generic =
        !fileTitle || /^(?:\d{1,3}|track\d+|台|港|简|繁|字幕|subtitle|subtitles)$/i.test(fileTitle);
    const mixedMatched =
        fileParts.length === 2 &&
        fileParts.some((part) => aliases.has(part)) &&
        /\p{Script=Han}/u.test(fileParts[0]) !== /\p{Script=Han}/u.test(fileParts[1]);
    if (mixedMatched) for (const part of fileParts) aliases.add(part);
    const matched =
        !!target &&
        (generic
            ? packMatched && packYears.length <= 1
            : aliases.has(fileTitle) ||
              mixedMatched ||
              (fileParts.length > 1 && fileParts.every((part) => aliases.has(part))));
    const titles = [fileTitle, ...groups.flat()];
    const related =
        !!target &&
        [...aliases].some(
            (alias) =>
                titles.some((part) => part && part.includes(alias)) ||
                (fileTitle && alias.includes(fileTitle))
        );
    return {
        titleMatched: matched,
        related,
        aliases: [...aliases],
        matchReason: matched ? '' : '文件片名未能确认为同一作品',
    };
}
function subtitleNetworkEditionMismatch(parsed, fields) {
    const network =
        /网络版|網絡版|ネット版|(?:^|[^a-z])(?:net|web)[ ._-]*(?:movie|edition|version)(?=$|[^a-z])/i;
    return (
        !parsed.tv &&
        fields.some((value) => network.test(String(value || ''))) &&
        ![parsed.query, ...(parsed.aliases || [])].some((value) => network.test(String(value || '')))
    );
}
function subtitleCandidateFilter(parsed, fields, name, semanticReview = false) {
    const text = String(name || '').normalize('NFKC');
    const opaque = /^[a-f0-9]{40}\.(?:srt|ass|ssa|vtt)$/i.test(text);
    if (/(?:^|[^a-z])(?:MAD|AMV)(?=$|[^a-z])|混剪|合集|剪辑|恶搞|鬼畜|\d+帧/i.test(text))
        return { excluded: '内容' };
    if (subtitleNetworkEditionMismatch(parsed, [...fields, text]))
        return { excluded: '内容', matchReason: '网络版不能作为电影版字幕' };
    if (
        !opaque &&
        !parsed.tv &&
        /\s+-\s*\d+(?=\s*(?:\.|\[|$))|(?:^|[^a-z])(?:EP|E)\s*\d{1,3}(?![a-z0-9])|\[\d+\]|第[\d零〇一二两三四五六七八九十百]+[话話集]|[\d零〇一二两三四五六七八九十百]+之卷/i.test(
            text
        )
    )
        return { excluded: '季集' };
    const match = subtitleWorkIdentity(parsed, fields, opaque ? '' : name);
    if (match.hardMismatch)
        return { ...match, excluded: match.matchReason === '片名续集编号不符' ? '无关' : '年份' };
    if (opaque)
        return {
            ...match,
            titleMatched: false,
            opaque: true,
            matchReason: '来源文件名缺少可识别片名，无法确认作品归属',
        };
    if (!match.titleMatched && !match.related && !semanticReview) return { ...match, excluded: '无关' };
    return match;
}
function* subtitleEvents(text, ext) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
    if (/^(?:ass|ssa)$/i.test(ext)) {
        let inEvents = false,
            fields = [
                'layer',
                'start',
                'end',
                'style',
                'name',
                'marginl',
                'marginr',
                'marginv',
                'effect',
                'text',
            ];
        for (const line of lines) {
            if (/^\s*\[/.test(line)) inEvents = /^\s*\[Events\]\s*$/i.test(line);
            if (!inEvents) continue;
            const record = /^\s*(Format|Dialogue|Comment)\s*:\s*(.*)$/i.exec(line);
            if (!record) continue;
            const type = record[1].toLowerCase();
            const values = record[2].split(',');
            if (type === 'format') {
                fields = values.map((value) => value.trim().toLowerCase());
                continue;
            }
            const column = fields.indexOf('text');
            if (column >= 0 && values.length >= fields.length)
                values.splice(
                    column,
                    values.length - fields.length + 1,
                    values.slice(column, values.length - (fields.length - column - 1)).join(',')
                );
            let drawing = false,
                hasDrawing = false,
                dialogue = '';
            for (const part of (values[column] || '').match(/\{[^}]*\}|[^{}]+|[{}]/g) || []) {
                if (/^\{[^}]*\}$/.test(part)) {
                    for (const tag of part.matchAll(/\\p(\d+)(?=\D|$)/gi)) drawing = Number(tag[1]) > 0;
                } else if (drawing) hasDrawing ||= !!part.trim();
                else dialogue += part;
            }
            dialogue = dialogue.replace(/\\[Nnh]/g, ' ').trim();
            const style = (values[fields.indexOf('style')] || '').trim();
            const kind =
                type === 'comment'
                    ? 'comment'
                    : !dialogue
                      ? hasDrawing
                          ? 'drawing'
                          : 'empty'
                      : /^(?:signs?|typeset(?:ting)?|credits?|招牌|特效)(?:$|[ _-])/i.test(style)
                        ? 'typeset'
                        : 'dialogue';
            const validFields = ['start', 'end', 'text'].every(
                (name) => fields.indexOf(name) >= 0 && fields.indexOf(name) === fields.lastIndexOf(name)
            );
            yield {
                kind,
                dialogue,
                start: values[fields.indexOf('start')],
                end: values[fields.indexOf('end')],
                malformed: !validFields || values.length !== fields.length,
            };
        }
        return;
    }
    let ignore = false,
        cue = null;
    for (const line of [...lines, '']) {
        if (!line.trim()) {
            if (cue) yield cue;
            cue = null;
            ignore = false;
            continue;
        }
        if (!cue && ext === 'vtt' && /^(?:NOTE(?:[ \t]|$)|STYLE\s*$|REGION\s*$)/.test(line)) ignore = true;
        if (ignore) continue;
        if (cue) {
            cue.dialogue += (cue.dialogue ? '\n' : '') + line.replace(/<[^>]*>/g, '').trim();
            continue;
        }
        if (line.includes('-->')) {
            const time = /^\s*(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+[^\r\n]*)?\s*$/.exec(line);
            cue = { kind: 'cue', dialogue: '', start: time?.[1], end: time?.[2], malformed: !time };
        }
    }
}
function subtitleTimestamp(value, ext) {
    const text = String(value ?? '').trim();
    if (/(?:^|:)-\d/.test(text)) return { issue: '负值' };
    if (/(?:infinity|nan)/i.test(text)) return { issue: '非有限值' };
    const format =
        ext === 'vtt'
            ? /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/
            : ext === 'ass' || ext === 'ssa'
              ? /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/
              : /^(\d{1,}):(\d{2}):(\d{2})[,.](\d{2,3})$/;
    const match = format.exec(text);
    if (!match) return { issue: '时间字段格式' };
    const [, hours = '0', minutes, seconds, fraction] = match;
    if (Number(minutes) > 59 || Number(seconds) > 59) return { issue: '分秒越界' };
    const time = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number('0.' + fraction);
    return Number.isFinite(time) && Number.isSafeInteger(Math.floor(time))
        ? { time }
        : { issue: '非有限值或超出安全范围' };
}
function subtitleTimeline(text, ext) {
    const events = { dialogue: 0, comment: 0, drawing: 0, typeset: 0, empty: 0 };
    const issues = {},
        dialogue = [],
        invalid = {};
    let start = Infinity,
        end = 0,
        rawEnd = 0,
        priorEnd = 0,
        longest = 0,
        visualEnd = 0;
    for (const event of subtitleEvents(text, ext)) {
        const kind = event.kind === 'cue' ? (event.dialogue ? 'dialogue' : 'empty') : event.kind;
        events[kind]++;
        const a = subtitleTimestamp(event.start, ext),
            b = subtitleTimestamp(event.end, ext);
        rawEnd = Math.max(rawEnd, b.time ?? 0);
        const issue = event.malformed
            ? '时间字段格式'
            : a.issue || b.issue || (a.time > b.time ? '开始与结束先后颠倒' : '');
        if (issue) {
            issues[issue] = (issues[issue] || 0) + 1;
            if (kind !== 'comment') invalid[issue] = (invalid[issue] || 0) + 1;
            continue;
        }
        if (kind === 'typeset' || kind === 'drawing') visualEnd = Math.max(visualEnd, b.time);
        if (kind !== 'dialogue') continue;
        dialogue.push(event.dialogue);
        start = Math.min(start, a.time);
        longest = Math.max(longest, b.time - a.time);
        if (b.time > end) {
            priorEnd = end;
            end = b.time;
        } else priorEnd = Math.max(priorEnd, b.time);
    }
    return {
        start: Number.isFinite(start) ? start : null,
        end,
        rawEnd,
        events,
        issues,
        invalid,
        dialogue,
        priorEnd,
        longest,
        visualEnd,
    };
}
function subtitleCheckDuration(row, timeline, log) {
    const { start, end, rawEnd, events, issues, invalid, priorEnd, longest, visualEnd } = timeline;
    const validDuration = (value) =>
        Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
    const parsed = row.parsed || {},
        episodeRange = subtitleEpisodeRange(parsed),
        episodeCount = episodeRange ? episodeRange.end - episodeRange.start + 1 : 1;
    const driveSeconds = validDuration(row.node.durationSeconds),
        runtime = validDuration(parsed.runtimeSeconds),
        runtimeReference = runtime * episodeCount;
    const duration = driveSeconds || runtimeReference;
    const source = driveSeconds ? '视频文件时长' : runtimeReference ? 'TMDB 作品时长参考' : '无时长参考';
    const counts = Object.entries(issues)
        .map(([reason, count]) => reason + ' ' + count)
        .join('、');
    log(
        '字幕时长',
        row.node.name +
            ' · 对白 ' +
            (start == null ? '无' : start.toFixed(1) + ' 秒起') +
            ' · 字幕结束 ' +
            end.toFixed(1) +
            ' 秒 · ' +
            source +
            (duration ? ' ' + duration.toFixed(1) + ' 秒' : '') +
            ' · 原始最晚结束 ' +
            rawEnd.toFixed(1) +
            ' 秒 · 对白 ' +
            events.dialogue +
            '、注释 ' +
            events.comment +
            '、绘图 ' +
            events.drawing +
            '、排版 ' +
            events.typeset +
            '、空事件 ' +
            events.empty +
            (visualEnd > end ? ' · 绘图或排版延伸到 ' + visualEnd.toFixed(1) + ' 秒，不计入对白范围' : '') +
            (counts ? ' · 异常 ' + counts : '')
    );
    const uncertain = (reason, identityClueAllowed = false) =>
        Object.assign(new Error(reason), { timingUnconfirmed: true, identityClueAllowed });
    if (Object.keys(invalid).length) throw uncertain('字幕时间轴异常：' + counts + '，待确认');
    if (!timeline.dialogue.length) throw uncertain('字幕时间轴没有可用的对白，待确认');
    // Work metadata is advisory. Extreme ranges and isolated hour-scale gaps still need review.
    const extreme =
        end > 12 * 3600 ||
        longest > 4 * 3600 ||
        (priorEnd > 0 && end - priorEnd > 3600 && end > priorEnd * 3);
    if (extreme) throw uncertain('字幕时间轴存在极端对白范围，待确认');
    if (driveSeconds && end > driveSeconds + Math.max(30, driveSeconds * 0.1))
        throw uncertain('字幕时间轴与视频文件时长冲突，待确认');
    if (driveSeconds && end < driveSeconds * 0.5)
        throw uncertain('字幕不完整：对白只到 ' + end.toFixed(1) + ' 秒（' + source + '），待确认');
    if (!driveSeconds && runtimeReference >= 1200 && end <= Math.min(480, runtimeReference * 0.2))
        throw uncertain('字幕不完整：对白只到 ' + end.toFixed(1) + ' 秒（' + source + '），待确认', true);
    const ordinaryEpisode =
        parsed.tv &&
        parsed.season > 0 &&
        parsed.episode > 0 &&
        !parsed.standalone &&
        !/短片|短剧|特别篇|特別篇|番外|预告|\b(?:teaser|short|special|OVA|OAD)\b/i.test(row.node.name);
    const dialogueSize = timeline.dialogue.reduce((sum, line) => sum + line.replace(/\s/g, '').length, 0);
    // Several weak signals must agree before holding an episode with no file duration.
    if (
        !driveSeconds &&
        ordinaryEpisode &&
        end <= 90 &&
        end - start <= 75 &&
        timeline.dialogue.length <= 12 &&
        dialogueSize <= 300
    )
        throw Object.assign(
            uncertain(
                '字幕可疑，待确认：普通剧集缺少文件时长，' +
                    timeline.dialogue.length +
                    ' 条有效对白、' +
                    dialogueSize +
                    ' 个字符，对白只到 ' +
                    end.toFixed(1) +
                    ' 秒'
            ),
            { subtitleSuspicious: true }
        );
    const evidence = driveSeconds
        ? 'file'
        : !runtimeReference
          ? 'unknown'
          : Math.abs(end - runtimeReference) >= Math.max(120, runtimeReference * 0.2)
            ? 'reference-difference'
            : 'reference';
    return { start, end, rawEnd, visualEnd, events, issues, duration, source, evidence };
}
function subtitleSearchNames(parsed) {
    const names = [parsed.query, ...(parsed.aliases || [])]
        .map((name) => subtitleQueryTitle(name, parsed.year))
        .filter(Boolean);
    const unique = names.filter(
        (name, index) => names.findIndex((other) => titleKey(other) === titleKey(name)) === index
    );
    // Include an original Japanese title before spending the budget on regional Chinese variants.
    const japanese = unique.find((name) => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name));
    const latin = unique.find(
        (name) =>
            /\p{Script=Latin}/u.test(name) &&
            !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name)
    );
    const theatrical =
        !parsed.tv &&
        unique
            .map(mediaTheatricalQuery)
            .find((name, index) => name && titleKey(name) !== titleKey(unique[index]));
    return [...new Set([unique[0], theatrical, japanese, latin, ...unique].filter(Boolean))].slice(0, 3);
}
function subtitleSeasonSearchNames(parsed) {
    const names = [...new Set(subtitleSeasonTitles(parsed))];
    const first = names[0];
    const other = names.find(
        (name) => name !== first && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Latin}]/u.test(name)
    );
    return [first, other].filter(Boolean);
}
function subtitleRequestPool(interval, limit, request) {
    let queue = Promise.resolve(),
        last = 0;
    const active = new Set();
    return async (...args) => {
        const start = queue.then(async () => {
            while (active.size >= limit) await Promise.race(active);
            const delay = interval - (Date.now() - last);
            if (delay > 0) await sleep(delay);
            last = Date.now();
            const running = Promise.resolve().then(() => request(...args));
            const done = running.then(
                () => active.delete(done),
                () => active.delete(done)
            );
            active.add(done);
            return { running };
        });
        queue = start.then(
            () => {},
            () => {}
        );
        return (await start).running;
    };
}
function subtitlePackSeason(fields, metadata) {
    const seasons = new Set(Number(metadata) > 0 ? [Number(metadata)] : []);
    for (const text of fields)
        for (const match of String(text).matchAll(
            /(?:^|[^a-z])(?:S|Season[ ._-]*)(\d{1,2})(?!\d)|第\s*(\d{1,2})\s*季/gi
        ))
            seasons.add(Number(match[1] || match[2]));
    return seasons.size === 1 ? [...seasons][0] : null;
}
function createSubtitleService({ wait = (ms) => sleep(ms), check = () => {}, log = () => {} } = {}) {
    let token = '',
        tokenKey = '';
    const unavailableSources = new Map();
    const searchCache = new Map();
    const seasonPreparations = new Map(),
        archiveCache = new Map(),
        transfers = new Map(),
        downloadPauses = new Map(),
        thunderDetails = new Map();
    const downloadQueues = new Map(),
        downloadStarted = new Map();
    let assrtEpisodes = new WeakMap();
    const clearCache = () => {
        const count =
            unavailableSources.size +
            searchCache.size +
            seasonPreparations.size +
            archiveCache.size +
            downloadPauses.size +
            thunderDetails.size;
        unavailableSources.clear();
        searchCache.clear();
        seasonPreparations.clear();
        archiveCache.clear();
        downloadPauses.clear();
        thunderDetails.clear();
        assrtEpisodes = new WeakMap();
        return count;
    };
    const assrtRequest = paced(1500, async (endpoint, params, config, verify) => {
        verify();
        const result = await subtitleRemoteJson('https://api.assrt.net/v1/sub/' + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ ...params, token: config.assrtKey }).toString(),
        });
        verify();
        if (result?.status !== 0)
            throw subtitleSourceError('射手网查询失败，状态码 ' + result?.status, {
                status: result?.status === 30900 ? 429 : 0,
            });
        return Array.isArray(result.sub?.subs) ? result.sub.subs : [];
    });
    const prepareAssrt = async (rows, config, verify) => {
        const visited = new Set(),
            partial = new Map(),
            maxDetails = 8;
        const parsed = rows[0].parsed,
            names = subtitleSearchNames(parsed);
        const season = ' S' + String(parsed.season).padStart(2, '0');
        const searches = [
            ...subtitleSeasonSearchNames(parsed).map((query) => ({ query, limit: 2 })),
            ...names.slice(0, 2).map((name) => ({ query: name + season, limit: 2 })),
            ...names.map((query) => ({ query, limit: maxDetails })),
        ];
        for (const { query, limit } of searches) {
            if (visited.size >= maxDetails) break;
            const hits = await assrtRequest('search', { q: query, cnt: 8 }, config, verify);
            log('射手网查询', query + ' · 返回 ' + hits.length + ' 条资源');
            let checked = 0;
            for (const hit of hits) {
                if (checked >= limit || visited.size >= maxDetails) break;
                if (!Number.isSafeInteger(hit?.id) || visited.has(hit.id)) continue;
                checked++;
                visited.add(hit.id);
                const [pack] = await assrtRequest('detail', { id: hit.id }, config, verify);
                if (String(pack?.id) !== String(hit.id) || !Array.isArray(pack.filelist)) continue;
                const found = new Map();
                for (const file of pack.filelist.slice(0, 200)) {
                    const name = file.f;
                    if (
                        typeof name !== 'string' ||
                        !/\.(?:srt|ass|ssa|vtt|zip|rar)$/i.test(name) ||
                        /[/\\]/.test(name)
                    )
                        continue;
                    let url;
                    try {
                        url = new URL(file.url);
                    } catch {
                        continue;
                    }
                    if (
                        !['http:', 'https:'].includes(url.protocol) ||
                        !/(^|\.)assrt\.net$/i.test(url.hostname) ||
                        url.username ||
                        url.password
                    )
                        continue;
                    url.protocol = 'https:';
                    const fallback = /简/.test(pack.lang?.desc)
                        ? 'zh-cn'
                        : /繁/.test(pack.lang?.desc)
                          ? 'zh-tw'
                          : /中文|双语/.test(pack.lang?.desc)
                            ? 'zh'
                            : '';
                    const info = subtitleFileInfo(name, fallback);
                    if (!config.language.split(',').includes(info.language)) continue;
                    const ext = name.split('.').pop().toLowerCase();
                    if (isSubtitleArchive(ext)) {
                        const fields = [pack.filename, mediaStem(name)],
                            identity = subtitleCandidateFilter(parsed, fields, mediaStem(name));
                        if (identity.excluded || !identity.titleMatched) continue;
                        const candidate = {
                            source: '射手网',
                            name,
                            ...info,
                            ...identity,
                            url: url.href,
                            ext,
                            release: pack.filename,
                            archiveFields: fields,
                            archiveSeason: subtitlePackSeason(fields),
                        };
                        try {
                            const archive = await archiveData(url.href, verify, ext, candidate.source);
                            for (const target of rows) {
                                const episode = { ...candidate, parsed: { ...target.parsed } };
                                if (!subtitleArchiveChoices(archive.index, episode, config.language).length)
                                    continue;
                                if (found.has(target)) found.set(target, null);
                                else found.set(target, episode);
                            }
                        } catch (error) {
                            check();
                            verify();
                            if (error.stop) throw error;
                            log('射手网压缩包', name + ' · ' + error.message);
                            if (error.phase === 'transfer' && [429, 509].includes(error.status))
                                throw subtitleSourceError(error.message, { status: error.status });
                        }
                        continue;
                    }
                    const match = matchSubtitleImport(name, rows, pack.filename);
                    if (!match.row || match.reason || match.needsIdentity) continue;
                    if (found.has(match.row)) {
                        found.set(match.row, null);
                        continue;
                    }
                    found.set(match.row, {
                        source: '射手网',
                        name,
                        ...info,
                        url: url.href,
                        ext,
                        titleMatched: true,
                        release: pack.filename,
                    });
                }
                const matched = [...found].filter(([, candidate]) => candidate);
                if (!matched.length) continue;
                log(
                    '射手网包内匹配',
                    pack.filename + ' · 匹配 ' + matched.length + '/' + rows.length + ' 集'
                );
                if (matched.length === rows.length) {
                    for (const [target, candidate] of matched) assrtEpisodes.set(target, [candidate]);
                    log('射手网整季包', pack.filename + ' · 已对应 ' + rows.length + ' 集');
                    return;
                }
                for (const [target, candidate] of matched)
                    if (!partial.has(target)) partial.set(target, candidate);
            }
        }
        for (const [target, candidate] of partial) assrtEpisodes.set(target, [candidate]);
        log(
            '射手网整季包',
            parsed.query +
                ' · 保留 ' +
                partial.size +
                '/' +
                rows.length +
                ' 集已匹配字幕' +
                (partial.size < rows.length ? '，缺集由其他来源补查' : '，来自多个字幕包')
        );
    };
    const archiveWork = paced(0, async (work, verify) => {
        check();
        verify();
        return work();
    });
    const transfer = (result, verify, source) => {
        check();
        verify();
        const key = JSON.stringify([source, result.url]);
        if (!transfers.has(key)) {
            const queued = source === '射手网';
            const run = async () => {
                check();
                verify();
                const paused = downloadPauses.get(source);
                if (paused)
                    throw Object.assign(new Error(source + ' 本批下载已暂停：' + paused.message), {
                        phase: 'transfer',
                        downloadPaused: true,
                    });
                if (queued) {
                    await pause(Math.max(0, 1100 - (Date.now() - (downloadStarted.get(source) || 0))));
                    verify();
                    downloadStarted.set(source, Date.now());
                }
                try {
                    return await subtitleBinary(result.url, { allowHttp: result.allowHttp === true });
                } catch (error) {
                    if (error.phase === 'transfer' && [429, 509].includes(error.status)) {
                        downloadPauses.set(source, error);
                        unavailableSources.set(source, error.message);
                        log('下载来源暂停', source + ' · ' + error.message + ' · 后续排队请求转用其他来源');
                    }
                    throw error;
                }
            };
            const pending = queued ? enqueueByKey(downloadQueues, source, run) : run();
            transfers.set(key, pending);
            const clear = () => {
                if (transfers.get(key) === pending) transfers.delete(key);
            };
            pending.then(clear, clear);
        }
        return transfers.get(key);
    };
    const archiveData = async (url, verify, ext, source) => {
        check();
        verify();
        if (!archiveCache.has(url)) {
            const entry = transfer({ url, allowHttp: source === '迅雷' }, verify, source)
                .then(async (bytes) => ({ bytes, index: await subtitleReadArchive(bytes, ext, verify) }))
                .catch((error) => {
                    archiveCache.delete(url);
                    throw error;
                });
            archiveCache.set(url, entry);
            evict(archiveCache, 3); // Retain compressed bytes and headers, extracting selected subtitles on demand.
        }
        const data = await archiveCache.get(url);
        check();
        verify();
        return data;
    };
    const thunderRequest = subtitleRequestPool(1100, 2, (title, verify) => {
        check();
        verify();
        if (unavailableSources.has('迅雷')) throw subtitleSourceError('迅雷本批已暂停');
        return subtitleRemoteJson(
            'https://api-shoulei-ssl.xunlei.com/oracle/subtitle?' + new URLSearchParams({ name: title }),
            {
                headers: {
                    'User-Agent':
                        'XLPlayer/3.1.1 (com.xunlei.XLPlayer; build:65742; macOS 15.0.0) Alamofire/5.4.3',
                },
            }
        );
    });
    const readThunderDetails = subtitleRequestPool(0, 2, async (item, url, verify) => {
        const bytes = await transfer({ url, allowHttp: true }, verify, '迅雷');
        check();
        verify();
        try {
            const { text } = subtitleDecode(bytes);
            const videoName = subtitleProjectVideo(text);
            if (!videoName) return null;
            const dialogue = subtitleDialogue(text, String(item.ext).toLowerCase());
            if (!dialogue) return null;
            log('字幕正文线索', item.name + ' · 内部视频名：' + videoName);
            return { videoName, chinese: /[\u3400-\u9fff]/.test(dialogue) };
        } catch (error) {
            log('字幕正文线索失败', item.name + ' · ' + error.message + ' · 已缓存解析失败结果');
            return null;
        }
    });
    const recoverThunderDetails = async (items, row, verify) => {
        if (!row.parsed.tv || !row.parsed.workResolved) return;
        await Promise.all(
            items.map(async (item) => {
                if (
                    !item ||
                    item.embeddedVideoName ||
                    typeof item.name !== 'string' ||
                    !['ass', 'ssa'].includes(String(item.ext).toLowerCase())
                )
                    return;
                const episode = subtitleEpisodeIdentity(item.name, row.parsed);
                if (episode.matched || episode.conflict) return;
                const match = subtitleCandidateFilter(row.parsed, [], item.name, true);
                if (match.hardMismatch || (!match.titleMatched && !match.related)) return;
                let url;
                try {
                    url = subtitleDownloadUrl(item.url, { allowHttp: true });
                } catch {
                    return;
                }
                try {
                    if (!thunderDetails.has(url)) {
                        const pending = readThunderDetails(item, url, verify);
                        thunderDetails.set(url, pending);
                        evict(thunderDetails, 200);
                        pending.catch(() => {
                            if (thunderDetails.get(url) === pending) thunderDetails.delete(url);
                        });
                    }
                    const detail = await thunderDetails.get(url);
                    check();
                    verify();
                    if (!detail) return;
                    item.embeddedVideoName = detail.videoName;
                    const labels = [
                        Array.isArray(item.languages) ? item.languages.join(' ') : '',
                        item.simple_name || '',
                    ]
                        .join(' ')
                        .replace(/英语/g, '英文');
                    if (
                        detail.chinese &&
                        !subtitleFileInfo(item.name, subtitleFileInfo(labels).language).language
                    )
                        item.languages = ['中文'];
                } catch (error) {
                    check();
                    verify();
                    if (error.stop || error.phase === 'drive-auth') throw error;
                    log('字幕正文线索失败', item.name + ' · ' + error.message);
                }
            })
        );
    };
    const request = paced(1100, (path, config, body) => {
        if (!config.key) throw subtitleSourceError('请先填写 OpenSubtitles API Key');
        return subtitleRemoteJson('https://api.opensubtitles.com/api/v1' + path, {
            method: body ? 'POST' : 'GET',
            headers: {
                'Api-Key': config.key,
                'User-Agent': 'CloudMediaOrganizer v' + VERSION,
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(token && tokenKey === config.key ? { Authorization: 'Bearer ' + token } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    });
    const pause = async (ms) => {
        for (let left = ms; left > 0; left -= 500) {
            check();
            await wait(Math.min(left, 500));
        }
        check();
    };
    return {
        async prepareSeason(rows, config, verify = () => {}) {
            const row = rows.find(
                    (row) =>
                        row.parsed.episode != null &&
                        (!row.parsed.endEpisode || row.parsed.endEpisode === row.parsed.episode)
                ),
                parsed = row?.parsed;
            if (!parsed?.tv || parsed.season == null || !parsed.query) return;
            const key = JSON.stringify([
                parsed.tmdbId || '',
                parsed.query,
                parsed.year,
                parsed.season,
                subtitleReleaseChapter(parsed),
                [...subtitleSeasonSearchNames(parsed), ...subtitleSearchNames(parsed)],
                config.language,
                config.thunder,
                config.assrtKey,
                rows.map((target) => target.node.id || target.parsed.episode),
            ]);
            if (!seasonPreparations.has(key)) {
                const task = (async () => {
                    log(
                        '整季搜索',
                        `${parsed.query} · S${String(parsed.season).padStart(2, '0')} · 优先取得整季文件列表，逐集复核，缺集再补查`
                    );
                    const sources = [
                        [
                            '迅雷',
                            config.thunder,
                            () =>
                                this.thunderSearch(
                                    row,
                                    {
                                        ...config,
                                        seasonSearch: true,
                                        seasonRows: rows.filter(
                                            (target) =>
                                                target.parsed.episode != null &&
                                                (!target.parsed.endEpisode ||
                                                    target.parsed.endEpisode === target.parsed.episode)
                                        ),
                                    },
                                    () => {},
                                    verify
                                ),
                        ],
                    ];
                    if (config.assrtKey)
                        sources.push(['射手网', true, () => prepareAssrt(rows, config, verify)]);
                    for (const [name, enabled, run] of sources) {
                        if (!enabled || unavailableSources.has(name)) continue;
                        try {
                            await run();
                        } catch (error) {
                            check();
                            verify();
                            if (!isSubtitleSourceError(error)) throw error;
                            if (subtitleSourcePaused(error)) unavailableSources.set(name, error.message);
                            log(
                                '整季来源失败',
                                `${parsed.query} · ${name} · ${error.message}；单集仍可补查其他来源`
                            );
                        }
                    }
                    check();
                    verify();
                })();
                seasonPreparations.set(key, task);
                evict(seasonPreparations, 24);
                task.catch(() => seasonPreparations.delete(key));
            }
            await seasonPreparations.get(key);
            check();
            verify();
        },
        assrtCachedEpisode(row) {
            return assrtEpisodes.get(row) || [];
        },
        resetSearchBatch() {
            unavailableSources.clear();
            downloadPauses.clear();
            seasonPreparations.clear();
            assrtEpisodes = new WeakMap();
        },
        resetDownloadBatch() {
            downloadPauses.clear();
        },
        searchUnavailable(name) {
            return unavailableSources.get(name);
        },
        pauseSearchSource(name, reason) {
            unavailableSources.set(name, reason);
        },
        thunderCachedEpisode(row, config, onFiles = () => {}, verify = () => {}, report) {
            const parsed = row.parsed;
            if (
                !parsed.tv ||
                !subtitleQueryTitle(parsed.query, parsed.year) ||
                parsed.season == null ||
                parsed.episode == null
            )
                return [];
            return this.thunderSearch(row, { ...config, thunderCacheOnly: true }, onFiles, verify, report);
        },
        async thunderSearch(row, config, onFiles = () => {}, verify = () => {}, report = () => {}) {
            check();
            verify();
            const parsed = row.parsed,
                title = subtitleQueryTitle(parsed.query, parsed.year);
            if (!title) throw subtitleSourceError('缺少可搜索的作品名');
            if (parsed.tv && (parsed.season == null || parsed.episode == null))
                throw subtitleSourceError('缺少明确季集，未按片名搜索');
            const chapter = subtitleReleaseChapter(parsed);
            const seasonNames = subtitleSeasonSearchNames(parsed);
            const seasonKey = parsed.tv
                ? JSON.stringify([
                      'thunder-season',
                      titleKey(title),
                      parsed.year || '',
                      parsed.tmdbId || '',
                      parsed.season,
                      chapter,
                      seasonNames,
                  ])
                : '';
            let items, attempts;
            const episodeRange = subtitleEpisodeRange(parsed);
            const episodeSuffix = episodeRange
                ? 'E' +
                  String(episodeRange.start).padStart(2, '0') +
                  (episodeRange.end !== episodeRange.start
                      ? '-E' + String(episodeRange.end).padStart(2, '0')
                      : '')
                : '';
            const episodeLabel = episodeRange
                ? String(episodeRange.start).padStart(2, '0') +
                  (episodeRange.end !== episodeRange.start
                      ? '-' + String(episodeRange.end).padStart(2, '0')
                      : '')
                : '';
            const suffix = parsed.tv
                ? ' S' + String(parsed.season).padStart(2, '0') + (config.seasonSearch ? '' : episodeSuffix)
                : '';
            const names = subtitleSearchNames(parsed);
            const original = row.node?.originalName || row.node?.name || '';
            const withRelease =
                !config.seasonSearch &&
                (/\b(?:BluRay|BDRip|WEB[ ._-]?(?:DL|Rip)|REMUX|HDTV|x26[45]|extended|theatrical)\b/i.test(
                    original
                ) ||
                    (parsed.tv && /\b(?:2160p|1080p|720p)\b/i.test(original)));
            const plainQueries = names.map((name) => name + suffix);
            const seasonQueries = seasonNames.map(
                (name) => name + (config.seasonSearch ? '' : ' ' + episodeLabel)
            );
            const releaseQuery = withRelease && original.replace(/\.[^.]+$/, '');
            const fallbackQueries = seasonQueries.length
                ? [...plainQueries, releaseQuery]
                : [releaseQuery, ...plainQueries];
            const chapterQuery = chapter && chapter + (config.seasonSearch ? '' : ' ' + episodeLabel);
            const chapterEpisodeQuery =
                chapter && !config.seasonSearch && chapter + ' S' + parsed.season + episodeSuffix;
            const queries = [
                ...new Set(
                    [...seasonQueries, chapterEpisodeQuery, chapterQuery, ...fallbackQueries].filter(Boolean)
                ),
            ].slice(0, chapterEpisodeQuery ? 4 : 3);
            const filter = (items, { parsed: target, node }) => {
                const candidates = [],
                    seen = new Set(),
                    excluded = {
                        年份: 0,
                        季集: 0,
                        语言: 0,
                        内容: 0,
                        无关: 0,
                        待确认上限: 0,
                        格式: 0,
                        重复: 0,
                    },
                    rejectionSamples = [];
                const sampleRejection = (name, reason) => {
                    if (rejectionSamples.length < 8) rejectionSamples.push(`${name}（${reason}）`);
                };
                log('迅雷 响应', `返回 ${items.length} 条原始结果`);
                for (const item of items) {
                    check();
                    verify();
                    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
                        excluded.格式++;
                        continue;
                    }
                    const name = item.name,
                        ext = String(item.ext || name.split('.').pop())
                            .replace(/^\./, '')
                            .toLowerCase();
                    if (
                        !['srt', 'ass', 'ssa', 'vtt', 'zip', 'rar'].includes(ext) ||
                        typeof item.url !== 'string'
                    ) {
                        excluded.格式++;
                        continue;
                    }
                    let url;
                    try {
                        url = subtitleDownloadUrl(item.url, { allowHttp: true });
                    } catch {
                        excluded.格式++;
                        continue;
                    }
                    if (seen.has(url)) {
                        excluded.重复++;
                        continue;
                    }
                    seen.add(url);
                    const episodeName = item.embeddedVideoName || name;
                    const episodeIdentity = subtitleEpisodeIdentity(episodeName, target);
                    if (
                        subtitleEpisodeIdentity(name, target).conflict ||
                        episodeIdentity.conflict ||
                        (!target.tv && episodeIdentity.season != null && episodeIdentity.episode != null)
                    ) {
                        excluded.季集++;
                        sampleRejection(name, '季集不符');
                        continue;
                    }
                    const episodeMatched = episodeIdentity.matched;
                    const exactRelease =
                        !episodeMatched && subtitleReleaseEpisodeMatch(node, target, episodeName);
                    const match = subtitleCandidateFilter(
                        target,
                        item.embeddedVideoName ? [name] : [],
                        episodeName,
                        exactRelease || !!config.reviewCandidates
                    );
                    if (match.excluded) {
                        excluded[match.excluded]++;
                        sampleRejection(name, match.matchReason || match.excluded);
                        continue;
                    }
                    const labels = [
                        Array.isArray(item.languages) ? item.languages.join(' ') : '',
                        item.simple_name || '',
                    ]
                        .join(' ')
                        .replace(/\\u0026/gi, '&')
                        .replace(/英语/g, '英文');
                    const metadata = subtitleFileInfo(labels),
                        info = subtitleFileInfo(name, metadata.language);
                    info.bilingual ||= metadata.bilingual && info.language.startsWith('zh');
                    const archiveSeason = isSubtitleArchive(ext) ? subtitlePackSeason([name]) : null;
                    if (target.tv && archiveSeason != null && archiveSeason !== target.season) {
                        excluded.季集++;
                        sampleRejection(name, '季号不符');
                        continue;
                    }
                    const titleMatched =
                        exactRelease ||
                        (match.titleMatched &&
                            (!target.tv || episodeMatched || archiveSeason === target.season));
                    if (
                        info.language &&
                        !(config.language || 'zh-cn,zh-tw,zh').split(',').includes(info.language) &&
                        !info.bilingual &&
                        !info.language.startsWith('zh') &&
                        info.language !== 'en'
                    ) {
                        excluded.语言++;
                        sampleRejection(name, '语言 ' + info.language);
                        continue;
                    }
                    if (candidates.length >= 60) {
                        const uncertain = titleMatched
                            ? candidates.findIndex((candidate) => !candidate.titleMatched)
                            : -1;
                        excluded.待确认上限++;
                        if (uncertain < 0) continue;
                        candidates.splice(uncertain, 1);
                    }
                    candidates.push({
                        source: '迅雷',
                        name,
                        ...info,
                        titleMatched,
                        opaque: !!match.opaque,
                        matchReason: titleMatched
                            ? ''
                            : target.tv && !episodeMatched
                              ? '文件未标明准确季集'
                              : match.matchReason,
                        url,
                        ext,
                        release: episodeName,
                        embeddedVideoName: item.embeddedVideoName,
                        searchTerms: item.searchTerms || [],
                        ...(isSubtitleArchive(ext)
                            ? { parsed: { ...target }, archiveSeason, archiveFields: [name] }
                            : {}),
                    });
                }
                return { candidates, excluded, rejectionSamples };
            };
            const reliable = (target, available) => {
                const { candidates } = filter(available, target);
                const failed = new Set(
                    (target.candidates || []).filter((item) => item.downloadFailed).map((item) => item.url)
                );
                const selection = {
                    node: target.node || { name: '' },
                    parsed: target.parsed,
                    candidates: candidates.filter((item) => !failed.has(item.url)),
                };
                selectSubtitleCandidate(selection, config.language);
                return !!selection.selectedCandidate;
            };
            if (config.thunderCacheOnly) {
                if (!searchCache.has(seasonKey)) return [];
                ({ items, attempts } = await searchCache.get(seasonKey));
                report({
                    queries: attempts,
                    rawCount: items.length,
                    unit: '缓存条目',
                    deferredTerms: queries,
                });
            } else {
                items = [];
                attempts = [];
                let failure,
                    rawCount = null;
                const offset = config.thunderOffset || 0;
                let index = offset;
                for (; index < queries.length; index++) {
                    check();
                    verify();
                    const term = queries[index],
                        cacheKey = JSON.stringify(['thunder', term]);
                    const attempt = { term };
                    attempts.push(attempt);
                    log(
                        '迅雷 查询',
                        '实际搜索词：' + term + ' · ' + (searchCache.has(cacheKey) ? '使用缓存' : '请求来源')
                    );
                    try {
                        if (!searchCache.has(cacheKey)) {
                            searchCache.set(
                                cacheKey,
                                thunderRequest(term, verify)
                                    .then((result) => {
                                        if (Number(result?.code) !== 0 || !Array.isArray(result?.data))
                                            throw subtitleSourceError(
                                                '迅雷字幕接口返回异常：' +
                                                    String(
                                                        result?.result || result?.code || '格式错误'
                                                    ).slice(0, 120)
                                            );
                                        return result.data.map((item) => ({ ...item, searchTerms: [term] }));
                                    })
                                    .catch((error) => {
                                        searchCache.delete(cacheKey);
                                        throw error;
                                    })
                            );
                            evict(searchCache, 200);
                        }
                        const found = await searchCache.get(cacheKey);
                        check();
                        verify();
                        attempt.rawCount = found.length;
                        rawCount = (rawCount ?? 0) + found.length;
                        items.push(...found);
                    } catch (error) {
                        check();
                        verify();
                        attempt.error = subtitleDiagnosticText(error.message, config);
                        failure ||= error;
                        if (!isSubtitleSourceError(error)) {
                            report({ queries: attempts, rawCount, unit: '条目' });
                            throw error;
                        }
                        if (subtitleSourcePaused(error)) {
                            unavailableSources.set('迅雷', attempt.error);
                            index++;
                            break;
                        }
                    }
                    const targets = config.seasonRows || [row];
                    if (rawCount != null && targets.every((target) => reliable(target, items))) {
                        index++;
                        break;
                    }
                }
                const deferredTerms = !unavailableSources.has('迅雷') ? queries.slice(index) : [];
                report({ queries: attempts, rawCount, unit: '条目', thunderOffset: index, deferredTerms });
                if (rawCount === null && failure) throw failure;
                if (seasonKey && rawCount != null) {
                    const previous = searchCache.get(seasonKey);
                    const merged = [
                        ...new Map(
                            [...(previous?.items || []), ...items].map((item) => [
                                item.url || item.name,
                                item,
                            ])
                        ).values(),
                    ];
                    const queries = [
                        ...new Map(
                            [...(previous?.attempts || []), ...attempts].map((attempt) => [
                                attempt.term,
                                attempt,
                            ])
                        ).values(),
                    ];
                    searchCache.set(seasonKey, { items: merged, attempts: queries });
                    evict(searchCache, 200);
                }
            }
            check();
            verify();
            await recoverThunderDetails(items, row, verify);
            const { candidates, excluded, rejectionSamples } = filter(items, row);
            onFiles(
                `搜索词：${attempts.map((attempt) => attempt.term).join(' / ')} · 筛选后 ${candidates.length} 份字幕文件` +
                    (candidates.length
                        ? '：' +
                          candidates
                              .slice(0, 12)
                              .map((candidate) => candidate.name)
                              .join('；') +
                          (candidates.length > 12 ? '；…' : '')
                        : '')
            );
            candidates.sort((a, b) => Number(a.opaque) - Number(b.opaque));
            if (rejectionSamples.length) log('迅雷 排除样例', rejectionSamples.join('；'));
            log(
                '迅雷 筛选',
                `保留 ${candidates.length} 份 · 排除 ${Object.values(excluded).reduce((a, b) => a + b, 0)} 份（${Object.entries(
                    excluded
                )
                    .map(([reason, count]) => reason + ' ' + count)
                    .join(
                        '，'
                    )}）· 待确认 ${candidates.filter((candidate) => !candidate.titleMatched).length} 份`
            );
            report({ keptCount: candidates.length, excluded });
            return candidates;
        },
        logout() {
            token = '';
            tokenKey = '';
            clearCache();
        },
        clearCache,
        async login(username, password, config) {
            token = '';
            tokenKey = '';
            if (!username || !password) throw new Error('请输入 OpenSubtitles 用户名和密码');
            const result = await request('/login', config, { username, password });
            if (!result?.token) throw new Error('接口未返回登录令牌');
            token = result.token;
            tokenKey = config.key;
        },
        async search(row, config, report = () => {}) {
            const parsed = row.parsed;
            const title = subtitleQueryTitle(parsed.query, parsed.year);
            if (!title) throw subtitleSourceError('无法从文件名识别作品名称');
            if (parsed.tv && (parsed.season === null || parsed.episode === null))
                throw subtitleSourceError('缺少明确季集，请先在影视整理中确认季集并重命名');
            const baseParams = new URLSearchParams({
                query: title,
                languages: config.language,
                order_by: 'download_count',
                order_direction: 'desc',
            });
            if (parsed.tmdbId) baseParams.set(parsed.tv ? 'parent_tmdb_id' : 'tmdb_id', parsed.tmdbId);
            if (parsed.tv) {
                baseParams.set('season_number', parsed.season);
                baseParams.set('type', 'episode');
            } else {
                baseParams.set('type', 'movie');
                if (parsed.year) baseParams.set('year', parsed.year);
            }
            const range = subtitleEpisodeRange(parsed),
                episodes =
                    parsed.tv && range && range.end !== range.start
                        ? [range.start, range.end]
                        : [parsed.episode],
                attempts = [],
                results = [];
            for (const episode of episodes) {
                const params = new URLSearchParams(baseParams);
                if (parsed.tv) params.set('episode_number', episode);
                const cacheKey = JSON.stringify([config.key, params.toString()]);
                if (!searchCache.has(cacheKey))
                    searchCache.set(
                        cacheKey,
                        request('/subtitles?' + params, config).catch((error) => {
                            searchCache.delete(cacheKey);
                            throw error;
                        })
                    );
                const attempt = { term: params.toString() };
                attempts.push(attempt);
                try {
                    const result = await searchCache.get(cacheKey);
                    if (!Array.isArray(result?.data)) throw subtitleSourceError('搜索返回格式异常');
                    attempt.rawCount = result.data.length;
                    results.push(result);
                } catch (error) {
                    attempt.error = error.message;
                    report({ queries: attempts });
                    throw error;
                }
            }
            const rawCount = results.reduce((count, result) => count + result.data.length, 0);
            const candidates = [],
                excluded = { 作品: 0, 年份: 0, 季集: 0, 格式: 0, 上限: 0 };
            for (const result of results)
                for (const item of result.data) {
                    const attrs = item.attributes || {},
                        feature = attrs.feature_details || {};
                    const identity = parsed.tv ? feature.parent_tmdb_id : feature.tmdb_id;
                    const yearMatches =
                        parsed.tv ||
                        !parsed.year ||
                        !feature.year ||
                        String(feature.year) === String(parsed.year);
                    const titleMatched =
                        [feature.title, feature.movie_name].some(
                            (value) => titleKey(value) === titleKey(title)
                        ) && yearMatches;
                    if (parsed.tmdbId && identity && String(identity) !== String(parsed.tmdbId)) {
                        excluded.作品++;
                        continue;
                    }
                    if (!parsed.tv && /episode|tvshow/i.test(feature.feature_type || '')) {
                        excluded.作品++;
                        continue;
                    }
                    if (
                        parsed.tv &&
                        (Number(feature.season_number) !== parsed.season ||
                            !episodes.includes(Number(feature.episode_number)))
                    ) {
                        excluded.季集++;
                        continue;
                    }
                    if (!Array.isArray(attrs.files) || !attrs.files.length) {
                        excluded.格式++;
                        continue;
                    }
                    for (const file of attrs.files) {
                        if (!Number.isSafeInteger(file?.file_id) || file.file_id <= 0) {
                            excluded.格式++;
                            continue;
                        }
                        const name = file.file_name || '',
                            ext = name.split('.').pop().toLowerCase();
                        if (
                            parsed.tv &&
                            range &&
                            range.end !== range.start &&
                            !exactSubtitleEpisode(name, parsed)
                        ) {
                            excluded.季集++;
                            continue;
                        }
                        const match = subtitleWorkIdentity(
                            parsed,
                            [feature.title, feature.movie_name],
                            file.file_name || 'subtitle'
                        );
                        candidates.push({
                            source: 'OpenSubtitles',
                            fileId: file.file_id,
                            ...subtitleFileInfo(file.file_name || attrs.release || '', attrs.language || ''),
                            release: [feature.movie_name || feature.title, attrs.release]
                                .filter(Boolean)
                                .join(' · '),
                            name,
                            ext,
                            parsed: { ...parsed },
                            archiveFields: [feature.title, feature.movie_name, attrs.release],
                            archiveSeason: subtitlePackSeason([name, attrs.release], feature.season_number),
                            workIdentity: {
                                tmdbId: identity,
                                year: feature.year,
                                tv: parsed.tv,
                                season: feature.season_number,
                                episode: feature.episode_number,
                            },
                            hardMismatch: !yearMatches || !!match.hardMismatch,
                            titleMatched: titleMatched && match.titleMatched,
                            identityMatched:
                                yearMatches &&
                                match.titleMatched &&
                                !!parsed.tmdbId &&
                                String(identity) === String(parsed.tmdbId),
                            matchReason: !yearMatches ? '作品年份与视频不符' : match.matchReason,
                        });
                    }
                }
            excluded.上限 = Math.max(0, candidates.length - 12);
            const kept = candidates.slice(0, 12);
            report({
                queries: attempts,
                rawCount,
                unit: '资源',
                keptCount: kept.length,
                excluded,
            });
            return kept;
        },
        async fetchFile(candidate, config, progress = () => {}, verify = () => {}) {
            for (let attempt = 0; attempt < 2; attempt++) {
                verify();
                let result;
                try {
                    result = await this.download(candidate, config);
                    verify();
                    if (result.fileName) progress('文件选择', `${candidate.source} · ${result.fileName}`);
                    if (isSubtitleArchive(result.ext))
                        return await archiveWork(async () => {
                            const archive = await archiveData(
                                result.url,
                                verify,
                                result.ext,
                                candidate.source
                            );
                            const file = await subtitleCandidateArchive(
                                archive.bytes,
                                candidate,
                                config.language,
                                verify,
                                archive.index
                            );
                            result.ext = file.ext;
                            result.fileName = file.name;
                            progress(candidate.source + ' 压缩包选择', file.name);
                            return { result, bytes: file.bytes };
                        }, verify);
                    const bytes = await transfer(result, verify, candidate.source);
                    verify();
                    return { result, bytes };
                } catch (error) {
                    verify();
                    if (
                        attempt ||
                        error.downloadPaused ||
                        error.phase !== 'transfer' ||
                        !([401, 403, 408, 500, 502, 503, 504].includes(error.status) || error.retryable)
                    )
                        throw error;
                    progress(
                        '下载重试',
                        `${candidate.source} · ${new URL(result.url).hostname} · ${error.message}；稍后重试一次`
                    );
                    if (isSubtitleArchive(candidate.ext)) archiveCache.delete(candidate.url);
                    await pause(1500);
                }
            }
        },
        async download(candidate, config) {
            if (candidate.source === '迅雷')
                return {
                    url: subtitleDownloadUrl(candidate.url, { allowHttp: true }),
                    ext: candidate.ext,
                    fileName: candidate.name,
                    allowHttp: true,
                };
            if (candidate.source === '射手网')
                return {
                    url: subtitleDownloadUrl(candidate.url),
                    ext: candidate.ext,
                    fileName: candidate.name,
                };
            const result = await request('/download', config, { file_id: candidate.fileId });
            const ext = String(result?.file_name || candidate.name)
                .split('.')
                .pop()
                .toLowerCase();
            return {
                url: subtitleDownloadUrl(result?.link),
                ext,
                fileName: result?.file_name || candidate.name,
            };
        },
    };
}

const SUBTITLE_LIMIT = 16 * 1024 * 1024;
const SUBTITLE_BATCH_LIMIT = 64 * 1024 * 1024;
const subtitleRarQueue = new Map();
const isSubtitleArchive = (ext) => ext === 'zip' || ext === 'rar';
async function subtitleReadArchive(bytes, ext, check = () => {}, strict = false, selectedPaths) {
    check();
    if (bytes.length > SUBTITLE_LIMIT) throw new Error('压缩包超过 16 MiB');
    const rar =
        ext === 'rar' || [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07].every((byte, index) => bytes[index] === byte);
    if (!rar) {
        return subtitleArchiveIndex(bytes, check, strict);
    }
    return enqueueByKey(
        subtitleRarQueue,
        'rar',
        () =>
            new Promise((resolve, reject) => {
                let worker,
                    url,
                    timer,
                    settled = false;
                const finish = (error, index) => {
                    if (settled) return;
                    settled = true;
                    clearInterval(timer);
                    worker?.terminate();
                    if (url) URL.revokeObjectURL(url);
                    if (error) reject(error);
                    else resolve(index);
                };
                try {
                    check();
                    url = URL.createObjectURL(new Blob([SUBTITLE_RAR_WORKER], { type: 'text/javascript' }));
                    worker = new Worker(url);
                    const started = Date.now();
                    timer = setInterval(() => {
                        try {
                            check();
                            if (Date.now() - started > 60000) throw new Error('RAR 解压超时，已停止后台线程');
                        } catch (error) {
                            finish(error);
                        }
                    }, 250);
                    worker.onerror = (event) => {
                        event.preventDefault();
                        finish(
                            new Error('RAR 解压线程启动或运行失败，请检查浏览器的 Worker 与 WebAssembly 权限')
                        );
                    };
                    worker.onmessageerror = () => finish(new Error('RAR 解压结果读取失败'));
                    worker.onmessage = (event) => {
                        try {
                            check();
                            if (event.data.type === 'error') throw new Error(event.data.error);
                            if (event.data.type === 'headers') {
                                if (!selectedPaths) finish(null, event.data.index);
                                else worker.postMessage({ type: 'extract', paths: selectedPaths });
                            } else if (event.data.type === 'complete') finish(null, event.data.index);
                        } catch (error) {
                            finish(error);
                        }
                    };
                    const data = bytes.slice().buffer;
                    worker.postMessage(
                        {
                            type: 'open',
                            bytes: data,
                            limits: { file: SUBTITLE_LIMIT, batch: SUBTITLE_BATCH_LIMIT },
                        },
                        [data]
                    );
                } catch (error) {
                    finish(error);
                }
            })
    );
}
function subtitleArchiveIndex(bytes, check = () => {}, strict = false) {
    // Parse the central directory once; do not inflate unrelated files.
    const invalid = () => new Error('ZIP 格式不支持或数据不完整（不支持 ZIP64 及多卷）');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22;
    for (; end >= Math.max(0, bytes.length - 65557); end--) {
        if (
            view.getUint32(end, true) === 0x06054b50 &&
            end + 22 + view.getUint16(end + 20, true) === bytes.length
        )
            break;
    }
    if (end < Math.max(0, bytes.length - 65557)) throw invalid();
    const count = view.getUint16(end + 10, true),
        size = view.getUint32(end + 12, true),
        start = view.getUint32(end + 16, true);
    if (
        view.getUint16(end + 4, true) ||
        view.getUint16(end + 6, true) ||
        count !== view.getUint16(end + 8, true) ||
        count > 2000 ||
        start + size !== end
    )
        throw invalid();
    const files = [],
        paths = new Map(),
        ranges = [];
    let offset = start;
    for (let i = 0; i < count; i++) {
        check();
        if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw invalid();
        const flags = view.getUint16(offset + 8, true),
            method = view.getUint16(offset + 10, true),
            crc = view.getUint32(offset + 16, true);
        const compressed = view.getUint32(offset + 20, true),
            length = view.getUint32(offset + 24, true),
            local = view.getUint32(offset + 42, true);
        const nameSize = view.getUint16(offset + 28, true),
            next =
                offset +
                46 +
                nameSize +
                view.getUint16(offset + 30, true) +
                view.getUint16(offset + 32, true);
        if (next > end || view.getUint16(offset + 34, true)) throw invalid();
        const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameSize);
        const path = new TextDecoder(flags & 0x800 ? 'utf-8' : 'gb18030', { fatal: strict }).decode(
            nameBytes
        );
        const name = path.split(/[\\/]/).pop(),
            ext = name.split('.').pop().toLowerCase();
        if (strict) {
            const parts = path.normalize('NFKC').replace(/\\/g, '/').replace(/\/$/, '').split('/');
            if (
                parts.some(
                    (part) =>
                        !part ||
                        part === '.' ||
                        part === '..' ||
                        /[:\x00-\x1f]/.test(part) ||
                        /[ .]$/.test(part)
                )
            )
                throw new Error('ZIP 包含绝对路径或不安全路径');
            const key = parts.join('/').toLowerCase(),
                directory = !name;
            if (paths.has(key)) throw new Error('ZIP 包含重复或冲突路径');
            paths.set(key, directory);
            if ((flags | (local + 30 <= start ? view.getUint16(local + 6, true) : 0)) & 0x2041)
                throw new Error('不支持加密 ZIP');
            if (
                length === 0xffffffff ||
                compressed === 0xffffffff ||
                local === 0xffffffff ||
                ![0, 8].includes(method)
            )
                throw invalid();
            const dataStart = subtitleArchiveDataOffset(
                view,
                { local, flags, method, compressed, length, crc },
                start,
                invalid
            );
            if (
                view.getUint16(local + 26, true) !== nameBytes.length ||
                local + 30 + nameBytes.length > dataStart ||
                nameBytes.some((byte, j) => byte !== bytes[local + 30 + j])
            )
                throw invalid();
            let dataEnd = dataStart + compressed;
            if (flags & 8) {
                const matches = (at) =>
                    at + 12 <= start &&
                    view.getUint32(at, true) === crc &&
                    view.getUint32(at + 4, true) === compressed &&
                    view.getUint32(at + 8, true) === length;
                if (matches(dataEnd)) dataEnd += 12;
                else if (
                    dataEnd + 4 <= start &&
                    view.getUint32(dataEnd, true) === 0x08074b50 &&
                    matches(dataEnd + 4)
                )
                    dataEnd += 16;
                else throw invalid();
            } else if (
                view.getUint32(local + 14, true) !== crc ||
                view.getUint32(local + 18, true) !== compressed ||
                view.getUint32(local + 22, true) !== length
            )
                throw invalid();
            ranges.push([local, dataEnd]);
        }
        offset = next;
        if (
            !['srt', 'ass', 'ssa', 'vtt'].includes(ext) ||
            path.startsWith('__MACOSX/') ||
            name.startsWith('._')
        )
            continue;
        if (flags & 1 || ![0, 8].includes(method) || (!strict && !length) || compressed > SUBTITLE_LIMIT)
            continue;
        files.push({ name, path, ext, method, crc, compressed, length, local, flags });
    }
    if (offset !== end) throw invalid();
    if (strict) {
        for (const key of paths.keys()) {
            for (let slash = key.lastIndexOf('/'); slash >= 0; slash = key.lastIndexOf('/', slash - 1))
                if (paths.get(key.slice(0, slash)) === false) throw new Error('ZIP 包含文件与目录路径冲突');
        }
        ranges.sort((a, b) => a[0] - b[0]);
        if (ranges.some(([at], index) => index && at < ranges[index - 1][1])) throw invalid();
    }
    return { files, start };
}
function subtitleArchiveChoices(index, candidate, language) {
    const parsed = candidate.parsed;
    if (parsed.tv && (parsed.season == null || parsed.episode == null)) return [];
    const files = [];
    for (const file of index.files) {
        if (!file.length || file.length > SUBTITLE_LIMIT) continue;
        const { name } = file;
        let identityName = name;
        if (parsed.tv) {
            const folders = file.path.replace(/\\/g, '/').split('/').slice(0, -1);
            const seasons = folders.flatMap((folder) =>
                [...folder.matchAll(/(?:^|[^a-z])(?:Season[ ._-]*|S)(\d{1,2})(?!\d)/gi)].map((match) =>
                    Number(match[1])
                )
            );
            if (
                seasons.some((season) => season !== parsed.season) ||
                folders.some((folder) => /^(?:extras?|specials?|bonus|特典|花絮)$/i.test(folder))
            )
                continue;
            const seasonContext = candidate.titleMatched
                ? (candidate.archiveSeason ?? seasons[0] ?? null)
                : null;
            const bare = name.match(
                /^(?:E(?:P)?[ ._-]*)?(\d{1,3})(?:[ ._-](?:chs|cht|zh|zh-cn|zh-tw|简体|繁体|简中|繁中))?\.(?:srt|ass|ssa|vtt)$/i
            );
            if (bare && seasonContext === parsed.season) {
                if (!subtitleEpisodeIdentity(name, parsed, seasonContext).matched) continue;
                identityName =
                    parsed.query +
                    '.S' +
                    String(parsed.season).padStart(2, '0') +
                    'E' +
                    String(parsed.episode).padStart(2, '0') +
                    '.' +
                    file.ext;
            } else if (!subtitleEpisodeIdentity(name, parsed, seasonContext).matched) continue;
        }
        const match = subtitleCandidateFilter(parsed, candidate.archiveFields || [], identityName);
        const info = subtitleFileInfo(name, candidate.language);
        if (
            match.excluded ||
            !match.titleMatched ||
            (!subtitleLanguageMatch(name, language) &&
                !language
                    .split(',')
                    .some(
                        (wanted) =>
                            wanted === info.language ||
                            (wanted.startsWith('zh') && info.language.startsWith('zh'))
                    ))
        )
            continue;
        files.push({ ...file, score: subtitlePreference({ ...info, name }, language) });
    }
    return files.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
async function subtitleCandidateArchive(bytes, candidate, language, check = () => {}, index) {
    check();
    index ||= await subtitleReadArchive(bytes, candidate.ext, check);
    const files = subtitleArchiveChoices(index, candidate, language);
    if (!files.length) throw new Error('压缩包没有通过片名、年份、季集及语言检查的文本字幕');
    return subtitleArchiveExtract(bytes, index, files[0], check);
}
function subtitleArchiveDataOffset(view, file, start, invalid) {
    const { local } = file;
    if (
        local + 30 > start ||
        view.getUint32(local, true) !== 0x04034b50 ||
        view.getUint16(local + 6, true) !== file.flags ||
        view.getUint16(local + 8, true) !== file.method
    )
        throw invalid();
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (dataStart + file.compressed > start) throw invalid();
    if (file.method === 0 && file.compressed !== file.length) throw invalid();
    return dataStart;
}
async function subtitleArchiveExtract(bytes, index, file, check) {
    check();
    if (file.length > SUBTITLE_LIMIT) throw new Error('字幕「' + file.name + '」超过 16 MiB');
    if (index.format === 'rar') {
        const extracted = await subtitleReadArchive(bytes, 'rar', check, false, [file.originalPath]);
        check();
        const selected = extracted.files.find((entry) => entry.originalPath === file.originalPath);
        if (!selected || selected.length !== file.length) throw new Error('RAR 所选字幕与目录记录不符');
        return { name: selected.name, ext: selected.ext, bytes: selected.bytes };
    }
    const invalid = () => new Error('ZIP 格式不支持或数据不完整');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dataStart = subtitleArchiveDataOffset(view, file, index.start, invalid);
    let payload = bytes.subarray(dataStart, dataStart + file.compressed);
    if (file.method === 8) {
        let inflater;
        try {
            inflater = new DecompressionStream('deflate-raw');
        } catch {
            throw new Error('当前浏览器不支持 ZIP 解压，请更新浏览器或选择其他来源的单文件字幕');
        }
        const reader = new Blob([payload]).stream().pipeThrough(inflater).getReader(),
            chunks = [];
        let total = 0;
        try {
            for (;;) {
                check();
                const { done, value } = await reader.read();
                check();
                if (done) break;
                total += value.length;
                if (total > file.length || total > SUBTITLE_LIMIT) throw invalid();
                chunks.push(value);
            }
        } catch (error) {
            check();
            if (error.name === 'TypeError') throw invalid();
            throw error;
        } finally {
            await reader.cancel().catch(() => {});
        }
        payload = new Uint8Array(total);
        let at = 0;
        for (const chunk of chunks) {
            payload.set(chunk, at);
            at += chunk.length;
        }
    }
    check();
    let crc = 0xffffffff;
    for (const byte of payload) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if (payload.length !== file.length || (crc ^ 0xffffffff) >>> 0 !== file.crc) throw invalid();
    return { name: file.name, ext: file.ext, bytes: payload };
}
function subtitleBinary(
    url,
    { method = 'GET', headers = {}, bytes, range, limit = SUBTITLE_LIMIT, allowHttp = false } = {}
) {
    url = subtitleDownloadUrl(url, {
        allowHttp: allowHttp && method === 'GET' && !bytes && !Object.keys(headers).length,
    });
    return new Promise((resolve, reject) => {
        let request,
            rejected = false;
        const fail = (message) => {
            rejected = true;
            reject(new Error(message));
            request?.abort();
        };
        request = GM_xmlhttpRequest({
            url,
            method,
            headers,
            data: bytes && new Blob([bytes]),
            anonymous: true,
            responseType: 'arraybuffer',
            timeout: range ? 8000 : 60000,
            onreadystatechange: (response) => {
                if (range && response.readyState === 2 && response.status && response.status !== 206)
                    fail('网盘未提供分段读取，已停止取样，不下载完整视频');
            },
            onprogress: (event) => {
                if (event.loaded > limit || (event.lengthComputable && event.total > limit))
                    fail('响应超过大小限制，已停止读取');
            },
            onload: (response) => {
                if (rejected) return;
                if (response.status < 200 || response.status >= 300) {
                    let payload;
                    try {
                        payload = JSON.parse(
                            new TextDecoder().decode(
                                new Uint8Array(response.response || new ArrayBuffer(0)).subarray(0, 8192)
                            )
                        );
                    } catch {
                        /* Error bodies can be HTML. */
                    }
                    const code = typeof payload?.error === 'string' ? payload.error : payload?.code;
                    const reason =
                        new Map([
                            ['daily_limit', '当日下载额度已用完'],
                            ['api_download_limit_exceeded', '账号下载额度已用完'],
                            ['rate_limit', '请求过频'],
                            ['service_busy', '来源服务繁忙'],
                        ]).get(code) ||
                        ([429, 509].includes(response.status) ? '来源限制，具体频率或额度原因未返回' : '');
                    const retry = String(response.responseHeaders || '')
                        .match(/^retry-after:\s*(.+)$/im)?.[1]
                        ?.trim();
                    const retryAfterMs = retry
                        ? Math.max(
                              0,
                              /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()
                          ) || 0
                        : 0;
                    reject(
                        Object.assign(
                            new Error(
                                '文件传输失败（HTTP ' +
                                    response.status +
                                    '）' +
                                    (reason ? '：' + reason : '') +
                                    (retryAfterMs
                                        ? '，服务要求等待 ' + Math.ceil(retryAfterMs / 1000) + ' 秒'
                                        : '')
                            ),
                            { status: response.status, phase: 'transfer', retryAfterMs }
                        )
                    );
                    return;
                }
                const data = new Uint8Array(response.response || new ArrayBuffer(0));
                if (data.length > limit) {
                    reject(new Error('响应超过大小限制'));
                    return;
                }
                if (range) {
                    const contentRange = String(response.responseHeaders || '').match(
                        /^content-range:\s*bytes\s+(\d+)-(\d+)\/(\d+)/im
                    );
                    if (
                        response.status !== 206 ||
                        !contentRange ||
                        Number(contentRange[1]) !== range[0] ||
                        Number(contentRange[2]) !== range[1] ||
                        Number(contentRange[3]) !== range[2] ||
                        data.length !== range[1] - range[0] + 1
                    ) {
                        reject(new Error('网盘返回的视频片段范围不正确'));
                        return;
                    }
                }
                resolve(data);
            },
            onerror: () =>
                reject(Object.assign(new Error('文件传输连接失败'), { phase: 'transfer', retryable: true })),
            ontimeout: () =>
                reject(
                    Object.assign(new Error('文件传输超时，请重试'), { phase: 'transfer', retryable: true })
                ),
            onabort: () => reject(new Error('文件传输已停止')),
        });
    });
}
function subtitleDecode(bytes) {
    const decode = (encoding) => ({
        text: new TextDecoder(encoding, { fatal: true }).decode(bytes),
        encoding,
    });
    // UTF-16 subtitles are common; decoding them as a legacy encoding leaves NULs between timestamp characters.
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return decode('utf-16le');
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return decode('utf-16be');
    const pairs = Math.floor(Math.min(bytes.length, 2048) / 2);
    let evenZero = 0,
        oddZero = 0;
    for (let i = 0; i < pairs * 2; i += 2) {
        if (bytes[i] === 0) evenZero++;
        if (bytes[i + 1] === 0) oddZero++;
    }
    if (pairs >= 8 && oddZero / pairs > 0.3 && evenZero / pairs < 0.1) return decode('utf-16le');
    if (pairs >= 8 && evenZero / pairs > 0.3 && oddZero / pairs < 0.1) return decode('utf-16be');
    try {
        return decode('utf-8');
    } catch {
        return decode('gb18030');
    }
}
function subtitleDialogue(text, ext) {
    return subtitleTimeline(text, ext).dialogue.join('\n');
}
function subtitleProjectVideo(text) {
    let section = '';
    const names = new Set();
    for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const heading = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (heading) section = heading[1].toLowerCase();
        if (!['script info', 'aegisub project garbage'].includes(section)) continue;
        const video = line.match(/^\s*Video File\s*:\s*(.+?)\s*$/i);
        const name = video?.[1].replace(/^"|"$/g, '').split(/[\\/]/).at(-1);
        if (name && MEDIA_VIDEO.test(name)) names.add(name);
    }
    return names.size === 1 ? [...names][0] : '';
}
function subtitleValidateContent(row, bytes, ext, language, log = () => {}) {
    if (!bytes.length || bytes.length > SUBTITLE_LIMIT || !['srt', 'ass', 'ssa', 'vtt'].includes(ext))
        throw new Error('仅支持单个 SRT、ASS、SSA、VTT 字幕，不导入压缩包或不完整字幕对');
    let decoded;
    try {
        decoded = subtitleDecode(bytes);
    } catch {
        throw new Error('字幕文本解码失败（UTF-8 / UTF-16 / GB18030），未上传');
    }
    const { text, encoding } = decoded;
    const description = `编码 ${encoding.toUpperCase()}，${bytes.length} 字节`;
    log('字幕解码', description);
    if (
        /^\s*(?:<!doctype\s+html|<html|\{"(?:error|message)")/i.test(text) ||
        !/-->|\[Events\][\s\S]*Dialogue\s*:/i.test(text)
    )
        throw new Error(
            '下载内容不是可识别的字幕文本（' +
                encoding.toUpperCase() +
                '，' +
                bytes.length +
                ' 字节，' +
                (/<!doctype\s+html|<html|<body/i.test(text.slice(0, 1024))
                    ? '返回了 HTML 页面'
                    : '缺少字幕时间轴或 Dialogue') +
                '）'
        );
    const timeline = subtitleTimeline(text, ext);
    const timing = subtitleCheckDuration(row, timeline, log);
    const dialogue = timeline.dialogue.join('\n');
    if (language !== 'en' && !/[\u3400-\u9fff]/.test(dialogue))
        throw new Error('字幕正文未检测到中文，未上传');
    if (language === 'en' && !/[a-z]{2}/i.test(dialogue)) throw new Error('字幕正文未检测到英文，未上传');
    return {
        text,
        encoding: description,
        ...timing,
        projectVideoName: /^(?:ass|ssa)$/.test(ext) ? subtitleProjectVideo(text) : '',
        work: { status: 'unconfirmed', reason: '正文格式和语言通过，作品归属未确认' },
    };
}
function subtitleVerificationMessage(result) {
    const timing =
        {
            file: '对白范围与视频文件时长相符',
            unknown: '无时长参考',
            reference: 'TMDB 仅作作品时长参考',
            'reference-difference': '与 TMDB 作品时长参考有差异',
        }[result.evidence] || '时长证据待确认';
    const identity =
        {
            manual: '已手动配对',
            supported: 'AI 支持作品归属（非实证）',
        }[result.work?.status] || '作品归属未确认';
    return `格式/语言通过；${timing}；${identity}；未核对音画同步`;
}
function subtitleEpisodeName(name, parsed) {
    const stem = String(name || '')
        .normalize('NFKC')
        .replace(/[【】]/g, (value) => (value === '【' ? '[' : ']'))
        .replace(/\.(?:srt|ass|ssa|vtt|zip|rar)$/i, '');
    const named = parseMediaName(stem + '.srt');
    const markers = [
        ...stem.matchAll(
            /(?:^|[^a-z0-9])SE?(\d{1,2})(?:[ ._-]*E[ ._-]*|[ ._-]+(?:EP?[ ._-]*)?)(\d{1,3})(?!\d)/gi
        ),
        ...stem.matchAll(/(?:^|[^a-z0-9])(\d{1,2})x(\d{1,3})(?!\d)/gi),
    ];
    const numbering = stem.split(
        new RegExp(
            MEDIA_RESOLUTION_BOUNDARY +
                '|(?:^|[ ._\\[(-])(?:BluRay|BDRip|WEB[ ._-]?(?:DL|Rip)|REMUX|HDTV|x26[45]|h[ ._-]?26[45]|HEVC|AVC|DTS|AAC|AC3)(?=$|[ ._\\])&+-])',
            'i'
        )
    )[0];
    const numbered =
        stem.match(/第\s*(\d{1,3})\s*[集话話]/) ||
        stem.match(/(?:^|[ ._\[\]-])(?:EP?|Episode)[ ._-]*(\d{1,3})(?:v\d+)?(?=$|[ ._\]「『(])/i) ||
        stem.match(/\[(\d{1,3})(?:v\d+)?(?:[ ._-]+end)?\]/i) ||
        [...numbering.matchAll(/(?:^|[ ._-]+)(\d{1,3})(?:v\d+)?(?=$|[ ._\]「『(])/gi)].at(-1);
    const marker = markers[0];
    let season = marker ? Number(marker[1]) : named.season;
    const episode = marker ? Number(marker[2]) : numbered ? Number(numbered[1]) : named.episode;
    let title = marker ? stem.slice(0, marker.index) : numbered ? stem.slice(0, numbered.index) : '';
    const withoutGroup = title.replace(/^\s*\[[^\]]+\][ ._-]*/, '').trim();
    if (withoutGroup && !withoutGroup.startsWith('[')) title = withoutGroup;
    else if (title.includes('[')) title = named.query;
    title = title
        .replace(
            /(?:[ ._-]*(?:S\d{1,2}|Season[ ._-]*\d{1,2}|第\s*[零〇一二两三四五六七八九十\d]+\s*季))[ ._-]*$/i,
            ''
        )
        .replace(/^[ ._\[\]-]+|[ ._\[\]-]+$/g, '')
        .trim();
    const seriesTitle = mediaSeriesSearchTitle(title);
    if (seriesTitle?.season === season) title = seriesTitle.query;
    const aliases = new Set([parsed.query, ...(parsed.aliases || [])].filter(Boolean).map(subtitleTitleKey));
    const seasons = (parsed.seasons || []).filter((item) => item.season_number > 0);
    if (season == null && episode != null && parsed.workResolved && title) {
        const releaseTitle = subtitleTitleKey(subtitleReleaseChapter(parsed));
        const subtitleTitle = subtitleTitleKey(title);
        const titleSeasons = seasons.filter((item) =>
            subtitleSeasonTitles(parsed, item.season_number).some(
                (name) => subtitleTitleKey(name) === subtitleTitle
            )
        );
        if (titleSeasons.length === 1) season = titleSeasons[0].season_number;
        if (season == null && releaseTitle && releaseTitle === subtitleTitle) season = parsed.season;
        const suffix = title.match(/^(.*?)[ ._-]*(\d{1,2}|VIII|VII|VI|IV|IX|III|II|V|X|I)$/i);
        const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
        const number =
            suffix && (/^\d+$/.test(suffix[2]) ? Number(suffix[2]) : roman[suffix[2].toUpperCase()]);
        if (
            season == null &&
            !aliases.has(subtitleTitleKey(title)) &&
            suffix &&
            aliases.has(subtitleTitleKey(suffix[1])) &&
            seasons.some((item) => item.season_number === number)
        ) {
            season = number;
            title = suffix[1].trim();
        } else if (season == null) {
            const matches = seasons.filter((item) => {
                const label = subtitleTitleKey(item.name);
                if (!label || /^(?:season\d+|第[零〇一二两三四五六七八九十\d]+季)$/i.test(label))
                    return false;
                return aliases.has(subtitleTitleKey(title))
                    ? seasons.length === 1
                    : [...aliases].some((alias) => subtitleTitleKey(title) === alias + label);
            });
            if (matches.length === 1) season = matches[0].season_number;
            if (season == null && seasons.length === 1 && aliases.has(subtitleTitleKey(title)))
                season = seasons[0].season_number;
        }
    }
    const episodeAt = marker
        ? marker.index + marker[0].lastIndexOf(marker[2])
        : numbered
          ? numbered.index + numbered[0].indexOf(numbered[1])
          : -1;
    const pattern =
        episodeAt < 0
            ? stem
            : stem.slice(0, episodeAt) +
              '{episode}' +
              stem
                  .slice(episodeAt + (marker ? marker[2] : numbered[1]).length)
                  .replace(/「[^」]*」|『[^』]*』/g, '{episodeTitle}');
    return { stem, named, markers, season, episode, title, pattern };
}
function subtitleEpisodeRange(parsed) {
    if (!parsed || parsed.episode == null) return null;
    const start = Number(parsed.episode),
        end = Number(parsed.endEpisode ?? parsed.episode);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
    return { start, end };
}
function subtitleEpisodeIdentity(name, parsed, seasonContext = null) {
    const detail = subtitleEpisodeName(name, parsed);
    const { stem, named, markers, title, pattern } = detail;
    let season = detail.season ?? seasonContext,
        episode = detail.episode;
    const targetRange = subtitleEpisodeRange(parsed),
        candidateEndEpisode = named.endEpisode ?? episode,
        exactRange =
            !!targetRange && episode === targetRange.start && candidateEndEpisode === targetRange.end;
    const multiple =
        markers.some(
            (mark) =>
                Number(mark[1]) !== season ||
                Number(mark[2]) !== episode ||
                (!exactRange &&
                    /^(?:[ ._-]*E\d|[ ._-]*[-~][ ._-]*(?:EP?)?\d)/i.test(
                        stem.slice(mark.index + mark[0].length)
                    ))
        ) ||
        (!exactRange && /(?:^|[ ._\[(])\d{1,3}[ ._]*[-~][ ._]*(?:EP?)?\d{1,3}(?!\d)/i.test(stem)) ||
        (named.endEpisode != null && named.endEpisode !== episode && !exactRange);
    const seasonTags = mediaSeasonNumbers(stem);
    const result = (matched, conflict) => ({
        matched,
        conflict,
        season,
        episode,
        endEpisode: candidateEndEpisode,
        title,
        pattern,
    });
    if (
        multiple ||
        seasonTags.size > 1 ||
        [...seasonTags].some((number) => season != null && number !== season) ||
        (parsed.tv && parsed.season > 0 && named.standalone && !markers.length)
    )
        return result(false, true);
    if (season != null && parsed.season != null && season !== parsed.season) return result(false, true);
    if (episode == null) return result(false, false);
    const seasons = parsed.seasons || [];
    if (season == null) {
        // Absolute numbering needs every preceding season's verified episode count.
        const regular = seasons
            .filter((item) => item.season_number > 0)
            .sort((a, b) => a.season_number - b.season_number);
        const index = regular.findIndex((item) => item.season_number === parsed.season);
        const complete =
            index >= 0 &&
            regular
                .slice(0, index + 1)
                .every(
                    (item, position) =>
                        item.season_number === position + 1 &&
                        Number.isInteger(item.episode_count) &&
                        item.episode_count > 0
                );
        if (complete) {
            const offset = regular.slice(0, index).reduce((sum, item) => sum + item.episode_count, 0);
            if (episode <= offset || episode > offset + regular[index].episode_count)
                return result(false, false);
            season = parsed.season;
            episode -= offset;
        }
    } else {
        const mapped = mediaMapAbsoluteSeasonEpisode(seasons, season, episode);
        if (mapped) episode = mapped.episode;
    }
    const matched =
        parsed.tv &&
        parsed.season != null &&
        targetRange &&
        season === parsed.season &&
        episode === targetRange.start &&
        candidateEndEpisode === targetRange.end &&
        !multiple;
    return result(
        matched,
        (season != null &&
            parsed.season != null &&
            (season !== parsed.season || episode !== parsed.episode)) ||
            (!!targetRange && candidateEndEpisode !== targetRange.end)
    );
}
function exactSubtitleEpisode(name, parsed) {
    return subtitleEpisodeIdentity(name, parsed).matched;
}
function subtitleReleaseEpisodeMatch(node, parsed, name) {
    const targetRange = subtitleEpisodeRange(parsed);
    if (!parsed.tv || parsed.season == null || !targetRange) return false;
    for (const video of [node?.originalName, node?.name]) {
        if (!video || !/^\s*\[[^\]]+\]\s*\[[^\]]+\]\s*\[\d{1,3}(?:v\d+)?\]/i.test(video)) continue;
        if (mediaSubtitleSuffix(video, name) === null) continue;
        const source = parseMediaName(video);
        const sourceRange = subtitleEpisodeRange(source);
        if (
            source.query &&
            sourceRange?.start === targetRange.start &&
            sourceRange.end === targetRange.end &&
            (source.season == null || source.season === parsed.season) &&
            (!source.year || !parsed.year || source.year === String(parsed.year))
        )
            return true;
    }
    return false;
}
function subtitleCandidateUploadName(row, candidate, name, ext) {
    try {
        return subtitleUploadName(name, ext);
    } catch (error) {
        if (
            candidate.source !== '迅雷' ||
            !candidate.titleMatched ||
            candidate.hardMismatch ||
            candidate.opaque ||
            !row.parsed?.tv ||
            !exactSubtitleEpisode(candidate.embeddedVideoName || candidate.name, row.parsed) ||
            !['srt', 'ass', 'ssa', 'vtt'].includes(ext) ||
            candidate.ext !== ext
        )
            throw error;
        return subtitleUploadName(mediaStem(row.node.name) + '.' + ext, ext);
    }
}
function subtitleUploadName(name, ext) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('来源未提供字幕原名，待处理');
    if (
        name !== name.trim() ||
        name.length >= 256 ||
        /[\\\/:*?"<>|\x00-\x1f\x7f]/.test(name) ||
        /^\.+|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\s*\./i.test(name) ||
        !/\.(?:srt|ass|ssa|vtt)$/i.test(name) ||
        name.split('.').at(-1).toLowerCase() !== ext
    )
        throw new Error('字幕原名不可用或扩展名与正文格式不符，待处理');
    return name;
}
function createSubtitleBodyReviewer(ai, log = () => {}, check = () => {}) {
    let parseFailures = 0;
    return paced(0, async (row, text, ext, verify = check) => {
        const check = verify;
        check();
        const unknown = (reason) => ({ status: 'unconfirmed', reason });
        if (parseFailures >= 2) return unknown('本批 AI 正文复查已停用');
        const dialogue = subtitleDialogue(text, ext).trim();
        const starts = [
            0,
            Math.max(0, Math.floor(dialogue.length / 2) - 1000),
            Math.max(0, dialogue.length - 2000),
        ];
        const excerpts = [
            ...new Set(starts.map((start) => dialogue.slice(start, start + 2000)).filter(Boolean)),
        ];
        try {
            check();
            const result = await ai.reviewSubtitleBody({ work: row.parsed || {}, excerpts });
            check();
            const evidence = typeof result?.evidence === 'string' ? result.evidence.trim() : '';
            if (
                !result ||
                !['same', 'different', 'uncertain'].includes(result.verdict) ||
                typeof result.confidence !== 'number' ||
                !Number.isFinite(result.confidence) ||
                result.confidence < 0 ||
                result.confidence > 1 ||
                typeof result.reason !== 'string'
            )
                throw Object.assign(new Error('正文复查返回字段无效'), { aiParse: true });
            parseFailures = 0;
            if (
                result.verdict === 'uncertain' ||
                result.confidence < 0.95 ||
                evidence.length < 4 ||
                evidence.length > 160 ||
                !excerpts.some((excerpt) => excerpt.includes(evidence)) ||
                !result.reason.trim()
            )
                return unknown('正文证据不足，未确认作品归属');
            const work = {
                status: result.verdict === 'same' ? 'supported' : 'mismatch',
                reason: result.reason.slice(0, 200),
            };
            log(
                'AI 正文复查',
                `${row.node.name} · ${work.status === 'mismatch' ? '疑似其他作品，暂停自动补齐' : '支持作品归属，但不代表音画同步'} · ${work.reason}`
            );
            return work;
        } catch (error) {
            check();
            if (error.stop) throw error;
            if (error.aiParse && ++parseFailures >= 2)
                log('AI 正文复查', '连续两次解析失败，本批剩余正文复查停用');
            log('AI 正文复查失败', `${row.node.name} · ${error.message}`);
            return unknown('AI 复查未完成');
        }
    });
}
function subtitleLanguageMatch(name, wanted) {
    const info = subtitleFileInfo(name);
    return wanted
        .split(',')
        .some((language) =>
            language === 'en'
                ? info.language === 'en' || info.bilingual
                : language === 'zh'
                  ? info.language.startsWith('zh')
                  : info.language === language
        );
}
function selectSubtitleCandidate(row, language) {
    const tokens = (value) =>
        new Set(
            (
                String(value)
                    .toLowerCase()
                    .match(/2160p|1080p|720p|bluray|bdrip|webrip|web[ ._-]?dl|remux|hdtv|x26[45]/g) || []
            ).map((v) => v.replace(/[ ._-]/g, ''))
        );
    const original = tokens(row.node.originalName || row.node.name),
        wanted = language.split(',');
    const scored = (row.candidates || [])
        .map((candidate) => {
            const version = tokens(candidate.release + ' ' + candidate.name);
            const editionMismatch =
                row.parsed && subtitleNetworkEditionMismatch(row.parsed, [candidate.name, candidate.release]);
            const overlaps = [...original].filter((token) => version.has(token)).length;
            const lang =
                wanted.includes(candidate.language) ||
                wanted.some((value) => subtitleLanguageMatch(candidate.name, value));
            const identity = candidate.identityMatched || candidate.titleMatched || candidate.aiAccepted;
            const reliable =
                !candidate.downloadFailed &&
                !candidate.hardMismatch &&
                !!identity &&
                lang &&
                !editionMismatch;
            const preference = wanted.indexOf(candidate.language);
            return {
                candidate,
                reliable,
                preference: subtitlePreference(candidate, language),
                score:
                    (candidate.identityMatched ? 100 : 0) +
                    (candidate.titleMatched ? 50 : 0) +
                    (candidate.seasonPackVerified ? 20 : 0) +
                    overlaps * 10 +
                    (lang ? 5 : 0) +
                    (preference < 0 ? 0 : (wanted.length - preference) / 10),
            };
        })
        .sort(
            (a, b) =>
                Number(!!a.candidate.opaque) - Number(!!b.candidate.opaque) ||
                Number(b.reliable) - Number(a.reliable) ||
                b.preference - a.preference ||
                b.score - a.score
        );
    row.candidates = scored.map((item) => item.candidate);
    row.autoCandidates = scored.filter((item) => item.reliable).map((item) => item.candidate);
    row.selectedCandidate = row.autoCandidates[0] || null;
    row.aiSuggested = !!row.selectedCandidate?.aiAccepted;
}
function subtitleCovered(row) {
    return row.complete || row.embedded?.chinese;
}
function subtitleCoverageState(row) {
    if (subtitleCovered(row)) return 'complete';
    return row.writeBlocked || row.coverageUnconfirmed || row.embedded?.unconfirmed
        ? 'unconfirmed'
        : 'missing';
}
function subtitleCanSupplement(row) {
    return !subtitleCovered(row) && !row.writeBlocked && !row.identityRecheck;
}
function subtitleCheckIncomplete(row) {
    return !!(
        row.writeBlocked ||
        row.coverageUnconfirmed ||
        (row.embedded?.unconfirmed && !row.embedded.metadataUnconfirmed && !row.embedded.unsupported)
    );
}
const subtitleSearchLabels = {
    unsearched: '尚未查找',
    ready: '待补齐',
    choice: '手动选择',
    notFound: '已查询来源未找到匹配项',
    unconfirmed: '候选无法确认，请导入字幕',
    failed: '查询失败',
};
function subtitleSearchState(row) {
    if (row.selectedCandidate && !row.selectedCandidate.downloadFailed && !row.selectedCandidate.opaque)
        return 'ready';
    if (row.candidates?.some((candidate) => !candidate.downloadFailed && !candidate.opaque)) return 'choice';
    if (row.candidates?.some((candidate) => !candidate.downloadFailed && candidate.opaque))
        return 'unconfirmed';
    const sources = row.sources || [];
    if (
        sources.some(
            (source) =>
                source.error ||
                source.paused ||
                (source.cacheError && source.count == null) ||
                source.queries?.some((query) => query.error) ||
                source.downloadErrors?.length
        )
    )
        return 'failed';
    return sources.some((source) => source.count != null) ? 'notFound' : 'unsearched';
}
function subtitleDiagnosticText(value, { key, assrtKey, password } = {}) {
    let message = String(value ?? '').replace(/https?:\/\/[^\s"'<>]+/gi, (value) => {
        try {
            return new URL(value).origin + '/[地址已隐藏]';
        } catch {
            return '[地址已隐藏]';
        }
    });
    for (const secret of [key, assrtKey, password])
        if (secret) {
            message = message.split(secret).join('[凭证已隐藏]');
            message = message.split(encodeURIComponent(secret)).join('[凭证已隐藏]');
        }
    return message
        .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
        .replace(
            /\b((?:security[-_ ]?)?token|api[-_ ]?key|authorization|signature)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi,
            '$1=[已隐藏]'
        );
}
function saveSubtitleSourceReport(source, config, report) {
    const { queries, downloadErrors, deferredTerms, ...counts } = report;
    Object.assign(source, counts);
    if (deferredTerms)
        source.deferredTerms = deferredTerms.map((term) => subtitleDiagnosticText(term, config));
    if (queries)
        source.queries = queries.map(({ term, rawCount, error }) => ({
            term: subtitleDiagnosticText(term, config),
            rawCount,
            ...(error ? { error: subtitleDiagnosticText(error, config) } : {}),
        }));
    if (downloadErrors?.length)
        (source.downloadErrors ||= []).push(
            ...downloadErrors.map((error) => subtitleDiagnosticText(error, config))
        );
}
function subtitleSourceSummary(source) {
    const exclusions = Object.entries(source.excluded || {})
        .filter(([, count]) => count)
        .map(([reason, count]) => `${reason} ${count}`);
    return [
        source.skipped,
        source.paused && '本批暂停：' + source.paused,
        source.cacheError && '整季缓存：' + source.cacheError,
        source.deferredTerms?.length && `暂缓 ${source.deferredTerms.length} 个搜索词`,
        source.rawCount != null ? `返回 ${source.rawCount} ${source.unit}` : '',
        source.count != null ? `保留 ${source.count} 个候选` : '',
        exclusions.length ? '排除 ' + exclusions.join('、') : '',
        source.rejected ? `AI 排除 ${source.rejected} 个候选` : '',
        source.error && '查询失败：' + source.error,
        ...(source.queries || [])
            .filter((query) => query.error)
            .map((query) => `搜索词「${query.term}」失败：${query.error}`),
        ...(source.downloadErrors || []).map((error) => '下载失败：' + error),
    ]
        .filter(Boolean)
        .join(' · ');
}
function subtitleAICandidate(result, row, language, onReject = () => {}) {
    const deny = (reason) => {
        onReject(reason);
        return null;
    };
    if (
        !Number.isInteger(result?.index) ||
        !Number.isFinite(result.confidence) ||
        result.confidence < 0.9 ||
        result.confidence > 1
    )
        return deny('未指定候选或置信度不足 90%');
    const candidate = row.candidates?.[result.index];
    if (!candidate) return deny('候选编号不在列表中');
    if (candidate.hardMismatch || candidate.downloadFailed) return deny('候选已有冲突或下载失败');
    if (candidate.mainTitleFallback || candidate.opaque)
        return deny('仅主名搜索或来源文件名不含可识别片名，需要手动确认');
    const parsed = row.parsed,
        identity = candidate.workIdentity,
        targetRange = subtitleEpisodeRange(parsed);
    const match = subtitleWorkIdentity(parsed, [candidate.release], candidate.name || '');
    if (match.hardMismatch) return deny(match.matchReason || '作品信息冲突');
    if (subtitleNetworkEditionMismatch(parsed, [candidate.name, candidate.release]))
        return deny('网络版不能作为电影版字幕');
    if (identity) {
        if (
            !!identity.tv !== !!parsed.tv ||
            (parsed.tmdbId && identity.tmdbId && String(parsed.tmdbId) !== String(identity.tmdbId))
        )
            return deny('类型或 TMDB 编号冲突');
        if (!parsed.tv && parsed.year && identity.year && String(parsed.year) !== String(identity.year))
            return deny('年份冲突');
    }
    const episodes = [candidate.name, candidate.release]
        .filter(Boolean)
        .map((name) => subtitleEpisodeIdentity(name, parsed));
    if (parsed.tv) {
        if (parsed.season == null || !targetRange) return deny('目标季集不完整');
        if (
            identity &&
            (Number(identity.season) !== parsed.season ||
                ![targetRange.start, targetRange.end].includes(Number(identity.episode)))
        )
            return deny('接口季集冲突');
        if (
            (!episodes.some((episode) => episode.matched) && !identity) ||
            episodes.some((episode) => episode.conflict)
        )
            return deny('字幕缺少准确季集或季集冲突');
        const sameWorkId =
            parsed.tmdbId && identity?.tmdbId && String(parsed.tmdbId) === String(identity.tmdbId);
        if (
            !sameWorkId &&
            !match.titleMatched &&
            !subtitleWorkIdentity(parsed, [], candidate.release).titleMatched
        )
            return deny('季集号相同，但缺少可核对的作品名称或编号');
    } else if (episodes.some((episode) => episode.season != null && episode.episode != null))
        return deny('电影候选含剧集季集编号');
    const wanted = language.split(',');
    const languageMatch =
        wanted.includes(candidate.language) ||
        (candidate.bilingual && wanted.some((value) => value.startsWith('zh'))) ||
        wanted.some((value) => subtitleLanguageMatch(candidate.name || '', value));
    if (!languageMatch) return deny('字幕语言未确认或不符合所选语言');
    return candidate;
}
function createSubtitleReviewer(ai, language, log = () => {}, check = () => {}) {
    let parseFailures = 0,
        disabled = false;
    const decisions = new Map(),
        pending = new Map();
    const familyKey = (row, candidate) => {
        const parsed = row.parsed;
        const pattern = (name) => (parsed.tv ? subtitleEpisodeIdentity(name, parsed).pattern : name);
        return JSON.stringify([
            parsed.tmdbId || '',
            titleKey(parsed.query),
            parsed.year || '',
            !!parsed.tv,
            parsed.season,
            parsed.aliases || [],
            language,
            candidate.source,
            pattern(candidate.name),
            pattern(candidate.release),
            candidate.ext,
            candidate.language,
            !!candidate.bilingual,
            candidate.workIdentity || null,
        ]);
    };
    const applyDecisions = (row, found) => {
        let reused = 0;
        const rejected = new Set();
        for (const candidate of found) {
            const decision = decisions.get(familyKey(row, candidate));
            if (!decision || candidate.titleMatched || candidate.identityMatched || candidate.aiAccepted)
                continue;
            if (decision.state === 'rejected') {
                rejected.add(candidate);
                log('AI 排除候选', `${row.node.name} · ${candidate.name} · ${decision.reason}`);
            } else if (decision.state === 'accepted') {
                const accepted = subtitleAICandidate(
                    { index: row.candidates.indexOf(candidate), confidence: decision.confidence },
                    row,
                    language,
                    (reason) => {
                        candidate.matchReason = reason;
                        log('AI 建议未采用', `${row.node.name} · ${candidate.name} · ${reason}`);
                    }
                );
                if (accepted) {
                    accepted.aiAccepted = true;
                    accepted.matchReason = '';
                    reused++;
                }
            }
        }
        row.candidates = row.candidates.filter((candidate) => !rejected.has(candidate));
        selectSubtitleCandidate(row, language);
        return reused;
    };
    return async (row, found, verify = check) => {
        verify();
        const cached = applyDecisions(row, found);
        if (row.selectedCandidate) {
            if (cached)
                log(
                    'AI 命名复用',
                    `${row.node.name} · 同作品、同季、同命名格式 · ${cached} 份候选通过逐集核验`
                );
            return;
        }
        if (disabled) return;
        const candidates = new Map();
        for (const candidate of found) {
            if (
                candidate.opaque ||
                candidate.hardMismatch ||
                candidate.detailError ||
                candidate.mainTitleFallback ||
                candidate.downloadFailed
            )
                continue;
            if (
                row.parsed.tv &&
                !subtitleAICandidate(
                    { index: row.candidates.indexOf(candidate), confidence: 1 },
                    row,
                    language,
                    (reason) => {
                        candidate.matchReason = reason;
                    }
                )
            )
                continue;
            candidates.set(familyKey(row, candidate), candidate);
        }
        const fresh = [...candidates].filter(([key]) => !decisions.has(key) && !pending.has(key));
        const tasks = new Set([...candidates.keys()].map((key) => pending.get(key)).filter(Boolean));
        for (let offset = 0; offset < fresh.length; offset += 20) {
            const batch = fresh.slice(offset, offset + 20);
            const task = Promise.resolve()
                .then(async () => {
                    verify();
                    if (disabled) return;
                    log(
                        'AI 候选判断',
                        `${row.node.name} · 合并 ${batch.length} 种命名格式，后续同季集数复用`
                    );
                    try {
                        const samples = batch.map(([, candidate], index) => {
                            const episode = subtitleEpisodeIdentity(candidate.name, row.parsed);
                            return {
                                index,
                                source: candidate.source,
                                name: String(candidate.name || '').slice(0, 300),
                                release:
                                    candidate.release === candidate.name
                                        ? undefined
                                        : String(candidate.release || '').slice(0, 200),
                                language: candidate.language,
                                bilingual: !!candidate.bilingual,
                                season: episode.season,
                                episode: episode.episode,
                            };
                        });
                        const result = await ai.disambiguateSubtitle({
                            work: {
                                title: row.parsed.query,
                                aliases: row.parsed.aliases || [],
                                year: row.parsed.year || '',
                                tv: !!row.parsed.tv,
                                season: row.parsed.season,
                                episode: row.parsed.episode,
                                tmdbId: row.parsed.tmdbId || '',
                            },
                            candidates: samples,
                        });
                        verify();
                        parseFailures = 0;
                        for (const [key] of batch) decisions.set(key, { state: 'unknown' });
                        if (
                            Number.isInteger(result?.index) &&
                            batch[result.index] &&
                            Number.isFinite(result.confidence) &&
                            result.confidence >= 0.9 &&
                            result.confidence <= 1
                        ) {
                            const [key] = batch[result.index];
                            decisions.set(key, { state: 'accepted', confidence: result.confidence });
                        }
                        log(
                            'AI 判断依据',
                            `${row.node.name} · index=${result?.index ?? '无'} · confidence=${result?.confidence ?? '无'} · ${String(result?.reason || '未提供依据').slice(0, 300)}`
                        );
                        for (const item of Array.isArray(result?.rejected) ? result.rejected : []) {
                            if (
                                !Number.isInteger(item?.index) ||
                                item.index === result.index ||
                                !batch[item.index] ||
                                !Number.isFinite(item.confidence) ||
                                item.confidence < 0.9 ||
                                item.confidence > 1 ||
                                typeof item.reason !== 'string' ||
                                !item.reason.trim()
                            )
                                continue;
                            const [key, excluded] = batch[item.index];
                            if (excluded.identityMatched || excluded.titleMatched || excluded.aiAccepted)
                                continue;
                            decisions.set(key, { state: 'rejected', reason: item.reason.slice(0, 200) });
                        }
                    } catch (error) {
                        verify();
                        if (error.stop) throw error;
                        for (const [key] of batch) decisions.set(key, { state: 'unknown' });
                        log('AI 字幕建议', `${row.node.name} · 判断失败：${error.message}；继续其他来源`);
                        parseFailures = error.aiParse ? parseFailures + 1 : 0;
                        if (parseFailures >= 2) {
                            disabled = true;
                            log('AI 字幕建议', '连续两次解析失败，本批剩余 AI 判断已停用');
                        }
                    }
                })
                .finally(() => {
                    for (const [key] of batch) pending.delete(key);
                });
            for (const [key] of batch) pending.set(key, task);
            tasks.add(task);
        }
        const outcomes = await Promise.allSettled(tasks);
        const failure = outcomes.find((outcome) => outcome.status === 'rejected');
        if (failure) throw failure.reason;
        verify();
        const accepted = applyDecisions(row, found);
        if (accepted) log('AI 字幕建议', `${row.node.name} · ${accepted} 份候选通过作品与季集复核`);
    };
}
function subtitleSearchMessage(row) {
    const message = row.selectedCandidate
        ? row.aiSuggested
            ? 'AI 建议了这份字幕，请核对候选名称后补齐。'
            : `已自动择优，${row.autoCandidates.length} 个可靠候选；点击“补齐字幕”下载并写入视频目录，下载内容不符时尝试下一份。`
        : row.candidates?.length
          ? '找到候选，但作品或语言未确认，需手动选择。'
          : subtitleSearchState(row) === 'failed'
            ? '查询有失败，请查看各来源结果。'
            : subtitleSearchState(row) === 'notFound'
              ? '已查询来源未找到匹配项。'
              : '尚未查询任何来源。';
    return [
        message,
        row.selectedCandidate && '所选字幕：' + subtitleCandidateLabel(row.selectedCandidate),
        ...(row.sources || []).map((source) => source.name + '：' + subtitleSourceSummary(source)),
    ]
        .filter(Boolean)
        .join('\n');
}
async function searchSubtitleSources(row, config, service, log = () => {}, check = () => {}, resume = false) {
    if (!resume) {
        row.error = '';
        row.candidates = [];
        row.selectedCandidate = null;
        row.aiSuggested = false;
        row.sources = [];
        row.seasonCacheHit = false;
    }
    const title = subtitleQueryTitle(row.parsed.query, row.parsed.year);
    const languageChecked = new Set();
    const verifyCandidateLanguage = async (selection) => {
        if (
            selection.selectedCandidate ||
            !selection.parsed.tv ||
            (config.language !== 'en' && !config.language.split(',').includes('zh'))
        )
            return;
        for (const candidate of selection.candidates) {
            if (
                !(candidate.titleMatched || candidate.identityMatched || candidate.aiAccepted) ||
                candidate.hardMismatch ||
                candidate.opaque ||
                candidate.downloadFailed ||
                isSubtitleArchive(candidate.ext) ||
                !exactSubtitleEpisode(candidate.embeddedVideoName || candidate.name, selection.parsed)
            )
                continue;
            const key = JSON.stringify([candidate.source, candidate.url || candidate.fileId]);
            if (languageChecked.has(key)) continue;
            languageChecked.add(key);
            check();
            log(
                '候选语言核验',
                `${row.node.name} · ${candidate.name} · 来源标注 ${candidate.language || '未知'}，读取正文核验`
            );
            try {
                const { result, bytes } = await service.fetchFile(
                    candidate,
                    config,
                    (phase, message) => log(phase, `${row.node.name} · ${message}`),
                    check
                );
                check();
                subtitleValidateContent(selection, bytes, result.ext, config.language, (phase, message) =>
                    log(phase, `${row.node.name} · ${message}`)
                );
                subtitleCandidateUploadName(
                    selection,
                    candidate,
                    result.fileName ?? candidate.name,
                    result.ext
                );
                candidate.language = config.language === 'en' ? 'en' : 'zh';
                candidate.matchReason = '';
                selectSubtitleCandidate(selection, config.language);
                log(
                    '候选语言通过',
                    `${row.node.name} · ${candidate.name} · 正文格式、对白语言与时长检查通过`
                );
                if (selection.selectedCandidate) return;
            } catch (error) {
                check();
                if (error.stop || error.phase === 'drive-auth') throw error;
                candidate.matchReason = subtitleDiagnosticText(error.message, config);
                log('候选语言未通过', `${row.node.name} · ${candidate.name} · ${candidate.matchReason}`);
                if (error.downloadPaused || subtitleSourcePaused(error)) break;
            }
        }
    };
    if (!resume && row.parsed.tv) {
        for (const [name, enabled, method] of [
            ['迅雷', config.thunder, 'thunderCachedEpisode'],
            ['射手网', config.assrtKey, 'assrtCachedEpisode'],
        ]) {
            if (!enabled || !service[method] || service.searchUnavailable?.(name)) continue;
            check();
            const source = { name };
            let cached;
            try {
                cached = await service[method](
                    row,
                    config,
                    (message) => log(name + ' 缓存文件列表', message),
                    check,
                    (report) => saveSubtitleSourceReport(source, config, report)
                );
                check();
            } catch (error) {
                check();
                if (!isSubtitleSourceError(error)) throw error;
                const reason = subtitleDiagnosticText(error.message, config);
                row.sources.push({ ...source, cacheError: reason });
                if (subtitleSourcePaused(error)) service.pauseSearchSource?.(name, reason);
                log('整季缓存失败', row.node.name + ' · ' + name + ' · ' + reason);
                continue;
            }
            if (!Array.isArray(cached)) throw new TypeError('整季缓存未返回候选列表：' + name);
            const selection = { node: row.node, parsed: row.parsed, candidates: cached };
            selectSubtitleCandidate(selection, config.language);
            await verifyCandidateLanguage(selection);
            if (!selection.selectedCandidate && cached.length && config.reviewCandidates)
                await config.reviewCandidates(selection, cached, check);
            check();
            if (!selection.selectedCandidate) continue;
            row.candidates.push(...selection.candidates);
            row.seasonCacheHit = true;
            source.count = selection.candidates.length;
            row.sources.push(source);
            selectSubtitleCandidate(row, config.language);
            const assrtBackup =
                name !== '射手网' && config.assrtKey && !service.searchUnavailable?.('射手网')
                    ? service.assrtCachedEpisode?.(row)
                    : null;
            if (assrtBackup?.length) {
                row.sources.push({
                    name: '射手网',
                    deferred: true,
                    cachedCandidates: assrtBackup,
                    skipped: '已匹配整季包，保留为下载备选',
                });
                log('整季备选', row.node.name + ' · 射手网已匹配本集，首选字幕失败后自动尝试');
            }
            log(
                '整季快速命中',
                `${row.node.name} · ${name} · 复查缓存中的片名、年份及准确季集后选中；跳过本集视频取样与来源搜索，下载后仍检查正文`
            );
            break;
        }
    }
    if (!resume && !row.selectedCandidate)
        log('查找阶段', `${row.node.name} · 使用片名及作品别名搜索字幕来源`);
    const run = async (name, enabled, configured, search) => {
        check();
        if (!resume && row.sources.some((source) => source.name === name && source.count != null)) return;
        let previous = row.sources.find((source) => source.name === name && source.cacheError);
        if (resume) {
            previous = row.sources.find(
                (source) => source.name === name && (source.deferred || source.deferredTerms?.length)
            );
            if (!previous) return;
            selectSubtitleCandidate(row, config.language);
            if (row.selectedCandidate) return;
            previous.deferred = false;
            previous.deferredTerms = [];
        }
        const mark = (state) => {
            if (previous) Object.assign(previous, state);
            else row.sources.push({ name, ...state });
        };
        if (!enabled) {
            mark({ skipped: '已关闭' });
            log('来源跳过', `${name} 已关闭`);
            return;
        }
        if (!configured) {
            mark({ skipped: '未配置密钥，未查询' });
            log('来源跳过', `${name} 未配置密钥`);
            return;
        }
        const unavailable = service.searchUnavailable?.(name);
        if (unavailable) {
            mark({ paused: subtitleDiagnosticText(unavailable, config) });
            log('来源跳过', `${name} 本批已暂停：${unavailable}`);
            return;
        }
        selectSubtitleCandidate(row, config.language);
        const selected = row.selectedCandidate;
        if (selected) {
            const reason = '已有可靠字幕，省去重复查询';
            mark({ skipped: reason, deferred: true });
            log('来源跳过', `${name}：${reason}`);
            return;
        }
        const started = Date.now();
        let fetchedAt = 0;
        const source = previous || { name };
        delete source.skipped;
        if (!previous) row.sources.push(source);
        const earlier = { ...source };
        try {
            log('来源', `${name} 开始，搜索片名：${title}`);
            const found = await search((report) => {
                saveSubtitleSourceReport(source, config, report);
                if (report.queries && earlier.queries)
                    source.queries = [...earlier.queries, ...source.queries];
                if ('rawCount' in report && earlier.rawCount != null && earlier.unit === source.unit)
                    source.rawCount = (source.rawCount ?? 0) + earlier.rawCount;
                if (report.excluded && earlier.excluded)
                    for (const [reason, count] of Object.entries(earlier.excluded))
                        source.excluded[reason] = (source.excluded[reason] || 0) + count;
            }, source);
            check();
            if (!Array.isArray(found)) throw new TypeError('字幕来源未返回候选列表');
            fetchedAt = Date.now();
            const known = new Set(
                row.candidates
                    .filter((candidate) => candidate.source === name)
                    .map((candidate) => candidate.url || candidate.fileId || candidate.name)
            );
            const fresh = found.filter(
                (candidate) => !known.has(candidate.url || candidate.fileId || candidate.name)
            );
            source.count = (earlier.count || 0) + fresh.length;
            row.candidates.push(...fresh);
            log('来源', `${name} 返回 ${found.length} 个文件候选`);
            selectSubtitleCandidate(row, config.language);
            await verifyCandidateLanguage(row);
            if (!row.selectedCandidate && config.reviewCandidates)
                await config.reviewCandidates(row, fresh, check);
            const kept = fresh.filter((candidate) => row.candidates.includes(candidate)).length;
            source.count = (earlier.count || 0) + kept;
            source.rejected = (earlier.rejected || 0) + fresh.length - kept;
            if (found.length > fresh.length)
                (source.excluded ||= {}).重复 = (source.excluded.重复 || 0) + found.length - fresh.length;
            log(
                '来源判断',
                `${row.node.name} · ${name} · 返回 ${found.length}，AI 排除 ${source.rejected}，保留 ${source.count} · ${row.selectedCandidate ? '产生可靠候选，后续来源暂缓' : source.count ? '只有待确认候选，继续下一来源' : '没有可用候选，继续下一来源'}`
            );
        } catch (error) {
            check();
            source.error = subtitleDiagnosticText(error.message, config);
            const expected = isSubtitleSourceError(error);
            if (expected && subtitleSourcePaused(error)) service.pauseSearchSource?.(name, source.error);
            log(
                error.phase === 'drive-auth' ? '网盘授权失败' : expected ? '来源失败' : '来源处理异常',
                `${row.node.name} · ${name}：${error.message}`
            );
            if (!expected) {
                row.error = source.error;
                row.searchMessage = subtitleSearchMessage(row);
                throw error;
            }
        } finally {
            const paused = service.searchUnavailable?.(name);
            if (paused) source.paused = subtitleDiagnosticText(paused, config);
            for (const query of source.queries || [])
                log(
                    '来源查询记录',
                    `${name} · ${query.term}${query.rawCount != null ? ` · 原始 ${query.rawCount} 条` : ''}${query.error ? ' · ' + query.error : ''}`
                );
            const detail = subtitleSourceSummary(source);
            if (detail) log('来源结果', `${row.node.name} · ${name} · ${detail}`);
            log(
                '来源耗时',
                `${row.node.name} · ${name} · 查询 ${(((fetchedAt || Date.now()) - started) / 1000).toFixed(1)} 秒${fetchedAt ? '，候选判断 ' + ((Date.now() - fetchedAt) / 1000).toFixed(1) + ' 秒' : ''}`
            );
        }
    };
    if (resume)
        await run('射手网', !!config.assrtKey, true, (_report, source) => {
            const candidates = source.cachedCandidates || [];
            delete source.cachedCandidates;
            return candidates;
        });
    if (!row.selectedCandidate) log('查找阶段', `${row.node.name} · 迅雷片名搜索`);
    await run('迅雷', config.thunder, true, (report, source) =>
        service.thunderSearch(
            row,
            { ...config, thunderOffset: source.thunderOffset },
            (message) => log('迅雷 文件列表', message),
            check,
            report
        )
    );
    await run('OpenSubtitles', config.open, config.key, (report) => service.search(row, config, report));
    check();
    selectSubtitleCandidate(row, config.language);
    row.searchMessage = subtitleSearchMessage(row);
}
function subtitleVerificationContext(row) {
    if (!row) return '';
    const node = row.node,
        parsed = row.parsed || {};
    return JSON.stringify([
        4,
        String(node.id),
        String(node.parentId ?? ''),
        node.name,
        node.size,
        (node.md5 || '').toLowerCase(),
        parsed.query,
        parsed.year,
        !!parsed.tv,
        parsed.tmdbId,
        parsed.season,
        parsed.episode,
        parsed.endEpisode,
        node.durationSeconds,
        parsed.runtimeSeconds,
        !!parsed.standalone,
    ]);
}
async function inspectExistingSubtitles(
    row,
    drive,
    language,
    log = () => {},
    check = () => {},
    { force = false, review = null, observe = () => {} } = {}
) {
    row.complete = false;
    row.verification = null;
    row.verifiedSubtitle = null;
    row.verifiedSubtitleCandidate = null;
    row.identityClues = [];
    row.coverageUnconfirmed = false;
    const rejected = [];
    for (const sub of row.subtitles.filter((sub) => /\.(srt|ass|ssa|vtt)$/i.test(sub.name))) {
        check();
        drive.assertReady?.();
        if (force) drive.verified?.forget(sub);
        const cached = !force && drive.verified?.get(sub, language, row);
        if (cached) {
            if (cached.result.work?.status === 'mismatch') {
                rejected.push(sub.name + '：疑似其他作品 · ' + cached.result.work.reason);
                log(
                    '现有字幕无效',
                    `${row.node.name} · ${sub.name} · 已记录疑似错片：${cached.result.work.reason}`
                );
                continue;
            }
            row.verification = cached.result;
            row.verifiedSubtitle = sub;
            row.complete = true;
            row.error = '';
            row.searchMessage =
                '已核验记录复用：' + sub.name + ' · ' + subtitleVerificationMessage(cached.result);
            log(
                '已核验记录复用',
                `${row.node.name} · ${sub.name} · ${subtitleVerificationMessage(cached.result)}`
            );
            return;
        }
        log('正文检查', `${row.node.name} · 读取现有字幕 ${sub.name}`);
        let bytes;
        try {
            bytes = await drive.read(sub, (message) => log('核验重试', message), check);
            check();
        } catch (error) {
            observe(error);
            check();
            if (error.stop) throw error;
            row.coverageUnconfirmed = true;
            rejected.push(sub.name + '：读取失败 · ' + error.message);
            log('现有字幕读取失败', `${sub.name}：${error.message}`);
            continue;
        }
        try {
            const ext = sub.name.split('.').pop().toLowerCase();
            const { text, ...result } = subtitleValidateContent(row, bytes, ext, language, log);
            if (
                language !== 'zh-cn,zh-tw,zh' &&
                language !== 'en' &&
                sub.language !== language &&
                !subtitleLanguageMatch(sub.name, language)
            ) {
                rejected.push(sub.name + '：正文含中文，但所选简繁标记未确认');
                continue;
            }
            if (review) result.work = await review(row, text, ext, check);
            check();
            try {
                drive.verified?.remember(sub, bytes, language, result.encoding, row, result);
            } catch (error) {
                log('核验记录', '保存失败：' + error.message);
            }
            if (result.work.status === 'mismatch') {
                rejected.push(sub.name + '：疑似其他作品 · ' + result.work.reason);
                continue;
            }
            row.verification = result;
            row.verifiedSubtitle = sub;
            row.complete = true;
            row.error = '';
            row.searchMessage = '已有字幕：' + sub.name + ' · ' + subtitleVerificationMessage(result);
            log('现有字幕确认', `${row.node.name} · ${sub.name} · ${subtitleVerificationMessage(result)}`);
            return;
        } catch (error) {
            check();
            if (error.stop) throw error;
            drive.verified?.forget(sub);
            if (error.timingUnconfirmed) {
                row.coverageUnconfirmed = true;
                if (
                    !review &&
                    error.identityClueAllowed &&
                    !row.parsed?.workResolved &&
                    !row.node.durationSeconds &&
                    !/^[a-f0-9]{40}\.(?:srt|ass|ssa|vtt)$/i.test(sub.name) &&
                    (language === 'en' ||
                        language === 'zh-cn,zh-tw,zh' ||
                        sub.language === language ||
                        subtitleLanguageMatch(sub.name, language))
                ) {
                    try {
                        subtitleValidateContent(
                            { ...row, parsed: {} },
                            bytes,
                            sub.name.split('.').pop().toLowerCase(),
                            language
                        );
                        row.identityClues.push(sub);
                    } catch {}
                }
            }
            rejected.push(sub.name + '：' + error.message);
            log('现有字幕无效', `${sub.name}：${error.message}`);
        }
    }
    row.error = '';
    row.searchMessage = rejected.length ? '已有字幕未通过检查：' + rejected.join('；') : '未发现可用外置字幕';
}
function mkvChineseSubtitle(tag, name) {
    // Muxers sometimes leave a default language on a clearly labelled Chinese track.
    const chineseLabel =
        /中文|汉语|漢語|中英|[简簡繁][体體中英]|\b(?:chinese|mandarin|cantonese|chs|cht|zh(?:[-_](?:cn|tw|hk|hans|hant))?)\b/i;
    if (chineseLabel.test(name || '')) return true;
    const normalized = String(tag || '')
        .trim()
        .replace(/_/g, '-');
    if (/^(?:zh|chi|zho|cmn|yue|nan|hak|wuu|gan|hsn|lzh|chs|cht)(?:-|$)/i.test(normalized)) return true;
    if (!normalized) return null;
    try {
        const { language } = new Intl.Locale(normalized);
        if (!language || ['und', 'mul', 'zxx'].includes(language)) return null;
        return language === 'zh' || language === 'yue';
    } catch {
        return null;
    }
}
function mkvSubtitleTrackSummary(tracks) {
    const clean = (text) =>
        String(text || '未标注')
            .replace(/[\r\n\t]+/g, ' ')
            .slice(0, 100);
    const labels = tracks.map((track, index) => {
        return `${index + 1}）语言=${clean(track.language)}，BCP47=${clean(track.languageBCP47)}，名称=${clean(track.name)}${track.enabled ? '' : '，轨道已禁用'}`;
    });
    return '字幕轨 ' + tracks.length + (labels.length ? ' · ' + labels.join('；') : '');
}
async function inspectMkvSubtitleTracks(size, readRange, check = () => {}, report = () => {}) {
    if (!Number.isSafeInteger(size) || size < 1) throw new Error('视频大小未知，无法安全分段读取');
    const windowSize = 4 * 1024,
        maxWindows = 128,
        windows = new Map();
    const read = async (offset, length) => {
        if (
            !Number.isSafeInteger(offset) ||
            offset < 0 ||
            !Number.isSafeInteger(length) ||
            length < 0 ||
            !Number.isSafeInteger(offset + length) ||
            offset + length > size
        )
            throw new Error('MKV 元素超出文件范围');
        const result = new Uint8Array(length);
        for (let written = 0; written < length;) {
            check();
            const position = offset + written,
                start = Math.floor(position / windowSize) * windowSize;
            if (!windows.has(start)) {
                if (windows.size >= maxWindows) throw new Error('达到 512 KiB 分段读取上限');
                let end = Math.min(
                    Math.ceil((offset + length) / windowSize) * windowSize,
                    start + (maxWindows - windows.size) * windowSize,
                    size
                );
                for (let next = start + windowSize; next < end; next += windowSize) {
                    if (windows.has(next)) {
                        end = next;
                        break;
                    }
                }
                const bytes = await readRange(start, end - 1);
                check();
                if (bytes.length !== end - start) throw new Error('MKV 片段长度不正确');
                for (let next = start; next < end; next += windowSize)
                    windows.set(next, bytes.subarray(next - start, next - start + windowSize));
            }
            const chunk = windows.get(start).subarray(position - start, position - start + length - written);
            result.set(chunk, written);
            written += chunk.length;
        }
        return result;
    };
    const header = (bytes, start, limit) => {
        let cursor = 0;
        const vint = (identifier, max) => {
            const first = bytes[cursor];
            if (!first) throw new Error('MKV 元素头无效或不完整');
            let width = 1,
                marker = 128;
            while (!(first & marker)) {
                width++;
                marker >>= 1;
            }
            if (width > max || cursor + width > bytes.length) throw new Error('MKV 元素头无效或不完整');
            let value = identifier ? first : first & (marker - 1);
            let unknown = !identifier && value === marker - 1;
            for (let index = 1; index < width; index++) {
                const next = bytes[cursor + index];
                value = value * 256 + next;
                unknown = unknown && next === 255;
            }
            cursor += width;
            if (!unknown && !Number.isSafeInteger(value)) throw new Error('MKV 元素大小超出可处理范围');
            return unknown ? null : value;
        };
        const id = vint(true, 4),
            length = vint(false, 8),
            data = start + cursor;
        const end = length === null ? limit : data + length;
        if (!Number.isSafeInteger(end) || data > end || end > limit) throw new Error('MKV 元素超出容器范围');
        return { id, data, end, unknown: length === null };
    };
    const at = async (start, limit) => header(await read(start, Math.min(12, limit - start)), start, limit);
    function* children(bytes, start = 0, limit = bytes.length) {
        for (let offset = start; offset < limit;) {
            const field = header(bytes.subarray(offset, limit), offset, limit);
            if (field.unknown) throw new Error('MKV 元数据包含未知长度的元素');
            yield field;
            offset = field.end;
        }
    }
    async function* childrenAt(start, limit) {
        for (let offset = start; offset < limit;) {
            const field = await at(offset, limit);
            if (field.unknown) throw new Error('MKV 元数据包含未知长度的元素');
            yield field;
            offset = field.end;
        }
    }
    const readTracks = async (tracks) => {
        let chinese = false,
            unconfirmed = false,
            entries = 0;
        const subtitleTracks = [];
        for await (const entry of childrenAt(tracks.data, tracks.end)) {
            if (entry.id !== 0xae) continue;
            entries++;
            const fields = [];
            // Skip codec payloads and read only the track's type, language and name.
            for await (const field of childrenAt(entry.data, entry.end)) fields.push(field);
            const types = fields.filter((item) => item.id === 0x83),
                type = types[0];
            if (types.length !== 1 || type.end - type.data < 1 || type.end - type.data > 8)
                throw new Error('MKV 轨道缺少有效的类型信息');
            const bytes = await read(type.data, type.end - type.data);
            if (bytes.at(-1) !== 0x11 || !bytes.subarray(0, -1).every((value) => value === 0)) continue;
            const enabled = fields.find((item) => item.id === 0xb9);
            let trackEnabled = true;
            if (enabled) {
                if (enabled.end - enabled.data < 1 || enabled.end - enabled.data > 8)
                    throw new Error('MKV 轨道启用信息无效');
                if ((await read(enabled.data, enabled.end - enabled.data)).every((value) => value === 0))
                    trackEnabled = false;
            }
            const readText = async (field) => {
                if (!field) return '';
                if (field.end - field.data > 64 * 1024) throw new Error('MKV 轨道文本超过读取上限');
                return new TextDecoder()
                    .decode(await read(field.data, field.end - field.data))
                    .replace(/\0+$/, '')
                    .trim();
            };
            const language = await readText(fields.find((item) => item.id === 0x22b59c)),
                languageBCP47 = await readText(fields.find((item) => item.id === 0x22b59d)),
                name = await readText(fields.find((item) => item.id === 0x536e));
            // BCP 47 takes precedence. Conflicting legacy Chinese metadata needs review.
            let chineseTrack = mkvChineseSubtitle(languageBCP47 || language, name);
            if (languageBCP47 && chineseTrack === false && mkvChineseSubtitle(language, '') === true)
                chineseTrack = null;
            subtitleTracks.push({ language, languageBCP47, name, enabled: trackEnabled });
            if (trackEnabled && chineseTrack === true) chinese = true;
            if (chineseTrack === null || (!trackEnabled && chineseTrack === true)) unconfirmed = true;
        }
        if (!entries) throw new Error('MKV 轨道表没有有效轨道');
        report(subtitleTracks);
        if (!chinese && unconfirmed)
            throw Object.assign(new Error('已发现字幕轨，语言标记缺失、冲突或中文轨道已禁用'), {
                embeddedTracks: subtitleTracks,
            });
        return chinese;
    };
    const ebml = await at(0, size);
    if (ebml.id !== 0x1a45dfa3 || ebml.unknown || ebml.end - ebml.data > 64 * 1024)
        throw new Error('不是有效的 MKV 文件头');
    const metadata = await read(ebml.data, ebml.end - ebml.data);
    const docType = [...children(metadata)].find((field) => field.id === 0x4282);
    if (!docType || new TextDecoder().decode(metadata.subarray(docType.data, docType.end)) !== 'matroska')
        throw new Error('视频容器不是 Matroska');
    let segment;
    for (let next = ebml.end, count = 0; next < size && count < 32; count++) {
        const field = await at(next, size);
        if (field.id === 0x18538067) {
            segment = field;
            break;
        }
        if (field.unknown) break;
        next = field.end;
    }
    if (!segment) throw new Error('未找到 MKV Segment');
    for (let next = segment.data, count = 0; next < segment.end && count < 128; count++) {
        const field = await at(next, segment.end);
        if (field.unknown) throw new Error('遇到未知长度的 MKV 元素，无法继续定位轨道表');
        if (field.id === 0x1654ae6b) return readTracks(field);
        if (field.id === 0x114d9b74 && field.end - field.data <= 64 * 1024) {
            const seekHead = await read(field.data, field.end - field.data);
            const positions = [];
            try {
                for (const entry of children(seekHead)) {
                    if (entry.id !== 0x4dbb) continue;
                    const fields = [...children(seekHead, entry.data, entry.end)];
                    const id = fields.find((item) => item.id === 0x53ab),
                        position = fields.find((item) => item.id === 0x53ac);
                    if (
                        !id ||
                        id.end - id.data !== 4 ||
                        !position ||
                        position.end - position.data < 1 ||
                        position.end - position.data > 8
                    )
                        continue;
                    if (
                        new DataView(seekHead.buffer, seekHead.byteOffset + id.data, 4).getUint32(0) !==
                        0x1654ae6b
                    )
                        continue;
                    let offset = 0;
                    for (const byte of seekHead.subarray(position.data, position.end))
                        offset = offset * 256 + byte;
                    // SeekPosition is relative to the Segment payload, not the file.
                    const target = segment.data + offset;
                    if (Number.isSafeInteger(target) && target >= segment.data && target < segment.end)
                        positions.push(target);
                }
            } catch {
                positions.length = 0;
            } // A damaged optional index falls back to sequential headers.
            for (const target of positions) {
                const bytes = await read(target, Math.min(12, segment.end - target));
                let tracks;
                try {
                    tracks = header(bytes, target, segment.end);
                } catch {
                    continue;
                }
                if (tracks.id === 0x1654ae6b && !tracks.unknown) return readTracks(tracks);
            }
        }
        next = field.end;
    }
    throw new Error('在读取限制内未找到 MKV 轨道表');
}
function subtitleDrive(context, wait = sleep) {
    const { session, source } = context;
    const history = typeof mediaFileHistory === 'function' ? mediaFileHistory(session) : null;
    // A token digest scopes receipts without storing a credential. Token changes do not reuse old receipts.
    const receiptKey = session.token
        ? 'cross-drive-subtitle-uploads-v1:' + subtitleMd5(new TextEncoder().encode('光鸭:' + session.token))
        : '';
    const verifiedKey = receiptKey.replace(
        'cross-drive-subtitle-uploads-v1:',
        'cross-drive-subtitle-verified-v1:'
    );
    const savedVerified = verifiedKey && GM_getValue(verifiedKey, []);
    const verifiedEntries = new Map(Array.isArray(savedVerified) ? savedVerified : []);
    const verifiedIdentity = (node) =>
        node.id != null &&
        Number.isSafeInteger(node.size) &&
        node.size >= 0 &&
        /^[a-f0-9]{32}$/i.test(node.md5 || '')
            ? JSON.stringify([String(node.id), node.size, node.md5.toLowerCase()])
            : '';
    const verified = {
        get(node, language, row) {
            const record = verifiedEntries.get(verifiedIdentity(node));
            return record?.language === language &&
                record.encoding &&
                record.time > 0 &&
                record.context &&
                record.context === subtitleVerificationContext(row) &&
                record.result
                ? record
                : undefined;
        },
        remember(node, bytes, language, encoding, row, result) {
            const key = verifiedIdentity(node);
            if (
                !verifiedKey ||
                !key ||
                !row ||
                !result ||
                node.size !== bytes.length ||
                node.md5.toLowerCase() !== subtitleMd5(bytes)
            )
                return;
            verifiedEntries.delete(key);
            verifiedEntries.set(key, {
                time: Date.now(),
                encoding,
                language,
                context: subtitleVerificationContext(row),
                result,
            });
            evict(verifiedEntries, 5000);
            GM_setValue(verifiedKey, [...verifiedEntries]);
        },
        forget(node) {
            if (verifiedEntries.delete(verifiedIdentity(node)) && verifiedKey)
                GM_setValue(verifiedKey, [...verifiedEntries]);
        },
        clear() {
            const count = verifiedEntries.size;
            verifiedEntries.clear();
            if (verifiedKey) GM_setValue(verifiedKey, []);
            return count;
        },
    };
    const savedReceipts = receiptKey && GM_getValue(receiptKey, []);
    const receipts = new Map(
        Array.isArray(savedReceipts)
            ? savedReceipts.filter(
                  (entry) =>
                      Array.isArray(entry) &&
                      typeof entry[0] === 'string' &&
                      entry[1] &&
                      typeof entry[1].name === 'string' &&
                      Number.isSafeInteger(entry[1].size) &&
                      /^[a-f0-9]{32}$/i.test(entry[1].md5 || '')
              )
            : []
    );
    const videoKey = (row) =>
        JSON.stringify([String(row.node.id), String(row.node.parentId), row.node.name, row.node.size]);
    const pendingFor = (row) => [...receipts].filter(([, record]) => record.video === videoKey(row));
    const persistReceipts = () => {
        if (receiptKey) GM_setValue(receiptKey, [...receipts]);
    };
    let authError = null;
    const assertReady = () => {
        if (authError) throw authError;
    };
    const driveCall = async (operation) => {
        assertReady();
        try {
            return await operation();
        } catch (error) {
            if (error.stop || [401, 403].includes(error.status)) {
                error.stop = true;
                error.phase = 'drive-auth';
                error.message = `光鸭网盘登录失效或权限不足：${error.message}；请刷新网盘登录后重新检查目录`;
                authError = error;
            }
            throw error;
        }
    };
    const post = paced(350, (path, body, allowed = [0, 200]) =>
        driveCall(async () => {
            const response = await requestJson('https://api.guangyapan.com' + path, {
                method: 'POST',
                credentials: 'omit',
                headers: guangyaAuthHeaders(session.token),
                body: JSON.stringify(body),
            });
            if (!allowed.includes(guangyaCode(response))) {
                const error = apiError('字幕网盘操作', response);
                error.submissionRejected = [110, 117, 118, 400, 401, 403, 404, 413, 415, 422, 429].includes(
                    guangyaCode(response)
                );
                throw error;
            }
            return response;
        })
    );
    const downloadUrl = async (node) => {
        const result = await post('/userres/v1/get_res_download_url', { fileId: node.id });
        return subtitleDownloadUrl(
            result.data?.signedURL || result.data?.signedUrl || result.data?.downloadUrl
        );
    };
    const retryable = (error) =>
        !error.stop && /连接|超时|网络|fetch|network|HTTP\s*(?:401|403|408|429|5\d\d)/i.test(error.message);
    // Hold the slot for the complete track inspection, including backoff and URL renewal.
    const inspectEmbeddedTracks = subtitleRequestPool(0, 2, async (node, check) => {
        check();
        let url,
            retries = 0,
            tracks = [];
        const chinese = await inspectMkvSubtitleTracks(
            node.size,
            async (start, end) => {
                for (let attempt = 0; ; attempt++) {
                    check();
                    try {
                        url ||= await downloadUrl(node);
                        check();
                        const bytes = await subtitleBinary(url, {
                            headers: { Range: `bytes=${start}-${end}` },
                            range: [start, end, node.size],
                            limit: end - start + 1,
                        });
                        check();
                        return bytes;
                    } catch (error) {
                        check();
                        if (attempt >= 2 || retries >= 4 || !retryable(error)) throw error;
                        retries++;
                        url = undefined;
                        await wait(1000 * (attempt + 1));
                    }
                }
            },
            check,
            (found) => {
                tracks = found;
            }
        );
        check();
        const message = chinese
            ? '有内嵌中文字幕，跳过补齐'
            : tracks.length
              ? '已读取字幕轨，未识别到中文标记'
              : '未发现内嵌字幕轨';
        return {
            chinese,
            tracks,
            message:
                (retries ? `自动重试 ${retries} 次成功 · ` : '') +
                message +
                ' · ' +
                mkvSubtitleTrackSummary(tracks),
        };
    });
    const read = async (node, progress = () => {}, check = () => {}, limit = SUBTITLE_LIMIT) => {
        if (node.size > limit) throw new Error('字幕文件超过读取大小上限');
        for (let attempt = 0; attempt < 3; attempt++) {
            check();
            try {
                let url;
                try {
                    url = await downloadUrl(node);
                } catch (error) {
                    if (!error.message.startsWith('获取网盘下载地址失败：'))
                        error.message = '获取网盘下载地址失败：' + error.message;
                    throw error;
                }
                check();
                const bytes = await subtitleBinary(url, { limit });
                check();
                return bytes;
            } catch (error) {
                check();
                if (attempt === 2 || !retryable(error)) throw error;
                progress(`读取核验失败：${error.message}；重新获取下载地址，重试 ${attempt + 1}/2`);
                await wait(1000 * (attempt + 1));
            }
        }
    };
    const sameContent = async (node, bytes, md5, progress = () => {}, check = () => {}) => {
        if (node.directory || node.size !== bytes.length) return false;
        let hash = node.md5;
        if (!/^[a-f0-9]{32}$/i.test(hash || '') && source.metadata) {
            check();
            try {
                const metadata = await driveCall(() => source.metadata(node));
                check();
                if (metadata?.size !== node.size) return false;
                hash = metadata.md5;
            } catch (error) {
                check();
                if (error.stop) throw error;
                progress('文件详情核验失败：' + error.message + '；改用正文核验');
            }
        }
        return /^[a-f0-9]{32}$/i.test(hash || '')
            ? hash.toLowerCase() === md5
            : subtitleMd5(await read(node, progress, check)) === md5;
    };
    const list = async (row, progress, check) => {
        for (let attempt = 0; ; attempt++) {
            check();
            try {
                const nodes = await driveCall(() => source.children({ id: row.node.parentId }));
                check();
                return nodes;
            } catch (error) {
                check();
                if (!error.directoryChanged || attempt >= 2) throw error;
                progress('目录分页不一致，重新读取 ' + (attempt + 1) + '/2');
                await wait(500 * (attempt + 1));
            }
        }
    };
    const validateVideo = (row, nodes) => {
        const found = nodes.find((node) => node.id === row.node.id);
        if (
            !found ||
            found.directory ||
            found.name !== row.node.name ||
            found.size !== row.node.size ||
            (row.node.md5 && found.md5 && row.node.md5.toLowerCase() !== found.md5.toLowerCase())
        )
            throw new Error('视频已移动、改名或内容变化，请重新查找字幕');
    };
    const reconcile = async (row, progress = () => {}, check = () => {}) => {
        const pending = pendingFor(row),
            recovered = [];
        if (!pending.length) return recovered;
        try {
            check();
            progress('检查此前已提交的字幕');
            const nodes = await list(row, progress, check);
            validateVideo(row, nodes);
            for (const [key, record] of pending) {
                check();
                const matches = nodes.filter((node) => node.name === record.name);
                if (
                    matches.length !== 1 ||
                    !(await sameContent(matches[0], { length: record.size }, record.md5, progress, check))
                )
                    throw Object.assign(
                        new Error(
                            '此前字幕上传已提交，但目录或内容仍未确认：' +
                                record.name +
                                '；请稍后重新检查目录，不重复上传'
                        ),
                        { pendingUpload: true }
                    );
                check();
                if (record.language) history?.link(row, matches[0], record.language);
                recovered.push({ ...matches[0], parentId: row.node.parentId, language: record.language });
                receipts.delete(key);
                persistReceipts();
                progress('已核验此前上传：' + record.name);
            }
            return recovered;
        } catch (error) {
            check();
            error.pendingUpload = true;
            throw error;
        }
    };
    async function ossUpload(token, bytes) {
        // Request ALI_OSS capability only, matching the website's provider=1 adapter.
        if (Number(token.provider) !== 1) throw new Error('光鸭未返回请求的 OSS 上传通道，本项未上传');
        const creds = token.creds || token,
            bucket = token.bucketName,
            path = token.objectPath;
        if (!bucket || !path || !creds.accessKeyID || !creds.secretAccessKey || !creds.sessionToken)
            throw new Error('光鸭未返回完整上传凭证');
        const host = token.endPoint || token.fullEndPoint;
        const endpoint = new URL(/^https?:\/\//i.test(host) ? host : 'https://' + host);
        if (!endpoint.hostname.startsWith(bucket + '.')) endpoint.hostname = bucket + '.' + endpoint.hostname;
        endpoint.protocol = 'https:';
        endpoint.pathname = '/' + path.split('/').map(encodeURIComponent).join('/');
        const date = new Date().toUTCString(),
            type = 'application/octet-stream';
        const canonical =
            'PUT\n\n' +
            type +
            '\n' +
            date +
            '\nx-oss-security-token:' +
            creds.sessionToken +
            '\n/' +
            bucket +
            '/' +
            path;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(creds.secretAccessKey),
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );
        const signature = btoa(
            String.fromCharCode(
                ...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(canonical)))
            )
        );
        await subtitleBinary(endpoint.href, {
            method: 'PUT',
            headers: {
                'Content-Type': type,
                Date: date,
                'x-oss-security-token': creds.sessionToken,
                Authorization: 'OSS ' + creds.accessKeyID + ':' + signature,
            },
            bytes,
        });
    }
    return {
        read,
        reconcile,
        assertReady,
        verified,
        async inspectEmbedded(node, check = () => {}) {
            if (!/\.mkv$/i.test(node.name))
                return {
                    chinese: false,
                    unconfirmed: true,
                    unsupported: true,
                    message: '当前格式尚未检测内嵌字幕，可继续查找或导入外置字幕',
                };
            try {
                return await inspectEmbeddedTracks(node, check);
            } catch (error) {
                check();
                if (error.stop || error.phase === 'drive-auth') throw error;
                return {
                    chinese: false,
                    unconfirmed: true,
                    metadataUnconfirmed: !!error.embeddedTracks,
                    tracks: error.embeddedTracks,
                    message:
                        (error.embeddedTracks ? '内嵌字幕语言未确认：' : '未读取到 MKV 字幕轨：') +
                        error.message +
                        (error.embeddedTracks ? ' · ' + mkvSubtitleTrackSummary(error.embeddedTracks) : ''),
                };
            }
        },
        async save(row, name, bytes, progress = () => {}, check = () => {}, { beforeWrite, language } = {}) {
            check();
            if (pendingFor(row).length) {
                const recovered = await reconcile(row, progress, check);
                const found = recovered.find((node) => node.name === name);
                if (
                    !beforeWrite &&
                    found &&
                    (await sameContent(found, bytes, subtitleMd5(bytes), progress, check))
                )
                    return found;
                throw Object.assign(
                    new Error('此前上传已核验，请重新检查目录后确认字幕状态；本次不再上传其他版本'),
                    { pendingUpload: true }
                );
            }
            const md5 = subtitleMd5(bytes),
                nodes = await list(row, progress, check);
            validateVideo(row, nodes);
            beforeWrite?.(nodes);
            const existing = nodes.filter((node) => node.name === name);
            if (existing.length) {
                if (existing.length !== 1 || !(await sameContent(existing[0], bytes, md5, progress, check)))
                    throw new Error('同名字幕已存在且内容不同或无法确认，未覆盖');
                return existing[0];
            }
            check();
            progress('上传到视频目录');
            const receiptId = JSON.stringify([videoKey(row), name]);
            receipts.set(receiptId, {
                video: videoKey(row),
                name,
                size: bytes.length,
                md5,
                time: Date.now(),
                language,
            });
            try {
                persistReceipts();
            } catch (error) {
                receipts.delete(receiptId);
                throw new Error('无法保存上传恢复记录，本次未上传：' + error.message);
            }
            const checkSubmitted = () => {
                try {
                    check();
                } catch (error) {
                    error.pendingUpload = true;
                    throw error;
                }
            };
            let uploadAccepted = false;
            try {
                const result = await post(
                    GUANGYA_API.create,
                    {
                        capacity: 2,
                        name,
                        parentId: row.node.parentId === '0' ? '' : row.node.parentId,
                        res: { fileSize: bytes.length, md5 },
                    },
                    [0, 156]
                );
                uploadAccepted = true;
                if (guangyaCode(result) !== 156) {
                    check();
                    await ossUpload(result.data || {}, bytes);
                }
                const taskId = taskIdOf(result.data);
                if (!taskId) throw new Error('上传请求已提交，但未返回任务 ID');
                for (let attempt = 0; attempt < 20; attempt++) {
                    check();
                    progress('等待网盘处理字幕');
                    const task = await post(GUANGYA_API.info, { taskId }, [0, 145, 146, 147, 155, 163]);
                    if (task.data?.fileId || task.data?.fileInfo?.fileId) break;
                    if (attempt < 19) await wait(1000);
                }
            } catch (error) {
                if (
                    !uploadAccepted &&
                    (error.submissionRejected ||
                        [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(error.status))
                ) {
                    receipts.delete(receiptId);
                    persistReceipts();
                    throw error;
                }
                checkSubmitted();
                throw Object.assign(
                    new Error('上传请求可能已提交：' + error.message + '；先重新检查目录，不重复上传'),
                    { pendingUpload: true, stop: !!error.stop }
                );
            }
            progress('核验网盘字幕');
            try {
                let listFailures = 0;
                for (let attempt = 0; attempt < 12; attempt++) {
                    check();
                    let fresh;
                    try {
                        fresh = await list(row, progress, check);
                        listFailures = 0;
                    } catch (error) {
                        check();
                        if (!retryable(error) || ++listFailures > 2 || attempt === 11) throw error;
                        progress(`刷新目录失败：${error.message}；重试 ${listFailures}/2`);
                        await wait(1000);
                        continue;
                    }
                    validateVideo(row, fresh);
                    const matches = fresh.filter((node) => node.name === name);
                    if (
                        matches.length === 1 &&
                        (await sameContent(matches[0], bytes, md5, progress, check))
                    ) {
                        check();
                        if (language) history?.link(row, matches[0], language);
                        receipts.delete(receiptId);
                        persistReceipts();
                        return { ...matches[0], parentId: row.node.parentId, language };
                    }
                    if (matches.length) throw new Error('上传后字幕内容不一致或同名不唯一，未标为已补齐');
                    if (attempt < 11) await wait(1000);
                }
                throw new Error('目录中尚未找到字幕');
            } catch (error) {
                checkSubmitted();
                throw Object.assign(
                    new Error(
                        '上传请求已提交，但核验未通过：' +
                            error.message +
                            '；请先重新检查目录，未标为已补齐，不要重复上传'
                    ),
                    { pendingUpload: true, stop: !!error.stop }
                );
            }
        },
    };
}
