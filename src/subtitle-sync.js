    const SYNC_SUBTITLE_BYTES = 4 * 1024 * 1024;
    const SYNC_MAX_MS = 8 * 3600 * 1000;
    const syncSrtTime = String.raw`(\d{2}):([0-5]\d):([0-5]\d),(\d{3})`;
    function readSyncSrt(bytes) {
        if (!bytes.length || bytes.length > SYNC_SUBTITLE_BYTES) throw new Error('SRT 文件大小须在 4 MiB 以内');
        const {text} = subtitleDecode(bytes);
        const source = text.replace(/^\uFEFF/,'');
        const timestamp = new RegExp('^('+syncSrtTime+')([ \t]+-->[ \t]+)('+syncSrtTime+')([ \t]*(?:X1:\d+[ \t]+X2:\d+[ \t]+Y1:\d+[ \t]+Y2:\d+)?)$');
        const ms = parts => ((Number(parts[0]) * 60 + Number(parts[1])) * 60 + Number(parts[2])) * 1000 + Number(parts[3]);
        const cues = [];
        const blocks = source.split(/\r?\n[ \t]*\r?\n/);
        for (const block of blocks) {
            if (!block.trim()) continue;
            const [index,line,...body] = block.trimStart().split(/\r?\n/);
            const match = timestamp.exec(line || '');
            if (!/^\d+[ \t]*$/.test(index) || !match || !body.some(value => value.trim()))
                throw new Error('SRT 包含无法保真的段落或时间格式');
            const start = ms(match.slice(2,6)), end = ms(match.slice(8,12));
            if (end <= start || end > SYNC_MAX_MS || cues.length >= 12000) throw new Error('SRT 时间范围或条目数量超出校对范围');
            cues.push({start,end,startText:match[1],endText:match[7],line,body:body.join('\n')});
        }
        if (!cues.length) throw new Error('没有可校对的字幕条目');
        return {source,blocks,cues};
    }
    function formatSyncTime(ms) {
        const n = Math.round(ms);
        const pad = (v,digits = 2) => String(v).padStart(digits,'0');
        return pad(Math.floor(n / 3600000)) + ':' + pad(Math.floor(n / 60000) % 60) + ':' + pad(Math.floor(n / 1000) % 60) + ',' + pad(n % 1000,3);
    }
    function subtitleSyncFromAnchors(first, second) {
        for (const pair of second ? [first,second] : [first]) {
            if (!pair.every(n => Number.isFinite(n) && n >= 0 && n <= SYNC_MAX_MS)) throw new Error('请输入有效的原字幕与播放时间');
        }
        if (second && (second[0] - first[0] < 1000 || second[1] <= first[1])) throw new Error('第二个对应点须晚于第一个点，原字幕时间至少相隔 1 秒');
        const scale = second ? (second[1] - first[1]) / (second[0] - first[0]) : 1;
        const offset = first[1] - first[0] * scale;
        if (scale < .8 || scale > 1.25) throw new Error('时间比例差异太大，请核对视频剪辑和对应点');
        return {offset,scale};
    }
    function renderSyncedSrt(parsed, {offset,scale}) {
        if (!Number.isFinite(offset) || !Number.isFinite(scale) || scale < .8 || scale > 1.25) throw new Error('校对参数无效');
        let cursor = 0, trimmed = 0, removed = 0;
        const blocks = parsed.blocks.map(block => {
            if (!block.trim()) return block;
            const cue = parsed.cues[cursor++];
            let start = Math.round(cue.start * scale + offset), end = Math.round(cue.end * scale + offset);
            if (end <= 0) { removed++; return ''; }
            if (end > SYNC_MAX_MS) throw new Error('校对结果超过支持的时间范围');
            if (start < 0) { start = 0; trimmed++; }
            if (end <= start) end = start + 1;
            const line = cue.line.replace(cue.startText,formatSyncTime(start));
            const endIndex = line.indexOf(cue.endText,line.indexOf('-->') + 3);
            const changed = line.slice(0,endIndex) + formatSyncTime(end) + line.slice(endIndex + cue.endText.length);
            return block.replace(cue.line,() => changed);
        });
        if (removed === parsed.cues.length) throw new Error('校对后的字幕全部在视频开始之前');
        const newline = parsed.source.includes('\r\n') ? '\r\n' : '\n';
        const output = new TextEncoder().encode(blocks.filter(Boolean).join(newline + newline) + newline);
        const cues = readSyncSrt(output).cues;
        if (cues.length !== parsed.cues.length - removed) throw new Error('校对副本往返检查失败');
        return {bytes:output,cues,trimmed,removed};
    }
    async function suggestSubtitleSync(target,reference,check = () => {},pause = () => sleep(0)) {
        const sorted = rows => rows.slice().sort((a,b) => a.start - b.start);
        const from = sorted(target), to = sorted(reference);
        if (Math.min(from.length,to.length) < 18 || from.at(-1).start - from[0].start < 45000)
            return {reason:'字幕片段太短，无法可靠推断整体偏移和比例'};
        const sample = (items,limit) => items.length <= limit ? items
            : Array.from({length:limit},(_,i) => items[Math.round(i * (items.length - 1) / (limit - 1))]);
        const lower = (items,time) => {
            let lo = 0, hi = items.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (items[mid].start < time) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        };
        const median = values => {
            const ordered = values.slice().sort((a,b) => a - b);
            const middle = Math.floor(ordered.length / 2);
            return (ordered[middle] + ordered[Math.floor((ordered.length - 1) / 2)]) / 2;
        };
        const density = sample(from,240);
        const score = ({scale,offset},items = density) => {
            const matches = [], used = new Set();
            for (const original of items) {
                const time = original.start * scale + offset;
                const index = lower(to,time);
                const left = to[index - 1], right = to[index];
                const nearest = left && (!right || time - left.start <= right.start - time) ? left : right;
                if (!nearest || used.has(nearest)) continue;
                const startError = nearest.start - time;
                const endError = nearest.end - (original.end * scale + offset);
                if (Math.abs(startError) > 460 || Math.abs(endError) > 1050) continue;
                used.add(nearest);
                matches.push({x:original.start,y:nearest.start,error:startError});
            }
            const residual = matches.length ? median(matches.map(hit => Math.abs(hit.error))) : 460;
            return {matches,residual,quality:(matches.length / items.length) * (1 - residual / 1200)};
        };
        const span = from.at(-1).start - from[0].start;
        const guesses = new Map();
        const add = (scale,offset) => {
            if (!Number.isFinite(scale) || scale < .9375 || scale > 1.067 || Math.abs(offset) > 120000) return;
            const key = Math.round(scale * 100000) + '/' + Math.round(offset / 100);
            if (!guesses.has(key)) guesses.set(key,{scale,offset});
        };
        const byText = new Map();
        const normalize = cue => cue.body?.replace(/<[^>]*>/g,'').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
        for (const cue of to) {
            const text = normalize(cue);
            if (text?.length >= 7) byText.set(text,byText.has(text) ? null : cue);
        }
        const exact = density.map(cue => [cue,byText.get(normalize(cue))]).filter(([,other]) => other);
        if (exact.length >= 6) {
            const first = sample(exact.slice(0,Math.floor(exact.length / 3)),5);
            const last = sample(exact.slice(-Math.floor(exact.length / 3)),5);
            for (const [a,ra] of first) for (const [b,rb] of last) if (b.start > a.start + 30000) {
                const scale = (rb.start - ra.start) / (b.start - a.start);
                add(scale,ra.start - a.start * scale);
            }
            add(1,median(exact.map(([a,b]) => b.start-a.start)));
        }
        const anchors = sample(from,44);
        const grid = new Set([1,24/25,25/24,24000/1001/25,25/(24000/1001),1000/1001,1001/1000]);
        const step = Math.max(.00025,Math.min(.002,1600 / span));
        for (let ratio = .94; ratio <= 1.065; ratio += step) grid.add(ratio);
        for (const [index,scale] of [...grid].entries()) {
            if (index % 8 === 0) { check(); await pause(); }
            const votes = new Map();
            for (const cue of anchors) {
                const predicted = cue.start * scale;
                const duration = (cue.end - cue.start) * scale;
                for (let i = lower(to,predicted - 120000); i < to.length && to[i].start <= predicted + 120000; i++) {
                    const other = to[i];
                    if (Math.abs(other.end-other.start-duration) > 800) continue;
                    const difference = other.start - predicted;
                    const bin = Math.round(difference / 400);
                    const vote = votes.get(bin) || {count:0,sum:0};
                    vote.count++; vote.sum += difference; votes.set(bin,vote);
                }
            }
            for (const hit of [...votes.values()].sort((a,b) => b.count-a.count).slice(0,2))
                if (hit.count >= 4) add(scale,hit.sum / hit.count);
        }
        const ranked = [];
        for (const [i,guess] of [...guesses.values()].entries()) {
            if (i % 24 === 0) { check(); await pause(); }
            const initial = score(guess);
            if (initial.matches.length < 8) continue;
            const hits = initial.matches;
            const first = median(hits.slice(0,Math.ceil(hits.length / 3)).map(hit => hit.x));
            const last = median(hits.slice(-Math.ceil(hits.length / 3)).map(hit => hit.x));
            const early = hits.filter(hit => hit.x <= first), late = hits.filter(hit => hit.x >= last);
            const slope = last - first > 20000 ? (median(late.map(hit => hit.error)) - median(early.map(hit => hit.error))) / (last - first) : 0;
            const scale = guess.scale + slope;
            const offset = median(hits.map(hit => hit.y - hit.x * scale));
            const fit = scale >= .9375 && scale <= 1.067 ? {scale,offset} : guess;
            ranked.push({...fit,quality:score(fit).quality});
        }
        check();
        ranked.sort((a,b) => b.quality - a.quality);
        const best = ranked[0];
        if (!best || best.quality < .55) return {reason:'参考字幕与待校对字幕缺少足够的时间对应'};
        const steps = [0,1,2].map(index => {
            const items = density.filter((_,i) => Math.min(2,Math.floor(i * 3 / density.length)) === index);
            const segment = score(best,items);
            return {share:segment.matches.length / items.length,
                residual:segment.residual,bias:segment.matches.length ? median(segment.matches.map(hit => hit.error)) : Infinity};
        });
        if (steps.some(item => item.share < .52 || item.residual > 300) || Math.max(...steps.map(item => item.bias)) - Math.min(...steps.map(item => item.bias)) > 420)
            return {reason:'头、中、尾无法用同一组参数对齐，请换同剪辑版本的字幕'};
        const alternative = ranked.find(item => Math.max(...[from[0].start,from.at(-1).start].map(x =>
            Math.abs((item.scale-best.scale)*x + item.offset-best.offset))) > 1000);
        if (alternative && best.quality - alternative.quality < .08)
            return {reason:'有多个相近的对齐结果，请用播放时间点手动校对'};
        return {offset:best.offset,scale:best.scale,steps};
    }


    function initSubtitleSync(provider,flow) {
        const ui = makePanel(provider + ' 字幕校对', `
            <div class="panel-actions">
                <button id="syncSelect">读取网盘选区</button>
                <button id="syncSuggest" disabled>自动建议</button>
                <button id="syncStop" hidden>停止</button>
            </div>
            <section id="subtitleSyncContent" tabindex="0" aria-label="字幕校对">
                <div class="sync-item subtitle-sync-fields">
                    <label>电影或单集<select id="syncVideo" disabled></select></label>
                    <label>待校对的网盘字幕<select id="syncInput"></select></label>
                    <label>或选本地字幕<input id="syncLocalInput" type="file" accept=".srt,.ass,.ssa,.vtt"></label>
                    <label>参考字幕<select id="syncReference"></select></label>
                    <label>或选本地参考 SRT<input id="syncLocalRef" type="file" accept=".srt"></label>
                    <label class="subtitle-sync-check"><input id="syncTrust" type="checkbox">参考字幕与这一版视频已对齐</label>
                </div>
                <details open class="sync-item">
                    <summary>按播放时间手动校对</summary>
                    <p>填写一处对应时间可平移字幕，填写两处可同时校正速度。时间单位为秒。</p>
                    <div class="subtitle-sync-fields">
                        <label>原字幕时间<input id="syncFromA" type="number" min="0" step="0.001"></label>
                        <label>对应播放时间<input id="syncToA" type="number" min="0" step="0.001"></label>
                        <label>第二处原字幕时间<input id="syncFromB" type="number" min="0" step="0.001"></label>
                        <label>第二处播放时间<input id="syncToB" type="number" min="0" step="0.001"></label>
                    </div>
                    <button id="syncManual" disabled>预览手动校对</button>
                </details>
                <details class="sync-item">
                    <summary>使用本地视频或保留 ASS / SSA / VTT</summary>
                    <p>用 <a href="https://ffsubsync.readthedocs.io/en/latest/usage.html" target="_blank" rel="noopener noreferrer">ffsubsync</a> 处理已在电脑上的同版本视频。多音轨时可用 <code>--reference-stream a:1</code> 选择第二条音轨。</p>
                    <pre>ffsubsync video.mkv -i input.srt -o output.srt</pre>
                    <p>ASS、SSA 和 VTT 请在本地保持原格式并抽查样式和内部时间标签。下方仅接收与原 SRT 正文一致的校对副本。</p>
                    <button id="syncOriginal" disabled>下载待校对字幕</button>
                    <label>导回校对后的 SRT<input id="syncReturn" type="file" accept=".srt"></label>
                    <button id="syncImport" disabled>预览导回副本</button>
                </details>
                <section id="syncCorrectionPreview" class="sync-item" hidden>
                    <h5>校对预览</h5>
                    <p id="syncDetails"></p>
                    <ol id="syncPoints"></ol>
                    <label class="subtitle-sync-check"><input id="syncReviewed" type="checkbox">已对照播放核查头、中、尾</label>
                    <div class="panel-actions">
                        <button id="syncDownload" disabled>下载校对副本</button>
                        <button id="syncSave" disabled>保存校对副本到网盘</button>
                    </div>
                </section>
                <button id="syncReconcile" disabled>核对待确认的网盘副本</button>
            </section>
            <p id="subtitleSyncStatus" role="status">读取当前网盘选区，然后选择一部电影或一集。</p>
        `,'subtitleSync');
        const get = ui.get;
        let context = null, videos = [], target = null, links = [], draft = null, generation = 0;
        let busy = false, cancelled = false;
        const status = message => { get('subtitleSyncStatus').textContent = message; };
        const log = (event, message) => flow.log('字幕校对 · ' + event,message);
        const check = () => { if (cancelled) throw Object.assign(new Error('已停止'),{stop:true}); };
        const sameNode = (current,saved) => current && saved && !current.directory && String(current.id) === String(saved.id)
            && current.name === saved.name && current.size === saved.size
            && (!saved.md5 || current.md5?.toLowerCase() === saved.md5.toLowerCase());
        const inputFields = ['syncVideo','syncInput','syncReference','syncLocalInput','syncLocalRef','syncTrust',
            'syncFromA','syncToA','syncFromB','syncToB','syncReturn','syncReviewed'];
        const local = id => get(id).files?.[0];
        const selected = id => links.find(item => String(item.id) === get(id).value);
        const inputChosen = () => !!(local('syncLocalInput') || selected('syncInput'));
        const updateControls = () => {
            for (const id of inputFields) get(id).disabled = busy;
            get('syncSelect').disabled = busy;
            get('syncVideo').disabled = busy || !videos.length;
            get('syncOriginal').disabled = busy || !target || !inputChosen();
            get('syncSuggest').disabled = busy || !target || !inputChosen() || !get('syncTrust').checked
                || !(local('syncLocalRef') || selected('syncReference'));
            get('syncManual').disabled = busy || !target || !inputChosen();
            get('syncImport').disabled = busy || !target || !inputChosen() || !local('syncReturn');
            get('syncDownload').disabled = busy || !draft || !get('syncReviewed').checked;
            get('syncSave').disabled = get('syncDownload').disabled || !!draft?.saved || !!draft?.pending;
            get('syncReconcile').disabled = busy || !target;
            get('syncStop').hidden = !busy;
            get('syncStop').disabled = !busy || cancelled;
        };
        const run = createPanelTask(ui,value => {
            busy = value;
            if (busy) cancelled = false;
            updateControls();
        });
        const runOperation = (event,work) => run(async () => {
            const started = Date.now();
            try {
                await work();
                log(event,'完成 · ' + ((Date.now() - started) / 1000).toFixed(2) + ' 秒');
            } catch (error) {
                const message = subtitleDiagnosticText(error.message,{key:context?.session.token});
                status(message);
                log(event,message + ' · ' + ((Date.now() - started) / 1000).toFixed(2) + ' 秒');
            }
        },true);
        const invalidate = () => {
            generation++;
            draft = null;
            get('syncReviewed').checked = false;
            get('syncCorrectionPreview').hidden = true;
            updateControls();
        };
        const options = (id,items,prompt) => {
            const select = get(id);
            select.replaceChildren(new Option(prompt,''));
            for (const item of items) select.append(new Option(item.path || item.name,String(item.id)));
            select.value = '';
        };
        const scope = candidate => JSON.stringify([candidate.session.parent,candidate.path,
            candidate.selected.map(item => [String(item.id ?? ''),[...(item.names || [item.name || ''])].sort()]).sort()]);
        const requireCurrent = async () => {
            const fresh = await mediaContext(provider,context);
            check();
            if (!context || fresh.session.token !== context.session.token || scope(fresh) !== scope(context))
                throw new Error('网盘账号或选区已变化，请重新读取选区');
            return fresh;
        };
        const freshTarget = async () => {
            const current = await requireCurrent(), node = target;
            if (!node) throw new Error('请选择一部电影或一集');
            const directory = await current.source.children({id:node.parentId});
            check();
            if (!sameNode(directory.find(item => String(node.id) === String(item.id)),node))
                throw new Error('视频已移动、改名或发生变化，请重新读取选区');
            const linked = mediaSubtitleLinks(directory,node.parentId,mediaFileHistory(current.session)).linked.get(String(node.id)) || [];
            return {current,node,linked};
        };
        get('syncSelect').onclick = () => runOperation('读取选区',async () => {
            invalidate();
            target = null; links = []; videos = []; context = null;
            options('syncVideo',[],'请选择一部电影或一集');
            options('syncInput',[],'请选择待校对字幕');
            options('syncReference',[],'可选已对齐的网盘 SRT');
            const current = await mediaContext(provider);
            check();
            const known = flow.syncVideos(current);
            if (known?.length) videos = known;
            else {
                if (!current.selected.length) throw new Error('请在网盘勾选一部电影或指定一集');
                const directory = await current.source.children({id:current.session.parent});
                check();
                videos = matchSelected(directory,current.selected).filter(node => !node.directory && MEDIA_VIDEO.test(node.name))
                    .map(node => ({...node,parentId:current.session.parent,path:node.name}));
            }
            if (!videos.length) throw new Error('请直接勾选视频，或先在影视整理中识别文件夹再回来');
            context = current;
            options('syncVideo',videos,'请选择一部电影或一集');
            if (videos.length === 1) {
                get('syncVideo').value = String(videos[0].id);
                await chooseVideo();
            } else status('选区内找到 ' + videos.length + ' 个视频，请选择一部电影或一集。');
        });
        const chooseVideo = async () => {
            invalidate();
            links = [];
            options('syncInput',[],'请选择待校对字幕');
            options('syncReference',[],'可选已对齐的网盘 SRT');
            get('syncLocalInput').value = '';
            get('syncLocalRef').value = '';
            get('syncReturn').value = '';
            get('syncTrust').checked = false;
            for (const id of ['syncFromA','syncToA','syncFromB','syncToB']) get(id).value = '';
            target = videos.find(node => String(node.id) === get('syncVideo').value);
            if (!target) return;
            const {linked} = await freshTarget();
            links = linked.filter(item => /\.(srt|ass|ssa|vtt)$/i.test(item.name));
            options('syncInput',links,'请选择待校对字幕');
            options('syncReference',links.filter(item => /\.srt$/i.test(item.name)),'可选已对齐的网盘 SRT');
            status(target.name + ' · 找到 ' + links.length + ' 份关联字幕');
            log('锁定目标',target.path || target.name);
        };
        get('syncVideo').onchange = () => runOperation('选择视频',chooseVideo);
        const read = async (state,which,isReference = false) => {
            const file = local(which);
            const item = file || selected(isReference ? 'syncReference' : 'syncInput');
            if (!item) throw new Error(isReference ? '请选择参考字幕' : '请选择待校对字幕');
            if (!Number.isSafeInteger(item.size) || item.size < 1 || item.size > SYNC_SUBTITLE_BYTES)
                throw new Error('字幕大小须已知且在 4 MiB 以内');
            let bytes;
            if (file) bytes = new Uint8Array(await file.arrayBuffer());
            else {
                const live = state.linked.find(item => sameNode(item,selected(isReference ? 'syncReference' : 'syncInput')));
                if (!live) throw new Error('网盘字幕已变化，请重新读取选区');
                bytes = await subtitleDrive(state.current).read(live,message => log('字幕读取',message),check,SYNC_SUBTITLE_BYTES);
            }
            check();
            if (bytes.length !== item.size) throw new Error('字幕读取长度与已选文件不一致');
            log('字幕读取',(file ? '本地' : '网盘') + ' · ' + (isReference ? '参考' : '待校对') + ' · ' + bytes.length + ' 字节');
            return {name:item.name,bytes,node:file ? null : item,language:item.language || subtitleFileInfo(item.name).language};
        };
        const srt = input => {
            if (!/\.srt$/i.test(input.name)) throw new Error('浏览器校对支持 SRT。此格式可下载后用本地工具保留格式处理。');
            return readSyncSrt(input.bytes);
        };
        const outputName = input => {
            const name = mediaStem(input.name).replace(/(?:\.synced)+$/i,'') + '.synced.srt';
            return subtitleUploadName(name,'srt');
        };
        const preview = (state,input,original,output,details,params,reference = null) => {
            const name = outputName(input);
            const points = get('syncPoints');
            points.replaceChildren();
            const cues = original.cues.slice().sort((a,b) => a.start-b.start), changed = output.cues.slice().sort((a,b) => a.start-b.start);
            for (const [label,fraction] of [['开头',.08],['中段',.5],['结尾',.92]]) {
                const cue = cues[Math.floor((cues.length - 1) * fraction)];
                const time = params ? Math.round(cue.start * params.scale + params.offset) : changed[Math.floor((changed.length - 1) * fraction)].start;
                const li = document.createElement('li');
                li.textContent = label + ' · 原 ' + formatSyncTime(cue.start) + ' → ' + (time < 0 ? '移到视频开始前' : formatSyncTime(time))
                    + ' · ' + cue.body.replace(/<[^>]*>/g,'').split('\n').join(' ').slice(0,80);
                points.append(li);
            }
            draft = {node:state.node,input,reference,name,bytes:output.bytes,generation,saved:false,pending:false};
            get('syncDetails').textContent = details + ' · 副本 ' + name
                + (output.trimmed || output.removed ? ' · 起点裁到 0 秒 ' + output.trimmed + ' 条，视频开始前移除 ' + output.removed + ' 条' : '');
            get('syncReviewed').checked = false;
            get('syncCorrectionPreview').hidden = false;
            log('预览',state.node.name + ' · ' + details);
            status('预览已生成。对照播放核查对应点后可下载或保存副本。');
        };
        const parameters = fit => '偏移 ' + (fit.offset / 1000).toFixed(3) + ' 秒 · 时间比例 ' + fit.scale.toFixed(6);
        get('syncSuggest').onclick = () => runOperation('自动建议',async () => {
            invalidate();
            if (!get('syncTrust').checked) throw new Error('请确认参考属于同一版视频并已对齐');
            const state = await freshTarget(), input = await read(state,'syncLocalInput'), reference = await read(state,'syncLocalRef',true);
            if (input.node && String(input.node.id) === String(reference.node?.id))
                throw new Error('待校对字幕和参考字幕是同一个网盘文件，请另选参考');
            status('正在比较字幕头、中、尾的时间分布…');
            const original = srt(input), fit = await suggestSubtitleSync(original.cues,srt(reference).cues,check);
            if (fit.reason) throw new Error('待复核 · ' + fit.reason);
            const details = (reference.node ? '网盘参考字幕 ' : '本地参考字幕 ') + reference.name + ' · ' + parameters(fit)
                + ' · 三段中位偏差 ' + fit.steps.map(step => Math.round(step.residual) + ' ms').join(' / ');
            preview(state,input,original,renderSyncedSrt(original,fit),details,fit,reference);
        });
        get('syncManual').onclick = () => runOperation('手动校对',async () => {
            invalidate();
            const value = id => get(id).value.trim() === '' ? NaN : Number(get(id).value) * 1000;
            const a = [value('syncFromA'),value('syncToA')], b = [value('syncFromB'),value('syncToB')];
            const fit = subtitleSyncFromAnchors(a,b.some(Number.isFinite) ? b : null);
            const state = await freshTarget(), input = await read(state,'syncLocalInput'), original = srt(input);
            preview(state,input,original,renderSyncedSrt(original,fit),'手动对应点 · ' + parameters(fit),fit);
        });
        const saveLocal = ({bytes,name}) => {
            const url = URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
            const element = document.createElement('a');
            element.href = url;
            element.download = name;
            element.click();
            setTimeout(() => URL.revokeObjectURL(url),30000);
        };
        get('syncOriginal').onclick = () => runOperation('下载字幕',async () => {
            saveLocal(await read(await freshTarget(),'syncLocalInput'));
            status('已准备下载字幕。可用本地工具处理后导回 SRT。');
        });
        get('syncImport').onclick = () => runOperation('导回本地副本',async () => {
            invalidate();
            const file = local('syncReturn');
            if (!file || !/\.srt$/i.test(file.name) || file.size > SYNC_SUBTITLE_BYTES) throw new Error('请选择 4 MiB 以内的 SRT 副本');
            const state = await freshTarget(), input = await read(state,'syncLocalInput'), original = srt(input);
            const bytes = new Uint8Array(await file.arrayBuffer());
            check();
            const output = readSyncSrt(bytes);
            const bodies = parsed => parsed.cues.map(cue => cue.body.trim()).join('\n\n').trim();
            if (bodies(output) !== bodies(original)) throw new Error('导回文件与原字幕的正文或排版不一致，请核对文件');
            const first = original.cues[0], last = original.cues.at(-1);
            const near = output.cues[0], far = output.cues.at(-1);
            const scale = last.start > first.start ? (far.start - near.start) / (last.start - first.start) : 1;
            log('字幕读取','本地导回 · ' + bytes.length + ' 字节');
            preview(state,input,original,{...output,bytes},'本地工具副本 · 头尾估算 ' + parameters({scale,offset:near.start-first.start*scale}),null);
        });
        get('syncDownload').onclick = () => {
            if (busy || !draft || !get('syncReviewed').checked) return;
            saveLocal(draft);
            log('下载副本',draft.name);
            status('校对副本已准备下载。');
        };
        get('syncSave').onclick = () => runOperation('网盘保存',async () => {
            const approved = draft;
            if (!approved || approved.saved || approved.pending || approved.generation !== generation || !get('syncReviewed').checked)
                throw new Error('请重新预览并核查副本');
            const state = await freshTarget();
            const row = {node:state.node}, mediaHistory = mediaFileHistory(state.current.session);
            if (!mediaHistory) throw new Error('当前登录状态无法登记文件关联，可下载校对副本');
            const beforeWrite = nodes => {
                const linked = mediaSubtitleLinks(nodes,row.node.parentId,mediaHistory).linked.get(String(row.node.id)) || [];
                for (const original of [approved.input.node,approved.reference?.node].filter(Boolean))
                    if (!linked.some(node => sameNode(node,original))) throw new Error('原字幕或参考已变化，请重新预览');
                if (nodes.some(node => node.name.normalize('NFKC').toLowerCase() === approved.name.normalize('NFKC').toLowerCase()))
                    throw new Error('同名校对副本已存在，可以下载到本地');
            };
            try {
                const node = await subtitleDrive(state.current).save(row,approved.name,approved.bytes,status,check,
                    {beforeWrite,language:approved.input.language || 'und',variant:'sync'});
                approved.saved = true;
                flow.syncChanged(row.node.id,[node]);
                status('校对副本已保存并核验 · ' + node.name);
                log('已核验',row.node.name + ' · ' + node.name);
            } catch (error) {
                if (error.pendingUpload) { approved.pending = true; flow.syncChanged(row.node.id,[],true); }
                throw error;
            }
        });
        get('syncReconcile').onclick = () => runOperation('上传对账',async () => {
            const state = await freshTarget(), row = {node:state.node};
            const recovered = await subtitleDrive(state.current).reconcile(row,status,check);
            if (!recovered.length) { status('该视频没有待核对的上传记录。'); return; }
            if (draft && recovered.some(node => node.name === draft.name)) { draft.saved = true; draft.pending = false; }
            flow.syncChanged(row.node.id,recovered);
            status('已核验 ' + recovered.length + ' 份网盘字幕。');
            log('已对账',row.node.name + ' · ' + recovered.length + ' 份');
        });
        for (const id of inputFields.filter(id => id !== 'syncVideo' && id !== 'syncReviewed')) get(id).onchange = () => {
            if (id === 'syncInput') get('syncLocalInput').value = '';
            if (id === 'syncReference') get('syncLocalRef').value = '';
            if (id === 'syncReference' || id === 'syncLocalRef') get('syncTrust').checked = false;
            invalidate();
        };
        get('syncReviewed').onchange = updateControls;
        get('syncStop').onclick = () => { cancelled = true; updateControls(); status('正在停止，等待已开始的读取或写入结束…'); };
        ui.onActivate(async () => {
            if (!context || busy) return;
            const previous = context, ticket = generation;
            try { await requireCurrent(); }
            catch (error) {
                if (busy || context !== previous || generation !== ticket) return;
                target = null; videos = []; links = [];
                options('syncVideo',[],'请重新读取选区');
                options('syncInput',[],'请选择待校对字幕');
                options('syncReference',[],'可选已对齐的网盘 SRT');
                invalidate();
                status(error.message);
            }
        });
        updateControls();
    }
