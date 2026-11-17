    function subtitleRemoteJson(url, options = {}) {
        const hostname = new URL(url).hostname;
        if (!['api.opensubtitles.com', 'www.shooter.cn', 'api.assrt.net'].includes(hostname)) throw new Error('不支持的字幕接口地址');
        if (typeof GM_xmlhttpRequest !== 'function') throw new Error('需要 Tampermonkey 的跨域请求权限，请更新并保存完整脚本');
        const shooter = hostname === 'www.shooter.cn';
        return new Promise((resolve, reject) => GM_xmlhttpRequest({
            responseType: shooter ? 'arraybuffer' : 'text',
            url, method: options.method || 'GET', headers: options.headers || {}, data: options.body,
            anonymous: true, timeout: 30000,
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
            ontimeout: () => reject(new Error('字幕来源请求超时（30 秒）')),
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
        const bilingual = /中英|简英|繁英|双语|bilingual/.test(value) || chinese && english;
        return {language:simplified ? 'zh-cn' : traditional ? 'zh-tw' : chinese || bilingual ? 'zh' : english ? 'en' : foreign ? languages[foreign] || foreign : fallback, bilingual};
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
    function subtitleTitleKey(value) {
        return titleKey(value);
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
            return subtitleTitleKey(text);
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
        const aliases = new Set([target, ...(parsed.aliases || []).map(value => clean(value, true)).filter(Boolean)]);
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
        const fileParts = splitMixed(name).map(part => clean(part)).filter(Boolean);
        const generic = !fileTitle || /^(?:\d{1,3}|track\d+|台|港|简|繁|字幕|subtitle|subtitles)$/i.test(fileTitle);
        const matched = !!target && (generic ? packMatched && packYears.length <= 1 : aliases.has(fileTitle) || fileParts.length > 1 && fileParts.every(part => aliases.has(part)));
        return {titleMatched:matched, aliases:[...aliases], matchReason:matched ? '' : '文件片名未能确认为同一作品'};
    }
    function createSubtitleService({wait = ms => sleep(ms), check = () => {}, log = () => {}} = {}) {
        let token = '', tokenKey = '';
        const searchCache = new Map(), seasonCache = new Map(), detailCache = new Map();
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
            const result = await assrtRequest('detail',config,{id});
            const item = result.sub?.subs?.find(item => String(item.id) === String(id));
            if (!item) throw new Error('Assrt 未返回对应字幕详情');
            detailCache.delete(key); detailCache.set(key,{time:Date.now(),item});
            evict(detailCache, 24);
            return item;
        };
        const assrtEpisode = (name, parsed) => {
            const found = [...String(name).matchAll(/S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)/gi)];
            return found.length === 1 && Number(found[0][1]) === parsed.season && Number(found[0][2]) === parsed.episode && !/E\d+[ ._-]*[-~][ ._-]*(?:E)?\d+/i.test(name);
        };
        return {
            async assrtSearch(row, config, onFiles = () => {}, check = () => {}) {
                const parsed = row.parsed;
                const title = subtitleQueryTitle(parsed.query, parsed.year);
                if (!title) throw new Error('缺少可搜索的作品名');
                if (parsed.tv && (parsed.season == null || parsed.episode == null)) throw new Error('缺少明确季集，未按片名搜索');
                if (parsed.endEpisode && parsed.endEpisode !== parsed.episode) throw new Error('合并多集视频需单独选字幕');
                const episode = parsed.tv ? 'S' + String(parsed.season).padStart(2,'0') + 'E' + String(parsed.episode).padStart(2,'0') : '';
                const terms = [...new Set([title + (episode ? ' ' + episode : ''), title])];
                const candidates = [], seen = new Map(), aliases = new Set(parsed.aliases || []);
                const excluded = {年份:0,季集:0,语言:0,待确认上限:0};
                let pages = 0, rejected = 0, uncertain = 0;
                const wanted = (config.language || 'zh-cn,zh-tw,zh').split(',');
                const preferred = candidate => candidate.titleMatched && (wanted.includes(candidate.language) || candidate.bilingual && wanted.includes('en'));
                const seasonKey = parsed.tv ? JSON.stringify([config.assrtToken,title.toLowerCase(),parsed.year || '',parsed.tmdbId || '',parsed.season]) : '';
                let cacheMiss = false;
                const collect = async item => {
                    check();
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
                            if (episodeMismatch) { excluded.季集++; dropped++; continue; }
                            const info = subtitleFileInfo(name, language);
                            if (info.language && !['zh-cn','zh-tw','zh','en'].includes(info.language) && !wanted.includes(info.language)) { excluded.语言++; dropped++; continue; }
                            const match = subtitleWorkIdentity({...parsed,aliases:[...aliases]}, [item.native_name,item.videoname,detail.native_name,detail.title], name);
                            if (match.hardMismatch) { excluded.年份++; dropped++; continue; }
                            if (files.length === 1 && langs.langdou && info.language.startsWith('zh')) info.bilingual = true;
                            if (!match.titleMatched && ++uncertain > 60) { excluded.待确认上限++; dropped++; continue; }
                            if (match.titleMatched) { confirmed = true; for (const alias of match.aliases) aliases.add(alias); }
                            candidates.push({...pack, ...info, name, assrtFileName:name, fileSize:file.s || '', titleMatched:match.titleMatched, matchReason:match.matchReason});
                            kept.push(name);
                        }
                        // Keep complete file lists, not another episode's selected candidate or signed URL.
                        if (seasonKey && confirmed) {
                            const packs = seasonCache.get(seasonKey) || new Map();
                            packs.set(String(item.id), {id:item.id, native_name:[...new Set([item.native_name,detail.native_name].filter(Boolean))].join('/'),
                                videoname:item.videoname || detail.videoname, title:detail.title, lang:item.lang, filelist:files.map(file => ({f:file.f,s:file.s}))});
                            while (packs.size > 8) packs.delete(packs.keys().next().value);
                            seasonCache.delete(seasonKey); seasonCache.set(seasonKey,packs);
                            evict(seasonCache, 24);
                        }
                        rejected += dropped;
                        if (kept.length) onFiles(`${release || 'Assrt #' + item.id} · 保留 ${kept.length}/${files.length} 份：${kept.slice(0,12).join('；')}${kept.length > 12 ? '；其余 ' + (kept.length - 12) + ' 份见候选列表' : ''}${dropped ? '；排除年份/季集/语言不符或超出待确认上限 ' + dropped + ' 份' : ''}`);
                    } catch (error) {
                        check();
                        if (candidates.filter(candidate => candidate.detailError).length < 10) candidates.push({...pack, name:item.filename || release || 'Assrt #' + item.id, titleMatched:false, detailError:error.message});
                        onFiles(`${release || 'Assrt #' + item.id} · 文件列表读取失败：${error.message}`);
                    }
                    return true;
                };
                const cached = seasonCache.get(seasonKey);
                if (cached) {
                    // Snapshot: collect refreshes the bounded cache while rechecking each episode.
                    for (const item of [...cached.values()]) await collect(item);
                    log('Assrt 整季复用', `${title} · ${episode} · 复查 ${cached.size} 组已确认资源 · 匹配 ${candidates.filter(preferred).length} 份`);
                    const selection = {node:row.node || {name:''}, candidates:[...candidates]};
                    selectSubtitleCandidate(selection, config.language || 'zh-cn,zh-tw,zh');
                    // Keep cached IDs and candidates so fresh search pages do not re-expand the same packages.
                    cacheMiss = !selection.selectedCandidate;
                }
                if (cacheMiss || !candidates.some(preferred)) for (const q of terms) {
                    for (let pos = 0; pos < 75; pos += 15) {
                        check(); pages++;
                        const key = JSON.stringify(['assrt',config.assrtToken,q,pos]);
                        if (!searchCache.has(key)) {
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
                        log('Assrt 搜索页', `搜索片名：${q} · 起始 ${pos} · 返回 ${items.length} 组资源`);
                        let fresh = 0;
                        for (const item of items) if (await collect(item)) fresh++;
                        const reliable = candidates.filter(preferred);
                        // Stop on a useful first page too, keeping alternative packages for failed downloads.
                        if (items.length < 15 || !fresh || reliable.some(candidate => wanted.includes('en') && !wanted.some(lang => lang.startsWith('zh')) || candidate.bilingual) && new Set(reliable.map(candidate => candidate.assrtId)).size >= 2) break;
                    }
                    if (candidates.some(preferred)) break;
                }
                for (const candidate of candidates) candidate.parsed.aliases = [...aliases];
                log('Assrt 筛选', `查询 ${pages} 页 · 保留 ${candidates.length} 份 · 排除 ${rejected} 份（${Object.entries(excluded).map(([reason,count]) => reason + ' ' + count).join('，')}）· 待确认 ${candidates.filter(candidate => !candidate.titleMatched).length} 份`);
                return candidates;
            },
            logout() { token = ''; tokenKey = ''; searchCache.clear(); seasonCache.clear(); detailCache.clear(); },
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
                    const titleMatched = [feature.title, feature.movie_name].some(value => subtitleTitleKey(value) === subtitleTitleKey(title)) && yearMatches;
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
                const result = await subtitleRemoteJson('https://www.shooter.cn/api/subapi.php', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body});
                if (result === null || result === -1 || Array.isArray(result) && !result.length) return [];
                if (!Array.isArray(result)) throw new Error('射手接口返回异常，暂时无法匹配');
                return result.flatMap(item => (item.Files || []).filter(file => file.Link).map(file => ({source:'射手', hashMatched:true, name:item.Desc || '', release:item.Desc || '', language:'', url:file.Link, ext:String(file.Ext || '').replace(/^\./,'').toLowerCase()}))).filter(item => ['srt','ass','ssa','vtt'].includes(item.ext));
            },
            async fetchFile(candidate, config, progress = () => {}, verify = () => {}) {
                for (let attempt = 0; attempt < 2; attempt++) {
                    verify();
                    const result = await this.download(candidate, config); verify();
                    if (result.fileName) progress('文件选择', `${candidate.assrtId} · ${result.fileName}`);
                    try {
                        const bytes = await subtitleBinary(result.url, {allowHttp:result.allowHttp === true}); verify();
                        return {result, bytes};
                    } catch (error) {
                        verify();
                        if (error.status === 493 && candidate.source === 'Assrt') throw Object.assign(new Error(`Assrt 单文件提取失败（HTTP 493，资源 #${candidate.assrtId}）；优先尝试其他资源包`), {status:493});
                        if (attempt || error.phase !== 'transfer' || !([401,403,408,429,500,502,503,504].includes(error.status) || error.retryable)) throw error;
                        progress('下载重试', `${candidate.source} · ${new URL(result.url).hostname} · ${error.message}；刷新下载地址后重试一次`);
                        if (candidate.source === 'Assrt') detailCache.delete(detailKey(candidate.assrtId,config));
                        await pause(1500);
                    }
                }
            },
            async download(candidate, config) {
                if (candidate.source === 'Assrt') {
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
                const result = await request('/download', config, {file_id:candidate.fileId});
                const ext = String(result?.file_name || candidate.name).split('.').pop().toLowerCase();
                return {url:subtitleDownloadUrl(result?.link), ext};
            }
        };
    }

    const SUBTITLE_LIMIT = 16 * 1024 * 1024;
    function subtitleBinary(url, {method = 'GET', headers = {}, bytes, range, limit = SUBTITLE_LIMIT, allowHttp = false} = {}) {
        url = subtitleDownloadUrl(url, {allowHttp:allowHttp && method === 'GET' && !bytes && !Object.keys(headers).length});
        return new Promise((resolve, reject) => {
            let request, rejected = false;
            const fail = message => { rejected = true; reject(new Error(message)); request?.abort(); };
            request = GM_xmlhttpRequest({url, method, headers, data: bytes && new Blob([bytes]), anonymous:true,
                responseType:'arraybuffer', timeout:60000,
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
    function subtitlePayload(bytes, ext, language, onDecoded = () => {}) {
        if (!bytes.length || bytes.length > SUBTITLE_LIMIT || !['srt','ass','ssa','vtt'].includes(ext)) throw new Error('仅支持单个 SRT、ASS、SSA、VTT 字幕，不导入压缩包或不完整字幕对');
        let decoded;
        try { decoded = subtitleDecode(bytes); }
        catch { throw new Error('字幕文本解码失败（UTF-8 / UTF-16 / GB18030），未上传'); }
        const {text, encoding} = decoded;
        onDecoded(`编码 ${encoding.toUpperCase()}，${bytes.length} 字节`);
        if (/^\s*(?:<!doctype\s+html|<html|\{"(?:error|message)")/i.test(text) || !(/\d{1,2}:\d{2}:\d{2}[,.]\d{2,3}\s*-->|\d{2}:\d{2}\.\d{3}\s*-->|\[Events\][\s\S]*Dialogue\s*:/i.test(text))) throw new Error('下载内容不是可识别的字幕文本（' + encoding.toUpperCase() + '，' + bytes.length + ' 字节，' + (/<!doctype\s+html|<html|<body/i.test(text.slice(0, 1024)) ? '返回了 HTML 页面' : '缺少字幕时间轴或 Dialogue') + '）');
        const dialogue = /^(?:ass|ssa)$/.test(ext) ? text.split(/\r?\n/).filter(line => /^Dialogue\s*:/i.test(line)).map(line => line.split(',').slice(9).join(',')).join('\n') : text.replace(/<[^>]*>/g, '').split(/\r?\n/).filter(line => !/-->|^\s*\d+\s*$|^WEBVTT/.test(line)).join('\n');
        if (language !== 'en' && !/[\u3400-\u9fff]/.test(dialogue)) throw new Error('字幕正文未检测到中文，未上传');
        if (language === 'en' && !/[a-z]{2}/i.test(dialogue)) throw new Error('字幕正文未检测到英文，未上传');
        return text;
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
            const identity = candidate.identityMatched || candidate.titleMatched;
            const reliable = !!candidate.hashMatched || !!identity && lang && !conflicts;
            const preference = wanted.indexOf(candidate.language);
            return {candidate, reliable, preference:subtitlePreference(candidate, language), score:(candidate.hashMatched ? 1000 : 0) + (candidate.identityMatched ? 100 : 0) + (candidate.titleMatched ? 50 : 0) + overlaps * 10 + (lang ? 5 : 0) + (preference < 0 ? 0 : (wanted.length - preference) / 10)};
        }).sort((a,b) => Number(b.reliable) - Number(a.reliable) || b.preference - a.preference || b.score - a.score);
        row.candidates = scored.map(item => item.candidate);
        row.autoCandidates = scored.filter(item => item.reliable).map(item => item.candidate);
        row.selectedCandidate = row.autoCandidates[0] || null;
        row.aiSuggested = false;
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
    function subtitleAICandidate(result, row, language) {
        if (!Number.isInteger(result?.index) || !Number.isFinite(result.confidence) || result.confidence < .9 || result.confidence > 1) return null;
        const candidate = row.candidates?.[result.index];
        if (!candidate || candidate.hardMismatch) return null;
        const parsed = row.parsed, identity = candidate.workIdentity;
        if (subtitleWorkIdentity(parsed, [candidate.release], candidate.name || '').hardMismatch) return null;
        if (identity) {
            if (!!identity.tv !== !!parsed.tv || parsed.tmdbId && identity.tmdbId && String(parsed.tmdbId) !== String(identity.tmdbId)) return null;
            if (!parsed.tv && parsed.year && identity.year && String(parsed.year) !== String(identity.year)) return null;
        }
        const episodeText = (candidate.name || '') + ' ' + (candidate.release || '');
        const episodes = [...episodeText.matchAll(/S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)/gi)];
        if (parsed.tv) {
            if (parsed.season == null || parsed.episode == null || parsed.endEpisode && parsed.endEpisode !== parsed.episode) return null;
            if (identity && (Number(identity.season) !== parsed.season || Number(identity.episode) !== parsed.episode)) return null;
            if (!episodes.length && !identity || episodes.some(match => Number(match[1]) !== parsed.season || Number(match[2]) !== parsed.episode)
                || /E\d+[ ._-]*[-~][ ._-]*(?:E)?\d+/i.test(episodeText)) return null;
        } else if (episodes.length) return null;
        const wanted = language.split(',');
        const languageMatch = wanted.includes(candidate.language) || candidate.bilingual && wanted.some(value => value.startsWith('zh')) || wanted.some(value => subtitleLanguageMatch(candidate.name || '', value));
        if (!languageMatch) return null;
        const quality = value => String(value || '').match(/(?:^|[^a-z0-9])(2160p|1080p|720p)(?=$|[^a-z0-9])/i)?.[1].toLowerCase();
        const sourceQuality = quality(row.node.name), candidateQuality = quality((candidate.release || '') + ' ' + (candidate.name || ''));
        if (sourceQuality && candidateQuality && sourceQuality !== candidateQuality) return null;
        return candidate;
    }
    function subtitleSearchSummary(rows) {
        const count = {complete:0,pending:0,ready:0,choice:0,failed:0,missing:0,unsearched:0};
        for (const row of rows) count[subtitleSearchState(row)]++;
        return `视频 ${rows.length} · 已有/已补齐 ${count.complete} · 待核验 ${count.pending} · 可补齐 ${count.ready} · 待选择 ${count.choice} · 未找到 ${count.missing} · 失败 ${count.failed} · 未查询 ${count.unsearched}`;
    }
    function subtitleSearchMessage(row) {
        if (row.pendingVerification) return row.error || '字幕文件或上传结果待核验，请先重新检查目录；本次不重复上传。';
        const message = row.selectedCandidate
            ? row.aiSuggested ? 'AI 建议了这份字幕，请核对候选名称；可在下拉框更改后补齐。' : row.manualCandidate ? '已手动选择字幕，点击“补齐字幕”下载并写入视频目录。' : `已自动择优，${row.autoCandidates.length} 个可靠候选；点击“补齐字幕”下载并写入视频目录，下载内容不符时尝试下一份。`
            : row.manualCandidate ? '已跳过此视频；重新选择字幕后可补齐。'
            : row.candidates.length ? '找到候选，但作品或语言未确认，请展开选择。'
            : row.sources.some(source => source.error) ? '查询有失败，不能判定为没有字幕。' : !row.sources.some(source => !source.skipped) ? '尚未查询任何来源，请启用并配置字幕来源。' : '已查询的来源未收录匹配字幕。';
        return message + (row.selectedCandidate ? '\n所选字幕：' + subtitleCandidateLabel(row.selectedCandidate) : '') + '\n' + row.sources.map(source => source.name + '：' + (source.skipped ? '跳过 · ' + source.skipped : source.error ? '失败 · ' + source.error : `找到 ${source.count} 个候选`)).join('\n');
    }
    async function searchSubtitleSources(row, config, service, drive, log = () => {}, check = () => {}, resume = false) {
        if (!resume) { row.error = ''; row.candidates = []; row.selectedCandidate = null; row.manualCandidate = false; row.aiSuggested = false; row.sources = []; }
        const title = subtitleQueryTitle(row.parsed.query, row.parsed.year);
        const run = async (name, enabled, configured, search) => {
            check();
            if (resume) {
                if (!row.sources.some(source => source.name === name && source.deferred)) return;
                row.sources = row.sources.filter(source => source.name !== name);
            }
            if (!enabled) { row.sources.push({name,skipped:'已关闭'}); log('来源跳过', `${name} 已关闭`); return; }
            if (!configured) { row.sources.push({name,error:'未配置密钥，未查询'}); log('来源跳过', `${name} 未配置密钥`); return; }
            selectSubtitleCandidate(row, config.language);
            const selected = row.selectedCandidate;
            if (!resume && selected && (config.language === 'en' ? selected.language === 'en' : selected.bilingual)) {
                const reason = '已有可靠的' + (config.language === 'en' ? '英文' : '双语') + '字幕，省去重复查询与视频取样';
                row.sources.push({name,skipped:reason,deferred:true}); log('来源跳过', `${name}：${reason}`); return;
            }
            try {
                log('来源', `${name} 开始，搜索片名：${title}`);
                const found = await search(); check();
                row.candidates.push(...found); row.sources.push({name,count:found.length});
                log('来源', `${name} 返回 ${found.length} 个文件候选`);
            } catch (error) {
                check(); row.sources.push({name,error:error.message});
                log(error.phase === 'drive-auth' ? '网盘授权失败' : '来源失败', `${row.node.name} · ${name}：${error.message}`);
                if (error.phase === 'drive-auth') { row.error = error.message; row.searchMessage = subtitleSearchMessage(row); throw error; }
            }
        };
        await run('Assrt 片名搜索', config.assrt, config.assrtToken, () => service.assrtSearch(row, config, message => log('Assrt 文件列表', message), check));
        await run('OpenSubtitles', config.open, config.key, () => service.search(row, config));
        await run('射手', config.shooter, true, async () => {
            log('射手取样', `pathinfo：${row.node.name}`);
            const hash = await drive.sample(row, check); check();
            log('射手取样', `${row.node.name} · 已计算 4 段视频哈希`);
            return service.shooterHash(hash, row.node.name, config.language);
        });
        check(); selectSubtitleCandidate(row, config.language);
        row.searchMessage = subtitleSearchMessage(row);
    }
    async function inspectExistingSubtitles(row, drive, language, log = () => {}, check = () => {}) {
        row.complete = false; row.pendingVerification = false;
        const unreadable = [], invalid = [];
        for (const sub of row.subtitles.filter(sub => /\.(srt|ass|ssa|vtt)$/i.test(sub.name))) {
            check(); log('正文检查', `${row.node.name} · 读取现有字幕 ${sub.name}`);
            let bytes;
            try { bytes = await drive.read(sub, message => log('核验重试', message), check); check(); }
            catch (error) { check(); if (error.stop) throw error; unreadable.push(sub.name + '：' + error.message); log('现有字幕待核验', `${sub.name}：${error.message}`); continue; }
            try {
                subtitlePayload(bytes, sub.name.split('.').pop().toLowerCase(), language, message => log('字幕解码', message));
                if (language !== 'zh-cn,zh-tw,zh' && language !== 'en' && !subtitleLanguageMatch(sub.name, language)) { invalid.push(sub.name + '：正文含中文，但所选简繁标记未确认'); continue; }
                row.complete = true; row.error = ''; row.searchMessage = '已有字幕正文已核验：' + sub.name;
                log('现有字幕确认', `${row.node.name} · ${sub.name} 正文格式和语言检查通过`); return;
            } catch (error) { invalid.push(sub.name + '：' + error.message); log('现有字幕无效', `${sub.name}：${error.message}`); }
        }
        if (unreadable.length) { row.pendingVerification = true; row.error = '已有字幕读取失败，尚未确认是否可用；先重新检查目录，暂停自动补齐：' + unreadable.join('；'); }
        else { row.error = ''; row.searchMessage = invalid.length ? '已有字幕未通过检查：' + invalid.join('；') : '未发现可核验的外置文本字幕'; }
    }
    function subtitleDrive(context, wait = sleep) {
        const {session, source} = context, guangya = session.provider === '光鸭';
        // A token digest scopes receipts without storing a credential. Token changes do not reuse old receipts.
        const receiptKey = session.token ? 'cross-drive-subtitle-uploads-v1:' + subtitleMd5(new TextEncoder().encode((session.provider || '123') + ':' + session.token)) : '';
        const savedReceipts = receiptKey && GM_getValue(receiptKey, []);
        const receipts = new Map(Array.isArray(savedReceipts) ? savedReceipts.filter(entry => Array.isArray(entry) && typeof entry[0] === 'string' && entry[1] && typeof entry[1].name === 'string' && Number.isSafeInteger(entry[1].size) && /^[a-f0-9]{32}$/i.test(entry[1].md5 || '')) : []);
        const videoKey = row => JSON.stringify([String(row.node.id), String(row.node.parentId), row.node.name, row.node.size]);
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
            read, reconcile, assertReady,
            async sample(row, check = () => {}) {
                const size = row.node.size;
                if (!Number.isSafeInteger(size) || size < 12288) throw new Error('视频大小不可用，无法取样');
                const url = await downloadUrl(row.node), hashes = [];
                for (const offset of [4096,Math.floor(size / 3) * 2,Math.floor(size / 3),size - 8192]) {
                    check();
                    hashes.push(subtitleMd5(await subtitleBinary(url, {headers:{Range:`bytes=${offset}-${offset + 4095}`}, range:[offset, offset + 4095,size], limit:4096})));
                }
                return hashes.join(';');
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
