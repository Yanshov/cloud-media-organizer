    function subtitleRemoteJson(url, options = {}) {
        const timeout = options.timeout || 30000;
        const hostname = new URL(url).hostname;
        if (!['api.opensubtitles.com', 'api-shoulei-ssl.xunlei.com', 'api.subdl.com'].includes(hostname)) throw new Error('不支持的字幕接口地址');
        if (typeof GM_xmlhttpRequest !== 'function') throw new Error('需要 Tampermonkey 的跨域请求权限，请更新并保存完整脚本');
        return new Promise((resolve, reject) => GM_xmlhttpRequest({
            url, method: options.method || 'GET', headers: options.headers || {}, data: options.body,
            anonymous: true, timeout,
            onload: response => {
                let data;
                const text = response.responseText || '';
                try { data = text.trim() ? JSON.parse(text) : null; } catch { /* HTTP errors may be HTML. */ }
                if (response.status < 200 || response.status >= 300) {
                    const error = subtitleSourceError('HTTP ' + response.status + (typeof data?.message === 'string' ? '：' + data.message.slice(0, 180) : ''));
                    error.status = response.status;
                    const retry = String(response.responseHeaders || '').match(/^retry-after:\s*(.+)$/im)?.[1]?.trim();
                    error.retryAfterMs = retry ? Math.max(0, /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) || 0 : 0;
                    reject(error); return;
                }
                if (data === undefined) { reject(subtitleSourceError('字幕接口未返回 JSON（HTTP ' + response.status + '）')); return; }
                resolve(data);
            },
            onerror: () => reject(subtitleSourceError('无法连接字幕来源，请检查网络或脚本跨域授权')),
            ontimeout: () => reject(subtitleSourceError(`字幕来源请求超时（${timeout / 1000} 秒）`)),
            onabort: () => reject(subtitleSourceError('字幕请求已取消'))
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
    function subtitleSourceError(message, fields) {
        return Object.assign(new Error(message), {phase:'subtitle-source',...fields});
    }
    function isSubtitleSourceError(error) {
        return error?.phase === 'subtitle-source' || !error?.phase && Number.isInteger(error?.status) && error.status >= 400;
    }
    function subtitleSourcePaused(name, error) {
        return [429,509].includes(error.status) || name === 'SubDL' && [401,403].includes(error.status);
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
        if (opaque) return {...match,titleMatched:false,opaque:true,matchReason:'来源文件名缺少可识别片名，无法确认作品归属'};
        if (!match.titleMatched && !match.related && !semanticReview) return {...match,excluded:'无关'};
        return match;
    }
    function* subtitleEvents(text, ext) {
        const lines = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
        if (/^(?:ass|ssa)$/i.test(ext)) {
            let inEvents = false, fields = ['layer','start','end','style','name','marginl','marginr','marginv','effect','text'];
            for (const line of lines) {
                if (/^\s*\[/.test(line)) inEvents = /^\s*\[Events\]\s*$/i.test(line);
                if (!inEvents) continue;
                const record = /^\s*(Format|Dialogue|Comment)\s*:\s*(.*)$/i.exec(line);
                if (!record) continue;
                const type = record[1].toLowerCase();
                const values = record[2].split(',');
                if (type === 'format') { fields = values.map(value => value.trim().toLowerCase()); continue; }
                const column = fields.indexOf('text');
                if (column >= 0 && values.length >= fields.length) values.splice(column, values.length - fields.length + 1,
                    values.slice(column, values.length - (fields.length - column - 1)).join(','));
                let drawing = false, hasDrawing = false, dialogue = '';
                for (const part of (values[column] || '').match(/\{[^}]*\}|[^{}]+|[{}]/g) || []) {
                    if (/^\{[^}]*\}$/.test(part)) {
                        for (const tag of part.matchAll(/\\p(\d+)(?=\D|$)/gi)) drawing = Number(tag[1]) > 0;
                    } else if (drawing) hasDrawing ||= !!part.trim();
                    else dialogue += part;
                }
                dialogue = dialogue.replace(/\\[Nnh]/g, ' ').trim();
                const style = (values[fields.indexOf('style')] || '').trim();
                const kind = type === 'comment' ? 'comment' : !dialogue ? (hasDrawing ? 'drawing' : 'empty')
                    : /^(?:signs?|typeset(?:ting)?|credits?|招牌|特效)(?:$|[ _-])/i.test(style) ? 'typeset' : 'dialogue';
                const validFields = ['start','end','text'].every(name => fields.indexOf(name) >= 0 && fields.indexOf(name) === fields.lastIndexOf(name));
                yield {kind, dialogue, start:values[fields.indexOf('start')], end:values[fields.indexOf('end')],
                    malformed:!validFields || values.length !== fields.length};
            }
            return;
        }
        let ignore = false, cue = null;
        for (const line of [...lines,'']) {
            if (!line.trim()) { if (cue) yield cue; cue = null; ignore = false; continue; }
            if (!cue && ext === 'vtt' && /^(?:NOTE(?:[ \t]|$)|STYLE\s*$|REGION\s*$)/.test(line)) ignore = true;
            if (ignore) continue;
            if (cue) { cue.dialogue += (cue.dialogue ? '\n' : '') + line.replace(/<[^>]*>/g,'').trim(); continue; }
            if (line.includes('-->')) {
                const time = /^\s*(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+[^\r\n]*)?\s*$/.exec(line);
                cue = {kind:'cue', dialogue:'', start:time?.[1], end:time?.[2], malformed:!time};
            }
        }
    }
    function subtitleTimestamp(value, ext) {
        const text = String(value ?? '').trim();
        if (/(?:^|:)-\d/.test(text)) return {issue:'负值'};
        if (/(?:infinity|nan)/i.test(text)) return {issue:'非有限值'};
        const format = ext === 'vtt' ? /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/
            : ext === 'ass' || ext === 'ssa' ? /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/
            : /^(\d{1,}):(\d{2}):(\d{2})[,.](\d{2,3})$/;
        const match = format.exec(text);
        if (!match) return {issue:'时间字段格式'};
        const [,hours = '0', minutes, seconds, fraction] = match;
        if (Number(minutes) > 59 || Number(seconds) > 59) return {issue:'分秒越界'};
        const time = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number('0.' + fraction);
        return Number.isFinite(time) && Number.isSafeInteger(Math.floor(time)) ? {time} : {issue:'非有限值或超出安全范围'};
    }
    function subtitleTimeline(text, ext) {
        const events = {dialogue:0,comment:0,drawing:0,typeset:0,empty:0};
        const issues = {}, dialogue = [], invalid = {};
        let start = Infinity, end = 0, rawEnd = 0, priorEnd = 0, longest = 0, visualEnd = 0;
        for (const event of subtitleEvents(text, ext)) {
            const kind = event.kind === 'cue' ? (event.dialogue ? 'dialogue' : 'empty') : event.kind;
            events[kind]++;
            const a = subtitleTimestamp(event.start, ext), b = subtitleTimestamp(event.end, ext);
            rawEnd = Math.max(rawEnd,b.time ?? 0);
            const issue = event.malformed ? '时间字段格式' : a.issue || b.issue || (a.time > b.time ? '开始与结束先后颠倒' : '');
            if (issue) {
                issues[issue] = (issues[issue] || 0) + 1;
                if (kind !== 'comment') invalid[issue] = (invalid[issue] || 0) + 1;
                continue;
            }
            if (kind === 'typeset' || kind === 'drawing') visualEnd = Math.max(visualEnd,b.time);
            if (kind !== 'dialogue') continue;
            dialogue.push(event.dialogue);
            start = Math.min(start,a.time);
            longest = Math.max(longest,b.time - a.time);
            if (b.time > end) { priorEnd = end; end = b.time; }
            else priorEnd = Math.max(priorEnd,b.time);
        }
        return {start:Number.isFinite(start) ? start : null,end,rawEnd,events,issues,invalid,dialogue,priorEnd,longest,visualEnd};
    }
    function subtitleEndTime(text, ext) {
        return subtitleTimeline(text,ext).end;
    }
    function subtitleCheckDuration(row, text, ext, log = () => {}, timeline = subtitleTimeline(text,ext)) {
        const {start,end,rawEnd,events,issues,invalid,priorEnd,longest,visualEnd} = timeline;
        const validDuration = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
        const driveSeconds = validDuration(row.node.durationSeconds), runtime = validDuration(row.parsed?.runtimeSeconds);
        const duration = driveSeconds || runtime;
        const source = driveSeconds ? '视频文件时长' : runtime ? 'TMDB 作品时长参考' : '无时长参考';
        const counts = Object.entries(issues).map(([reason,count]) => reason + ' ' + count).join('、');
        log('字幕时长', row.node.name + ' · 对白 ' + (start == null ? '无' : start.toFixed(1) + ' 秒起')
            + ' · 字幕结束 ' + end.toFixed(1) + ' 秒 · ' + source + (duration ? ' ' + duration.toFixed(1) + ' 秒' : '')
            + ' · 原始最晚结束 ' + rawEnd.toFixed(1) + ' 秒 · 对白 ' + events.dialogue + '、注释 ' + events.comment
            + '、绘图 ' + events.drawing + '、排版 ' + events.typeset + '、空事件 ' + events.empty
            + (visualEnd > end ? ' · 绘图或排版延伸到 ' + visualEnd.toFixed(1) + ' 秒，不计入对白范围' : '')
            + (counts ? ' · 异常 ' + counts : ''));
        const uncertain = reason => Object.assign(new Error(reason),{timingUnconfirmed:true});
        if (Object.keys(invalid).length) throw uncertain('字幕时间轴异常：' + counts + '，待确认');
        if (!timeline.dialogue.length) throw uncertain('字幕时间轴没有可用的对白，待确认');
        // Work metadata is advisory. Extreme ranges and isolated hour-scale gaps still need review.
        const extreme = end > 12 * 3600 || longest > 4 * 3600 || (priorEnd > 0 && end - priorEnd > 3600 && end > priorEnd * 3);
        if (extreme) throw uncertain('字幕时间轴存在极端对白范围，待确认');
        if (driveSeconds && end > driveSeconds + Math.max(30,driveSeconds * .1))
            throw uncertain('字幕时间轴与视频文件时长冲突，待确认');
        if (driveSeconds && end < driveSeconds * .5 || !driveSeconds && runtime >= 1200 && end <= Math.min(480,runtime * .2))
            throw uncertain('字幕不完整：对白只到 ' + end.toFixed(1) + ' 秒（' + source + '），待确认');
        const parsed = row.parsed || {};
        const ordinaryEpisode = parsed.tv && parsed.season > 0 && parsed.episode > 0 && !parsed.standalone
            && !/短片|短剧|特别篇|特別篇|番外|预告|\b(?:teaser|short|special|OVA|OAD)\b/i.test(row.node.name);
        const dialogueSize = timeline.dialogue.reduce((sum,line) => sum + line.replace(/\s/g,'').length,0);
        // Several weak signals must agree before holding an episode with no file duration.
        if (!driveSeconds && ordinaryEpisode && end <= 90 && end - start <= 75 && timeline.dialogue.length <= 12 && dialogueSize <= 300)
            throw Object.assign(uncertain('字幕可疑，待确认：普通剧集缺少文件时长，' + timeline.dialogue.length + ' 条有效对白、'
                + dialogueSize + ' 个字符，对白只到 ' + end.toFixed(1) + ' 秒'), {subtitleSuspicious:true});
        const evidence = driveSeconds ? 'file' : !runtime ? 'unknown'
            : Math.abs(end - runtime) >= Math.max(120,runtime * .2) ? 'reference-difference' : 'reference';
        return {start,end,rawEnd,visualEnd,events,issues,duration,source,evidence};
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
        const unavailableSources = new Map(), workConflicts = new Map();
        const searchCache = new Map();
        const seasonPreparations = new Map(), archiveCache = new Map(), transfers = new Map();
        const archiveWork = paced(0,async (work,verify) => { check(); verify(); return work(); });
        const transfer = (result,verify) => {
            check(); verify();
            const key = result.url;
            if (!transfers.has(key)) {
                const pending = subtitleBinary(key,{allowHttp:result.allowHttp === true});
                transfers.set(key,pending);
                const clear = () => { if (transfers.get(key) === pending) transfers.delete(key); };
                pending.then(clear,clear);
            }
            return transfers.get(key);
        };
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
            if (paused) throw subtitleSourceError('SubDL 本批已暂停：' + paused);
            const result = await subtitleRemoteJson('https://api.subdl.com/api/v1/subtitles?' + new URLSearchParams({...params,api_key:config.subdlKey}));
            if (result?.status !== true || !Array.isArray(result.subtitles)) {
                const reason = String(result?.error || '响应格式异常');
                const status = Number(result?.statusCode) || (/not.authori[sz]ed|invalid.*(?:api.key|token)/i.test(reason) ? 403 : /rate.limit|too many requests/i.test(reason) ? 429 : 0);
                if (result?.status === false && !status && /can't find/i.test(String(result.error || ''))) return {status:true,subtitles:[],totalPages:1};
                throw subtitleSourceError('SubDL 查询失败' + (status ? '（' + status + '）' : '') + '：' + reason.slice(0,100), {status});
            }
            return result;
        });
        const thunderRequest = subtitleRequestPool(1100, 2, (title, verify) => {
            check(); verify();
            if (unavailableSources.has('迅雷')) throw subtitleSourceError('迅雷本批已暂停');
            return subtitleRemoteJson('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?' + new URLSearchParams({name:title}), {
                headers:{'User-Agent':'XLPlayer/3.1.1 (com.xunlei.XLPlayer; build:65742; macOS 15.0.0) Alamofire/5.4.3'}
            });
        });
        const request = paced(1100, (path, config, body) => {
            if (!config.key) throw subtitleSourceError('请先填写 OpenSubtitles API Key');
            return subtitleRemoteJson('https://api.opensubtitles.com/api/v1' + path, {
                method: body ? 'POST' : 'GET',
                headers: {'Api-Key': config.key, 'User-Agent': 'CloudMediaOrganizer v' + VERSION, Accept: 'application/json', ...(body ? {'Content-Type':'application/json'} : {}), ...(token && tokenKey === config.key ? {Authorization: 'Bearer ' + token} : {})},
                ...(body ? {body: JSON.stringify(body)} : {})
            });
        });
        const pause = async ms => { for (let left = ms; left > 0; left -= 500) { check(); await wait(Math.min(left, 500)); } check(); };
        const exactSubtitleEpisode = (name, parsed) => {
            const found = [...String(name).matchAll(/S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)/gi)];
            return found.length === 1 && Number(found[0][1]) === parsed.season && Number(found[0][2]) === parsed.episode && !/E\d+[ ._-]*[-~][ ._-]*(?:E)?\d+/i.test(name);
        };
        return {
            async prepareSeason(rows,config,verify = () => {}) {
                const row = rows.find(row => row.parsed.episode != null && (!row.parsed.endEpisode || row.parsed.endEpisode === row.parsed.episode)), parsed = row?.parsed;
                if (!parsed?.tv || parsed.season == null || !parsed.query) return;
                const key = JSON.stringify([parsed.tmdbId || '',parsed.query,parsed.year,parsed.season,subtitleSearchNames(parsed),config.language,
                    config.thunder,config.subdl,config.subdlKey]);
                if (!seasonPreparations.has(key)) {
                    const task = (async () => {
                        log('整季搜索', `${parsed.query} · S${String(parsed.season).padStart(2,'0')} · 优先取得整季文件列表，逐集复核，缺集再补查`);
                        const sources = [
                            ['迅雷',config.thunder,() => this.thunderSearch(row,{...config,seasonSearch:true,seasonRows:rows.filter(target => target.parsed.episode != null && (!target.parsed.endEpisode || target.parsed.endEpisode === target.parsed.episode))},() => {},verify)],
                            ['SubDL',config.subdl && config.subdlKey,async () => {
                                const found = await this.subdlSearch(row,{...config,seasonSearch:true},() => {},verify);
                                // Index archives once so missing episodes are found before selecting a pack.
                                const missing = new Set(rows.filter(target => target.parsed.episode != null).map(target => target.parsed.episode));
                                for (const candidate of found.filter(item => item.ext === 'zip' && item.titleMatched).slice(0,3)) {
                                    verify();
                                    try {
                                        await archiveWork(async () => {
                                            const archive = await archiveData(candidate.url,verify);
                                            for (const target of rows) if (subtitleArchiveChoices(archive.index,{...candidate,parsed:target.parsed},config.language).length) missing.delete(target.parsed.episode);
                                        },verify);
                                        log('整季覆盖', `${candidate.name} · 当前缺集 ${missing.size} 集${missing.size ? '，继续补查' : '，停止下载其他整季包'}`);
                                        if (!missing.size) break;
                                    }
                                    catch (error) { verify(); if (error.stop) throw error; log('整季压缩包', `${candidate.name} · ${error.message}；保留其他候选`); }
                                }
                            }]
                        ].filter(([name,enabled]) => enabled && !unavailableSources.has(name));
                        for (const [name,,run] of sources) {
                            try { await run(); }
                            catch (error) {
                                check(); verify(); if (!isSubtitleSourceError(error)) throw error;
                                if (subtitleSourcePaused(name,error)) unavailableSources.set(name,error.message);
                                log('整季来源失败', `${parsed.query} · ${name} · ${error.message}；单集仍可补查其他来源`);
                            }
                        }
                        check(); verify();
                    })();
                    seasonPreparations.set(key,task); evict(seasonPreparations,24);
                    task.catch(() => seasonPreparations.delete(key));
                }
                await seasonPreparations.get(key); check(); verify();
            },
            resetSearchBatch() { unavailableSources.clear(); seasonPreparations.clear(); workConflicts.clear(); },
            searchUnavailable(name) { return unavailableSources.get(name); },
            pauseSearchSource(name, reason) { unavailableSources.set(name, reason); },
            thunderCachedEpisode(row, config, onFiles = () => {}, verify = () => {}, report) {
                const parsed = row.parsed;
                if (!parsed.tv || !subtitleQueryTitle(parsed.query, parsed.year) || parsed.season == null || parsed.episode == null || parsed.endEpisode && parsed.endEpisode !== parsed.episode) return [];
                return this.thunderSearch(row, {...config,thunderCacheOnly:true}, onFiles, verify, report);
            },
            async thunderSearch(row, config, onFiles = () => {}, verify = () => {}, report = () => {}) {
                check(); verify();
                const parsed = row.parsed, title = subtitleQueryTitle(parsed.query, parsed.year);
                if (!title) throw subtitleSourceError('缺少可搜索的作品名');
                if (parsed.tv && (parsed.season == null || parsed.episode == null)) throw subtitleSourceError('缺少明确季集，未按片名搜索');
                if (parsed.endEpisode && parsed.endEpisode !== parsed.episode) throw subtitleSourceError('合并多集视频需单独选字幕');
                const seasonKey = parsed.tv ? JSON.stringify(['thunder-season',titleKey(title),parsed.year || '',parsed.tmdbId || '',parsed.season]) : '';
                let items, attempts;
                const suffix = parsed.tv ? ' S' + String(parsed.season).padStart(2,'0') + (config.seasonSearch ? '' : 'E' + String(parsed.episode).padStart(2,'0')) : '';
                const names = subtitleSearchNames(parsed);
                const original = row.node?.originalName || row.node?.name || '';
                const withRelease = !config.seasonSearch && (/\b(?:BluRay|BDRip|WEB[ ._-]?(?:DL|Rip)|REMUX|HDTV|x26[45]|extended|theatrical)\b/i.test(original)
                    || parsed.tv && /\b(?:2160p|1080p|720p)\b/i.test(original));
                const plainQueries = names.map(name => name + suffix);
                const queries = config.correctionName ? [config.correctionName + suffix]
                    : (withRelease ? [...new Set([original.replace(/\.[^.]+$/,''),...plainQueries])] : plainQueries).slice(0,3);
                const filter = (items, target) => {
                    const candidates = [], seen = new Set(), excluded = {年份:0,季集:0,语言:0,内容:0,无关:0,待确认上限:0,格式:0,重复:0}, rejectionSamples = [];
                    const sampleRejection = (name, reason) => { if (rejectionSamples.length < 8) rejectionSamples.push(`${name}（${reason}）`); };
                    log('迅雷 响应', `返回 ${items.length} 条原始结果`);
                    for (const item of items) {
                        check(); verify();
                        if (!item || typeof item.name !== 'string' || !item.name.trim()) { excluded.格式++; continue; }
                        const name = item.name, ext = String(item.ext || name.split('.').pop()).replace(/^\./, '').toLowerCase();
                        if (!['srt','ass','ssa','vtt'].includes(ext) || typeof item.url !== 'string') { excluded.格式++; continue; }
                        let url;
                        try { url = subtitleDownloadUrl(item.url, {allowHttp:true}); } catch { excluded.格式++; continue; }
                        if (seen.has(url)) { excluded.重复++; continue; }
                        seen.add(url);
                        const episodeTagged = /S\d+[ ._-]*E\d+/i.test(name);
                        if (episodeTagged && (!target.tv || !exactSubtitleEpisode(name, target))) { excluded.季集++; sampleRejection(name, '季集不符'); continue; }
                        const match = subtitleCandidateFilter(target, [], name, !!config.reviewCandidates);
                        if (match.excluded) { excluded[match.excluded]++; sampleRejection(name, match.matchReason || match.excluded); continue; }
                        const labels = [Array.isArray(item.languages) ? item.languages.join(' ') : '', item.simple_name || ''].join(' ').replace(/\\u0026/gi, '&').replace(/英语/g, '英文');
                        const metadata = subtitleFileInfo(labels), info = subtitleFileInfo(name, metadata.language);
                        info.bilingual ||= metadata.bilingual && info.language.startsWith('zh');
                        const titleMatched = match.titleMatched && (!target.tv || episodeTagged);
                        if (info.language && !(config.language || 'zh-cn,zh-tw,zh').split(',').includes(info.language) && !info.bilingual && !info.language.startsWith('zh') && info.language !== 'en') { excluded.语言++; sampleRejection(name, '语言 ' + info.language); continue; }
                        if (candidates.length >= 60) {
                            const uncertain = titleMatched ? candidates.findIndex(candidate => !candidate.titleMatched) : -1;
                            excluded.待确认上限++;
                            if (uncertain < 0) continue;
                            candidates.splice(uncertain,1);
                        }
                        candidates.push({source:'迅雷', name, ...info, titleMatched, opaque:!!match.opaque, matchReason:target.tv && !episodeTagged ? '文件未标明准确季集' : match.matchReason, url, ext, release:name, searchTerms:item.searchTerms || []});
                    }
                    return {candidates, excluded, rejectionSamples};
                };
                const reliable = (target, available) => {
                    const {candidates} = filter(available, target.parsed);
                    const failed = new Set((target.candidates || []).filter(item => item.downloadFailed).map(item => item.url));
                    const selection = {node:target.node || {name:''},parsed:target.parsed,candidates:candidates.filter(item => !failed.has(item.url))};
                    selectSubtitleCandidate(selection, config.language);
                    return !!selection.selectedCandidate;
                };
                if (config.thunderCacheOnly) {
                    if (!searchCache.has(seasonKey)) return [];
                    ({items, attempts} = await searchCache.get(seasonKey));
                    report({queries:attempts, rawCount:items.length, unit:'缓存条目', deferredTerms:queries});
                } else {
                    items = []; attempts = [];
                    let failure, rawCount = null;
                    const offset = config.thunderOffset || 0;
                    let index = offset;
                    for (; index < queries.length; index++) {
                        check(); verify();
                        const term = queries[index], cacheKey = JSON.stringify(['thunder',term]);
                        const attempt = {term}; attempts.push(attempt);
                        log('迅雷 查询', '实际搜索词：' + term + ' · ' + (searchCache.has(cacheKey) ? '使用缓存' : '请求来源'));
                        try {
                            if (!searchCache.has(cacheKey)) {
                                searchCache.set(cacheKey, thunderRequest(term,verify).then(result => {
                                    if (Number(result?.code) !== 0 || !Array.isArray(result?.data)) throw subtitleSourceError('迅雷字幕接口返回异常：' + String(result?.result || result?.code || '格式错误').slice(0,120));
                                    return result.data.map(item => ({...item,searchTerms:[term]}));
                                }).catch(error => { searchCache.delete(cacheKey); throw error; }));
                                evict(searchCache,200);
                            }
                            const found = await searchCache.get(cacheKey); check(); verify();
                            attempt.rawCount = found.length;
                            rawCount = (rawCount ?? 0) + found.length;
                            items.push(...found);
                        } catch (error) {
                            check(); verify();
                            attempt.error = subtitleDiagnosticText(error.message,config);
                            failure ||= error;
                            if (!isSubtitleSourceError(error)) { report({queries:attempts,rawCount,unit:'条目'}); throw error; }
                            if (subtitleSourcePaused('迅雷',error)) { unavailableSources.set('迅雷',attempt.error); index++; break; }
                        }
                        const targets = config.seasonRows || [row];
                        if (rawCount != null && targets.every(target => reliable(target, items))) { index++; break; }
                    }
                    const deferredTerms = !unavailableSources.has('迅雷') ? queries.slice(index) : [];
                    report({queries:attempts,rawCount,unit:'条目',thunderOffset:index,deferredTerms});
                    if (rawCount === null && failure) throw failure;
                    if (seasonKey && rawCount != null) {
                        const previous = searchCache.get(seasonKey);
                        const merged = [...new Map([...(previous?.items || []),...items].map(item => [item.url || item.name,item])).values()];
                        const queries = [...new Map([...(previous?.attempts || []),...attempts].map(attempt => [attempt.term,attempt])).values()];
                        searchCache.set(seasonKey,{items:merged, attempts:queries}); evict(searchCache,200);
                    }
                }
                check(); verify();
                const {candidates, excluded, rejectionSamples} = filter(items, parsed);
                onFiles(`搜索词：${attempts.map(attempt => attempt.term).join(' / ')} · 筛选后 ${candidates.length} 份字幕文件` + (candidates.length ? '：' + candidates.slice(0, 12).map(candidate => candidate.name).join('；') + (candidates.length > 12 ? '；…' : '') : ''));
                candidates.sort((a,b) => Number(a.opaque) - Number(b.opaque));
                if (rejectionSamples.length) log('迅雷 排除样例', rejectionSamples.join('；'));
                log('迅雷 筛选', `保留 ${candidates.length} 份 · 排除 ${Object.values(excluded).reduce((a,b) => a + b,0)} 份（${Object.entries(excluded).map(([reason,count]) => reason + ' ' + count).join('，')}）· 待确认 ${candidates.filter(candidate => !candidate.titleMatched).length} 份`);
                report({keptCount:candidates.length, excluded});
                return candidates;
            },
            async subdlSearch(row, config, onFiles = () => {}, verify = () => {}, report = () => {}) {
                check(); verify();
                if (!config.subdlKey) throw subtitleSourceError('请先填写 SubDL API Key');
                const parsed = row.parsed, title = subtitleQueryTitle(parsed.query,parsed.year);
                if (!title) throw subtitleSourceError('缺少可搜索的作品名');
                if (parsed.tv && (parsed.season == null || parsed.episode == null || parsed.endEpisode && parsed.endEpisode !== parsed.episode)) throw subtitleSourceError('缺少唯一准确季集，未查询 SubDL');
                const languages = config.language === 'en' ? 'EN' : config.language === 'zh-tw' ? 'ZH_BG' : 'ZH,ZH_BG';
                const params = {type:parsed.tv ? 'tv' : 'movie',languages,releases:1,unpack:1,subs_per_page:30};
                if (parsed.tv) { params.season_number = parsed.season; if (config.seasonSearch) params.full_season = 1; else params.episode_number = parsed.episode; }
                const candidates = [], seen = new Set(), excluded = {年份:0,季集:0,语言:0,内容:0,无关:0,格式:0,重复:0,翻译:0,上限:0,压缩包:0,作品:0}, samples = [];
                const queries = [];
                let rawCount = null;
                const reject = (reason, name) => { excluded[reason]++; if (samples.length < 8) samples.push(`${name}（${reason}）`); };
                log('SubDL 查询', `${parsed.tmdbId ? 'TMDB #' + parsed.tmdbId : title} · ${params.type} · ${languages}`);
                const methods = config.correctionName ? [{film_name:config.correctionName}]
                    : [...(parsed.tmdbId ? [{tmdb_id:parsed.tmdbId}] : []), ...subtitleSearchNames(parsed).map(film_name => ({film_name}))];
                let acceptedWorkId;
                queriesLoop: for (const method of methods) {
                    const start = candidates.length;
                    let firstWorkId;
                    for (let page = 1; page <= 2 && candidates.length < 60; page++) {
                        check(); verify();
                        const query = {...params,...method,page}, key = JSON.stringify(['subdl',config.subdlKey,query]);
                        const workKey = JSON.stringify([key,titleKey(parsed.query),parsed.year,parsed.tmdbId]);
                        const previousConflict = workConflicts.get(workKey);
                        if (previousConflict) {
                            if (!candidates.length) throw previousConflict;
                            queries.push({term:new URLSearchParams(query).toString(),error:previousConflict.message});
                            report({queries,rawCount,unit:'资源',excluded});
                            break queriesLoop;
                        }
                        if (!searchCache.has(key)) {
                            if (config.subdlCacheOnly) break;
                            searchCache.set(key,subdlRequest(query,config,verify).catch(error => { searchCache.delete(key); throw error; })); evict(searchCache,200);
                        }
                        const attempt = {term:new URLSearchParams(query).toString()};
                        queries.push(attempt);
                        let result;
                        try { result = await searchCache.get(key); check(); verify(); }
                        catch (error) { check(); verify(); attempt.error = error.message; report({queries,rawCount,unit:'资源',excluded}); throw error; }
                        attempt.rawCount = result.subtitles.length;
                        rawCount = (rawCount ?? 0) + attempt.rawCount;
                        report({queries,rawCount,unit:'资源',excluded});
                        // The response's subtitles belong exclusively to the first work.
                        const work = Array.isArray(result.results) ? result.results[0] : null;
                        const workId = work?.tmdb_id ? 'tmdb:' + work.tmdb_id : work?.sd_id ? 'subdl:' + work.sd_id : '';
                        const wrongWork = work && (parsed.tmdbId && work.tmdb_id && String(work.tmdb_id) !== String(parsed.tmdbId)
                            || work.type && work.type !== params.type || !parsed.tv && parsed.year && work.year && String(work.year) !== String(parsed.year));
                        const unverifiedName = method.film_name && !(work?.tmdb_id && String(work.tmdb_id) === String(parsed.tmdbId)) && (work?.name
                            ? !subtitleSearchNames(parsed).some(name => titleKey(name) === titleKey(subtitleQueryTitle(work.name,parsed.year)))
                            : !!parsed.tmdbId);
                        const mixedWork = workId && (firstWorkId && firstWorkId !== workId || acceptedWorkId && acceptedWorkId !== workId);
                        if (wrongWork || unverifiedName || mixedWork) {
                            excluded.作品 += attempt.rawCount;
                            if (wrongWork || mixedWork) attempt.error = 'SubDL 返回的首部作品编号、类型或年份与目标冲突';
                            report({queries,excluded});
                            if (wrongWork || mixedWork) {
                                const error = subtitleSourceError(attempt.error);
                                workConflicts.set(workKey,error);
                                searchCache.delete(key);
                                evict(workConflicts,200);
                                if (candidates.length) break queriesLoop;
                                throw error;
                            }
                            break;
                        }
                        firstWorkId ||= workId;
                        const keptBefore = candidates.length;
                        log('SubDL 响应', `第 ${page} 页 · ${result.subtitles.length} 条资源`);
                        for (const item of result.subtitles) {
                            if (!item) { excluded.格式++; continue; }
                            if (item.ai_translated) { excluded.翻译++; continue; }
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
                                if (seen.has(url)) { excluded.重复++; continue; }
                                seen.add(url);
                                const tagged = /S\d+[ ._-]*E\d+/i.test(name);
                                const exactEpisode = tagged ? exactSubtitleEpisode(name,parsed) : Number(file.season) === parsed.season && Number(file.episode) === parsed.episode && (unpacked.length > 0 || !item.full_season && !(Number(item.episode_end) > Number(item.episode_from)));
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
                                if (candidates.length >= 60) { excluded.上限++; continue; }
                                candidates.push({source:'SubDL',name,...info,...match,titleMatched:match.titleMatched && (!parsed.tv || exactEpisode || ext === 'zip'),url,ext,release:fields.join(' · '),subdlFields:fields,archiveSeason:subtitlePackSeason(fields,item.season),parsed:{...parsed}});
                            }
                        }
                        if (candidates.length > keptBefore) acceptedWorkId ||= workId;
                        if (page >= Number(result.totalPages || 1) || result.subtitles.length < 30) break;
                    }
                    const selection = {node:row.node || {name:''},parsed,candidates};
                    selectSubtitleCandidate(selection,config.language);
                    if (!config.subdlCacheOnly && (selection.selectedCandidate || config.seasonSearch && candidates.slice(start).some(candidate => candidate.ext === 'zip' && candidate.titleMatched)
                        || candidates.length >= 60)) break;
                }
                onFiles(`${title} · ${candidates.length} 份字幕资源：${candidates.slice(0,12).map(candidate => candidate.name).join('；')}`);
                if (samples.length) log('SubDL 排除样例',samples.join('；'));
                log('SubDL 筛选',`保留 ${candidates.length} 份 · 排除 ${Object.values(excluded).reduce((a,b) => a+b,0)} 份（${Object.entries(excluded).map(([reason,count]) => reason + ' ' + count).join('，')}）`);
                const covered = [];
                const downloadErrors = [];
                for (const candidate of candidates) {
                    if (candidate.ext === 'zip' && config.subdlCacheOnly && !archiveCache.has(candidate.url)) { excluded.压缩包++; continue; }
                    if (candidate.ext === 'zip' && archiveCache.has(candidate.url)) {
                        try {
                            const archive = await archiveData(candidate.url,verify);
                            if (!subtitleArchiveChoices(archive.index,candidate,config.language).length) { excluded.压缩包++; continue; }
                            if (config.seasonSearch && candidate.archiveSeason === parsed.season) candidate.seasonPackVerified = true;
                        } catch (error) { check(); verify(); if (error.stop) throw error; excluded.压缩包++; downloadErrors.push(error.message); continue; }
                    }
                    covered.push(candidate);
                }
                report({keptCount:covered.length,excluded,downloadErrors});
                return covered.sort((a,b) => Number(a.opaque) - Number(b.opaque));
            },
            subdlCachedEpisode(row,config,onFiles = () => {},verify = () => {},report) {
                if (!row.parsed.tv || row.parsed.season == null || row.parsed.episode == null || row.parsed.endEpisode && row.parsed.endEpisode !== row.parsed.episode) return [];
                return this.subdlSearch(row,{...config,seasonSearch:true,subdlCacheOnly:true},onFiles,verify,report);
            },
            logout() { token = ''; tokenKey = ''; searchCache.clear(); seasonPreparations.clear(); archiveCache.clear(); workConflicts.clear(); },
            async login(username, password, config) {
                token = ''; tokenKey = '';
                if (!username || !password) throw new Error('请输入 OpenSubtitles 用户名和密码');
                const result = await request('/login', config, {username, password});
                if (!result?.token) throw new Error('接口未返回登录令牌');
                token = result.token; tokenKey = config.key;
            },
            async search(row, config, report = () => {}) {
                const parsed = row.parsed;
                const title = config.correctionName || subtitleQueryTitle(parsed.query, parsed.year);
                if (!title) throw subtitleSourceError('无法从文件名识别作品名称');
                if (parsed.tv && (parsed.season === null || parsed.episode === null)) throw subtitleSourceError('缺少明确季集，请先在影视整理中确认季集并重命名');
                if (parsed.endEpisode && parsed.endEpisode !== parsed.episode) throw subtitleSourceError('合并多集视频需要单独匹配字幕，本次未自动查询');
                const params = new URLSearchParams({query: title, languages: config.language, order_by: 'download_count', order_direction: 'desc'});
                if (parsed.tmdbId) params.set(parsed.tv ? 'parent_tmdb_id' : 'tmdb_id', parsed.tmdbId);
                if (parsed.tv) { params.set('season_number', parsed.season); params.set('episode_number', parsed.episode); params.set('type','episode'); }
                else { params.set('type','movie'); if (parsed.year) params.set('year',parsed.year); }
                const cacheKey = JSON.stringify([config.key, params.toString()]);
                if (!searchCache.has(cacheKey)) searchCache.set(cacheKey, request('/subtitles?' + params, config).catch(error => { searchCache.delete(cacheKey); throw error; }));
                const attempt = {term:params.toString()};
                let result;
                try {
                    result = await searchCache.get(cacheKey);
                    if (!Array.isArray(result?.data)) throw subtitleSourceError('搜索返回格式异常');
                } catch (error) {
                    attempt.error = error.message; report({queries:[attempt]}); throw error;
                }
                attempt.rawCount = result.data.length;
                const candidates = [], excluded = {作品:0,年份:0,季集:0,格式:0,上限:0};
                for (const item of result.data) {
                    const attrs = item.attributes || {}, feature = attrs.feature_details || {};
                    const identity = parsed.tv ? feature.parent_tmdb_id : feature.tmdb_id;
                    const yearMatches = parsed.tv || !parsed.year || !feature.year || String(feature.year) === String(parsed.year);
                    const titleMatched = [feature.title, feature.movie_name].some(value => titleKey(value) === titleKey(title)) && yearMatches;
                    if (parsed.tmdbId && identity && String(identity) !== String(parsed.tmdbId)) { excluded.作品++; continue; }
                    if (!parsed.tv && /episode|tvshow/i.test(feature.feature_type || '')) { excluded.作品++; continue; }
                    if (parsed.tv && (Number(feature.season_number) !== parsed.season || Number(feature.episode_number) !== parsed.episode)) { excluded.季集++; continue; }
                    if (!Array.isArray(attrs.files) || !attrs.files.length) { excluded.格式++; continue; }
                    for (const file of attrs.files) {
                        if (!Number.isSafeInteger(file?.file_id) || file.file_id <= 0) { excluded.格式++; continue; }
                        const match = subtitleWorkIdentity(parsed, [feature.title, feature.movie_name], file.file_name || 'subtitle');
                        candidates.push({source:'OpenSubtitles', fileId:file.file_id, ...subtitleFileInfo(file.file_name || attrs.release || '', attrs.language || ''), release:[feature.movie_name || feature.title, attrs.release].filter(Boolean).join(' · '), name:file.file_name || '', workIdentity:{tmdbId:identity,year:feature.year,tv:parsed.tv,season:feature.season_number,episode:feature.episode_number}, hardMismatch:!yearMatches || !!match.hardMismatch, titleMatched:titleMatched && match.titleMatched, identityMatched:yearMatches && match.titleMatched && !!parsed.tmdbId && String(identity) === String(parsed.tmdbId), matchReason:!yearMatches ? '作品年份与视频不符' : match.matchReason});
                    }
                }
                excluded.上限 = Math.max(0, candidates.length - 12);
                const kept = candidates.slice(0, 12);
                report({queries:[attempt],rawCount:attempt.rawCount,unit:'资源',keptCount:kept.length,excluded});
                return kept;
            },
            async fetchFile(candidate, config, progress = () => {}, verify = () => {}) {
                for (let attempt = 0; attempt < 2; attempt++) {
                    verify();
                    let result;
                    try {
                        result = await this.download(candidate, config); verify();
                        if (result.fileName) progress('文件选择', `${candidate.source} · ${result.fileName}`);
                        if (candidate.source === 'SubDL' && result.ext === 'zip') return await archiveWork(async () => {
                            const archive = await archiveData(result.url,verify);
                            const file = await subtitleSubdlArchive(archive.bytes,candidate,config.language,verify,archive.index);
                            result.ext = file.ext; result.fileName = file.name;
                            progress('SubDL 压缩包选择',file.name);
                            return {result,bytes:file.bytes};
                        },verify);
                        const bytes = await transfer(result,verify);
                        verify();
                        return {result,bytes};
                    } catch (error) {
                        verify();
                        if (attempt || error.phase !== 'transfer' || !([401,403,408,429,500,502,503,504].includes(error.status) || error.retryable)) throw error;
                        progress('下载重试', `${candidate.source} · ${new URL(result.url).hostname} · ${error.message}；刷新下载地址后重试一次`);
                        if (candidate.source === 'SubDL') archiveCache.delete(candidate.url);
                        await pause(1500);
                    }
                }
            },
            async download(candidate, config) {
                if (candidate.source === '迅雷') return {url:subtitleDownloadUrl(candidate.url,{allowHttp:true}), ext:candidate.ext,fileName:candidate.name,allowHttp:true};
                if (candidate.source === 'SubDL') return {url:subtitleDownloadUrl(candidate.url),ext:candidate.ext,fileName:candidate.name};
                const result = await request('/download', config, {file_id:candidate.fileId});
                const ext = String(result?.file_name || candidate.name).split('.').pop().toLowerCase();
                return {url:subtitleDownloadUrl(result?.link), ext,fileName:result?.file_name || candidate.name};
            }
        };
    }

    const SUBTITLE_LIMIT = 16 * 1024 * 1024;
    function subtitleArchiveIndex(bytes, check = () => {}, strict = false) {
        // Parse the central directory once; do not inflate unrelated files.
        const invalid = () => new Error('ZIP 格式不支持或数据不完整（不支持 ZIP64、多卷及 RAR）');
        const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        let end = bytes.length - 22;
        for (; end >= Math.max(0,bytes.length - 65557); end--) {
            if (view.getUint32(end,true) === 0x06054b50 && end + 22 + view.getUint16(end+20,true) === bytes.length) break;
        }
        if (end < Math.max(0,bytes.length - 65557)) throw invalid();
        const count = view.getUint16(end+10,true), size = view.getUint32(end+12,true), start = view.getUint32(end+16,true);
        if (view.getUint16(end+4,true) || view.getUint16(end+6,true) || count !== view.getUint16(end+8,true) || count > 2000 || start + size !== end) throw invalid();
        const files = [], paths = new Map(), ranges = [];
        let expanded = 0;
        if (strict && count > 200) throw new Error('ZIP 条目超过 200 项');
        let offset = start;
        for (let i = 0; i < count; i++) {
            check();
            if (offset + 46 > end || view.getUint32(offset,true) !== 0x02014b50) throw invalid();
            const flags = view.getUint16(offset+8,true), method = view.getUint16(offset+10,true), crc = view.getUint32(offset+16,true);
            const compressed = view.getUint32(offset+20,true), length = view.getUint32(offset+24,true), local = view.getUint32(offset+42,true);
            const nameSize = view.getUint16(offset+28,true), next = offset + 46 + nameSize + view.getUint16(offset+30,true) + view.getUint16(offset+32,true);
            if (next > end || view.getUint16(offset+34,true)) throw invalid();
            const nameBytes = bytes.subarray(offset+46,offset+46+nameSize);
            const path = new TextDecoder(flags & 0x800 ? 'utf-8' : 'gb18030', {fatal:strict}).decode(nameBytes);
            const name = path.split(/[\\/]/).pop(), ext = name.split('.').pop().toLowerCase();
            if (strict) {
                const parts = path.normalize('NFKC').replace(/\\/g,'/').replace(/\/$/,'').split('/');
                if (parts.some(part => !part || part === '.' || part === '..' || /[:\x00-\x1f]/.test(part) || /[ .]$/.test(part)))
                    throw new Error('ZIP 包含绝对路径或不安全路径');
                const key = parts.join('/').toLowerCase(), directory = !name;
                if (paths.has(key)) throw new Error('ZIP 包含重复或冲突路径');
                paths.set(key,directory);
                if ((flags | (local + 30 <= start ? view.getUint16(local+6,true) : 0)) & 0x2041) throw new Error('不支持加密 ZIP');
                if (length === 0xffffffff || compressed === 0xffffffff || local === 0xffffffff || ![0,8].includes(method)) throw invalid();
                if (/\.(?:zip|rar|7z|tar|gz|bz2|xz|cab)$/i.test(name)) throw new Error('不支持嵌套压缩包');
                if (length > 4 * 1024 * 1024) throw new Error('ZIP 单个条目超过 4 MiB');
                expanded += length;
                if (expanded > 32 * 1024 * 1024) throw new Error('ZIP 累计解压大小超过 32 MiB');
                if (length > compressed * 200) throw new Error('ZIP 条目压缩比超过 200:1');
                const dataStart = subtitleArchiveDataOffset(view,{local,flags,method,compressed,length,crc},start,invalid);
                if (view.getUint16(local+26,true) !== nameBytes.length || local + 30 + nameBytes.length > dataStart
                    || nameBytes.some((byte,j) => byte !== bytes[local+30+j])) throw invalid();
                let dataEnd = dataStart + compressed;
                if (flags & 8) {
                    const matches = at => at + 12 <= start && view.getUint32(at,true) === crc
                        && view.getUint32(at+4,true) === compressed && view.getUint32(at+8,true) === length;
                    if (matches(dataEnd)) dataEnd += 12;
                    else if (dataEnd + 4 <= start && view.getUint32(dataEnd,true) === 0x08074b50 && matches(dataEnd+4)) dataEnd += 16;
                    else throw invalid();
                } else if (view.getUint32(local+14,true) !== crc || view.getUint32(local+18,true) !== compressed
                    || view.getUint32(local+22,true) !== length) throw invalid();
                ranges.push([local,dataEnd]);
            }
            offset = next;
            if (!['srt','ass','ssa','vtt'].includes(ext) || path.startsWith('__MACOSX/') || name.startsWith('._')) continue;
            if (flags & 1 || ![0,8].includes(method) || !strict && !length || length > SUBTITLE_LIMIT || compressed > SUBTITLE_LIMIT) continue;
            files.push({name,path,ext,method,crc,compressed,length,local,flags});
        }
        if (offset !== end) throw invalid();
        if (strict) {
            for (const key of paths.keys()) {
                for (let slash = key.lastIndexOf('/'); slash >= 0; slash = key.lastIndexOf('/',slash-1))
                    if (paths.get(key.slice(0,slash)) === false) throw new Error('ZIP 包含文件与目录路径冲突');
            }
            ranges.sort((a,b) => a[0] - b[0]);
            if (ranges.some(([at],index) => index && at < ranges[index-1][1])) throw invalid();
        }
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
        check();
        const files = subtitleArchiveChoices(index,candidate,language);
        if (!files.length) throw new Error('SubDL 压缩包没有通过片名、年份、季集及语言检查的文本字幕');
        return subtitleArchiveExtract(bytes,index,files[0],check);
    }
    function subtitleArchiveDataOffset(view, file, start, invalid) {
        const {local} = file;
        if (local + 30 > start || view.getUint32(local,true) !== 0x04034b50 || view.getUint16(local+6,true) !== file.flags || view.getUint16(local+8,true) !== file.method) throw invalid();
        const dataStart = local + 30 + view.getUint16(local+26,true) + view.getUint16(local+28,true);
        if (dataStart + file.compressed > start) throw invalid();
        if (file.method === 0 && file.compressed !== file.length) throw invalid();
        return dataStart;
    }
    async function subtitleArchiveExtract(bytes, index, file, check) {
        const invalid = () => new Error('ZIP 格式不支持或数据不完整');
        const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        const dataStart = subtitleArchiveDataOffset(view,file,index.start,invalid);
        let payload = bytes.subarray(dataStart,dataStart+file.compressed);
        if (file.method === 8) {
            let inflater;
            try { inflater = new DecompressionStream('deflate-raw'); } catch { throw new Error('当前浏览器不支持 ZIP 解压，请更新浏览器或选择其他来源的单文件字幕'); }
            const reader = new Blob([payload]).stream().pipeThrough(inflater).getReader(), chunks = [];
            let total = 0;
            try {
                for (;;) {
                    check(); const {done,value} = await reader.read(); check(); if (done) break;
                    total += value.length;
                    if (total > file.length || total > SUBTITLE_LIMIT) throw invalid();
                    chunks.push(value);
                }
            } catch (error) { check(); if (error.name === 'TypeError') throw invalid(); throw error; }
            finally { await reader.cancel().catch(() => {}); }
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
                            reject(new Error('网盘返回的视频片段范围不正确')); return;
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
        return subtitleTimeline(text, ext).dialogue.join('\n');
    }
    function subtitlePayload(bytes, ext, language, onDecoded = () => {}, validateTimeline) {
        if (!bytes.length || bytes.length > SUBTITLE_LIMIT || !['srt','ass','ssa','vtt'].includes(ext)) throw new Error('仅支持单个 SRT、ASS、SSA、VTT 字幕，不导入压缩包或不完整字幕对');
        let decoded;
        try { decoded = subtitleDecode(bytes); }
        catch { throw new Error('字幕文本解码失败（UTF-8 / UTF-16 / GB18030），未上传'); }
        const {text, encoding} = decoded;
        onDecoded(`编码 ${encoding.toUpperCase()}，${bytes.length} 字节`);
        if (/^\s*(?:<!doctype\s+html|<html|\{"(?:error|message)")/i.test(text) || !(/-->|\[Events\][\s\S]*Dialogue\s*:/i.test(text))) throw new Error('下载内容不是可识别的字幕文本（' + encoding.toUpperCase() + '，' + bytes.length + ' 字节，' + (/<!doctype\s+html|<html|<body/i.test(text.slice(0, 1024)) ? '返回了 HTML 页面' : '缺少字幕时间轴或 Dialogue') + '）');
        const timeline = subtitleTimeline(text, ext);
        if (validateTimeline) validateTimeline(timeline);
        else if (!timeline.dialogue.length) throw new Error('字幕时间轴没有可用的对白');
        const dialogue = timeline.dialogue.join('\n');
        if (language !== 'en' && !/[\u3400-\u9fff]/.test(dialogue)) throw new Error('字幕正文未检测到中文，未上传');
        if (language === 'en' && !/[a-z]{2}/i.test(dialogue)) throw new Error('字幕正文未检测到英文，未上传');
        return text;
    }
    function subtitleValidateContent(row, bytes, ext, language, log = () => {}) {
        let encoding = '', timing;
        const text = subtitlePayload(bytes, ext, language, message => { encoding = message; log('字幕解码', message); },
            timeline => {timing = subtitleCheckDuration(row, '', ext, log, timeline);});
        return {text, encoding, ...timing, work:{status:'unconfirmed', reason:'正文格式和语言通过，作品归属未确认'}};
    }
    function subtitleVerificationMessage(result) {
        return `格式/语言通过；${({file:'对白范围与视频文件时长相符', unknown:'无时长参考', reference:'TMDB 仅作作品时长参考', 'reference-difference':'与 TMDB 作品时长参考有差异'})[result.evidence] || '时长证据待确认'}；${result.work?.status === 'supported' ? 'AI 支持作品归属（非实证）' : '作品归属未确认'}；未核对音画同步`;
    }
    function subtitleUploadName(name, ext) {
        if (typeof name !== 'string' || !name.trim()) throw new Error('来源未提供字幕原名，待处理');
        if (name !== name.trim() || name.length >= 256 || /[\\\/:*?"<>|\x00-\x1f\x7f]/.test(name)
            || /^\.+|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\s*\./i.test(name) || !/\.(?:srt|ass|ssa|vtt)$/i.test(name) || name.split('.').at(-1).toLowerCase() !== ext)
            throw new Error('字幕原名不可用或扩展名与正文格式不符，待处理');
        return name;
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
        const original = tokens(row.node.originalName || row.node.name), wanted = language.split(',');
        const scored = (row.candidates || []).map(candidate => {
            const version = tokens(candidate.release + ' ' + candidate.name);
            const editionMismatch = row.parsed && subtitleNetworkEditionMismatch(row.parsed, [candidate.name,candidate.release]);
            const overlaps = [...original].filter(token => version.has(token)).length;
            const lang = wanted.includes(candidate.language) || wanted.some(value => subtitleLanguageMatch(candidate.name, value));
            const identity = candidate.identityMatched || candidate.titleMatched || candidate.aiAccepted;
            const reliable = !candidate.downloadFailed && !candidate.hardMismatch && !!identity && lang && !editionMismatch;
            const preference = wanted.indexOf(candidate.language);
            return {candidate, reliable, preference:subtitlePreference(candidate, language), score:(candidate.identityMatched ? 100 : 0) + (candidate.titleMatched ? 50 : 0) + overlaps * 10 + (lang ? 5 : 0) + (preference < 0 ? 0 : (wanted.length - preference) / 10)};
        }).sort((a,b) => Number(!!a.candidate.opaque) - Number(!!b.candidate.opaque) || Number(b.reliable) - Number(a.reliable) || b.preference - a.preference || b.score - a.score);
        row.candidates = scored.map(item => item.candidate);
        row.autoCandidates = scored.filter(item => item.reliable).map(item => item.candidate);
        row.selectedCandidate = row.autoCandidates[0] || null;
        row.aiSuggested = !!row.selectedCandidate?.aiAccepted;
    }
    function subtitleCovered(row) {
        return row.complete || row.embedded?.chinese;
    }
    function subtitleCoverageState(row) {
        if (subtitleCovered(row)) return 'complete';
        return row.writeBlocked || row.coverageUnconfirmed || row.embedded?.unconfirmed ? 'unconfirmed' : 'missing';
    }
    const subtitleSearchLabels = {unsearched:'尚未查找',ready:'待补齐',choice:'手动选择',notFound:'已查询来源未找到匹配项',failed:'查询失败'};
    function subtitleSearchState(row) {
        if (row.selectedCandidate && !row.selectedCandidate.downloadFailed) return 'ready';
        if (row.candidates?.some(candidate => !candidate.downloadFailed)) return 'choice';
        const sources = row.sources || [];
        if (sources.some(source => source.error || source.paused || source.cacheError && source.count == null
            || source.queries?.some(query => query.error) || source.downloadErrors?.length)) return 'failed';
        return sources.some(source => source.count != null) ? 'notFound' : 'unsearched';
    }
    function createSubtitleWorkCorrection(ai, credential) {
        const works = new Map();
        let parseFailures = 0, paused = false;
        const identify = paced(0, async (row, check) => {
            check();
            if (paused) return null;
            const {parsed, node} = row;
            const type = parsed.tv ? 'tv' : 'movie';
            const client = tmdbClient(credential);
            const attempted = subtitleSearchNames(parsed);
            const safe = value => subtitleDiagnosticText(value, {key:credential}).slice(0,160);
            const eligible = item => item.media_type === type && /^\d+$/.test(String(item.id))
                && String(item.release_date || item.first_air_date || '').slice(0,4) === String(parsed.year);
            const known = (await client.search(parsed.query)).filter(eligible).slice(0,8);
            check();
            let suggestion;
            try {
                suggestion = await ai.correctSubtitleWork({name:safe(node.name), folders:(node.folders || []).slice(-2).map(safe),
                    work:{type,year:parsed.year,season:parsed.season,names:attempted.map(safe)},
                    candidates:known.map(({id,title,name,original_title,original_name}) => ({id,title:safe(title || name),original:safe(original_title || original_name)}))});
                check(); parseFailures = 0;
            } catch (error) {
                check();
                parseFailures = error.aiParse ? parseFailures + 1 : 0;
                if (parseFailures >= 2 || [401,403,429,509].includes(error.status)) paused = true;
                throw error;
            }
            const proposed = suggestion?.title;
            const picked = Number.isSafeInteger(suggestion?.id) && known.find(item => String(item.id) === String(suggestion.id));
            if (suggestion?.id != null && !picked) return null;
            if (!picked && (typeof proposed !== 'string' || !proposed.trim() || proposed.length > 120 || /https?:|[\r\n<>]/i.test(proposed))) return null;
            const nameToVerify = picked ? picked.title || picked.name : proposed;
            if (typeof nameToVerify !== 'string' || !nameToVerify.trim()) return null;
            const matches = (await client.search(nameToVerify)).filter(item => eligible(item)
                && mediaWorkNames(item).some(name => titleKey(name) === titleKey(nameToVerify)));
            check();
            if (matches.length !== 1 || picked && String(picked.id) !== String(matches[0].id)) return null;
            const id = String(matches[0].id);
            const detail = await client.get('/' + type + '/' + id,{append_to_response:'alternative_titles'});
            check();
            if (String(detail.id) !== id || (detail.release_date || detail.first_air_date || '').slice(0,4) !== String(parsed.year)) return null;
            if (detail.media_type && detail.media_type !== type) return null;
            const aliases = mediaWorkNames(detail);
            const normalized = aliases.map(titleKey);
            // Model suggestions need an existing trusted title or an exact filename/folder title as evidence.
            const recognized = [parsed.query,...(parsed.aliases || []),...(node.folders || []).slice(-2)]
                .some(name => normalized.includes(titleKey(subtitleQueryTitle(name,parsed.year))));
            if (!recognized) return null;
            if (typeof proposed === 'string' && !picked && !normalized.includes(titleKey(proposed))) return null;
            const name = aliases.map(alias => subtitleQueryTitle(alias,parsed.year)).find(alias => alias && !attempted.some(term => titleKey(term) === titleKey(alias)));
            return name ? {client,id,aliases,name} : null;
        });
        return async (row, check) => {
            const {parsed} = row;
            const phase = subtitleSearchState(row);
            if (paused || parsed.tmdbId || !parsed.year || !parsed.query || row.complete || row.embedded?.chinese || row.writeBlocked
                || row.selectedCandidate || row.workLookupFailed || row.sources?.some(source => source.error || source.paused || source.downloadErrors?.length || source.queries?.some(query => query.error))
                || !['notFound','choice'].includes(phase)
                || parsed.tv && (parsed.season == null || parsed.episode == null || parsed.endEpisode && parsed.endEpisode !== parsed.episode)) return null;
            const parsedNames = subtitleSearchNames(parsed).map(titleKey);
            const differentFolderTitle = (row.node.folders || []).slice(-2).some(folder => {
                const title = titleKey(subtitleQueryTitle(folder,parsed.year));
                return title.length >= 2 && !/^(?:movies?|tv|series|\d+|s\d+|season\d+|电影|剧集|动漫|纪录片|综艺|第\d+季)$/i.test(title) && !parsedNames.includes(title);
            });
            if (phase !== 'choice' && !differentFolderTitle) return null;
            const key = JSON.stringify([parsed.tv,titleKey(parsed.query),parsed.year,parsed.season,(row.node.folders || []).slice(-2).map(titleKey)]);
            if (!works.has(key)) works.set(key, identify(row,check));
            const result = await works.get(key); check();
            if (!result) return null;
            if (parsed.tv) {
                const episode = await result.client.get('/tv/' + result.id + '/season/' + parsed.season + '/episode/' + parsed.episode);
                check();
                if (Number(episode.season_number) !== parsed.season || Number(episode.episode_number) !== parsed.episode) return null;
            }
            return {name:result.name, parsed:{...parsed,tmdbId:result.id,aliases:[...new Set([...(parsed.aliases || []),...result.aliases])],workResolved:true}};
        };
    }
    function subtitleDiagnosticText(value, {key, subdlKey, password} = {}) {
        let message = String(value ?? '').replace(/https?:\/\/[^\s"'<>]+/gi, value => {
            try { return new URL(value).origin + '/[地址已隐藏]'; } catch { return '[地址已隐藏]'; }
        });
        for (const secret of [key, subdlKey, password]) if (secret) {
            message = message.split(secret).join('[凭证已隐藏]');
            message = message.split(encodeURIComponent(secret)).join('[凭证已隐藏]');
        }
        return message.replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
            .replace(/\b((?:security[-_ ]?)?token|api[-_ ]?key|authorization|signature)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi, '$1=[已隐藏]');
    }
    function saveSubtitleSourceReport(source, config, report) {
        const {queries, downloadErrors, deferredTerms, ...counts} = report;
        Object.assign(source, counts);
        if (deferredTerms) source.deferredTerms = deferredTerms.map(term => subtitleDiagnosticText(term, config));
        if (queries) source.queries = queries.map(({term, rawCount, error}) => ({
            term:subtitleDiagnosticText(term, config), rawCount, ...(error ? {error:subtitleDiagnosticText(error, config)} : {})
        }));
        if (downloadErrors?.length) (source.downloadErrors ||= []).push(...downloadErrors.map(error => subtitleDiagnosticText(error, config)));
    }
    function subtitleSourceSummary(source) {
        const exclusions = Object.entries(source.excluded || {}).filter(([, count]) => count).map(([reason, count]) => `${reason} ${count}`);
        return [source.skipped, source.paused && '本批暂停：' + source.paused, source.cacheError && '整季缓存：' + source.cacheError,
            source.deferredTerms?.length && `暂缓 ${source.deferredTerms.length} 个搜索词`,
            source.rawCount != null ? `返回 ${source.rawCount} ${source.unit}` : '',
            source.count != null ? `保留 ${source.count} 个候选` : '', exclusions.length ? '排除 ' + exclusions.join('、') : '',
            source.rejected ? `AI 排除 ${source.rejected} 个候选` : '', source.error && '查询失败：' + source.error,
            ...((source.queries || []).filter(query => query.error).map(query => `搜索词「${query.term}」失败：${query.error}`)),
            ...(source.downloadErrors || []).map(error => '下载失败：' + error)
        ].filter(Boolean).join(' · ');
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
                            if (excluded.identityMatched || excluded.titleMatched || excluded.aiAccepted) continue;
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
                    || candidate.identityMatched || candidate.titleMatched || candidate.aiAccepted);
                selectSubtitleCandidate(row,language);
            }
        });
    }
    function subtitleSearchSummary(rows) {
        const coverage = {complete:0,missing:0,unconfirmed:0};
        const search = {unsearched:0,ready:0,choice:0,notFound:0,failed:0};
        for (const row of rows) {
            const state = subtitleCoverageState(row);
            coverage[state]++;
            if (state !== 'complete') search[subtitleSearchState(row)]++;
        }
        const counts = Object.entries(search).filter(([, count]) => count).map(([state, count]) => `${subtitleSearchLabels[state]} ${count}`);
        return [`视频 ${rows.length} · 有字幕 ${coverage.complete} · 缺可用字幕 ${coverage.missing} · 检查未确认 ${coverage.unconfirmed}`, ...counts].join(' · ');
    }
    function subtitleSearchMessage(row) {
        const message = row.selectedCandidate
            ? row.aiSuggested ? 'AI 建议了这份字幕，请核对候选名称；可在下拉框更改后补齐。' : row.manualCandidate ? '已手动选择字幕，点击“补齐字幕”下载并写入视频目录。' : `已自动择优，${row.autoCandidates.length} 个可靠候选；点击“补齐字幕”下载并写入视频目录，下载内容不符时尝试下一份。`
            : row.manualCandidate ? '已跳过此视频；重新选择字幕后可补齐。'
            : row.candidates?.length ? '找到候选，但作品或语言未确认，需手动选择。'
            : subtitleSearchState(row) === 'failed' ? '查询有失败，请查看各来源结果。'
                : subtitleSearchState(row) === 'notFound' ? '已查询来源未找到匹配项。' : '尚未查询任何来源。';
        return [message, row.selectedCandidate && '所选字幕：' + subtitleCandidateLabel(row.selectedCandidate),
            ...(row.sources || []).map(source => source.name + '：' + subtitleSourceSummary(source))].filter(Boolean).join('\n');
    }
    async function searchSubtitleSources(row, config, service, drive, log = () => {}, check = () => {}, resume = false) {
        if (!resume && !config.correctionName) { row.error = ''; row.candidates = []; row.selectedCandidate = null; row.manualCandidate = false; row.aiSuggested = false; row.sources = []; }
        const title = subtitleQueryTitle(row.parsed.query, row.parsed.year);
        if (!resume && !config.correctionName && row.parsed.tv) {
            for (const [name,enabled,method] of [['SubDL',config.subdl && config.subdlKey,'subdlCachedEpisode'],['迅雷',config.thunder,'thunderCachedEpisode']]) {
                if (!enabled || !service[method] || service.searchUnavailable?.(name)) continue;
                check();
                const source = {name};
                let cached;
                try {
                    cached = await service[method](row, config, message => log(name + ' 缓存文件列表', message), check, report => saveSubtitleSourceReport(source, config, report));
                    check();
                } catch (error) {
                    check();
                    if (!isSubtitleSourceError(error)) throw error;
                    const reason = subtitleDiagnosticText(error.message,config);
                    row.sources.push({...source,cacheError:reason});
                    if (subtitleSourcePaused(name,error)) service.pauseSearchSource?.(name,reason);
                    log('整季缓存失败', row.node.name + ' · ' + name + ' · ' + reason);
                    continue;
                }
                if (!Array.isArray(cached)) throw new TypeError('整季缓存未返回候选列表：' + name);
                const selection = {node:row.node,parsed:row.parsed,candidates:cached};
                selectSubtitleCandidate(selection, config.language);
                if (!selection.selectedCandidate) continue;
                row.candidates.push(...cached);
                source.count = cached.length;
                row.sources.push(source);
                selectSubtitleCandidate(row, config.language);
                log('整季快速命中', `${row.node.name} · ${name} · 复查缓存中的片名、年份及准确季集后选中；跳过本集视频取样与来源搜索，下载后仍检查正文`);
                break;
            }
        }
        if (!resume && !row.selectedCandidate) log('查找阶段', `${row.node.name} · 使用片名及作品别名搜索字幕来源`);
        const run = async (name, enabled, configured, search) => {
            check();
            if (config.correctionName) {
                const source = row.sources.find(source => source.name === name);
                const terms = source?.queries || [];
                const termKeys = new Set(terms.map(({term}) => {
                    if (name === '迅雷') return titleKey(term.replace(/ S\d+E\d+$/, ''));
                    const params = new URLSearchParams(term);
                    return titleKey(params.get('film_name') || params.get('query') || '');
                }).filter(Boolean));
                // OpenSubtitles keeps its single-query budget. A verified new name can use an unused alias slot elsewhere.
                if (termKeys.has(titleKey(config.correctionName)) || termKeys.size >= (name === 'OpenSubtitles' ? 1 : 3)) return;
                if (source?.count != null && !source.queries?.length) return;
            }
            if (!resume && !config.correctionName && row.sources.some(source => source.name === name && source.count != null)) return;
            let previous = row.sources.find(source => source.name === name && source.cacheError);
            if (config.correctionName) previous = row.sources.find(source => source.name === name);
            if (resume) {
                previous = row.sources.find(source => source.name === name && (source.deferred || source.deferredTerms?.length));
                if (!previous) return;
                selectSubtitleCandidate(row, config.language);
                if (row.selectedCandidate) return;
                previous.deferred = false;
                previous.deferredTerms = [];
            }
            const mark = state => { if (previous) Object.assign(previous, state); else row.sources.push({name,...state}); };
            if (!enabled) { mark({skipped:'已关闭'}); log('来源跳过', `${name} 已关闭`); return; }
            if (!configured) { mark({skipped:'未配置密钥，未查询'}); log('来源跳过', `${name} 未配置密钥`); return; }
            const unavailable = service.searchUnavailable?.(name);
            if (unavailable) { mark({paused:subtitleDiagnosticText(unavailable, config)}); log('来源跳过', `${name} 本批已暂停：${unavailable}`); return; }
            selectSubtitleCandidate(row, config.language);
            const selected = row.selectedCandidate;
            if (selected) {
                const reason = '已有可靠字幕，省去重复查询';
                mark({skipped:reason,deferred:true}); log('来源跳过', `${name}：${reason}`); return;
            }
            const started = Date.now(); let fetchedAt = 0;
            const source = previous || {name};
            delete source.skipped;
            if (!previous) row.sources.push(source);
            const earlier = {...source};
            try {
                log('来源', `${name} 开始，搜索片名：${title}`);
                const found = await search(report => {
                    saveSubtitleSourceReport(source, config, report);
                    if (report.queries && earlier.queries) source.queries = [...earlier.queries,...source.queries];
                    if ('rawCount' in report && earlier.rawCount != null && earlier.unit === source.unit) source.rawCount = (source.rawCount ?? 0) + earlier.rawCount;
                    if (report.excluded && earlier.excluded) for (const [reason,count] of Object.entries(earlier.excluded)) source.excluded[reason] = (source.excluded[reason] || 0) + count;
                }, source); check();
                if (!Array.isArray(found)) throw new TypeError('字幕来源未返回候选列表');
                fetchedAt = Date.now();
                const known = new Set(row.candidates.filter(candidate => candidate.source === name).map(candidate => candidate.url || candidate.fileId || candidate.name));
                const fresh = found.filter(candidate => !known.has(candidate.url || candidate.fileId || candidate.name));
                source.count = (earlier.count || 0) + fresh.length;
                row.candidates.push(...fresh);
                log('来源', `${name} 返回 ${found.length} 个文件候选`);
                selectSubtitleCandidate(row, config.language);
                if (!row.selectedCandidate && config.reviewCandidates) await config.reviewCandidates(row, fresh, check);
                const kept = fresh.filter(candidate => row.candidates.includes(candidate)).length;
                source.count = (earlier.count || 0) + kept;
                source.rejected = (earlier.rejected || 0) + fresh.length - kept;
                if (found.length > fresh.length) (source.excluded ||= {}).重复 = (source.excluded.重复 || 0) + found.length - fresh.length;
                log('来源判断', `${row.node.name} · ${name} · 返回 ${found.length}，AI 排除 ${source.rejected}，保留 ${source.count} · ${row.selectedCandidate ? '产生可靠候选，后续来源暂缓' : source.count ? '只有待确认候选，继续下一来源' : '没有可用候选，继续下一来源'}`);
            } catch (error) {
                check(); source.error = subtitleDiagnosticText(error.message, config);
                const expected = isSubtitleSourceError(error);
                if (expected && subtitleSourcePaused(name,error)) service.pauseSearchSource?.(name,source.error);
                log(error.phase === 'drive-auth' ? '网盘授权失败' : expected ? '来源失败' : '来源处理异常', `${row.node.name} · ${name}：${error.message}`);
                if (!expected) { row.error = source.error; row.searchMessage = subtitleSearchMessage(row); throw error; }
            } finally {
                const paused = service.searchUnavailable?.(name);
                if (paused) source.paused = subtitleDiagnosticText(paused,config);
                for (const query of source.queries || []) log('来源查询记录', `${name} · ${query.term}${query.rawCount != null ? ` · 原始 ${query.rawCount} 条` : ''}${query.error ? ' · ' + query.error : ''}`);
                const detail = subtitleSourceSummary(source);
                if (detail) log('来源结果', `${row.node.name} · ${name} · ${detail}`);
                log('来源耗时', `${row.node.name} · ${name} · 查询 ${(((fetchedAt || Date.now()) - started) / 1000).toFixed(1)} 秒${fetchedAt ? '，候选判断 ' + ((Date.now() - fetchedAt) / 1000).toFixed(1) + ' 秒' : ''}`);
            }
        };
        if (!row.selectedCandidate) log('查找阶段', `${row.node.name} · 迅雷片名搜索`);
        await run('迅雷', config.thunder, true, (report, source) => service.thunderSearch(row, {...config,thunderOffset:config.correctionName ? 0 : source.thunderOffset}, message => log('迅雷 文件列表', message), check, report));
        if (config.subdl) await run('SubDL', true, config.subdlKey, report => service.subdlSearch(row, config, message => log('SubDL 文件列表',message),check,report));
        await run('OpenSubtitles', config.open, config.key, report => service.search(row, config, report));
        check(); selectSubtitleCandidate(row, config.language);
        row.searchMessage = subtitleSearchMessage(row);
    }
    async function applySubtitleWorkCorrection(row, correctWork, config, service, drive, log, check) {
        if (!correctWork) return;
        try {
            const suggestion = await correctWork(row, check);
            if (!suggestion) return;
            const revised = {...row,parsed:suggestion.parsed,sources:row.sources.map(source => ({...source})),
                candidates:[],autoCandidates:[],selectedCandidate:null,aiSuggested:false};
            await searchSubtitleSources(revised,{...config,correctionName:suggestion.name},service,drive,log,check);
            check();
            row.sources = revised.sources;
            if (revised.selectedCandidate || !row.candidates.length && revised.candidates.length) {
                Object.assign(row,{parsed:revised.parsed,candidates:revised.candidates,selectedCandidate:revised.selectedCandidate,
                    autoCandidates:revised.autoCandidates,aiSuggested:revised.aiSuggested});
            }
            row.searchMessage = subtitleSearchMessage(row);
            log('作品纠正补查', suggestion.name);
        } catch (error) {
            check();
            if (error.stop) throw error;
            log('作品纠正未采用', error.message);
        }
    }
    function subtitleVerificationContext(row) {
        if (!row) return '';
        const node = row.node, parsed = row.parsed || {};
        return JSON.stringify([4, String(node.id), String(node.parentId ?? ''), node.name, node.size, (node.md5 || '').toLowerCase(),
            parsed.query, parsed.year, !!parsed.tv, parsed.tmdbId, parsed.season, parsed.episode, parsed.endEpisode, node.durationSeconds, parsed.runtimeSeconds, !!parsed.standalone]);
    }
    async function inspectExistingSubtitles(row, drive, language, log = () => {}, check = () => {}, {force = false, review = null, observe = () => {}} = {}) {
        row.complete = false; row.verification = null; row.coverageUnconfirmed = false;
        const rejected = [];
        for (const sub of row.subtitles.filter(sub => /\.(srt|ass|ssa|vtt)$/i.test(sub.name))) {
            check(); drive.assertReady?.();
            if (force) drive.verified?.forget(sub);
            const cached = !force && drive.verified?.get(sub,language,row);
            if (cached) {
                if (cached.result.work?.status === 'mismatch') {
                    rejected.push(sub.name + '：疑似其他作品 · ' + cached.result.work.reason);
                    log('现有字幕无效', `${row.node.name} · ${sub.name} · 已记录疑似错片：${cached.result.work.reason}`); continue;
                }
                row.verification = cached.result;
                row.complete = true; row.error = ''; row.searchMessage = '已核验记录复用：' + sub.name + ' · ' + subtitleVerificationMessage(cached.result);
                log('已核验记录复用', `${row.node.name} · ${sub.name} · ${subtitleVerificationMessage(cached.result)}`); return;
            }
            log('正文检查', `${row.node.name} · 读取现有字幕 ${sub.name}`);
            let bytes;
            try { bytes = await drive.read(sub, message => log('核验重试', message), check); check(); }
            catch (error) { observe(error); check(); if (error.stop) throw error; row.coverageUnconfirmed = true; rejected.push(sub.name + '：读取失败 · ' + error.message); log('现有字幕读取失败', `${sub.name}：${error.message}`); continue; }
            try {
                const ext = sub.name.split('.').pop().toLowerCase();
                const {text, ...result} = subtitleValidateContent(row, bytes, ext, language, log);
                if (language !== 'zh-cn,zh-tw,zh' && language !== 'en' && sub.language !== language && !subtitleLanguageMatch(sub.name, language)) { rejected.push(sub.name + '：正文含中文，但所选简繁标记未确认'); continue; }
                if (review) result.work = await review(row, text, ext, check);
                check();
                try { drive.verified?.remember(sub,bytes,language,result.encoding,row,result); } catch (error) { log('核验记录', '保存失败：' + error.message); }
                if (result.work.status === 'mismatch') {
                    rejected.push(sub.name + '：疑似其他作品 · ' + result.work.reason); continue;
                }
                row.verification = result;
                row.complete = true; row.error = ''; row.searchMessage = '已有字幕：' + sub.name + ' · ' + subtitleVerificationMessage(result);
                log('现有字幕确认', `${row.node.name} · ${sub.name} · ${subtitleVerificationMessage(result)}`); return;
            } catch (error) {
                check(); if (error.stop) throw error;
                drive.verified?.forget(sub);
                if (error.timingUnconfirmed) row.coverageUnconfirmed = true;
                rejected.push(sub.name + '：' + error.message);
                log('现有字幕无效', `${sub.name}：${error.message}`);
            }
        }
        row.error = '';
        row.searchMessage = rejected.length ? '已有字幕未通过检查：' + rejected.join('；') : '未发现可用外置字幕';
    }
    function mkvChineseSubtitle(tag, name) {
        if (tag) {
            try {
                const {language} = new Intl.Locale(tag);
                if (language && language !== 'und' && language !== 'mul') return language === 'zh' || language === 'yue';
            } catch { return false; }
        }
        return /中文|汉语|漢語|中英|[简簡繁][体體中英]|\b(?:chinese|mandarin|cantonese)\b/i.test(name);
    }
    async function inspectMkvSubtitleTracks(size, readRange, check = () => {}) {
        if (!Number.isSafeInteger(size) || size < 1) throw new Error('视频大小未知，无法安全分段读取');
        const windowSize = 64 * 1024, windows = new Map();
        const read = async (offset, length) => {
            if (!Number.isSafeInteger(offset + length) || offset + length > size) throw new Error('MKV 元素超出文件范围');
            const result = new Uint8Array(length);
            for (let written = 0; written < length;) {
                check();
                const position = offset + written, start = Math.floor(position / windowSize) * windowSize;
                if (!windows.has(start)) {
                    if (windows.size >= 8) throw new Error('达到 512 KiB 分段读取上限');
                    const end = Math.min(start + windowSize, size);
                    const bytes = await readRange(start, end - 1); check();
                    if (bytes.length !== end - start) throw new Error('MKV 片段长度不正确');
                    windows.set(start, bytes);
                }
                const chunk = windows.get(start).subarray(position - start, position - start + length - written);
                result.set(chunk, written); written += chunk.length;
            }
            return result;
        };
        const header = (bytes, start, limit) => {
            let cursor = 0;
            const vint = (identifier, max) => {
                const first = bytes[cursor];
                if (!first) throw new Error('MKV 元素头无效或不完整');
                let width = 1, marker = 128;
                while (!(first & marker)) { width++; marker >>= 1; }
                if (width > max || cursor + width > bytes.length) throw new Error('MKV 元素头无效或不完整');
                let value = identifier ? first : first & (marker - 1);
                let unknown = !identifier && value === marker - 1;
                for (let index = 1; index < width; index++) {
                    const next = bytes[cursor + index];
                    value = value * 256 + next; unknown = unknown && next === 255;
                }
                cursor += width;
                if (!unknown && !Number.isSafeInteger(value)) throw new Error('MKV 元素大小超出可处理范围');
                return unknown ? null : value;
            };
            const id = vint(true, 4), length = vint(false, 8), data = start + cursor;
            const end = length === null ? limit : data + length;
            if (!Number.isSafeInteger(end) || data > end || end > limit) throw new Error('MKV 元素超出容器范围');
            return {id, data, end, unknown:length === null};
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
        const ebml = await at(0, size);
        if (ebml.id !== 0x1a45dfa3 || ebml.unknown || ebml.end - ebml.data > windowSize) throw new Error('不是有效的 MKV 文件头');
        const metadata = await read(ebml.data, ebml.end - ebml.data);
        const docType = [...children(metadata)].find(field => field.id === 0x4282);
        if (!docType || new TextDecoder().decode(metadata.subarray(docType.data, docType.end)) !== 'matroska') throw new Error('视频容器不是 Matroska');
        let segment;
        for (let next = ebml.end, count = 0; next < size && count < 32; count++) {
            const field = await at(next, size);
            if (field.id === 0x18538067) { segment = field; break; }
            if (field.unknown) break;
            next = field.end;
        }
        if (!segment) throw new Error('未找到 MKV Segment');
        for (let next = segment.data, count = 0; next < segment.end && count < 128; count++) {
            const field = await at(next, segment.end);
            if (field.unknown) throw new Error('遇到未知长度的 MKV 元素，无法继续定位轨道表');
            if (field.id === 0x1654ae6b) {
                const length = field.end - field.data;
                if (length > windowSize * 8) throw new Error('MKV 轨道表超过读取上限');
                const tracks = await read(field.data, length);
                let chinese = false, entries = 0;
                for (const entry of children(tracks)) {
                    if (entry.id !== 0xae) continue;
                    entries++;
                    const fields = [...children(tracks, entry.data, entry.end)];
                    const types = fields.filter(item => item.id === 0x83);
                    const type = types[0];
                    if (types.length !== 1 || type.end - type.data < 1 || type.end - type.data > 8) throw new Error('MKV 轨道缺少有效的类型信息');
                    const bytes = tracks.subarray(type.data, type.end);
                    if (bytes.at(-1) !== 0x11 || !bytes.subarray(0, -1).every(value => value === 0)) continue;
                    const enabled = fields.find(item => item.id === 0xb9);
                    if (enabled && tracks.subarray(enabled.data, enabled.end).every(value => value === 0)) continue;
                    const readText = field => field ? new TextDecoder().decode(tracks.subarray(field.data, field.end)).replace(/\0+$/, '').trim() : '';
                    const tag = fields.find(item => item.id === 0x22b59d) || fields.find(item => item.id === 0x22b59c);
                    if (mkvChineseSubtitle(readText(tag), readText(fields.find(item => item.id === 0x536e)))) chinese = true;
                }
                if (!entries) throw new Error('MKV 轨道表没有有效轨道');
                return chinese;
            }
            next = field.end;
        }
        throw new Error('在读取限制内未找到 MKV 轨道表');
    }
    function subtitleDrive(context, wait = sleep) {
        const {session, source} = context, guangya = session.provider === '光鸭';
        const history = typeof mediaFileHistory === 'function' ? mediaFileHistory(session) : null;
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
                    check();
                    if (record.language) history?.link(row,matches[0],record.language);
                    recovered.push({...matches[0],parentId:row.node.parentId,language:record.language}); receipts.delete(key); persistReceipts();
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
            async inspectEmbedded(node, check = () => {}) {
                if (!/\.mkv$/i.test(node.name)) return {chinese:false, message:'非 MKV 格式，未读取视频'};
                try {
                    let url;
                    const chinese = await inspectMkvSubtitleTracks(node.size, async (start, end) => {
                        url ||= await downloadUrl(node); check();
                        return subtitleBinary(url, {headers:{Range:`bytes=${start}-${end}`}, range:[start,end,node.size], limit:end - start + 1});
                    }, check);
                    return {chinese, message:chinese ? '有内嵌中文字幕，跳过补齐' : '未发现内嵌中文字幕'};
                } catch (error) {
                    check(); if (error.stop || error.phase === 'drive-auth') throw error;
                    return {chinese:false, unconfirmed:true, message:'未读取到 MKV 字幕轨：' + error.message};
                }
            },
            async save(row, name, bytes, progress = () => {}, check = () => {}, {beforeWrite,language} = {}) {
                check();
                if (pendingFor(row).length) {
                    const recovered = await reconcile(row, progress, check);
                    const found = recovered.find(node => node.name === name);
                    if (!beforeWrite && found && await sameContent(found, bytes, subtitleMd5(bytes), progress, check)) return found;
                    throw Object.assign(new Error('此前上传已核验，请重新检查目录后确认字幕状态；本次不再上传其他版本'), {pendingUpload:true});
                }
                const md5 = subtitleMd5(bytes), nodes = await list(row); check(); validateVideo(row, nodes);
                beforeWrite?.(nodes);
                const existing = nodes.filter(node => node.name === name);
                if (existing.length) {
                    if (existing.length !== 1 || !await sameContent(existing[0], bytes, md5, progress, check)) throw new Error('同名字幕已存在且内容不同或无法确认，未覆盖');
                    return existing[0];
                }
                check(); progress('上传到视频目录');
                const receiptId = JSON.stringify([videoKey(row), name]);
                receipts.set(receiptId, {video:videoKey(row), name, size:bytes.length, md5, time:Date.now(),language});
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
                        if (!taskId) throw new Error('上传请求已提交，但未返回任务 ID');
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
                    throw Object.assign(new Error('上传请求可能已提交：' + error.message + '；先重新检查目录，不重复上传'), {pendingUpload:true, stop:!!error.stop});
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
                        if (matches.length === 1 && await sameContent(matches[0], bytes, md5, progress, check)) {
                            check();
                            if (language) history?.link(row,matches[0],language);
                            receipts.delete(receiptId); persistReceipts();
                            return {...matches[0],parentId:row.node.parentId,language};
                        }
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
