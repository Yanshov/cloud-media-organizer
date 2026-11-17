    function subtitleRemoteJson(url, options = {}) {
        const timeout = options.timeout || 30000;
        const hostname = new URL(url).hostname;
        if (!['api.opensubtitles.com', 'www.shooter.cn', 'api.assrt.net', 'api-shoulei-ssl.xunlei.com', 'api.subdl.com'].includes(hostname)) throw new Error('不支持的字幕接口地址');
        if (typeof GM_xmlhttpRequest !== 'function') throw new Error('需要 Tampermonkey 的跨域请求权限，请更新并保存完整脚本');
        const shooter = hostname === 'www.shooter.cn';
        return new Promise((resolve, reject) => GM_xmlhttpRequest({
            responseType: shooter ? 'arraybuffer' : 'text',
            url, method: options.method || 'GET', headers: options.headers || {}, data: options.body,
            anonymous: true, timeout,
            onload: response => {
                let data;
                const bytes = shooter && response.response instanceof ArrayBuffer ? new Uint8Array(response.response) : null;
                if (response.status === 200 && bytes?.length === 1 && bytes[0] === 255) { resolve([]); return; }
                const text = bytes ? new TextDecoder().decode(bytes) : response.responseText || '';
                try { data = text.trim() ? JSON.parse(text) : null; } catch { /* HTTP errors may be HTML. */ }
                if (response.status < 200 || response.status >= 300) {
                    const error = new Error('HTTP ' + response.status + (typeof data?.message === 'string' ? '：' + data.message.slice(0, 180) : ''));
                    error.status = response.status;
                    const retry = String(response.responseHeaders || '').match(/^retry-after:\s*(.+)$/im)?.[1]?.trim();
                    error.retryAfterMs = retry ? Math.max(0, /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) || 0 : 0;
                    reject(error); return;
                }
                if (data === undefined) { reject(new Error('字幕接口未返回 JSON（HTTP ' + response.status + '）')); return; }
                resolve(data);
            },
            onerror: () => reject(new Error('无法连接字幕来源，请检查网络或脚本跨域授权')),
            ontimeout: () => reject(new Error(`字幕来源请求超时（${timeout / 1000} 秒）`)),
            onabort: () => reject(new Error('字幕请求已取消'))
        }));
    }
    function subtitleMd5(bytes) {
        const length = bytes.length, padded = new Uint8Array(((length + 8 >>> 6) + 1) * 64);
        padded.set(bytes); padded[length] = 128;
        const view = new DataView(padded.buffer); view.setUint32(padded.length - 8, length * 8, true);
        const shifts = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
        const constants = Array.from({length:64}, (_,i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0);
        let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
        for (let offset = 0; offset < padded.length; offset += 64) {
            let a = a0, b = b0, c = c0, d = d0;
            for (let i = 0; i < 64; i++) {
                let f, g;
                if (i < 16) { f = b & c | ~b & d; g = i; }
                else if (i < 32) { f = d & b | ~d & c; g = (5 * i + 1) % 16; }
                else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
                else { f = c ^ (b | ~d); g = 7 * i % 16; }
                const v = (a + f + constants[i] + view.getUint32(offset + g * 4, true)) | 0;
                const shift = shifts[(i >>> 4) * 4 + i % 4];
                a = d; d = c; c = b; b = (b + (v << shift | v >>> (32 - shift))) | 0;
            }
            a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
        }
        return [a0,b0,c0,d0].map(n => [0,8,16,24].map(shift => ((n >>> shift) & 255).toString(16).padStart(2,'0')).join('')).join('');
    }
    function subtitleDownloadUrl(value, {allowHttp = false, base} = {}) {
        let url;
        try { url = new URL(value, base); } catch { throw new Error('字幕来源未返回有效下载地址'); }
        if (!(url.protocol === 'https:' || allowHttp && url.protocol === 'http:') || url.username || url.password) throw new Error('字幕来源返回了不支持的下载地址协议或内嵌账号');
        return url.href;
    }
    function subtitleFileInfo(name, fallback = '') {
        const value = String(name).normalize('NFKC').toLowerCase();
        const tag = code => new RegExp('(?:^|[^\\p{L}\\p{N}])(?:' + code + ')(?=$|[^\\p{L}\\p{N}])', 'u').test(value);
        const simplified = /zh[._-]?(?:cn|hans)|简体|简中|简英|简[&+ ]英/.test(value) || tag('chs');
        const traditional = /zh[._-]?(?:tw|hant)|繁体|繁中|繁英|繁[&+ ]英/.test(value) || tag('cht');
        const chinese = simplified || traditional || tag('zh|zho|chi') || /中文|中英|双语|简繁/.test(value);
        const english = tag('en|eng') || /英文|中英|简英|繁英|[简繁][&+ ]英/.test(value);
        // Foreign suffixes override a multilingual package's Chinese label.
        const foreign = value.match(/\[([a-z]{2,3})\]\.(?:srt|ass|ssa|vtt)$/)?.[1] || value.match(/(?:\[|[._ -])(fra|fre|fr|spa|es|ger|deu|de|ita|it|por|pt|rus|ru|jpn|ja|kor|ko|ara|ar|tha|th|vie|vi|ind|id|dut|nld|nl|pol|pl|tur|tr|hin|hi)(?:\])?\.(?:srt|ass|ssa|vtt)$/)?.[1];
        const languages = {fra:'fr',fre:'fr',spa:'es',ger:'de',deu:'de',ita:'it',por:'pt',rus:'ru',jpn:'ja',kor:'ko',ara:'ar',tha:'th',vie:'vi',ind:'id',dut:'nl',nld:'nl',pol:'pl',tur:'tr',hin:'hi'};
        const fullLanguages = {german:'de',spanish:'es',french:'fr',italian:'it',portuguese:'pt',russian:'ru',japanese:'ja',korean:'ko',arabic:'ar',thai:'th',vietnamese:'vi',indonesian:'id',dutch:'nl',polish:'pl',turkish:'tr',hindi:'hi',greek:'el',hebrew:'he',finnish:'fi',estonian:'et',hungarian:'hu',swedish:'sv',danish:'da',norwegian:'no',czech:'cs',romanian:'ro'};
        const fullLanguage = Object.keys(fullLanguages).find(tag);
        const bilingual = /中英|简英|繁英|双语|bilingual/.test(value) || chinese && english;
        return {language:simplified ? 'zh-cn' : traditional ? 'zh-tw' : chinese || bilingual ? 'zh' : english ? 'en' : foreign ? languages[foreign] || foreign : fullLanguage ? fullLanguages[fullLanguage] : fallback, bilingual};
    }
    function subtitlePreference(candidate, language) {
        const info = subtitleFileInfo(candidate.name, candidate.language);
        if (language === 'en') return info.language === 'en' ? 300 : info.bilingual || candidate.bilingual ? 200 : 0;
        const chinese = ['zh-cn','zh-tw','zh'].includes(info.language);
        return (chinese && (info.bilingual || candidate.bilingual) ? 400 : 0) + (info.language === 'zh-cn' ? 30 : info.language === 'zh-tw' ? 20 : info.language === 'zh' ? 10 : 0);
    }
    function subtitleCandidateLabel(candidate) {
        const language = ({'zh-cn':'简体中文','zh-tw':'繁体中文',zh:'中文',en:'英文'})[candidate.language] || '语言未标注';
        return [candidate.source, candidate.bilingual ? '双语' : '', language, candidate.name || candidate.release, candidate.fileSize || '', candidate.matchReason ? '待确认：' + candidate.matchReason : '', candidate.detailError ? '文件列表读取失败：' + candidate.detailError : ''].filter(Boolean).join(' · ');
    }
    function subtitleQueryTitle(value, year = '') {
        return String(value ?? '').normalize('NFKC')
            .replace(year ? new RegExp('[._\\s:(\\[-]+' + String(year).replace(/\D/g, '') + '[)\\]\\s]*$') : /$^/, ' ')
            .replace(/\s+/g, ' ').trim();
    }
    function subtitleWorkIdentity(parsed, fields, name) {
        const titleNumbers = String(parsed.query || '').match(/(?:19|20)\d{2}/g) || [];
        const years = value => [...String(value).normalize('NFKC').matchAll(/(?:^|[^\p{L}\p{N}])((?:19|20)\d{2})(?=$|[^\p{L}\p{N}])/gu)].map(m => m[1]).filter(y => Number(y) <= new Date().getFullYear() + 1 && (!titleNumbers.includes(y) || y === String(parsed.year)));
        const clean = (value, isTitle = false) => {
            let text = String(value || '').normalize('NFKC').replace(/\.(?:srt|ass|ssa|vtt)$/i, '').trim();
            // Strip only known version/language tags; meaningful title brackets stay intact.
            text = text.replace(/^(?:[\[【](?:v\d+(?:\.\d+)*|(?:简体|繁体|简中|繁中|中英|简英|繁英|chs|cht)(?:中英|双语|&英文)?(?:ass|ssa|srt|vtt)?)[\]】][. _-]*)+/i, '');
            text = text.replace(/(?:[. _-]|\[)(?:chi|zho|zh|en|eng|chs|cht|zh[._-]?(?:cn|tw|hans|hant))\]?$/i, '');
            text = text.replace(/^(?:【[^】]*(?:字幕组|字幕社|工作室)[^】]*】|\[[^\]]*(?:字幕组|字幕社|工作室)\])[. _-]*/i, '');
            text = text.replace(/(?:^|[. _-])(?:杜比视界|特效字幕|双语字幕)(?=$|[. _-])/g, ' ');
            text = text.replace(/^(?:(?:简体|繁体|简中|繁中|中文|双语|中英|简英|繁英|chs|cht|eng)(?:双语|&英文|英文)?[. _\-]*)+/i, '');
            // Strip release metadata, keeping numeric title tokens such as Blade Runner 2049.
            const year = !isTitle && years(text).at(-1);
            if (year) {
                const found = new RegExp('(?:^|[^\\p{L}\\p{N}])' + year + '(?=$|[^\\p{L}\\p{N}])', 'u').exec(text);
                if (found) text = found.index === 0 && /^\d{4}/.test(found[0]) ? text.slice(found[0].length).replace(/^[. :_-]+/, '') : text.slice(0, found.index);
            }
            text = text.split(/(?:^|[. _\[(-])(?:\d{3,4}p|4k|8k|BluRay|BDRip|WEB(?:[ ._-]?(?:DL|Rip))?|REMUX|HDTV|DVD(?:Rip)?|x26[45]|h[ ._-]?26[45]|HEVC|AVC|chs|cht|eng|简体|繁体|简中|繁中|中英|双语)(?=$|[. _\])&+-])/i)[0];
            text = text.replace(/(?:^|[. _-])S\d{1,2}[. _-]*E\d{1,3}[\s\S]*$/i, '');
            if (parsed.tv) text = text.replace(/(?:[. _-]*(?:S\d{1,2}|Season[. _-]*\d{1,2}|第[零〇一二两三四五六七八九十百\d]+季))[. _-]*$/i, '');
            return titleKey(text);
        };
        const target = clean(subtitleQueryTitle(parsed.query, parsed.year), true);
        const fileYears = years(name), packYears = [...new Set(fields.flatMap(years))];
        const fileYear = fileYears.at(-1);
        // TV filenames use the series premiere year; later seasons have later release years.
        const laterSeason = parsed.tv && parsed.season > 1 && [name,...fields].some(value => {
            const episodes = [...String(value || '').matchAll(/S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)/gi)];
            return episodes.length === 1 && Number(episodes[0][1]) === parsed.season && Number(episodes[0][2]) === parsed.episode;
        });
        const yearConflict = year => parsed.year && year && String(parsed.year) !== year && !(laterSeason && Number(year) >= Number(parsed.year));
        if (yearConflict(fileYear)) return {titleMatched:false, hardMismatch:true, matchReason:`文件年份 ${fileYear} 与视频 ${parsed.year} 不符`};
        if (!fileYear && packYears.length === 1 && yearConflict(packYears[0])) return {titleMatched:false, hardMismatch:true, matchReason:`资源年份 ${packYears[0]} 与视频 ${parsed.year} 不符`};
        const variants = value => {
            const text = String(value || '').normalize('NFKC');
            return [text, text.replace(/^(.*?\D)\d+\s*:\s*(\S.*)$/, '$1:$2')].map(value => clean(value, true)).filter(Boolean);
        };
        const aliases = new Set([target, ...[subtitleQueryTitle(parsed.query, parsed.year), ...(parsed.aliases || [])].flatMap(variants)]);
        let packMatched = false;
        const splitMixed = part => {
            // Common Assrt display: Chinese title + English release name, without a slash.
            const mixed = part.normalize('NFKC').replace(/^(?:【[^】]*(?:字幕组|字幕社|工作室)[^】]*】|\[[^\]]*(?:字幕组|字幕社|工作室)\])[. _-]*/i, '').trim().match(/^([\p{Script=Han}\p{N}\p{P}\s]+?)[.\s]+([a-z].*)$/iu);
            return mixed ? [mixed[1], mixed[2]] : [part];
        };
        const groups = fields.map(field => String(field || '').split(/[\/|\n·]/).flatMap(splitMixed).map(part => clean(part)).filter(Boolean));
        for (const parts of groups) {
            if (parts.some(part => aliases.has(part))) {
                packMatched = true;
                // A list of several Chinese or English film titles is not a list of aliases.
                const foreign = [...new Set(parts.filter(part => /[\p{Script=Han}]/u.test(part) !== /[\p{Script=Han}]/u.test(target)))];
                if (foreign.length === 1) aliases.add(foreign[0]);
            }
        }
        if (packMatched) {
            const foreign = [...new Set(groups.flat().filter(part => /[\p{Script=Han}]/u.test(part) !== /[\p{Script=Han}]/u.test(target)))];
            if (foreign.length === 1) aliases.add(foreign[0]);
        }
        const fileTitle = clean(name);
        const numbered = fileTitle.match(/^(.*?\D)(\d{1,2})?$/);
        if (numbered && [...aliases].some(alias => {
            const targetNumbered = alias.match(/^(.*?\D)(\d{1,2})?$/);
            return targetNumbered && targetNumbered[1] === numbered[1] && (targetNumbered[2] || '') !== (numbered[2] || '');
        })) return {titleMatched:false, hardMismatch:true, matchReason:'片名续集编号不符'};
        const fileParts = splitMixed(name).map(part => clean(part)).filter(Boolean);
        const generic = !fileTitle || /^(?:\d{1,3}|track\d+|台|港|简|繁|字幕|subtitle|subtitles)$/i.test(fileTitle);
        const mixedMatched = fileParts.length === 2 && fileParts.some(part => aliases.has(part)) && /\p{Script=Han}/u.test(fileParts[0]) !== /\p{Script=Han}/u.test(fileParts[1]);
        if (mixedMatched) for (const part of fileParts) aliases.add(part);
        const matched = !!target && (generic ? packMatched && packYears.length <= 1 : aliases.has(fileTitle) || mixedMatched || fileParts.length > 1 && fileParts.every(part => aliases.has(part)));
        const titles = [fileTitle,...groups.flat()];
        const related = !!target && [...aliases].some(alias => titles.some(part => part && part.includes(alias)) || fileTitle && alias.includes(fileTitle));
        return {titleMatched:matched, related, aliases:[...aliases], matchReason:matched ? '' : '文件片名未能确认为同一作品'};
    }
    function subtitleNetworkEditionMismatch(parsed, fields) {
        const network = /网络版|網絡版|ネット版|(?:^|[^a-z])(?:net|web)[ ._-]*(?:movie|edition|version)(?=$|[^a-z])/i;
        return !parsed.tv && fields.some(value => network.test(String(value || '')))
            && ![parsed.query,...(parsed.aliases || [])].some(value => network.test(String(value || '')));
    }
    function subtitleCandidateFilter(parsed, fields, name, semanticReview = false) {
        const text = String(name || '').normalize('NFKC');
        const opaque = /^[a-f0-9]{40}\.(?:srt|ass|ssa|vtt)$/i.test(text);
        if (/(?:^|[^a-z])(?:MAD|AMV)(?=$|[^a-z])|混剪|合集|剪辑|恶搞|鬼畜|\d+帧/i.test(text)) return {excluded:'内容'};
        if (subtitleNetworkEditionMismatch(parsed, [...fields,text])) return {excluded:'内容',matchReason:'网络版不能作为电影版字幕'};
        if (!opaque && !parsed.tv && /\s+-\s*\d+(?=\s*(?:\.|\[|$))|(?:^|[^a-z])(?:EP|E)\s*\d{1,3}(?![a-z0-9])|\[\d+\]|第[\d零〇一二两三四五六七八九十百]+[话話集]|[\d零〇一二两三四五六七八九十百]+之卷/i.test(text)) return {excluded:'季集'};
        const match = subtitleWorkIdentity(parsed, fields, opaque ? '' : name);
        if (match.hardMismatch) return {...match,excluded:match.matchReason === '片名续集编号不符' ? '无关' : '年份'};
        if (opaque) return {...match,titleMatched:false,opaque:true,matchReason:'来源文件名缺少可识别片名，不代表视频指纹匹配'};
        if (!match.titleMatched && !match.related && !semanticReview) return {...match,excluded:'无关'};
        return match;
    }
    function subtitleEndTime(text, ext) {
        const seconds = value => {
            const parts = value.trim().replace(',', '.').split(':').map(Number);
            return parts.length >= 2 && parts.length <= 3 && parts.every(Number.isFinite) ? parts.reduce((total,part) => total * 60 + part,0) : 0;
        };
        let end = 0;
        if (/^(?:ass|ssa)$/i.test(ext)) {
            let inEvents = false, endColumn = 2;
            for (const line of text.split(/\r?\n/)) {
                if (/^\s*\[/.test(line)) inEvents = /^\s*\[Events\]/i.test(line);
                if (!inEvents) continue;
                if (/^\s*Format\s*:/i.test(line)) {
                    const index = line.replace(/^\s*Format\s*:/i,'').split(',').findIndex(value => value.trim().toLowerCase() === 'end');
                    if (index >= 0) endColumn = index;
                }
                if (/^\s*Dialogue\s*:/i.test(line)) end = Math.max(end,seconds(line.replace(/^\s*Dialogue\s*:/i,'').split(',')[endColumn] || ''));
            }
        } else for (const match of text.matchAll(/-->\s*((?:\d+:)?\d{2}:\d{2}[,.]\d{2,3})/g)) end = Math.max(end,seconds(match[1]));
        return end;
    }
    function subtitleCheckDuration(row, text, ext, log = () => {}) {
        const end = subtitleEndTime(text,ext), driveSeconds = Number(row.node.durationSeconds), runtime = Number(row.parsed?.runtimeSeconds);
        const duration = driveSeconds > 0 ? driveSeconds : runtime > 0 ? runtime : 0;
        const source = driveSeconds > 0 ? '网盘已确认时长' : runtime > 0 ? 'TMDB runtime' : '无时长参考';
        log('字幕时长', `${row.node.name} · 字幕结束 ${end.toFixed(1)} 秒 · 目标 ${duration ? duration.toFixed(1) + ' 秒' : '未知'} · 来源 ${source}${duration ? '' : '，跳过长度检查'}`);
        if (duration && end < duration * 0.5) throw Object.assign(new Error(`字幕不完整：结束 ${end.toFixed(1)} 秒，不到目标 ${duration.toFixed(1)} 秒的 50%（${source}）`), {subtitleIncomplete:true});
        return {end, duration, source};
    }
    function subtitleSearchNames(parsed) {
        const names = [parsed.query,...(parsed.aliases || [])].map(name => subtitleQueryTitle(name,parsed.year)).filter(Boolean);
        const unique = names.filter((name,index) => names.findIndex(other => titleKey(other) === titleKey(name)) === index);
        // Include an original Japanese title before spending the budget on regional Chinese variants.
        const japanese = unique.find(name => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name));
        const latin = unique.find(name => /\p{Script=Latin}/u.test(name) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(name));
        return [...new Set([unique[0],japanese,latin,...unique].filter(Boolean))].slice(0,3);
    }
    function subtitleRequestPool(interval, limit, request) {
        let queue = Promise.resolve(), last = 0;
        const active = new Set();
        return async (...args) => {
            const start = queue.then(async () => {
                while (active.size >= limit) await Promise.race(active);
                const delay = interval - (Date.now() - last);
                if (delay > 0) await sleep(delay);
                last = Date.now();
                const running = Promise.resolve().then(() => request(...args));
                const done = running.then(() => active.delete(done), () => active.delete(done));
                active.add(done);
                return {running};
            });
            queue = start.then(() => {}, () => {});
            return (await start).running;
        };
    }
    function subtitlePackSeason(fields, metadata) {
        const seasons = new Set(Number(metadata) > 0 ? [Number(metadata)] : []);
        for (const text of fields) for (const match of String(text).matchAll(/(?:^|[^a-z])(?:S|Season[ ._-]*)(\d{1,2})(?!\d)|第\s*(\d{1,2})\s*季/gi)) seasons.add(Number(match[1] || match[2]));
        return seasons.size === 1 ? [...seasons][0] : null;
    }
    function createSubtitleService({wait = ms => sleep(ms), check = () => {}, log = () => {}} = {}) {
        let token = '', tokenKey = '';
        const failedAssrtPackages = new Set();
        const unavailableSources = new Map();
        let assrtDownloadBlocked = false;
        const searchCache = new Map(), seasonCache = new Map(), detailCache = new Map(), pendingDetails = new Map();
        const seasonPreparations = new Map(), archiveCache = new Map();
        const archiveData = async (url,verify) => {
            check(); verify();
            if (!archiveCache.has(url)) {
                const entry = subtitleBinary(url).then(bytes => ({bytes,index:subtitleArchiveIndex(bytes,verify)}))
                    .catch(error => { archiveCache.delete(url); throw error; });
                archiveCache.set(url,entry); evict(archiveCache,3); // At most three 16 MiB archives.
            }
            const data = await archiveCache.get(url); check(); verify(); return data;
        };
        const subdlRequest = paced(1100, async (params, config, verify) => {
            check(); verify();
            const paused = unavailableSources.get('SubDL');
            if (paused) throw new Error('SubDL 本批已暂停：' + paused);
            const result = await subtitleRemoteJson('https://api.subdl.com/api/v1/subtitles?' + new URLSearchParams({...params,api_key:config.subdlKey}));
            if (result?.status !== true || !Array.isArray(result.subtitles)) {
                const status = Number(result?.statusCode);
                if (result?.status === false && !status && /can't find/i.test(String(result.error || ''))) return {status:true,subtitles:[],totalPages:1};
                throw Object.assign(new Error('SubDL 查询失败' + (status ? '（' + status + '）' : '') + '：' + String(result?.error || '响应格式异常').slice(0,100)), {status});
            }
            return result;
        });
        const thunderRequest = subtitleRequestPool(1100, 2, (title, verify) => {
            check(); verify();
            if (unavailableSources.has('迅雷')) throw new Error('迅雷本批已暂停');
            return subtitleRemoteJson('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?' + new URLSearchParams({name:title}), {
                headers:{'User-Agent':'XLPlayer/3.1.1 (com.xunlei.XLPlayer; build:65742; macOS 15.0.0) Alamofire/5.4.3'}
            });
        });
        const request = paced(1100, (path, config, body) => {
            if (!config.key) throw new Error('请先填写 OpenSubtitles API Key');
            return subtitleRemoteJson('https://api.opensubtitles.com/api/v1' + path, {
                method: body ? 'POST' : 'GET',
                headers: {'Api-Key': config.key, 'User-Agent': 'CloudMediaOrganizer v' + VERSION, Accept: 'application/json', ...(body ? {'Content-Type':'application/json'} : {}), ...(token && tokenKey === config.key ? {Authorization: 'Bearer ' + token} : {})},
                ...(body ? {body: JSON.stringify(body)} : {})
            });
        });
        const pause = async ms => { for (let left = ms; left > 0; left -= 500) { check(); await wait(Math.min(left, 500)); } check(); };
        let assrtBlockedUntil = 0;
        const assrtRequest = paced(3500, async (path, config, params) => {
            check();
            if (config.nonBlockingSearch && unavailableSources.has('Assrt 片名搜索')) throw new Error('Assrt 本批搜索已暂停');
            if (!config.assrtToken) throw new Error('请在设置填写 Assrt Token，片名搜索尚未执行');
            if (Date.now() < assrtBlockedUntil) throw Object.assign(new Error('Assrt 仍在冷却，请约 ' + Math.ceil((assrtBlockedUntil - Date.now()) / 1000) + ' 秒后重搜失败项'), {assrtCooldown:true});
            const query = new URLSearchParams({...params, token:config.assrtToken});
            for (let attempt = 0; attempt < 3; attempt++) {
                check();
                try {
                    const result = await subtitleRemoteJson('https://api.assrt.net/v1/sub/' + path + '?' + query);
                    if (Number(result?.status) !== 0) {
                        const error = new Error('Assrt 返回码 ' + result?.status + '：' + (result?.errmsg || '搜索或下载受限'));
                        error.apiStatus = Number(result?.status); throw error;
                    }
                    return result;
                } catch (error) {
                    check();
                    if (config.nonBlockingSearch && ([429,509].includes(error.status) || error.apiStatus === 30900)) {
                        assrtBlockedUntil = Date.now() + Math.max(60000, error.retryAfterMs || 0);
                        unavailableSources.set('Assrt 片名搜索', error.message);
                        log('来源暂停', `Assrt ${error.message}；本批跳过该来源，立即继续其他来源`);
                        throw error;
                    }
                    if (![429,509].includes(error.status) && error.apiStatus !== 30900) {
                        if (attempt === 0 && (/连接|超时|网络/i.test(error.message) || [408,500,502,503,504].includes(error.status))) {
                            log('Assrt 请求重试', `${error.message}；等待 3.5 秒后重试一次`); await pause(3500); continue;
                        }
                        throw error;
                    }
                    const delay = Math.max(60000 * (attempt + 1), error.retryAfterMs || 0);
                    assrtBlockedUntil = Date.now() + delay;
                    if (attempt === 2 || delay > 120000) {
                        log('Assrt 限流', `${error.message}；暂停请求，约 ${Math.ceil(delay / 1000)} 秒后可重搜失败项`);
                        throw Object.assign(new Error(error.message + '；限流重试已停止，请冷却后重搜失败项'), {assrtCooldown:true});
                    }
                    log('Assrt 限流', `${error.message}；等待 ${Math.ceil(delay / 1000)} 秒后重试 ${attempt + 1}/2，可点击停止`);
                    await pause(delay);
                }
            }
        });
        const assrtFiles = item => Array.isArray(item.filelist) && item.filelist.length ? item.filelist : [{f:item.filename, url:item.url}];
        const detailKey = (id, config) => JSON.stringify([config.assrtToken,String(id)]);
        const assrtDetail = async (id, config, reuse = false) => {
            check();
            const key = detailKey(id,config), cached = detailCache.get(key);
            // Signed URLs live only in this bounded, short-lived memory cache.
            if (reuse && cached && Date.now() - cached.time < 60000) {
                log('Assrt 详情复用', `资源 #${id} · 使用一分钟内的文件列表与下载地址`);
                return cached.item;
            }
            if (reuse && Date.now() < assrtBlockedUntil) {
                log('Assrt 下载等待', `正在冷却，等待约 ${Math.ceil((assrtBlockedUntil - Date.now()) / 1000)} 秒再获取下载地址，可点击停止`);
                while (Date.now() < assrtBlockedUntil) await pause(assrtBlockedUntil - Date.now());
            }
            if (!pendingDetails.has(key)) pendingDetails.set(key, (async () => {
                const result = await assrtRequest('detail',config,{id});
                const item = result.sub?.subs?.find(item => String(item.id) === String(id));
                if (!item) throw new Error('Assrt 未返回对应字幕详情');
                detailCache.delete(key); detailCache.set(key,{time:Date.now(),item});
                evict(detailCache, 24);
                return item;
            })().finally(() => pendingDetails.delete(key)));
            return pendingDetails.get(key);
        };
        const assrtEpisode = (name, parsed) => {
            const found = [...String(name).matchAll(/S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)/gi)];
            return found.length === 1 && Number(found[0][1]) === parsed.season && Number(found[0][2]) === parsed.episode && !/E\d+[ ._-]*[-~][ ._-]*(?:E)?\d+/i.test(name);
        };
        return {
            async prepareSeason(rows,config,verify = () => {}) {
                const row = rows.find(row => row.parsed.episode != null && (!row.parsed.endEpisode || row.parsed.endEpisode === row.parsed.episode)), parsed = row?.parsed;
                if (!parsed?.tv || parsed.season == null || !parsed.query) return;
                const key = JSON.stringify([parsed.tmdbId || '',parsed.query,parsed.year,parsed.season,subtitleSearchNames(parsed),config.language,
                    config.thunder,config.assrt,config.assrtToken,config.subdl,config.subdlKey]);
                if (!seasonPreparations.has(key)) {
                    const task = (async () => {
                        log('整季搜索', `${parsed.query} · S${String(parsed.season).padStart(2,'0')} · 优先取得整季文件列表，逐集复核，缺集再补查`);
                        const sources = [
                            ['迅雷',config.thunder,() => this.thunderSearch(row,{...config,seasonSearch:true},() => {},verify)],
                            ['Assrt 片名搜索',config.assrt && config.assrtToken,() => this.assrtSearch(row,{...config,seasonSearch:true,nonBlockingSearch:true},() => {},verify)],
                            ['SubDL',config.subdl && config.subdlKey,async () => {
                                const found = await this.subdlSearch(row,{...config,seasonSearch:true},() => {},verify);
                                // Index archives once so missing episodes are found before selecting a pack.
                                const missing = new Set(rows.filter(target => target.parsed.episode != null).map(target => target.parsed.episode));
                                for (const candidate of found.filter(item => item.ext === 'zip' && item.titleMatched).slice(0,3)) {
                                    verify();
                                    try {
                                        const archive = await archiveData(candidate.url,verify);
                                        for (const target of rows) if (subtitleArchiveChoices(archive.index,{...candidate,parsed:target.parsed},config.language).length) missing.delete(target.parsed.episode);
                                        log('整季覆盖', `${candidate.name} · 当前缺集 ${missing.size} 集${missing.size ? '，继续补查' : '，停止下载其他整季包'}`);
                                        if (!missing.size) break;
                                    }
                                    catch (error) { verify(); if (error.stop) throw error; log('整季压缩包', `${candidate.name} · ${error.message}；保留其他候选`); }
                                }
                            }]
                        ].filter(([name,enabled]) => enabled && !unavailableSources.has(name));
                        const results = await Promise.allSettled(sources.map(async ([name,,run]) => {
                            try { await run(); }
                            catch (error) {
                                check(); verify(); if (error.stop) throw error;
                                if ([429,509].includes(error.status) || name === 'SubDL' && [401,403].includes(error.status)) unavailableSources.set(name,error.message);
                                log('整季来源失败', `${name} · ${error.message}；单集仍可补查其他来源`);
                            }
                        }));
                        check(); verify();
                        const failed = results.find(result => result.status === 'rejected');
                        if (failed) throw failed.reason;
                    })();
                    seasonPreparations.set(key,task); evict(seasonPreparations,24);
                    task.catch(() => seasonPreparations.delete(key));
                }
                await seasonPreparations.get(key); check(); verify();
            },
            resetSearchBatch() { unavailableSources.clear(); seasonPreparations.clear(); },
            searchUnavailable(name) { return unavailableSources.get(name); },
            pauseSearchSource(name, reason) { unavailableSources.set(name, reason); },
            resetDownloadBatch() { failedAssrtPackages.clear(); assrtDownloadBlocked = false; },
            assrtDownloadUnavailable() { return assrtDownloadBlocked; },
            assrtCachedEpisode(row, config, onFiles = () => {}, check = () => {}) {
                const parsed = row.parsed;
                if (!parsed.tv || !subtitleQueryTitle(parsed.query, parsed.year) || parsed.season == null || parsed.episode == null || parsed.endEpisode && parsed.endEpisode !== parsed.episode) return [];
                return this.assrtSearch(row, {...config,assrtCacheOnly:true}, onFiles, check, false);
            },
            async assrtSearch(row, config, onFiles = () => {}, check = () => {}, allowFallback = true) {
                const parsed = row.parsed;
                const title = subtitleQueryTitle(parsed.query, parsed.year);
                if (!title) throw new Error('缺少可搜索的作品名');
                if (parsed.tv && (parsed.season == null || parsed.episode == null)) throw new Error('缺少明确季集，未按片名搜索');
                if (parsed.endEpisode && parsed.endEpisode !== parsed.episode) throw new Error('合并多集视频需单独选字幕');
                const episode = parsed.tv ? 'S' + String(parsed.season).padStart(2,'0') + 'E' + String(parsed.episode).padStart(2,'0') : '';
                // Assrt query punctuation is cleaned independently of the identity title.
                const queryText = value => String(value).normalize('NFKC').replace(/[!:"“”()|@~^/<>=*]/g, ' ').replace(/\s+/g, ' ').trim();
                const mainTitle = title.includes(':') ? title.slice(0,title.indexOf(':')).trim() : '';
                const terms = [
                    {q:title + (config.seasonSearch && parsed.tv ? ' S' + String(parsed.season).padStart(2,'0') : episode ? ' ' + episode : ''), main:false}, {q:title, main:false},
                    ...(allowFallback ? subtitleSearchNames(parsed).slice(1) : []).map(value => ({q:value + (config.seasonSearch && parsed.tv ? ' S' + String(parsed.season).padStart(2,'0') : ''), main:false})),
                    ...(allowFallback && mainTitle ? [{q:mainTitle, main:true}] : [])
                ].map(term => ({...term,q:queryText(term.q)})).filter((term,index,all) => term.q && all.findIndex(other => other.q === term.q) === index);
                const candidates = [], seen = new Map(), aliases = new Set(parsed.aliases || []);
                const excluded = {年份:0,季集:0,语言:0,内容:0,无关:0,待确认上限:0};
                let mainSearch = false;
                let pages = 0, rejected = 0, uncertain = 0;
                const rejectionSamples = [];
                const sampleRejection = (name, reason) => { if (rejectionSamples.length < 8) rejectionSamples.push(`${name}（${reason}）`); };
                const wanted = (config.language || 'zh-cn,zh-tw,zh').split(',');
                const preferred = candidate => candidate.titleMatched && (wanted.includes(candidate.language) || candidate.bilingual && wanted.includes('en'));
                const seasonKey = parsed.tv ? JSON.stringify([config.assrtToken,title.toLowerCase(),parsed.year || '',parsed.tmdbId || '',parsed.season]) : '';
                let cacheMiss = false;
                const collect = async item => {
                    check();
                    if (config.nonBlockingSearch && unavailableSources.has('Assrt 片名搜索')) return false;
                    if (!item.id) return false;
                    const id = String(item.id), fileSignature = Array.isArray(item.filelist) && item.filelist.length ? JSON.stringify(item.filelist.map(file => file.f)) : '';
                    if (seen.has(id) && (!fileSignature || seen.get(id) === fileSignature)) return false;
                    seen.set(id, fileSignature || seen.get(id) || '');
                    const release = [item.native_name,item.videoname].filter(value => value && !/^(?:不知道|未知|不详|unknown)$/i.test(value.trim())).join(' · '), langs = item.lang?.langlist || {};
                    const language = langs.langchs ? 'zh-cn' : langs.langcht ? 'zh-tw' : langs.langdou ? 'zh' : langs.langeng ? 'en' : '';
                    const pack = {source:'Assrt', assrtId:item.id, release, language, parsed:{...parsed,aliases:[...aliases]}};
                    try {
                        const detail = Array.isArray(item.filelist) && item.filelist.length ? item : await assrtDetail(item.id, config);
                        check();
                        const files = assrtFiles(detail).filter(file => /\.(srt|ass|ssa|vtt)$/i.test(file.f || ''));
                        if (!files.length) throw new Error('来源未提供 SRT、ASS、SSA 或 VTT 文件列表');
                        const kept = []; let dropped = 0, confirmed = false;
                        for (const file of files) {
                            const name = String(file.f), identity = release + ' ' + name;
                            const episodeMismatch = parsed.tv ? !(assrtEpisode(name, parsed) || !/S\d+[ ._-]*E\d+/i.test(name) && assrtEpisode(release, parsed)) : /S\d+[ ._-]*E\d+/i.test(identity);
                            if (episodeMismatch) { excluded.季集++; dropped++; sampleRejection(name, '季集不符'); continue; }
                            const info = subtitleFileInfo(name, language);
                            if (info.language && !['zh-cn','zh-tw','zh','en'].includes(info.language) && !wanted.includes(info.language)) { excluded.语言++; dropped++; sampleRejection(name, '语言 ' + info.language); continue; }
                            const match = subtitleCandidateFilter({...parsed,aliases:[...aliases]}, [item.native_name,item.videoname,detail.native_name,detail.title], name, !!config.reviewCandidates);
                            if (match.excluded) { excluded[match.excluded]++; dropped++; sampleRejection(name, match.matchReason || match.excluded); continue; }
                            if (mainSearch) { match.titleMatched = false; match.matchReason = '主名兜底搜索，需确认完整片名'; }
                            if (files.length === 1 && langs.langdou && info.language.startsWith('zh')) info.bilingual = true;
                            if (!match.titleMatched && ++uncertain > 60) { excluded.待确认上限++; dropped++; continue; }
                            if (match.titleMatched) { confirmed = true; for (const alias of match.aliases) aliases.add(alias); }
                            candidates.push({...pack, ...info, name, assrtFileName:name, fileSize:file.s || '', titleMatched:match.titleMatched, opaque:!!match.opaque, mainTitleFallback:mainSearch, matchReason:match.matchReason});
                            kept.push(name);
                        }
                        // Keep complete file lists, not another episode's selected candidate or signed URL.
                        if (seasonKey && (confirmed || config.seasonSearch && subtitleWorkIdentity(parsed,[item.native_name,item.videoname,detail.native_name,detail.title],'').titleMatched)) {
                            const packs = seasonCache.get(seasonKey) || new Map();
                            packs.set(String(item.id), {id:item.id, native_name:[...new Set([item.native_name,detail.native_name].filter(Boolean))].join('/'),
                                videoname:item.videoname || detail.videoname, title:detail.title, lang:item.lang, filelist:files.map(file => ({f:file.f,s:file.s}))});
                            while (packs.size > 8) packs.delete(packs.keys().next().value);
                            seasonCache.delete(seasonKey); seasonCache.set(seasonKey,packs);
                            evict(seasonCache, 24);
                        }
                        rejected += dropped;
                        if (kept.length) onFiles(`${release || 'Assrt #' + item.id} · 保留 ${kept.length}/${files.length} 份：${kept.slice(0,12).join('；')}${kept.length > 12 ? '；其余 ' + (kept.length - 12) + ' 份见候选列表' : ''}${dropped ? '；排除年份/季集/语言不符、无关或超出待确认上限 ' + dropped + ' 份' : ''}`);
                    } catch (error) {
                        check();
                        const match = subtitleWorkIdentity({...parsed,aliases:[...aliases]}, [item.native_name,item.videoname], item.filename || release);
                        if (match.hardMismatch) { excluded.年份++; rejected++; }
                        else if (!match.related) { excluded.无关++; rejected++; }
                        if (!match.hardMismatch && match.related && candidates.filter(candidate => candidate.detailError).length < 10) candidates.push({...pack, name:item.filename || release || 'Assrt #' + item.id, titleMatched:false, mainTitleFallback:mainSearch, detailError:error.message});
                        onFiles(`${release || 'Assrt #' + item.id} · 文件列表读取失败：${error.message}`);
                    }
                    return true;
                };
                const cached = seasonCache.get(seasonKey);
                if (config.assrtCacheOnly && !cached) return [];
                if (cached) {
                    // Snapshot: collect refreshes the bounded cache while rechecking each episode.
                    for (const item of [...cached.values()]) await collect(item);
                    log('Assrt 整季复用', `${title} · ${episode} · 复查 ${cached.size} 组已确认资源 · 匹配 ${candidates.filter(preferred).length} 份`);
                    const selection = {node:row.node || {name:''}, candidates:[...candidates]};
                    selectSubtitleCandidate(selection, config.language || 'zh-cn,zh-tw,zh');
                    // Keep cached IDs and candidates so fresh search pages do not re-expand the same packages.
                    cacheMiss = !selection.selectedCandidate;
                }
                if (!config.assrtCacheOnly && (cacheMiss || !candidates.some(preferred))) for (const term of terms) {
                    if (unavailableSources.has('Assrt 片名搜索')) break;
                    const q = term.q; mainSearch = term.main;
                    for (let pos = 0; pos < 75; pos += 15) {
                        if (unavailableSources.has('Assrt 片名搜索')) break;
                        check(); pages++;
                        const key = JSON.stringify(['assrt',config.assrtToken,q,pos]);
                        const cachedSearch = searchCache.has(key);
                        if (!cachedSearch) {
                            searchCache.set(key, assrtRequest('search',config,{q,cnt:15,pos,filelist:1}).catch(error => {searchCache.delete(key); throw error;}));
                            evict(searchCache, 200);
                        }
                        let result;
                        try { result = await searchCache.get(key); }
                        catch (error) {
                            if (!candidates.length) throw error;
                            log('Assrt 分页中断', `${error.message}；保留已取得的 ${candidates.length} 个候选`); break;
                        }
                        let items;
                        if (Array.isArray(result.sub?.subs)) items = result.sub.subs;
                        else if (result.sub && result.sub.subs != null && !Object.keys(result.sub.subs).length) items = [];
                        else throw new Error('Assrt 搜索返回格式异常');
                        log('Assrt 搜索页', `搜索片名：${q} · 起始 ${pos} · 返回 ${items.length} 组资源 · ${cachedSearch ? '使用缓存' : '请求来源'}`);
                        let fresh = 0;
                        for (const item of items) if (await collect(item)) fresh++;
                        const reliable = candidates.filter(preferred);
                        // Stop on a useful first page too, keeping alternative packages for failed downloads.
                        if (items.length < 15 || !fresh || reliable.some(candidate => wanted.includes('en') && !wanted.some(lang => lang.startsWith('zh')) || candidate.bilingual) && new Set(reliable.map(candidate => candidate.assrtId)).size >= 2) break;
                    }
                    if (candidates.some(candidate => candidate.titleMatched)) break;
                }
                for (const candidate of candidates) candidate.parsed.aliases = [...aliases];
                if (rejectionSamples.length) log('Assrt 排除样例', rejectionSamples.join('；'));
                log('Assrt 筛选', `查询 ${pages} 页 · 保留 ${candidates.length} 份 · 排除 ${rejected} 份（${Object.entries(excluded).map(([reason,count]) => reason + ' ' + count).join('，')}）· 待确认 ${candidates.filter(candidate => !candidate.titleMatched).length} 份`);
                return candidates;
            },
            thunderCachedEpisode(row, config, onFiles = () => {}, verify = () => {}) {
                const parsed = row.parsed;
                if (!parsed.tv || !subtitleQueryTitle(parsed.query, parsed.year) || parsed.season == null || parsed.episode == null || parsed.endEpisode && parsed.endEpisode !== parsed.episode) return [];
                return this.thunderSearch(row, {...config,thunderCacheOnly:true}, onFiles, verify);
            },
            async thunderSearch(row, config, onFiles = () => {}, verify = () => {}) {
                check(); verify();
                const parsed = row.parsed, title = subtitleQueryTitle(parsed.query, parsed.year);
                if (!title) throw new Error('缺少可搜索的作品名');
                if (parsed.tv && (parsed.season == null || parsed.episode == null)) throw new Error('缺少明确季集，未按片名搜索');
                if (parsed.endEpisode && parsed.endEpisode !== parsed.episode) throw new Error('合并多集视频需单独选字幕');
                const seasonKey = parsed.tv ? JSON.stringify(['thunder-season',titleKey(title),parsed.year || '',parsed.tmdbId || '',parsed.season]) : '';
                let items;
                const suffix = parsed.tv ? ' S' + String(parsed.season).padStart(2,'0') + (config.seasonSearch ? '' : 'E' + String(parsed.episode).padStart(2,'0')) : '';
                const queries = subtitleSearchNames(parsed).map(name => name + suffix);
                if (config.thunderCacheOnly) {
                    if (!searchCache.has(seasonKey)) return [];
                    items = await searchCache.get(seasonKey);
                } else {
                    const results = await Promise.allSettled(queries.map(async query => {
                        check(); verify();
                        const cacheKey = JSON.stringify(['thunder',query]);
                        log('迅雷 查询', `实际搜索词：${query} · ${searchCache.has(cacheKey) ? '使用缓存' : '请求来源'}`);
                        if (!searchCache.has(cacheKey)) {
                            searchCache.set(cacheKey, thunderRequest(query,verify).then(result => {
                                if (Number(result?.code) !== 0 || !Array.isArray(result?.data)) throw new Error('迅雷字幕接口返回异常：' + String(result?.result || result?.code || '格式错误').slice(0,120));
                                return result.data.map(item => ({...item,searchTerms:[query]}));
                            }).catch(error => { searchCache.delete(cacheKey); throw error; }));
                            evict(searchCache,200);
                        }
                        return await searchCache.get(cacheKey);
                    }));
                    check(); verify();
                    const successes = results.filter(result => result.status === 'fulfilled');
                    if (!successes.length) throw results[0].reason;
                    for (const result of results.filter(result => result.status === 'rejected')) {
                        if (result.reason.stop) throw result.reason;
                        if ([429,509].includes(result.reason.status)) unavailableSources.set('迅雷',result.reason.message);
                        log('迅雷 别名查询失败', result.reason.message + '；保留其他搜索词的结果');
                    }
                    items = successes.flatMap(result => result.value);
                    if (seasonKey) {
                        const previous = await searchCache.get(seasonKey) || [];
                        searchCache.set(seasonKey,[...new Map([...previous,...items].map(item => [item.url || item.name,item])).values()]); evict(searchCache,200);
                    }
                }
                check(); verify();
                const candidates = [], seen = new Set(), excluded = {年份:0,季集:0,语言:0,内容:0,无关:0,待确认上限:0}, rejectionSamples = [];
                const sampleRejection = (name, reason) => { if (rejectionSamples.length < 8) rejectionSamples.push(`${name}（${reason}）`); };
                log('迅雷 响应', `返回 ${items.length} 条原始结果`);
                for (const item of items) {
                    check(); verify();
                    if (!item || typeof item.name !== 'string' || !item.name.trim()) continue;
                    const name = item.name, ext = String(item.ext || name.split('.').pop()).replace(/^\./, '').toLowerCase();
                    if (!['srt','ass','ssa','vtt'].includes(ext) || typeof item.url !== 'string') continue;
                    let url;
                    try { url = subtitleDownloadUrl(item.url, {allowHttp:true}); } catch { continue; }
                    if (seen.has(url)) continue;
                    seen.add(url);
                    const episodeTagged = /S\d+[ ._-]*E\d+/i.test(name);
                    if (episodeTagged && (!parsed.tv || !assrtEpisode(name, parsed))) { excluded.季集++; sampleRejection(name, '季集不符'); continue; }
                    const match = subtitleCandidateFilter(parsed, [], name, !!config.reviewCandidates);
                    if (match.excluded) { excluded[match.excluded]++; sampleRejection(name, match.matchReason || match.excluded); continue; }
                    const labels = [Array.isArray(item.languages) ? item.languages.join(' ') : '', item.simple_name || ''].join(' ').replace(/\\u0026/gi, '&').replace(/英语/g, '英文');
                    const metadata = subtitleFileInfo(labels), info = subtitleFileInfo(name, metadata.language);
                    info.bilingual ||= metadata.bilingual && info.language.startsWith('zh');
                    const titleMatched = match.titleMatched && (!parsed.tv || episodeTagged);
                    if (info.language && !(config.language || 'zh-cn,zh-tw,zh').split(',').includes(info.language) && !info.bilingual && !info.language.startsWith('zh') && info.language !== 'en') { excluded.语言++; sampleRejection(name, '语言 ' + info.language); continue; }
                    if (candidates.length >= 60) {
                        const uncertain = titleMatched ? candidates.findIndex(candidate => !candidate.titleMatched) : -1;
                        excluded.待确认上限++;
                        if (uncertain < 0) continue;
                        candidates.splice(uncertain,1);
                    }
                    candidates.push({source:'迅雷', name, ...info, titleMatched, opaque:!!match.opaque, matchReason:parsed.tv && !episodeTagged ? '文件未标明准确季集' : match.matchReason, url, ext, release:name, searchTerms:item.searchTerms || []});
                }
                onFiles(`搜索词：${queries.join(' / ')} · 筛选后 ${candidates.length} 份字幕文件` + (candidates.length ? '：' + candidates.slice(0, 12).map(candidate => candidate.name).join('；') + (candidates.length > 12 ? '；…' : '') : ''));
                candidates.sort((a,b) => Number(a.opaque) - Number(b.opaque));
                if (rejectionSamples.length) log('迅雷 排除样例', rejectionSamples.join('；'));
                log('迅雷 筛选', `保留 ${candidates.length} 份 · 排除 ${Object.values(excluded).reduce((a,b) => a + b,0)} 份（${Object.entries(excluded).map(([reason,count]) => reason + ' ' + count).join('，')}）· 待确认 ${candidates.filter(candidate => !candidate.titleMatched).length} 份`);
                return candidates;
            },
            async subdlSearch(row, config, onFiles = () => {}, verify = () => {}) {
                check(); verify();
                if (!config.subdlKey) throw new Error('请先填写 SubDL API Key');
                const parsed = row.parsed, title = subtitleQueryTitle(parsed.query,parsed.year);
                if (!title) throw new Error('缺少可搜索的作品名');
                if (parsed.tv && (parsed.season == null || parsed.episode == null || parsed.endEpisode && parsed.endEpisode !== parsed.episode)) throw new Error('缺少唯一准确季集，未查询 SubDL');
                const languages = config.language === 'en' ? 'EN' : config.language === 'zh-tw' ? 'ZH_BG' : 'ZH,ZH_BG';
                const params = {type:parsed.tv ? 'tv' : 'movie',languages,releases:1,unpack:1,subs_per_page:30};
                if (parsed.tmdbId) params.tmdb_id = parsed.tmdbId;
                else params.film_name = title;
                if (parsed.tv) { params.season_number = parsed.season; if (config.seasonSearch) params.full_season = 1; else params.episode_number = parsed.episode; }
                const candidates = [], seen = new Set(), excluded = {年份:0,季集:0,语言:0,内容:0,无关:0,格式:0}, samples = [];
                const reject = (reason, name) => { excluded[reason]++; if (samples.length < 8) samples.push(`${name}（${reason}）`); };
                log('SubDL 查询', `${parsed.tmdbId ? 'TMDB #' + parsed.tmdbId : title} · ${params.type} · ${languages}`);
                for (let page = 1; page <= 2 && candidates.length < 60; page++) {
                    check(); verify();
                    const query = {...params,page}, key = JSON.stringify(['subdl',config.subdlKey,query]);
                    if (!searchCache.has(key)) {
                        if (config.subdlCacheOnly) break;
                        searchCache.set(key,subdlRequest(query,config,verify).catch(error => { searchCache.delete(key); throw error; })); evict(searchCache,200);
                    }
                    const result = await searchCache.get(key); check(); verify();
                    for (const work of Array.isArray(result.results) ? result.results : []) {
                        if (parsed.tmdbId && work.tmdb_id && String(work.tmdb_id) !== String(parsed.tmdbId) || work.type && work.type !== params.type || !parsed.tv && parsed.year && work.year && String(work.year) !== String(parsed.year)) throw new Error('SubDL 返回作品编号、类型或年份与目标冲突，未采用结果');
                    }
                    log('SubDL 响应', `第 ${page} 页 · ${result.subtitles.length} 条资源`);
                    for (const item of result.subtitles) {
                        if (!item || item.ai_translated) continue;
                        const fallback = ({ZH:'zh',ZH_BG:'zh-tw',EN:'en'})[item.language];
                        if (!fallback) { reject('语言',item.name); continue; }
                        const fields = [...(Array.isArray(item.releases) ? item.releases.filter(value => typeof value === 'string') : []),item.release_name || '',String(item.name || '').replace(/\.zip$/i,'')];
                        const unpacked = Array.isArray(item.unpack_files) ? item.unpack_files.filter(file => file?.url && /\.(srt|ass|ssa|vtt)$/i.test(file.name || '')) : [];
                        const files = unpacked.length ? unpacked : [{name:item.name,url:item.url,season:item.season,episode:item.episode}];
                        for (const file of files) {
                            const name = String(file.name || ''), ext = name.split('.').pop().toLowerCase();
                            if (!['srt','ass','ssa','vtt','zip'].includes(ext) || !file.url) { reject('格式',name); continue; }
                            let url;
                            try { url = subtitleDownloadUrl(file.url,{base:'https://dl.subdl.com/'}); } catch { reject('格式',name); continue; }
                            if (seen.has(url)) continue;
                            seen.add(url);
                            const tagged = /S\d+[ ._-]*E\d+/i.test(name);
                            const exactEpisode = tagged ? assrtEpisode(name,parsed) : Number(file.season) === parsed.season && Number(file.episode) === parsed.episode && (unpacked.length > 0 || !item.full_season && !(Number(item.episode_end) > Number(item.episode_from)));
                            // SubDL uses season=0 for unknown metadata; an explicit SxxExx filename still identifies the episode.
                            if ((!parsed.tv && tagged) || parsed.tv && (tagged && !exactEpisode || !exactEpisode && ext !== 'zip' || Number(file.season) > 0 && Number(file.season) !== parsed.season
                                || unpacked.length > 0 && Number(file.episode) > 0 && Number(file.episode) !== parsed.episode)) { reject('季集',name); continue; }
                            const archiveTitle = name.replace(/\.zip$/i,'');
                            const archiveIdentity = ext === 'zip' && subtitleWorkIdentity(parsed,[],archiveTitle);
                            if (archiveIdentity?.hardMismatch) { reject('年份',name); continue; }
                            const matchName = ext === 'zip' ? fields.find(value => subtitleWorkIdentity(parsed,[],value).titleMatched) || archiveTitle : name;
                            const numberedFile = parsed.tv && exactEpisode && unpacked.length && /^(?:E(?:P)?[ ._-]*)?\d{1,3}(?:[ ._-](?:chs|cht|zh|zh-cn|zh-tw|简体|繁体|简中|繁中))?\.(?:srt|ass|ssa|vtt)$/i.test(name);
                            if (numberedFile && Number(name.match(/\d+/)[0]) !== parsed.episode) { reject('季集',name); continue; }
                            const match = subtitleCandidateFilter(parsed,fields,numberedFile ? '' : matchName,!!config.reviewCandidates);
                            if (match.excluded) { reject(match.excluded,name); continue; }
                            const info = subtitleFileInfo(name,fallback);
                            if (!info.language.startsWith('zh') && info.language !== 'en') { reject('语言',name); continue; }
                            if (candidates.length >= 60) break;
                            candidates.push({source:'SubDL',name,...info,...match,titleMatched:match.titleMatched && (!parsed.tv || exactEpisode || ext === 'zip'),url,ext,release:fields.join(' · '),subdlFields:fields,archiveSeason:subtitlePackSeason(fields,item.season),parsed:{...parsed}});
                        }
                    }
                    if (page >= Number(result.totalPages || 1) || result.subtitles.length < 30) break;
                }
                onFiles(`${title} · ${candidates.length} 份字幕资源：${candidates.slice(0,12).map(candidate => candidate.name).join('；')}`);
                if (samples.length) log('SubDL 排除样例',samples.join('；'));
                log('SubDL 筛选',`保留 ${candidates.length} 份 · 排除 ${Object.values(excluded).reduce((a,b) => a+b,0)} 份（${Object.entries(excluded).map(([reason,count]) => reason + ' ' + count).join('，')}）`);
                const covered = [];
                for (const candidate of candidates) {
                    if (candidate.ext === 'zip' && config.subdlCacheOnly && !archiveCache.has(candidate.url)) continue;
                    if (candidate.ext === 'zip' && archiveCache.has(candidate.url)) {
                        try {
                            const archive = await archiveData(candidate.url,verify);
                            if (!subtitleArchiveChoices(archive.index,candidate,config.language).length) continue;
                        } catch (error) { check(); verify(); if (error.stop) throw error; continue; }
                    }
                    covered.push(candidate);
                }
                return covered.sort((a,b) => Number(a.opaque) - Number(b.opaque));
            },
            subdlCachedEpisode(row,config,onFiles = () => {},verify = () => {}) {
                if (!row.parsed.tv || row.parsed.season == null || row.parsed.episode == null || row.parsed.endEpisode && row.parsed.endEpisode !== row.parsed.episode) return [];
                return this.subdlSearch(row,{...config,seasonSearch:true,subdlCacheOnly:true},onFiles,verify);
            },
            logout() { token = ''; tokenKey = ''; searchCache.clear(); seasonCache.clear(); detailCache.clear(); seasonPreparations.clear(); archiveCache.clear(); },
            async login(username, password, config) {
                token = ''; tokenKey = '';
                if (!username || !password) throw new Error('请输入 OpenSubtitles 用户名和密码');
                const result = await request('/login', config, {username, password});
                if (!result?.token) throw new Error('接口未返回登录令牌');
                token = result.token; tokenKey = config.key;
            },
            async search(row, config) {
                const parsed = row.parsed;
                const title = subtitleQueryTitle(parsed.query, parsed.year);
                if (!title) throw new Error('无法从文件名识别作品名称');
                if (parsed.tv && (parsed.season === null || parsed.episode === null)) throw new Error('缺少明确季集，请先在影视整理中确认季集并重命名');
                if (parsed.endEpisode && parsed.endEpisode !== parsed.episode) throw new Error('合并多集视频需要单独匹配字幕，本次未自动查询');
                const params = new URLSearchParams({query: title, languages: config.language, order_by: 'download_count', order_direction: 'desc'});
                if (parsed.tmdbId) params.set(parsed.tv ? 'parent_tmdb_id' : 'tmdb_id', parsed.tmdbId);
                if (parsed.tv) { params.set('season_number', parsed.season); params.set('episode_number', parsed.episode); params.set('type','episode'); }
                else { params.set('type','movie'); if (parsed.year) params.set('year',parsed.year); }
                const cacheKey = JSON.stringify([config.key, params.toString()]);
                if (!searchCache.has(cacheKey)) searchCache.set(cacheKey, request('/subtitles?' + params, config).catch(error => { searchCache.delete(cacheKey); throw error; }));
                const result = await searchCache.get(cacheKey);
                if (!Array.isArray(result?.data)) throw new Error('搜索返回格式异常');
                const candidates = [];
                for (const item of result.data) {
                    const attrs = item.attributes || {}, feature = attrs.feature_details || {};
                    const identity = parsed.tv ? feature.parent_tmdb_id : feature.tmdb_id;
                    const yearMatches = parsed.tv || !parsed.year || !feature.year || String(feature.year) === String(parsed.year);
                    const titleMatched = [feature.title, feature.movie_name].some(value => titleKey(value) === titleKey(title)) && yearMatches;
                    if (parsed.tmdbId && identity && String(identity) !== String(parsed.tmdbId)) continue;
                    if (!parsed.tv && /episode|tvshow/i.test(feature.feature_type || '')) continue;
                    if (parsed.tv && (Number(feature.season_number) !== parsed.season || Number(feature.episode_number) !== parsed.episode)) continue;
                    for (const file of attrs.files || []) if (Number.isSafeInteger(file.file_id) && file.file_id > 0) {
                        const match = subtitleWorkIdentity(parsed, [feature.title, feature.movie_name], file.file_name || 'subtitle');
                        candidates.push({source:'OpenSubtitles', fileId:file.file_id, ...subtitleFileInfo(file.file_name || attrs.release || '', attrs.language || ''), release:[feature.movie_name || feature.title, attrs.release].filter(Boolean).join(' · '), name:file.file_name || '', workIdentity:{tmdbId:identity,year:feature.year,tv:parsed.tv,season:feature.season_number,episode:feature.episode_number}, hardMismatch:!yearMatches || !!match.hardMismatch, titleMatched:titleMatched && match.titleMatched, identityMatched:yearMatches && match.titleMatched && !!parsed.tmdbId && String(identity) === String(parsed.tmdbId), matchReason:!yearMatches ? '作品年份与视频不符' : match.matchReason});
                    }
                }
                return candidates.slice(0, 12);
            },
            async shooterHash(hash, name, language = 'zh') {
                const body = new URLSearchParams({filehash:hash, pathinfo:name, format:'json', lang:language === 'en' ? 'Eng' : 'Chn'}).toString();
                const result = await subtitleRemoteJson('https://www.shooter.cn/api/subapi.php', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body, timeout:8000});
                if (result === null || result === -1 || Array.isArray(result) && !result.length) return [];
                if (!Array.isArray(result)) throw new Error('射手接口返回异常，暂时无法匹配');
                return result.flatMap(item => (item.Files || []).filter(file => file.Link).map(file => ({source:'射手', hashMatched:true, name:item.Desc || '', release:item.Desc || '', language:'', url:file.Link, ext:String(file.Ext || '').replace(/^\./,'').toLowerCase()}))).filter(item => ['srt','ass','ssa','vtt'].includes(item.ext));
            },
            async fetchFile(candidate, config, progress = () => {}, verify = () => {}) {
                for (let attempt = 0; attempt < 2; attempt++) {
                    verify();
                    let result;
                    try {
                        result = await this.download(candidate, config); verify();
                        if (result.fileName) progress('文件选择', `${candidate.assrtId || candidate.source} · ${result.fileName}`);
                        const archive = candidate.source === 'SubDL' && result.ext === 'zip' ? await archiveData(result.url,verify) : null;
                        let bytes = archive ? archive.bytes : await subtitleBinary(result.url, {allowHttp:result.allowHttp === true}); verify();
                        if (archive) {
                            const file = await subtitleSubdlArchive(bytes,candidate,config.language,verify,archive.index);
                            bytes = file.bytes; result.ext = file.ext; result.fileName = file.name;
                            progress('SubDL 压缩包选择',file.name);
                        }
                        return {result, bytes};
                    } catch (error) {
                        verify();
                        if (error.status === 493 && candidate.source === 'Assrt') {
                            failedAssrtPackages.add(String(candidate.assrtId));
                            if (!assrtDownloadBlocked && failedAssrtPackages.size >= 2) {
                                assrtDownloadBlocked = true;
                                log('下载熔断', `Assrt 下载已熔断：本批已有 ${failedAssrtPackages.size} 个资源包返回 493，剩余 Assrt 候选跳过`);
                            }
                            throw Object.assign(new Error(`Assrt 单文件提取失败（HTTP 493，资源 #${candidate.assrtId}）；优先尝试其他资源包`), {status:493});
                        }
                        if (attempt || error.phase !== 'transfer' || !([401,403,408,429,500,502,503,504].includes(error.status) || error.retryable)) throw error;
                        progress('下载重试', `${candidate.source} · ${new URL(result.url).hostname} · ${error.message}；刷新下载地址后重试一次`);
                        if (candidate.source === 'Assrt') detailCache.delete(detailKey(candidate.assrtId,config));
                        if (candidate.source === 'SubDL') archiveCache.delete(candidate.url);
                        await pause(1500);
                    }
                }
            },
            async download(candidate, config) {
                if (candidate.source === 'Assrt') {
                    if (assrtDownloadBlocked) throw Object.assign(new Error('Assrt 下载已熔断，本批跳过'), {assrtDownloadBlocked:true});
                    let item;
                    try { item = await assrtDetail(candidate.assrtId, config, true); }
                    catch (error) {
                        // Quota exhaustion pauses the batch instead of burning sibling candidates.
                        if (error.assrtCooldown) error.stop = true;
                        throw error;
                    }
                    let files = assrtFiles(item).filter(file => /\.(srt|ass|ssa|vtt)$/i.test(file.f || '') && file.url);
                    if (candidate.parsed.tv) files = files.filter(file => !/S\d+[ ._-]*E\d+/i.test(file.f) || assrtEpisode(file.f,candidate.parsed));
                    if (candidate.assrtFileName) files = files.filter(file => file.f === candidate.assrtFileName);
                    if (!files.length) throw new Error('未提供可直接下载的字幕文件（压缩包暂不支持）');
                    const fileScore = file => subtitlePreference({name:file.f, language:candidate.language}, config.language);
                    files.sort((a, b) => fileScore(b) - fileScore(a) || String(a.f).localeCompare(String(b.f)));
                    const file = files[0];
                    return {url:subtitleDownloadUrl(file.url,{allowHttp:true,base:'https://assrt.net/'}),ext:file.f.split('.').pop().toLowerCase(),fileName:file.f,allowHttp:true};
                }
                if (candidate.source === '射手') return {url:subtitleDownloadUrl(candidate.url,{allowHttp:true,base:'https://www.shooter.cn/'}), ext:candidate.ext,allowHttp:true};
                if (candidate.source === '迅雷') return {url:subtitleDownloadUrl(candidate.url,{allowHttp:true}), ext:candidate.ext,allowHttp:true};
                if (candidate.source === 'SubDL') return {url:subtitleDownloadUrl(candidate.url),ext:candidate.ext,fileName:candidate.name};
                const result = await request('/download', config, {file_id:candidate.fileId});
                const ext = String(result?.file_name || candidate.name).split('.').pop().toLowerCase();
                return {url:subtitleDownloadUrl(result?.link), ext};
            }
        };
    }

    const SUBTITLE_LIMIT = 16 * 1024 * 1024;
    function subtitleArchiveIndex(bytes, check = () => {}) {
        // Parse the central directory once; do not inflate unrelated files.
        const invalid = () => new Error('SubDL ZIP 格式不支持或数据不完整（不支持加密、ZIP64、多卷及 RAR）');
        const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        let end = bytes.length - 22;
        for (; end >= Math.max(0,bytes.length - 65557); end--) {
            if (view.getUint32(end,true) === 0x06054b50 && end + 22 + view.getUint16(end+20,true) === bytes.length) break;
        }
        if (end < 0 || end < bytes.length - 65557) throw invalid();
        const count = view.getUint16(end+10,true), size = view.getUint32(end+12,true), start = view.getUint32(end+16,true);
        if (view.getUint16(end+4,true) || view.getUint16(end+6,true) || count !== view.getUint16(end+8,true) || count > 2000 || start + size !== end) throw invalid();
        const files = [];
        let offset = start;
        for (let i = 0; i < count; i++) {
            check();
            if (offset + 46 > end || view.getUint32(offset,true) !== 0x02014b50) throw invalid();
            const flags = view.getUint16(offset+8,true), method = view.getUint16(offset+10,true), crc = view.getUint32(offset+16,true);
            const compressed = view.getUint32(offset+20,true), length = view.getUint32(offset+24,true), local = view.getUint32(offset+42,true);
            const nameSize = view.getUint16(offset+28,true), next = offset + 46 + nameSize + view.getUint16(offset+30,true) + view.getUint16(offset+32,true);
            if (next > end || view.getUint16(offset+34,true)) throw invalid();
            const path = new TextDecoder(flags & 0x800 ? 'utf-8' : 'gb18030').decode(bytes.subarray(offset+46,offset+46+nameSize));
            const name = path.split(/[\\/]/).pop(), ext = name.split('.').pop().toLowerCase();
            offset = next;
            if (!['srt','ass','ssa','vtt'].includes(ext) || path.startsWith('__MACOSX/') || name.startsWith('._')) continue;
            if (flags & 1 || ![0,8].includes(method) || !length || length > SUBTITLE_LIMIT || compressed > SUBTITLE_LIMIT) continue;
            files.push({name,path,ext,method,crc,compressed,length,local,flags});
        }
        if (offset !== end) throw invalid();
        return {files,start};
    }
    function subtitleArchiveChoices(index,candidate,language) {
        const parsed = candidate.parsed;
        if (parsed.tv && (parsed.season == null || parsed.episode == null || parsed.endEpisode && parsed.endEpisode !== parsed.episode)) return [];
        const files = [];
        for (const file of index.files) {
            const {name} = file;
            let identityName = name;
            if (parsed.tv) {
                const episodes = [...name.matchAll(/S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)/gi)];
                const bare = name.match(/^(?:E(?:P)?[ ._-]*)?(\d{1,3})(?:[ ._-](?:chs|cht|zh|zh-cn|zh-tw|简体|繁体|简中|繁中))?\.(?:srt|ass|ssa|vtt)$/i);
                if (bare && candidate.titleMatched && candidate.archiveSeason === parsed.season) {
                    const folders = file.path.replace(/\\/g,'/').split('/').slice(0,-1);
                    const seasons = folders.flatMap(folder => [...folder.matchAll(/(?:^|[^a-z])(?:Season[ ._-]*|S)(\d{1,2})(?!\d)/gi)].map(match => Number(match[1])));
                    if (Number(bare[1]) !== parsed.episode || seasons.some(season => season !== parsed.season)
                        || folders.some(folder => /^(?:extras?|specials?|bonus|特典|花絮)$/i.test(folder))) continue;
                    identityName = parsed.query + '.S' + String(parsed.season).padStart(2,'0') + 'E' + String(parsed.episode).padStart(2,'0') + '.' + file.ext;
                } else if (episodes.length !== 1 || Number(episodes[0][1]) !== parsed.season || Number(episodes[0][2]) !== parsed.episode || /E\d+[ ._-]*[-~][ ._-]*(?:E)?\d+/i.test(name)) continue;
            }
            const match = subtitleCandidateFilter(parsed,candidate.subdlFields || [],identityName);
            const info = subtitleFileInfo(name,candidate.language);
            if (match.excluded || !match.titleMatched || !subtitleLanguageMatch(name,language) && !language.split(',').some(wanted => wanted === info.language || wanted.startsWith('zh') && info.language.startsWith('zh'))) continue;
            files.push({...file,score:subtitlePreference({...info,name},language)});
        }
        return files.sort((a,b) => b.score-a.score || a.name.localeCompare(b.name));
    }
    async function subtitleSubdlArchive(bytes, candidate, language, check = () => {}, index = subtitleArchiveIndex(bytes,check)) {
        const invalid = () => new Error('SubDL ZIP 格式不支持或数据不完整');
        check();
        const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), start = index.start;
        const files = subtitleArchiveChoices(index,candidate,language);
        if (!files.length) throw new Error('SubDL 压缩包没有通过片名、年份、季集及语言检查的文本字幕');
        const file = files[0], local = file.local;
        if (local + 30 > start || view.getUint32(local,true) !== 0x04034b50 || view.getUint16(local+6,true) !== file.flags || view.getUint16(local+8,true) !== file.method) throw invalid();
        const dataStart = local + 30 + view.getUint16(local+26,true) + view.getUint16(local+28,true);
        if (dataStart + file.compressed > start) throw invalid();
        let payload = bytes.subarray(dataStart,dataStart+file.compressed);
        if (file.method === 8) {
            let inflater;
            try { inflater = new DecompressionStream('deflate-raw'); } catch { throw new Error('当前浏览器不支持 ZIP 解压，请更新浏览器或选择其他来源的单文件字幕'); }
            const reader = new Blob([payload]).stream().pipeThrough(inflater).getReader(), chunks = [];
            let total = 0;
            try {
                for (;;) {
                    check(); const {done,value} = await reader.read(); if (done) break;
                    total += value.length;
                    if (total > file.length || total > SUBTITLE_LIMIT) throw invalid();
                    chunks.push(value);
                }
            } finally { await reader.cancel().catch(() => {}); }
            payload = new Uint8Array(total); let at = 0;
            for (const chunk of chunks) { payload.set(chunk,at); at += chunk.length; }
        }
        check();
        let crc = 0xffffffff;
        for (const byte of payload) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
        if (payload.length !== file.length || (crc ^ 0xffffffff) >>> 0 !== file.crc) throw invalid();
        return {name:file.name,ext:file.ext,bytes:payload};
    }
    function subtitleBinary(url, {method = 'GET', headers = {}, bytes, range, limit = SUBTITLE_LIMIT, allowHttp = false} = {}) {
        url = subtitleDownloadUrl(url, {allowHttp:allowHttp && method === 'GET' && !bytes && !Object.keys(headers).length});
        return new Promise((resolve, reject) => {
            let request, rejected = false;
            const fail = message => { rejected = true; reject(new Error(message)); request?.abort(); };
            request = GM_xmlhttpRequest({url, method, headers, data: bytes && new Blob([bytes]), anonymous:true,
                responseType:'arraybuffer', timeout:range ? 8000 : 60000,
                onreadystatechange: response => {
                    if (range && response.readyState === 2 && response.status && response.status !== 206) fail('网盘未提供分段读取，已停止取样，不下载完整视频');
                },
                onprogress: event => { if (event.loaded > limit || event.lengthComputable && event.total > limit) fail('响应超过大小限制，已停止读取'); },
                onload: response => {
                    if (rejected) return;
                    if (response.status < 200 || response.status >= 300) { reject(Object.assign(new Error('文件传输失败（HTTP ' + response.status + '）'), {status:response.status, phase:'transfer'})); return; }
                    const data = new Uint8Array(response.response || new ArrayBuffer(0));
                    if (data.length > limit) { reject(new Error('响应超过大小限制')); return; }
                    if (range) {
                        const contentRange = String(response.responseHeaders || '').match(/^content-range:\s*bytes\s+(\d+)-(\d+)\/(\d+)/im);
                        if (response.status !== 206 || !contentRange || Number(contentRange[1]) !== range[0] || Number(contentRange[2]) !== range[1] || Number(contentRange[3]) !== range[2] || data.length !== range[1] - range[0] + 1) {
                            reject(new Error('网盘返回的视频片段范围不正确，未计算哈希')); return;
                        }
                    }
                    resolve(data);
                },
                onerror: () => reject(Object.assign(new Error('文件传输连接失败'), {phase:'transfer', retryable:true})),
                ontimeout: () => reject(Object.assign(new Error('文件传输超时，请重试'), {phase:'transfer', retryable:true})),
                onabort: () => reject(new Error('文件传输已停止'))
            });
        });
    }
    function subtitleDecode(bytes) {
        const decode = encoding => ({text:new TextDecoder(encoding, {fatal:true}).decode(bytes), encoding});
        // UTF-16 subtitles are common; decoding them as a legacy encoding leaves NULs between timestamp characters.
        if (bytes[0] === 0xff && bytes[1] === 0xfe) return decode('utf-16le');
        if (bytes[0] === 0xfe && bytes[1] === 0xff) return decode('utf-16be');
        const pairs = Math.floor(Math.min(bytes.length, 2048) / 2);
        let evenZero = 0, oddZero = 0;
        for (let i = 0; i < pairs * 2; i += 2) {
            if (bytes[i] === 0) evenZero++;
            if (bytes[i + 1] === 0) oddZero++;
        }
        if (pairs >= 8 && oddZero / pairs > 0.3 && evenZero / pairs < 0.1) return decode('utf-16le');
        if (pairs >= 8 && evenZero / pairs > 0.3 && oddZero / pairs < 0.1) return decode('utf-16be');
        try { return decode('utf-8'); }
        catch { return decode('gb18030'); }
    }
    function subtitleDialogue(text, ext) {
        if (!/^(?:ass|ssa)$/i.test(ext)) return text.replace(/<[^>]*>/g, '').split(/\r?\n/).filter(line => !/-->|^\s*\d+\s*$|^WEBVTT/.test(line)).join('\n');
        let inEvents = false, textColumn = 9;
        const lines = [];
        for (const line of text.split(/\r?\n/)) {
            if (/^\s*\[/.test(line)) inEvents = /^\s*\[Events\]/i.test(line);
            if (!inEvents) continue;
            if (/^\s*Format\s*:/i.test(line)) {
                const index = line.replace(/^\s*Format\s*:/i, '').split(',').findIndex(value => value.trim().toLowerCase() === 'text');
                if (index >= 0) textColumn = index;
            }
            if (/^\s*Dialogue\s*:/i.test(line)) lines.push(line.replace(/^\s*Dialogue\s*:/i, '').split(',').slice(textColumn).join(',').replace(/\{[^}]*\}/g, '').replace(/\\[Nnh]/g, ' '));
        }
        return lines.join('\n');
    }
    function subtitlePayload(bytes, ext, language, onDecoded = () => {}) {
        if (!bytes.length || bytes.length > SUBTITLE_LIMIT || !['srt','ass','ssa','vtt'].includes(ext)) throw new Error('仅支持单个 SRT、ASS、SSA、VTT 字幕，不导入压缩包或不完整字幕对');
        let decoded;
        try { decoded = subtitleDecode(bytes); }
        catch { throw new Error('字幕文本解码失败（UTF-8 / UTF-16 / GB18030），未上传'); }
        const {text, encoding} = decoded;
        onDecoded(`编码 ${encoding.toUpperCase()}，${bytes.length} 字节`);
        if (/^\s*(?:<!doctype\s+html|<html|\{"(?:error|message)")/i.test(text) || !(/\d{1,2}:\d{2}:\d{2}[,.]\d{2,3}\s*-->|\d{2}:\d{2}\.\d{3}\s*-->|\[Events\][\s\S]*Dialogue\s*:/i.test(text))) throw new Error('下载内容不是可识别的字幕文本（' + encoding.toUpperCase() + '，' + bytes.length + ' 字节，' + (/<!doctype\s+html|<html|<body/i.test(text.slice(0, 1024)) ? '返回了 HTML 页面' : '缺少字幕时间轴或 Dialogue') + '）');
        const dialogue = subtitleDialogue(text, ext);
        if (language !== 'en' && !/[\u3400-\u9fff]/.test(dialogue)) throw new Error('字幕正文未检测到中文，未上传');
        if (language === 'en' && !/[a-z]{2}/i.test(dialogue)) throw new Error('字幕正文未检测到英文，未上传');
        return text;
    }
    function subtitleValidateContent(row, bytes, ext, language, log = () => {}) {
        let encoding = '';
        const text = subtitlePayload(bytes, ext, language, message => { encoding = message; log('字幕解码', message); });
        const timing = subtitleCheckDuration(row, text, ext, log);
        return {text, encoding, ...timing, work:{status:'unconfirmed', reason:'正文格式和语言通过，作品归属未确认'}};
    }
    function subtitleVerificationMessage(result) {
        return `格式/语言通过；${result.duration ? '长度下限通过' : '无时长参考'}；${result.work?.status === 'supported' ? 'AI 支持作品归属（非实证）' : '作品归属未确认'}；未核对音画同步`;
    }
    function createSubtitleBodyReviewer(ai, log = () => {}, check = () => {}) {
        let parseFailures = 0;
        return paced(0, async (row, text, ext, verify = check) => {
            const check = verify;
            check();
            const unknown = reason => ({status:'unconfirmed', reason});
            if (parseFailures >= 2) return unknown('本批 AI 正文复查已停用');
            const dialogue = subtitleDialogue(text, ext).trim();
            const starts = [0, Math.max(0, Math.floor(dialogue.length / 2) - 1000), Math.max(0, dialogue.length - 2000)];
            const excerpts = [...new Set(starts.map(start => dialogue.slice(start, start + 2000)).filter(Boolean))];
            try {
                check();
                const result = await ai.reviewSubtitleBody({work:row.parsed || {}, excerpts}); check();
                const evidence = typeof result?.evidence === 'string' ? result.evidence.trim() : '';
                if (!result || !['same','different','uncertain'].includes(result.verdict) || typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1 || typeof result.reason !== 'string') throw Object.assign(new Error('正文复查返回字段无效'), {aiParse:true});
                parseFailures = 0;
                if (result.verdict === 'uncertain' || result.confidence < .95 || evidence.length < 4 || evidence.length > 160 || !excerpts.some(excerpt => excerpt.includes(evidence)) || !result.reason.trim()) return unknown('正文证据不足，未确认作品归属');
                const work = {status:result.verdict === 'same' ? 'supported' : 'mismatch', reason:result.reason.slice(0,200)};
                log('AI 正文复查', `${row.node.name} · ${work.status === 'mismatch' ? '疑似其他作品，暂停自动补齐' : '支持作品归属，但不代表音画同步'} · ${work.reason}`);
                return work;
            } catch (error) {
                check(); if (error.stop) throw error;
                if (error.aiParse && ++parseFailures >= 2) log('AI 正文复查', '连续两次解析失败，本批剩余正文复查停用');
                log('AI 正文复查失败', `${row.node.name} · ${error.message}`);
                return unknown('AI 复查未完成');
            }
        });
    }
    function subtitleLanguageMatch(name, wanted) {
        const info = subtitleFileInfo(name);
        return wanted.split(',').some(language => language === 'en' ? info.language === 'en' || info.bilingual
            : language === 'zh' ? info.language.startsWith('zh') : info.language === language);
    }
    function selectSubtitleCandidate(row, language) {
        const tokens = value => new Set((String(value).toLowerCase().match(/2160p|1080p|720p|bluray|bdrip|webrip|web[ ._-]?dl|remux|hdtv|x26[45]/g) || []).map(v => v.replace(/[ ._-]/g,'')));
        const original = tokens(row.node.name), wanted = language.split(',');
        const scored = (row.candidates || []).map(candidate => {
            const version = tokens(candidate.release + ' ' + candidate.name);
            const conflicts = [...original].some(token => /^(?:2160p|1080p|720p)$/.test(token) && [...version].some(other => /^(?:2160p|1080p|720p)$/.test(other) && token !== other));
            const overlaps = [...original].filter(token => version.has(token)).length;
            const lang = wanted.includes(candidate.language) || wanted.some(value => subtitleLanguageMatch(candidate.name, value));
            const identity = candidate.identityMatched || candidate.titleMatched || candidate.aiAccepted;
            const reliable = !candidate.downloadFailed && !candidate.hardMismatch && (!!candidate.hashMatched || !!identity && lang && !conflicts);
            const preference = wanted.indexOf(candidate.language);
            return {candidate, reliable, preference:subtitlePreference(candidate, language), score:(candidate.hashMatched ? 1000 : 0) + (candidate.identityMatched ? 100 : 0) + (candidate.titleMatched ? 50 : 0) + overlaps * 10 + (lang ? 5 : 0) + (preference < 0 ? 0 : (wanted.length - preference) / 10)};
        }).sort((a,b) => Number(!!a.candidate.opaque) - Number(!!b.candidate.opaque) || Number(b.reliable) - Number(a.reliable) || b.preference - a.preference || b.score - a.score);
        row.candidates = scored.map(item => item.candidate);
        row.autoCandidates = scored.filter(item => item.reliable).map(item => item.candidate);
        row.selectedCandidate = row.autoCandidates[0] || null;
        row.aiSuggested = !!row.selectedCandidate?.aiAccepted;
    }
    function subtitleSearchState(row) {
        if (row.complete) return 'complete';
        if (row.pendingVerification) return 'pending';
        if (row.error) return 'failed';
        if (row.selectedCandidate) return 'ready';
        if (row.candidates?.length) return 'choice';
        if (!row.sources?.some(source => !source.skipped)) return 'unsearched';
        return row.sources.some(source => source.error) ? 'failed' : 'missing';
    }
    function subtitleAICandidate(result, row, language, onReject = () => {}) {
        const deny = reason => { onReject(reason); return null; };
        if (!Number.isInteger(result?.index) || !Number.isFinite(result.confidence) || result.confidence < .9 || result.confidence > 1) return deny('未指定候选或置信度不足 90%');
        const candidate = row.candidates?.[result.index];
        if (!candidate) return deny('候选编号不在列表中');
        if (candidate.hardMismatch || candidate.downloadFailed) return deny('候选已有冲突或下载失败');
        if (candidate.mainTitleFallback || candidate.opaque) return deny('仅主名搜索或来源文件名不含可识别片名，需要手动确认');
        const parsed = row.parsed, identity = candidate.workIdentity;
        const match = subtitleWorkIdentity(parsed, [candidate.release], candidate.name || '');
        if (match.hardMismatch) return deny(match.matchReason || '作品信息冲突');
        if (subtitleNetworkEditionMismatch(parsed, [candidate.name,candidate.release])) return deny('网络版不能作为电影版字幕');
        if (identity) {
            if (!!identity.tv !== !!parsed.tv || parsed.tmdbId && identity.tmdbId && String(parsed.tmdbId) !== String(identity.tmdbId)) return deny('类型或 TMDB 编号冲突');
            if (!parsed.tv && parsed.year && identity.year && String(parsed.year) !== String(identity.year)) return deny('年份冲突');
        }
        const episodeText = (candidate.name || '') + ' ' + (candidate.release || '');
        const episodes = [...episodeText.matchAll(/S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)/gi)];
        if (parsed.tv) {
            if (parsed.season == null || parsed.episode == null || parsed.endEpisode && parsed.endEpisode !== parsed.episode) return deny('目标季集不完整或为多集文件');
            if (identity && (Number(identity.season) !== parsed.season || Number(identity.episode) !== parsed.episode)) return deny('接口季集冲突');
            if (!episodes.length && !identity || episodes.some(match => Number(match[1]) !== parsed.season || Number(match[2]) !== parsed.episode)
                || /E\d+[ ._-]*[-~][ ._-]*(?:E)?\d+/i.test(episodeText)) return deny('字幕缺少准确季集或季集冲突');
        } else if (episodes.length) return deny('电影候选含剧集季集编号');
        const wanted = language.split(',');
        const languageMatch = wanted.includes(candidate.language) || candidate.bilingual && wanted.some(value => value.startsWith('zh')) || wanted.some(value => subtitleLanguageMatch(candidate.name || '', value));
        if (!languageMatch) return deny('字幕语言未确认或不符合所选语言');
        const quality = value => String(value || '').match(/(?:^|[^a-z0-9])(2160p|1080p|720p)(?=$|[^a-z0-9])/i)?.[1].toLowerCase();
        const sourceQuality = quality(row.node.name), candidateQuality = quality((candidate.release || '') + ' ' + (candidate.name || ''));
        if (sourceQuality && candidateQuality && sourceQuality !== candidateQuality) return deny('分辨率版本冲突');
        return candidate;
    }
    function createSubtitleReviewer(ai, language, log = () => {}, check = () => {}) {
        let parseFailures = 0, disabled = false;
        return paced(0, async (row, found, verify = check) => {
            const check = verify;
            check();
            if (disabled) return;
            const unique = new Set();
            const reviewKey = candidate => JSON.stringify([candidate.source,candidate.name,candidate.release,candidate.language,candidate.bilingual]);
            const rejected = new Set();
            const candidates = found.filter(candidate => {
                if (candidate.opaque || candidate.hardMismatch || candidate.detailError || candidate.mainTitleFallback || candidate.downloadFailed) return false;
                const key = reviewKey(candidate);
                if (unique.has(key)) return false;
                unique.add(key); return true;
            }).map(candidate => ({index:row.candidates.indexOf(candidate), source:candidate.source, name:String(candidate.name || '').slice(0,400),
                release:String(candidate.release || '').slice(0,400), language:candidate.language, bilingual:!!candidate.bilingual}));
            // Batch every distinct candidate, rather than silently dropping everything after the first three.
            // Keep indexes stable across batches; remove rejected entries only when review ends.
            try {
                for (let offset = 0; offset < candidates.length; offset += 20) {
                    const batch = candidates.slice(offset,offset + 20);
                    check();
                    log('AI 候选判断', `${row.node.name} · ${batch[0].source} · 第 ${offset + 1}—${offset + batch.length}/${candidates.length} 个不同候选`);
                    try {
                        const result = await ai.disambiguateSubtitle({work:{title:row.parsed.query,aliases:row.parsed.aliases || [],year:row.parsed.year || '',
                            tv:!!row.parsed.tv,season:row.parsed.season,episode:row.parsed.episode,tmdbId:row.parsed.tmdbId || ''},candidates:batch});
                        check(); parseFailures = 0;
                        const candidate = batch.some(item => item.index === result?.index) && subtitleAICandidate(result,row,language, reason => {
                            log('AI 建议未采用', `${row.node.name} · ${row.candidates[result.index].name} · ${reason}`);
                            row.candidates[result.index].matchReason = reason;
                        });
                        log('AI 判断依据', `${row.node.name} · index=${result?.index ?? '无'} · confidence=${result?.confidence ?? '无'} · ${String(result?.reason || '未提供依据').slice(0,300)}`);
                        for (const item of Array.isArray(result?.rejected) ? result.rejected : []) {
                            if (!Number.isInteger(item?.index) || item.index === result.index || !batch.some(entry => entry.index === item.index)
                                || !Number.isFinite(item.confidence) || item.confidence < .9 || item.confidence > 1 || typeof item.reason !== 'string' || !item.reason.trim()) continue;
                            const excluded = row.candidates[item.index];
                            // AI may remove ambiguous alternatives, but cannot veto deterministic matches.
                            if (excluded.hashMatched || excluded.identityMatched || excluded.titleMatched || excluded.aiAccepted) continue;
                            const key = reviewKey(excluded);
                            if (rejected.has(key)) continue;
                            rejected.add(key);
                            log('AI 排除候选', `${row.node.name} · ${excluded.source} · ${excluded.name} · ${item.reason.slice(0,200)} · 置信度 ${Math.round(item.confidence * 100)}%`);
                        }
                        if (candidate) {
                            candidate.aiAccepted = true;
                            candidate.matchReason = '';
                            log('AI 字幕建议', `${row.node.name} · ${subtitleCandidateLabel(candidate)} · 置信度 ${Math.round(result.confidence * 100)}%`);
                            return;
                        }
                        log('AI 字幕建议', `${row.node.name} · 未确认可用字幕，继续其他候选或来源`);
                    } catch (error) {
                        check(); if (error.stop) throw error;
                        log('AI 字幕建议', `${row.node.name} · 判断失败：${error.message}；继续其他来源`);
                        parseFailures = error.aiParse ? parseFailures + 1 : 0;
                        if (parseFailures >= 2) { disabled = true; log('AI 字幕建议', '连续两次解析失败，本批剩余 AI 判断已停用'); return; }
                        // A failed request is not evidence about the remaining candidates.
                        return;
                    }
                }
            } finally {
                row.candidates = row.candidates.filter(candidate => !found.includes(candidate) || !rejected.has(reviewKey(candidate))
                    || candidate.hashMatched || candidate.identityMatched || candidate.titleMatched || candidate.aiAccepted);
                selectSubtitleCandidate(row,language);
            }
        });
    }
    function subtitleSearchSummary(rows) {
        const count = {complete:0,pending:0,ready:0,choice:0,failed:0,missing:0,unsearched:0};
        for (const row of rows) count[subtitleSearchState(row)]++;
        const supported = rows.filter(row => row.complete && row.verification?.work?.status === 'supported').length;
        return `视频 ${rows.length} · 已有/已补齐 ${count.complete} · 待核验 ${count.pending} · 可补齐 ${count.ready} · 待选择 ${count.choice} · 未找到 ${count.missing} · 失败 ${count.failed} · 未查询 ${count.unsearched}`
            + (count.complete ? ` · 其中作品归属未确认 ${count.complete - supported}，AI 支持 ${supported}（未核对音画同步）` : '');
    }
    function subtitleSearchMessage(row) {
        if (row.pendingVerification) return row.error || '字幕文件或上传结果待核验，请先重新检查目录；本次不重复上传。';
        const message = row.selectedCandidate
            ? row.aiSuggested ? 'AI 建议了这份字幕，请核对候选名称；可在下拉框更改后补齐。' : row.manualCandidate ? '已手动选择字幕，点击“补齐字幕”下载并写入视频目录。' : `已自动择优，${row.autoCandidates.length} 个可靠候选；点击“补齐字幕”下载并写入视频目录，下载内容不符时尝试下一份。`
            : row.manualCandidate ? '已跳过此视频；重新选择字幕后可补齐。'
            : row.candidates.length ? '找到候选，但作品或语言未确认，请展开选择。'
            : row.sources.some(source => source.error) ? '查询有失败，不能判定为没有字幕。' : !row.sources.some(source => !source.skipped) ? '尚未查询任何来源，请启用并配置字幕来源。' : '已查询的来源未收录匹配字幕。';
        return message + (row.selectedCandidate ? '\n所选字幕：' + subtitleCandidateLabel(row.selectedCandidate) : '') + '\n' + row.sources.map(source => source.name + '：' + (source.skipped ? '跳过 · ' + source.skipped : source.error ? '失败 · ' + source.error : `保留 ${source.count} 个候选` + (source.rejected ? ` · AI 排除 ${source.rejected} 个其他作品候选` : ''))).join('\n');
    }
    async function searchSubtitleSources(row, config, service, drive, log = () => {}, check = () => {}, resume = false) {
        if (!resume) { row.error = ''; row.candidates = []; row.selectedCandidate = null; row.manualCandidate = false; row.aiSuggested = false; row.sources = []; }
        const title = subtitleQueryTitle(row.parsed.query, row.parsed.year);
        if (!resume && row.parsed.tv) {
            for (const [name,enabled,method] of [['SubDL',config.subdl && config.subdlKey,'subdlCachedEpisode'],['迅雷',config.thunder,'thunderCachedEpisode'],['Assrt 片名搜索',config.assrt && config.assrtToken && !service.assrtDownloadUnavailable?.(),'assrtCachedEpisode']]) {
                if (!enabled || !service[method] || service.searchUnavailable?.(name)) continue;
                check();
                const cached = await service[method](row, config, message => log(name + ' 缓存文件列表', message), check);
                check();
                const selection = {node:row.node,candidates:cached};
                selectSubtitleCandidate(selection, config.language);
                if (!selection.selectedCandidate) continue;
                row.candidates.push(...cached);
                row.sources.push({name,count:cached.length});
                selectSubtitleCandidate(row, config.language);
                log('整季快速命中', `${row.node.name} · ${name} · 复查缓存中的片名、年份及准确季集后选中；跳过本集视频取样与来源搜索，下载后仍检查正文`);
                break;
            }
        }
        if (!resume && !row.selectedCandidate) log('查找阶段', `${row.node.name} · 第一阶段：视频指纹匹配；无可靠指纹候选后进入片名搜索`);
        const run = async (name, enabled, configured, search) => {
            check();
            if (!resume && row.sources.some(source => source.name === name)) return;
            if (resume) {
                if (!row.sources.some(source => source.name === name && source.deferred)) return;
                row.sources = row.sources.filter(source => source.name !== name);
            }
            if (!enabled) { row.sources.push({name,skipped:'已关闭'}); log('来源跳过', `${name} 已关闭`); return; }
            if (!configured) { row.sources.push({name,error:'未配置密钥，未查询'}); log('来源跳过', `${name} 未配置密钥`); return; }
            const unavailable = service.searchUnavailable?.(name);
            if (unavailable) { row.sources.push({name,error:'本批来源暂停：' + unavailable}); log('来源跳过', `${name} 本批已暂停：${unavailable}`); return; }
            selectSubtitleCandidate(row, config.language);
            const selected = row.selectedCandidate;
            if (selected) {
                const reason = name === '射手' ? '已有其他来源候选，暂缓视频取样' : '已有可靠字幕，省去重复查询与视频取样';
                row.sources.push({name,skipped:reason,deferred:true}); log('来源跳过', `${name}：${reason}`); return;
            }
            const started = Date.now(); let fetchedAt = 0;
            try {
                log('来源', `${name} 开始，搜索片名：${title}`);
                const found = await search(); check();
                fetchedAt = Date.now();
                const source = {name,count:found.length};
                row.candidates.push(...found); row.sources.push(source);
                log('来源', `${name} 返回 ${found.length} 个文件候选`);
                selectSubtitleCandidate(row, config.language);
                if (!row.selectedCandidate && config.reviewCandidates) await config.reviewCandidates(row, found, check);
                source.count = found.filter(candidate => row.candidates.includes(candidate)).length;
                source.rejected = found.length - source.count;
                log('来源判断', `${row.node.name} · ${name} · 返回 ${found.length}，AI 排除 ${source.rejected}，保留 ${source.count} · ${row.selectedCandidate ? '产生可靠候选，后续来源暂缓' : source.count ? '只有待确认候选，继续下一来源' : '没有可用候选，继续下一来源'}`);
            } catch (error) {
                check(); row.sources.push({name,error:error.message});
                if ([429,509].includes(error.status) || name === 'SubDL' && [401,403].includes(error.status) || error.apiStatus === 30900 || error.assrtCooldown || name === '射手' && (error.hashSample || /超时|无法连接字幕来源/.test(error.message))) service.pauseSearchSource?.(name,error.message);
                log(error.phase === 'drive-auth' ? '网盘授权失败' : '来源失败', `${row.node.name} · ${name}：${error.message}`);
                if (error.phase === 'drive-auth') { row.error = error.message; row.searchMessage = subtitleSearchMessage(row); throw error; }
            } finally {
                log('来源耗时', `${row.node.name} · ${name} · 查询 ${(((fetchedAt || Date.now()) - started) / 1000).toFixed(1)} 秒${fetchedAt ? '，候选判断 ' + ((Date.now() - fetchedAt) / 1000).toFixed(1) + ' 秒' : ''}`);
            }
        };
        await run('射手', config.shooter, true, async () => {
            log('射手取样', `${row.node.name} · 按射手算法读取四段各 4KB，非网盘完整 MD5`);
            const hash = await drive.sample(row, check, message => log('视频指纹', `${row.node.name} · ${message}`)); check();
            const found = await service.shooterHash(hash, row.node.name, config.language); check();
            log('指纹匹配', `${row.node.name} · ${found.length ? '命中 ' + found.length + ' 份字幕，仍需下载检查正文、语言和时长' : '未命中，转片名搜索'}`);
            return found;
        });
        if (!row.selectedCandidate) log('查找阶段', `${row.node.name} · 视频指纹未形成可靠候选，第二阶段：迅雷片名搜索`);
        await run('迅雷', config.thunder, true, () => service.thunderSearch(row, config, message => log('迅雷 文件列表', message), check));
        if (config.subdl) await run('SubDL', true, config.subdlKey, () => service.subdlSearch(row, config, message => log('SubDL 文件列表',message),check));
        if (!row.selectedCandidate && !row.candidates.some(candidate => candidate.source === '迅雷' && candidate.titleMatched && !candidate.downloadFailed)) {
            log('查找阶段', `${row.node.name} · 迅雷没有可靠候选，补查 Assrt 片名搜索`);
        }
        await run('Assrt 片名搜索', config.assrt, config.assrtToken, () => service.assrtSearch(row, {...config,nonBlockingSearch:true}, message => log('Assrt 文件列表', message), check,
            !row.candidates.some(candidate => candidate.source === '迅雷' && candidate.titleMatched && !candidate.downloadFailed)));
        await run('OpenSubtitles', config.open, config.key, () => service.search(row, config));
        check(); selectSubtitleCandidate(row, config.language);
        row.searchMessage = subtitleSearchMessage(row);
    }
    function subtitleVerificationContext(row) {
        if (!row) return '';
        const node = row.node, parsed = row.parsed || {};
        return JSON.stringify([2, String(node.id), String(node.parentId ?? ''), node.name, node.size, (node.md5 || '').toLowerCase(),
            parsed.query, parsed.year, !!parsed.tv, parsed.tmdbId, parsed.season, parsed.episode, parsed.endEpisode, node.durationSeconds, parsed.runtimeSeconds]);
    }
    async function inspectExistingSubtitles(row, drive, language, log = () => {}, check = () => {}, {force = false, review = null} = {}) {
        row.complete = false; row.pendingVerification = false; row.verification = null;
        const unreadable = [], invalid = [], suspicious = [];
        for (const sub of row.subtitles.filter(sub => /\.(srt|ass|ssa|vtt)$/i.test(sub.name))) {
            check(); drive.assertReady?.();
            if (force) drive.verified?.forget(sub);
            const cached = !force && drive.verified?.get(sub,language,row);
            if (cached) {
                if (cached.result.work?.status === 'mismatch') {
                    suspicious.push(sub.name + '：' + cached.result.work.reason);
                    log('现有字幕待核验', `${row.node.name} · ${sub.name} · 已记录疑似错片：${cached.result.work.reason}`); continue;
                }
                row.verification = cached.result;
                row.complete = true; row.error = ''; row.searchMessage = '已核验记录复用：' + sub.name + ' · ' + subtitleVerificationMessage(cached.result);
                log('已核验记录复用', `${row.node.name} · ${sub.name} · ${subtitleVerificationMessage(cached.result)}`); return;
            }
            log('正文检查', `${row.node.name} · 读取现有字幕 ${sub.name}`);
            let bytes;
            try { bytes = await drive.read(sub, message => log('核验重试', message), check); check(); }
            catch (error) { check(); if (error.stop) throw error; unreadable.push(sub.name + '：' + error.message); log('现有字幕待核验', `${sub.name}：${error.message}`); continue; }
            try {
                const ext = sub.name.split('.').pop().toLowerCase();
                const {text, ...result} = subtitleValidateContent(row, bytes, ext, language, log);
                if (language !== 'zh-cn,zh-tw,zh' && language !== 'en' && !subtitleLanguageMatch(sub.name, language)) { invalid.push(sub.name + '：正文含中文，但所选简繁标记未确认'); continue; }
                if (review) result.work = await review(row, text, ext, check);
                check();
                try { drive.verified?.remember(sub,bytes,language,result.encoding,row,result); } catch (error) { log('核验记录', '保存失败：' + error.message); }
                if (result.work.status === 'mismatch') {
                    suspicious.push(sub.name + '：' + result.work.reason); continue;
                }
                row.verification = result;
                row.complete = true; row.error = ''; row.searchMessage = '已有字幕：' + sub.name + ' · ' + subtitleVerificationMessage(result);
                log('现有字幕确认', `${row.node.name} · ${sub.name} · ${subtitleVerificationMessage(result)}`); return;
            } catch (error) {
                check(); if (error.stop) throw error;
                drive.verified?.forget(sub);
                if (error.subtitleIncomplete) suspicious.push(sub.name + '：' + error.message);
                else invalid.push(sub.name + '：' + error.message);
                log('现有字幕无效', `${sub.name}：${error.message}`);
            }
        }
        if (suspicious.length) { row.pendingVerification = true; row.error = '已有字幕疑似不完整或属于其他作品，暂停自动补齐，请人工核对原字幕：' + suspicious.join('；'); }
        else if (unreadable.length) { row.pendingVerification = true; row.error = '已有字幕读取失败，尚未确认是否可用；先重新检查目录，暂停自动补齐：' + unreadable.join('；'); }
        else { row.error = ''; row.searchMessage = invalid.length ? '已有字幕未通过检查：' + invalid.join('；') : '未发现可核验的外置文本字幕'; }
    }
    function subtitleDrive(context, wait = sleep) {
        const {session, source} = context, guangya = session.provider === '光鸭';
        // A token digest scopes receipts without storing a credential. Token changes do not reuse old receipts.
        const receiptKey = session.token ? 'cross-drive-subtitle-uploads-v1:' + subtitleMd5(new TextEncoder().encode((session.provider || '123') + ':' + session.token)) : '';
        const verifiedKey = receiptKey.replace('cross-drive-subtitle-uploads-v1:', 'cross-drive-subtitle-verified-v1:');
        const savedVerified = verifiedKey && GM_getValue(verifiedKey, []);
        const verifiedEntries = new Map(Array.isArray(savedVerified) ? savedVerified : []);
        const verifiedIdentity = node => node.id != null && Number.isSafeInteger(node.size) && node.size >= 0 && /^[a-f0-9]{32}$/i.test(node.md5 || '')
            ? JSON.stringify([String(node.id),node.size,node.md5.toLowerCase()]) : '';
        const verified = {
            get(node,language,row) { const record = verifiedEntries.get(verifiedIdentity(node)); return record?.language === language && record.encoding && record.time > 0 && record.context && record.context === subtitleVerificationContext(row) && record.result ? record : undefined; },
            remember(node,bytes,language,encoding,row,result) {
                const key = verifiedIdentity(node);
                if (!verifiedKey || !key || !row || !result || node.size !== bytes.length || node.md5.toLowerCase() !== subtitleMd5(bytes)) return;
                verifiedEntries.delete(key); verifiedEntries.set(key,{time:Date.now(),encoding,language,context:subtitleVerificationContext(row),result}); evict(verifiedEntries,5000);
                GM_setValue(verifiedKey,[...verifiedEntries]);
            },
            forget(node) { if (verifiedEntries.delete(verifiedIdentity(node)) && verifiedKey) GM_setValue(verifiedKey,[...verifiedEntries]); },
            clear() { verifiedEntries.clear(); if (verifiedKey) GM_setValue(verifiedKey,[]); }
        };
        const savedReceipts = receiptKey && GM_getValue(receiptKey, []);
        const receipts = new Map(Array.isArray(savedReceipts) ? savedReceipts.filter(entry => Array.isArray(entry) && typeof entry[0] === 'string' && entry[1] && typeof entry[1].name === 'string' && Number.isSafeInteger(entry[1].size) && /^[a-f0-9]{32}$/i.test(entry[1].md5 || '')) : []);
        const videoKey = row => JSON.stringify([String(row.node.id), String(row.node.parentId), row.node.name, row.node.size]);
        const sampleCache = new Map();
        const pendingFor = row => [...receipts].filter(([,record]) => record.video === videoKey(row));
        const persistReceipts = () => { if (receiptKey) GM_setValue(receiptKey, [...receipts]); };
        let authError = null;
        const assertReady = () => { if (authError) throw authError; };
        const driveCall = async operation => {
            assertReady();
            try { return await operation(); }
            catch (error) {
                if (error.stop || [401,403].includes(error.status)) {
                    error.stop = true; error.phase = 'drive-auth';
                    error.message = `${session.provider || '123'}网盘登录失效或权限不足：${error.message}；请刷新网盘登录后重新检查目录`;
                    authError = error;
                }
                throw error;
            }
        };
        const post = paced(350, (path, body, allowed = [0,200]) => driveCall(async () => {
            const response = await requestJson(guangya ? 'https://api.guangyapan.com' + path : session.base + path, {
                method:'POST', credentials:'omit', headers:guangya ? guangyaAuthHeaders(session.token) : {...session.headers, 'Content-Type':'application/json'}, body:JSON.stringify(body)
            });
            if (!allowed.includes(guangya ? guangyaCode(response) : apiCode(response))) {
                const error = apiError('字幕网盘操作', response);
                error.submissionRejected = [110,117,118,400,401,403,404,413,415,422,429].includes(apiCode(response));
                throw error;
            }
            return response;
        }));
        const downloadUrl = async node => {
            if (guangya) {
                const result = await post('/userres/v1/get_res_download_url', {fileId:node.id});
                return subtitleDownloadUrl(result.data?.signedURL || result.data?.signedUrl || result.data?.downloadUrl);
            }
            const result = await post('/file/download_info', {driveId:0, fileId:node.id, fileName:node.name, size:node.size, etag:node.md5, type:0, s3keyFlag:node.s3keyFlag});
            let url = result.data?.DownloadUrl;
            const wrapped = new URL(url).searchParams.get('params');
            if (wrapped) url = atob(wrapped);
            return subtitleDownloadUrl(url);
        };
        const retryable = error => !error.stop && /连接|超时|网络|fetch|network|HTTP\s*(?:401|403|408|429|5\d\d)/i.test(error.message);
        const read = async (node, progress = () => {}, check = () => {}) => {
            if (node.size > SUBTITLE_LIMIT) throw new Error('字幕文件超过 16MB');
            for (let attempt = 0; attempt < 3; attempt++) {
                check();
                try {
                    let url;
                    try { url = await downloadUrl(node); }
                    catch (error) { if (!error.message.startsWith('获取网盘下载地址失败：')) error.message = '获取网盘下载地址失败：' + error.message; throw error; }
                    check(); const bytes = await subtitleBinary(url); check(); return bytes;
                }
                catch (error) {
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
            if (!/^[a-f0-9]{32}$/i.test(hash || '') && guangya && source.metadata) {
                check();
                try {
                    const metadata = await driveCall(() => source.metadata(node)); check();
                    if (metadata?.size !== node.size) return false;
                    hash = metadata.md5;
                } catch (error) { check(); if (error.stop) throw error; progress('文件详情核验失败：' + error.message + '；改用正文核验'); }
            }
            return /^[a-f0-9]{32}$/i.test(hash || '') ? hash.toLowerCase() === md5 : subtitleMd5(await read(node, progress, check)) === md5;
        };
        const list = row => driveCall(() => source.children({id:row.node.parentId}));
        const validateVideo = (row, nodes) => {
            const found = nodes.find(node => node.id === row.node.id);
            if (!found || found.directory || found.name !== row.node.name || found.size !== row.node.size || row.node.md5 && found.md5 && row.node.md5.toLowerCase() !== found.md5.toLowerCase()) throw new Error('视频已移动、改名或内容变化，请重新查找字幕');
        };
        const reconcile = async (row, progress = () => {}, check = () => {}) => {
            const pending = pendingFor(row), recovered = [];
            if (!pending.length) return recovered;
            try {
                check(); progress('检查此前已提交的字幕');
                const nodes = await list(row); check(); validateVideo(row, nodes);
                for (const [key, record] of pending) {
                    check();
                    const matches = nodes.filter(node => node.name === record.name);
                    if (matches.length !== 1 || !await sameContent(matches[0], {length:record.size}, record.md5, progress, check)) throw Object.assign(new Error('此前字幕上传已提交，但目录或内容仍未确认：' + record.name + '；请稍后重新检查目录，不重复上传'), {pendingUpload:true});
                    check(); recovered.push(matches[0]); receipts.delete(key); persistReceipts();
                    progress('已核验此前上传：' + record.name);
                }
                return recovered;
            } catch (error) { check(); error.pendingUpload = true; throw error; }
        };
        async function ossUpload(token, bytes) {
            // Request ALI_OSS capability only, matching the website's provider=1 adapter.
            if (Number(token.provider) !== 1) throw new Error('光鸭未返回请求的 OSS 上传通道，本项未上传');
            const creds = token.creds || token, bucket = token.bucketName, path = token.objectPath;
            if (!bucket || !path || !creds.accessKeyID || !creds.secretAccessKey || !creds.sessionToken) throw new Error('光鸭未返回完整上传凭证');
            const host = token.endPoint || token.fullEndPoint;
            const endpoint = new URL(/^https?:\/\//i.test(host) ? host : 'https://' + host);
            if (!endpoint.hostname.startsWith(bucket + '.')) endpoint.hostname = bucket + '.' + endpoint.hostname;
            endpoint.protocol = 'https:';
            endpoint.pathname = '/' + path.split('/').map(encodeURIComponent).join('/');
            const date = new Date().toUTCString(), type = 'application/octet-stream';
            const canonical = 'PUT\n\n' + type + '\n' + date + '\nx-oss-security-token:' + creds.sessionToken + '\n/' + bucket + '/' + path;
            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey('raw', encoder.encode(creds.secretAccessKey), {name:'HMAC', hash:'SHA-1'}, false, ['sign']);
            const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(canonical)))));
            await subtitleBinary(endpoint.href, {method:'PUT', headers:{'Content-Type':type, Date:date, 'x-oss-security-token':creds.sessionToken, Authorization:'OSS ' + creds.accessKeyID + ':' + signature}, bytes});
        }
        return {
            read, reconcile, assertReady, verified,
            async sample(row, check = () => {}, progress = () => {}) {
                check(); assertReady();
                const size = row.node.size;
                if (!Number.isSafeInteger(size) || size < 12288) throw new Error('视频大小不可用，无法取样');
                const key = JSON.stringify([videoKey(row),row.node.md5 || '']);
                if (sampleCache.has(key)) { progress('复用已计算的四段指纹'); return sampleCache.get(key); }
                const url = await downloadUrl(row.node), hashes = [];
                try {
                    for (const offset of [4096,Math.floor(size / 3) * 2,Math.floor(size / 3),size - 8192]) {
                        check();
                        hashes.push(subtitleMd5(await subtitleBinary(url, {headers:{Range:`bytes=${offset}-${offset + 4095}`}, range:[offset, offset + 4095,size], limit:4096})));
                    }
                } catch (error) { error.hashSample = true; throw error; }
                check();
                const hash = hashes.join(';');
                sampleCache.set(key,hash); evict(sampleCache,200);
                progress('四段取样完成，共 16KB；仅在当前目录会话缓存指纹');
                return hash;
            },
            async save(row, name, bytes, progress = () => {}, check = () => {}) {
                check();
                if (pendingFor(row).length) {
                    const recovered = await reconcile(row, progress, check);
                    const found = recovered.find(node => node.name === name);
                    if (found && await sameContent(found, bytes, subtitleMd5(bytes), progress, check)) return found;
                    throw Object.assign(new Error('此前上传已核验，请重新检查目录后确认字幕状态；本次不再上传其他版本'), {pendingUpload:true});
                }
                const md5 = subtitleMd5(bytes), nodes = await list(row); check(); validateVideo(row, nodes);
                const existing = nodes.filter(node => node.name === name);
                if (existing.length) {
                    if (existing.length !== 1 || !await sameContent(existing[0], bytes, md5, progress, check)) throw new Error('同名字幕已存在且内容不同或无法确认，未覆盖');
                    return existing[0];
                }
                check(); progress('上传到视频目录');
                const receiptId = JSON.stringify([videoKey(row), name]);
                receipts.set(receiptId, {video:videoKey(row), name, size:bytes.length, md5, time:Date.now()});
                try { persistReceipts(); }
                catch (error) { receipts.delete(receiptId); throw new Error('无法保存上传恢复记录，本次未上传：' + error.message); }
                const checkSubmitted = () => { try { check(); } catch (error) { error.pendingUpload = true; throw error; } };
                let uploadAccepted = false;
                try {
                    if (guangya) {
                        const result = await post(API.create, {capacity:2, name, parentId:row.node.parentId === '0' ? '' : row.node.parentId, res:{fileSize:bytes.length, md5}}, [0,156]);
                        uploadAccepted = true;
                        if (guangyaCode(result) !== 156) { check(); await ossUpload(result.data || {}, bytes); }
                        const taskId = taskIdOf(result.data);
                        if (!taskId) throw new Error('上传请求已提交，但未返回任务 ID，结果待核验');
                        for (let attempt = 0; attempt < 20; attempt++) {
                            check(); progress('等待网盘处理字幕');
                            const task = await post(API.info, {taskId}, [0,145,146,147,155,163]);
                            if (task.data?.fileId || task.data?.fileInfo?.fileId) break;
                            if (attempt < 19) await wait(1000);
                        }
                    } else {
                        const result = await post('/file/upload_request', {driveId:0, duplicate:0, etag:md5, fileName:name, parentFileId:row.node.parentId, size:bytes.length, type:0});
                        uploadAccepted = true;
                        const data = result.data || {};
                        if (data.Reuse !== true) {
                            if (!data.Key || !data.Bucket || !data.FileId) throw new Error('123 未返回完整上传任务，未报告成功');
                            check();
                            const body = {StorageNode:data.StorageNode, bucket:data.Bucket, key:data.Key, uploadId:data.UploadId, partNumberStart:1, partNumberEnd:2};
                            const auth = await post('/file/s3_upload_object/auth', body);
                            const url = auth.data?.presignedUrls?.['1'];
                            if (!url) throw new Error('123 未返回字幕上传地址');
                            check(); await subtitleBinary(url, {method:'PUT', bytes});
                            await post('/file/upload_complete/v2', {StorageNode:data.StorageNode, bucket:data.Bucket, fileId:data.FileId, fileSize:bytes.length, isMultipart:false, key:data.Key, uploadId:data.UploadId});
                        }
                    }
                } catch (error) {
                    if (!uploadAccepted && (error.submissionRejected || [400,401,403,404,405,413,415,422,429].includes(error.status))) { receipts.delete(receiptId); persistReceipts(); throw error; }
                    checkSubmitted();
                    throw Object.assign(new Error('上传请求可能已提交，结果待核验：' + error.message + '；先重新检查目录，不重复上传'), {pendingUpload:true, stop:!!error.stop});
                }
                progress('核验网盘字幕');
                try {
                    let listFailures = 0;
                    for (let attempt = 0; attempt < 12; attempt++) {
                        check();
                        let fresh;
                        try { fresh = await list(row); listFailures = 0; }
                        catch (error) {
                            check();
                            if (!retryable(error) || ++listFailures > 2 || attempt === 11) throw error;
                            progress(`刷新目录失败：${error.message}；重试 ${listFailures}/2`); await wait(1000); continue;
                        }
                        validateVideo(row, fresh);
                        const matches = fresh.filter(node => node.name === name);
                        if (matches.length === 1 && await sameContent(matches[0], bytes, md5, progress, check)) { check(); receipts.delete(receiptId); persistReceipts(); return matches[0]; }
                        if (matches.length) throw new Error('上传后字幕内容不一致或同名不唯一，未标为已补齐');
                        if (attempt < 11) await wait(1000);
                    }
                    throw new Error('目录中尚未找到字幕');
                } catch (error) {
                    checkSubmitted();
                    throw Object.assign(new Error('上传请求已提交，但核验未通过：' + error.message + '；请先重新检查目录，未标为已补齐，不要重复上传'), {pendingUpload:true, stop:!!error.stop});
                }
            }
        };
    }
