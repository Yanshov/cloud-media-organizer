    function initMediaOrganizer(provider = '123') {
        const ui = makePanel(provider + ' 重命名与自动分类', `
            <p>勾选内容 → 识别并预览 → 确认执行。使用 TMDB 查询影视资料。</p>
            <section id="mediaSettings"><label><span class="credential-head"><span>TMDB 密钥</span><a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">获取 API ↗</a></span><input id="tmdbKey" type="password" autocomplete="off" placeholder="API Key 或 API Read Access Token"></label>
            <div class="panel-actions"><button id="saveMediaKey">保存密钥</button><button id="forgetMediaKey">清除密钥</button></div></section>
            <section id="mediaAISettings">
            <label><input id="enableMediaAI" type="checkbox">启用大模型识别</label>
            <p>仅发送文件名、目录名或字幕候选，不上传视频。调用可能计费。</p>
            <label>服务商<select id="mediaAIProvider"><option value="custom">自定义兼容接口</option><option value="deepseek">DeepSeek</option><option value="qwen">通义千问</option><option value="siliconflow">硅基流动</option><option value="openai">OpenAI</option></select></label>
            <label>模型<select id="mediaAIModelSelect"></select></label>
            <label>API 地址<input id="mediaAIBase" type="url" placeholder="https://服务商地址/v1"></label>
            <label><span class="credential-head"><span>API Key</span><a id="mediaAIKeyLink" href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" hidden>获取 API ↗</a></span><input id="mediaAIKey" type="password" autocomplete="off" placeholder="粘贴 API Key；可带或不带 Bearer 前缀"></label>
            <div class="panel-actions"><button id="fetchMediaAIModels">获取模型列表</button><button id="saveMediaAI">保存设置</button><button id="testMediaAI">测试连接</button><button id="forgetMediaAI">清除密钥</button></div>
            <label id="mediaAIManualModel" hidden>手动填写模型 ID<input id="mediaAIModel" placeholder="接口不提供列表时手动填写"></label>
            <p id="mediaAIState" role="status"></p></section>
            <p id="mediaTarget"></p><p id="mediaRecordState" role="status"></p>
            <div class="panel-actions"><button id="scanMedia">识别并预览</button><button id="runMedia" disabled>确认执行</button><button id="openMediaCleanup" type="button" aria-controls="mediaCleanup" aria-expanded="false">清理文件</button><button id="stopMedia" hidden disabled>停止</button></div>
            <p id="mediaProgress" role="status">先在网页勾选视频或文件夹。</p><progress id="mediaBar" aria-label="影视整理进度" max="1" value="0" hidden></progress><div id="mediaSummary"></div>
            <div id="mediaPreview" style="max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px"></div>
            <div id="mediaRows"></div>
            <section id="mediaCleanup" class="sync-preview" hidden>
            <label>清理规则<select id="cleanupMode"><option value="extras">非正片与附件</option><option value="nonstandard">所有不规范项目</option></select></label>
            <label id="cleanupSubtitleOption"><input id="cleanupSubtitles" type="checkbox">同时清理字幕及字体（默认保留）</label>
            <p id="cleanupRule">清理图片、附件及已标记的花絮/预告；默认保留字幕、字体和普通视频。</p>
            <div class="panel-actions"><button id="checkCleanup">检查清理范围</button><button id="runEmpty" disabled>确认清理</button></div>
            <div id="emptyPreview" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto"></div></section>
            <details id="mediaDiagnostics"><summary>详细日志</summary><div class="panel-actions"><button id="copyMediaLog" type="button">复制日志</button><button id="clearMediaLog" type="button">清空日志</button></div><textarea id="mediaLog" readonly spellcheck="false" aria-label="影视整理运行日志"></textarea></details>`, true);
        ui.moveSettings(['mediaSettings'], 'TMDB 设置', '#settingsBasics');
        ui.moveSettings(['mediaAISettings'], '大模型识别', '#settingsModels');
        ui.get('tmdbKey').value = GM_getValue('cross-drive-tmdb-key', '');
        const storedAI = GM_getValue('cross-drive-media-ai', {});
        const aiSaved = migrateMediaAISettings(storedAI);
        if (aiSaved !== storedAI) GM_setValue('cross-drive-media-ai', aiSaved);
        const aiPresets = {
            deepseek: {base:'https://api.deepseek.com', model:'deepseek-flash', link:'https://platform.deepseek.com/api_keys'},
            qwen: {base:'https://dashscope.aliyuncs.com/compatible-mode/v1', model:'qwen-plus', link:'https://bailian.console.aliyun.com/'},
            siliconflow: {base:'https://api.siliconflow.cn/v1', model:'', link:'https://cloud.siliconflow.cn/account/ak'},
            openai: {base:'https://api.openai.com/v1', model:'', link:'https://platform.openai.com/api-keys'}
        };
        ui.get('enableMediaAI').checked = aiSaved.enabled === true;
        ui.get('mediaAIProvider').value = aiSaved.provider || 'custom';
        ui.get('mediaAIBase').value = aiSaved.base || ''; ui.get('mediaAIKey').value = aiSaved.key || ''; ui.get('mediaAIModel').value = aiSaved.model || '';
        const aiSettings = () => ({enabled:ui.get('enableMediaAI').checked, provider:ui.get('mediaAIProvider').value, base:ui.get('mediaAIBase').value.trim(), key:normalizeMediaAIKey(ui.get('mediaAIKey').value), model:ui.get('mediaAIModel').value.trim()});
        const updateAILink = () => { const preset = aiPresets[ui.get('mediaAIProvider').value]; const link = ui.get('mediaAIKeyLink'); link.hidden = !preset; if (preset) link.href = preset.link; };
        const showAIModels = (models = []) => {
            const current = ui.get('mediaAIModel').value.trim(), select = ui.get('mediaAIModelSelect');
            select.replaceChildren();
            const option = (value, label) => { const item = document.createElement('option'); item.value = value; item.textContent = label; select.appendChild(item); };
            option('', '请选择模型');
            for (const model of models) option(model, model);
            if (current && !models.includes(current)) option(current, current + '（未验证）');
            option('__manual__', '手动填写模型 ID');
            select.value = current;
            ui.get('mediaAIManualModel').hidden = true;
        };
        updateAILink(); showAIModels();
        ui.get('mediaAIState').textContent = aiSaved.enabled ? '大模型识别已启用。' : '未启用，不会发送大模型请求。';
        let rows = [], batch = null, batchWriter = null, session = null, source = null, client = null, targetSession = null, targetPath = '', emptyPlan = [], emptySession = null, emptySource = null;
        let cancelled = false, reused = 0, history = null, previewRevision = '';
        const checkStopped = () => { if (cancelled) throw new Error('已停止；已完成的操作保留，未处理项目不再执行'); };
        ui.get('stopMedia').onclick = () => { cancelled = true; ui.get('stopMedia').disabled = true; progress('正在停止，等待当前文件操作或请求结束…'); };
        ui.get('mediaRecordState').textContent = `已保存 ${mediaRecords.count()} 个本盘视频的识别记录；未变化的内容可复用。`;
        const progress = message => { ui.get('mediaProgress').textContent = message; };
        const meter = (stage, done = 0, total = null) => {
            const bar = ui.get('mediaBar');
            const label = total === null ? stage + '…' : `${stage} · ${done}/${total}`;
            if (bar.getAttribute('aria-label') !== stage || ui.get('mediaProgress').textContent === bar.getAttribute('aria-valuetext'))
                progress(label);
            bar.hidden = false;
            bar.setAttribute('aria-label', stage);
            bar.setAttribute('aria-valuetext', label);
            bar.max = Math.max(1, total ?? 1);
            if (total === null) bar.removeAttribute('value');
            else bar.value = done;
        };
        const stopMeter = () => {
            const bar = ui.get('mediaBar');
            if (!bar.hasAttribute('value')) bar.value = 0;
            bar.setAttribute('aria-valuetext', '本阶段未完成');
        };
        const logLines = [], logBox = ui.get('mediaLog');
        const clearLog = () => { logLines.length = 0; logBox.value = ''; };
        const log = message => {
            logLines.push(message);
            if (logLines.length > 200) logLines.shift();
            logBox.value = logLines.join('\n');
            logBox.scrollTop = logBox.scrollHeight;
        };
        ui.get('clearMediaLog').onclick = clearLog;
        ui.get('copyMediaLog').onclick = async () => {
            try { await navigator.clipboard.writeText(logBox.value || '（暂无影视整理运行日志）'); progress('影视整理运行日志已复制。'); }
            catch (error) { progress('复制日志失败：' + error.message); }
        };
        const invalidate = () => { batch = null; batchWriter = null; ui.get('runMedia').disabled = true; ui.get('mediaPreview').textContent = ''; };
        const runTask = createPanelTask(ui, (busy, stoppable = false) => {
            if (busy) cancelled = false;
            ui.get('stopMedia').hidden = !busy || !stoppable;
            ui.get('stopMedia').disabled = !busy || !stoppable;
            for (const id of ['scanMedia', 'openMediaCleanup', 'saveMediaKey', 'forgetMediaKey', 'tmdbKey', 'checkCleanup', 'cleanupMode', 'cleanupSubtitles', 'enableMediaAI', 'mediaAIProvider', 'mediaAIBase', 'mediaAIKey', 'mediaAIModel', 'mediaAIModelSelect', 'fetchMediaAIModels', 'saveMediaAI', 'testMediaAI', 'forgetMediaAI']) ui.get(id).disabled = busy;
            for (const control of ui.get('mediaRows').querySelectorAll('input,select,button')) control.disabled = busy;
            ui.get('runMedia').disabled = busy || !batch;
            ui.get('runEmpty').disabled = busy || !emptyPlan.length;
        });
        const previewCleanup = (extras = false) => runTask(async () => {
            emptyPlan = []; ui.get('emptyPreview').textContent = ''; meter(extras ? '检查非正片与附件' : '检查不规范项目');
            try {
                const context = await mediaContext(provider); emptySession = context.session; emptySource = context.source; checkStopped();
                const canonical = extras ? null : mediaCanonicalResolver(tmdbClient(ui.get('tmdbKey').value));
                emptyPlan = await planMediaCleanup(context.selected, emptySource, message => {
                    checkStopped(); progress(message);
                    if (!extras && (message.includes('无法唯一确认') || message.includes('未返回标准片名'))) log('未确认标准名，暂不删除：' + message);
                }, {extras, includeSubtitles:extras && ui.get('cleanupSubtitles').checked, resolveCanonical:canonical});
                ui.get('emptyPreview').textContent = emptyPlan.map(item => `${item.directory ? '删除整个文件夹及全部内容' : '删除文件'}：${item.path}${item.reason ? '\n原因：' + item.reason : ''}${item.expectedName ? '\n应为标准名称：' + item.expectedName : ''}`).join('\n\n') || (extras ? '未发现非正片文件。' : '没有已确认不符合标准的项目；无法匹配的作品见日志。');
                meter('检查结束', emptyPlan.length, emptyPlan.length); progress(`可清理 ${emptyPlan.length} 个${extras ? '非正片文件' : '不规范项目（文件夹包含全部内容）'}；尚未删除`);
            } catch (error) { stopMeter(); progress('检查失败：' + error.message); }
        }, true);
        const changeCleanupRule = () => {
            emptyPlan = []; ui.get('runEmpty').disabled = true; ui.get('emptyPreview').textContent = '';
            ui.get('cleanupRule').textContent = ui.get('cleanupMode').value === 'extras'
                ? (ui.get('cleanupSubtitles').checked ? '清理选中范围内的字幕、字体、图片、其他附件、花絮和预告；保留普通视频及特别篇。' : '清理图片、其他附件、花絮和预告；保留字幕、字体、普通视频及特别篇。')
                : '清理所选范围内已确认不符合标准命名的文件与文件夹；整文件夹包含全部内容。先核对清单，再移入回收站。无法确认的作品保留。';
        };
        ui.get('cleanupMode').onchange = () => { ui.get('cleanupSubtitleOption').hidden = ui.get('cleanupMode').value !== 'extras'; changeCleanupRule(); };
        ui.get('cleanupSubtitles').onchange = changeCleanupRule;
        ui.get('openMediaCleanup').onclick = () => {
            const section = ui.get('mediaCleanup');
            section.hidden = !section.hidden;
            ui.get('openMediaCleanup').setAttribute('aria-expanded',String(!section.hidden));
            if (section.hidden) changeCleanupRule();
        };
        ui.get('checkCleanup').onclick = () => previewCleanup(ui.get('cleanupMode').value === 'extras');
        ui.get('runEmpty').onclick = () => runTask(async () => {
            if (!emptyPlan.length) return;

            const plan = emptyPlan; emptyPlan = []; invalidate(); let deleted = 0, retained = 0, failed = 0, pending = 0;
            for (const item of plan) {
                if (cancelled) break;
                try { log(item.path + '：' + await removeMediaNonstandard(item, emptySession, emptySource)); deleted++; }
                catch (error) { if (error.retained) { retained++; log(item.path + '：保留；' + error.message); } else if (error.pending) { pending++; log(item.path + '：删除结果待确认；' + error.message); } else { failed++; log(item.path + '：删除失败；' + error.message); } if (error.stop) { log('登录或权限异常，停止后续清理'); break; } }
                meter('清理所选项目', deleted + retained + failed + pending, plan.length);
            }

            progress(`清理结束：已清理 ${deleted}，保留 ${retained}，删除失败 ${failed}，结果待确认 ${pending}，未处理 ${plan.length - deleted - retained - failed - pending}。具体原因见日志。`);
        }, true);
        ui.get('mediaAIProvider').onchange = () => {
            const preset = aiPresets[ui.get('mediaAIProvider').value];
            if (preset) { ui.get('mediaAIBase').value = preset.base; ui.get('mediaAIModel').value = preset.model; }
            updateAILink(); showAIModels(); invalidate();
            ui.get('mediaAIState').textContent = '服务商已切换；如密钥不同，请手动更新后获取模型列表。';
        };
        ui.get('mediaAIModelSelect').onchange = () => {
            const value = ui.get('mediaAIModelSelect').value;
            ui.get('mediaAIManualModel').hidden = value !== '__manual__';
            if (value !== '__manual__') ui.get('mediaAIModel').value = value;
            invalidate();
        };
        ui.get('mediaAIModel').oninput = invalidate;
        for (const id of ['mediaAIBase', 'mediaAIKey']) ui.get(id).oninput = () => { showAIModels(); invalidate(); };
        ui.get('fetchMediaAIModels').onclick = () => runTask(async () => {
            ui.get('mediaAIState').textContent = '正在获取模型列表…';
            try {
                const models = await createMediaAI(aiSettings()).models();
                showAIModels(models);
                ui.get('mediaAIState').textContent = models.length ? `已获取 ${models.length} 个模型，请下拉选择后保存；模型能否用于识别请测试连接。` : '接口返回空列表，可选择手动填写模型 ID。';
            } catch (error) { ui.get('mediaAIState').textContent = '获取模型失败：' + error.message + '；接口不提供列表时可选择手动填写模型 ID。'; }
        });
        ui.get('saveMediaAI').onclick = () => {
            try { const config = aiSettings(); if (config.enabled) mediaAIEndpoint(config); GM_setValue('cross-drive-media-ai',config); invalidate(); ui.get('mediaAIState').textContent = config.enabled ? '已保存并启用；仅在作品未匹配或字幕候选待选择时使用大模型。' : '设置已保存，大模型未启用。'; }
            catch (error) { ui.get('mediaAIState').textContent = error.message; }
        };
        ui.get('forgetMediaAI').onclick = () => { ui.get('mediaAIKey').value = ''; ui.get('enableMediaAI').checked = false; GM_setValue('cross-drive-media-ai',aiSettings()); invalidate(); ui.get('mediaAIState').textContent = '已清除大模型密钥并停用。'; };
        ui.get('testMediaAI').onclick = () => runTask(async () => {
            ui.get('mediaAIState').textContent = '正在测试，发送一次简短请求…';
            try { const result = await createMediaAI(aiSettings()).ask({test:true}); if (result.ok !== true) throw new Error('接口可响应，但没有返回预期 JSON，请检查模型兼容性'); ui.get('mediaAIState').textContent = '连接成功，模型能返回识别所需 JSON。'; }
            catch (error) { ui.get('mediaAIState').textContent = '连接失败：' + error.message; }
        });
        ui.get('saveMediaKey').onclick = () => { GM_setValue('cross-drive-tmdb-key', ui.get('tmdbKey').value.trim()); progress('TMDB 密钥已保存在脚本设置中'); };
        ui.get('forgetMediaKey').onclick = () => { GM_setValue('cross-drive-tmdb-key', ''); ui.get('tmdbKey').value = ''; progress('已清除密钥'); };
        const refreshPreview = async () => { mediaWorkCounts(rows); if (rows.some(row => row.include && readyRow(row)) && !cancelled) await generatePreview(); };
        const editRows = async work => {
            let started = false;
            try {
                await runTask(async () => {
                    started = true;
                    invalidate();
                    try { await work(); }
                    finally { render(); }
                });
            } finally { if (started) await refreshPreview(); }
        };
        const field = (box, label, value, change, type = 'text') => {
            const wrapper = document.createElement('label'), input = document.createElement('input'); wrapper.textContent = label; input.type = type; input.value = value ?? ''; wrapper.appendChild(input); box.appendChild(wrapper);
            input.oninput = () => { change(input.value); invalidate(); };
            input.onchange = () => label.startsWith('搜索片名') ? undefined : refreshPreview(); return input;
        };
        const key = titleKey;
        const peers = row => rows.filter(r => r.group === row.group);
        const readyRow = row => {
            if (!row.detail || row.error || !row.type || !row.title || !row.year) return false;
            try { mediaPath(row); return true; } catch { return false; }
        };
        const skipRows = async targets => {
            for (const row of targets) row.include = false;
            invalidate(); render(); progress('已跳过 ' + targets.length + ' 个视频，未修改网盘文件；可点击“恢复已跳过”撤销'); await refreshPreview();
        };
        const seasonPicker = (box, row, wholeGroup = false) => {
            const label = document.createElement('label'), select = document.createElement('select');
            label.textContent = wholeGroup ? '选择季（应用到同组缺少季号的文件）' : '选择季';
            select.setAttribute('data-media-season', wholeGroup ? 'group' : 'file');
            const blank = document.createElement('option'); blank.value = ''; blank.textContent = '请选择季'; select.appendChild(blank);
            const seasons = [...(row.detail?.seasons || [])].sort((a, b) => a.season_number - b.season_number);
            if (row.season != null && !seasons.some(s => s.season_number === row.season)) seasons.push({ season_number: row.season });
            for (const season of seasons) {
                const option = document.createElement('option'); option.value = String(season.season_number);
                option.textContent = (season.season_number === 0 ? '特别篇' : '第 ' + season.season_number + ' 季')
                    + (season.air_date ? ' · ' + season.air_date.slice(0, 4) : '')
                    + (season.episode_count != null ? ' · ' + season.episode_count + ' 集' : '');
                select.appendChild(option);
            }
            select.value = wholeGroup ? '' : String(row.season ?? ''); label.appendChild(select); box.appendChild(label);
            select.onchange = () => {
                if (select.value === '') return;
                const season = Number(select.value);
                const targets = wholeGroup ? peers(row).filter(item => item.include && item.type === 'tv' && item.detail?.id === row.detail.id && item.season == null) : [row];
                return editRows(async () => {
                    for (const item of targets) { if (item.episodeInferred) { item.episode = null; item.episodeInferred = false; } item.season = season; await validateEpisode(item); }
                    const ready = targets.filter(readyRow).length;
                    progress('已应用第 ' + season + ' 季：' + ready + ' 个文件就绪，' + (targets.length - ready) + ' 个仍需处理；集号已自动提取或按标题匹配，无法对应的可直接下拉选集');
                });
            };
        };
        const episodePicker = (box, row) => {
            const label = document.createElement('label'), select = document.createElement('select');
            label.textContent = '选择集（集号 · 标题）'; select.setAttribute('data-media-episode', 'file');
            const blank = document.createElement('option'); blank.value = ''; blank.textContent = row.season == null ? '请先选择季' : '未自动对应，请选择这一集'; select.appendChild(blank);
            for (const episode of row.seasonEpisodes || []) {
                const option = document.createElement('option'); option.value = String(episode.episode_number);
                option.textContent = 'E' + String(episode.episode_number).padStart(2, '0') + (episode.name ? ' · ' + episode.name : '') + (episode.air_date ? ' · ' + episode.air_date : '');
                select.appendChild(option);
            }
            if (row.episode != null && !(row.seasonEpisodes || []).some(ep => ep.episode_number === row.episode)) {
                const option = document.createElement('option'); option.value = String(row.episode); option.textContent = '原集号 ' + row.episode + '（本季未找到）'; select.appendChild(option);
            }
            select.value = String(row.episode ?? ''); select.disabled = row.season == null; label.appendChild(select); box.appendChild(label);
            select.onchange = () => {
                if (!select.value) return;
                return editRows(async () => { row.episode = Number(select.value); row.episodeInferred = false; row.endEpisode = null; await validateEpisode(row); progress(readyRow(row) ? '已应用季集，此文件已就绪，预览会自动更新' : row.error); });
            };
        };
        const candidatePicker = (box, row, wholeGroup = false) => {
            const preference = mediaCandidatePreference(row);
            const note = document.createElement('p');
            note.textContent = preference.reason + (row.workVideoCount ? ` · 同作品 ${row.workVideoCount} 个正片视频（本次读取）` : '');
            box.appendChild(note);
            const select = document.createElement('select'); box.appendChild(select);
            const toggle = document.createElement('button'); toggle.type = 'button';
            let showAll = false;
            const update = () => {
                const selected = select.value || row.match || '';
                select.textContent = '';
                const blank = document.createElement('option'); blank.value = '';
                blank.textContent = wholeGroup ? '待确认；选择作品应用到同组' : '请选择候选作品'; select.appendChild(blank);
                const visible = row.candidates.filter(candidate => showAll || !preference.type || candidate.media_type === preference.type || candidate.media_type + ':' + candidate.id === row.match);
                for (const candidate of visible) {
                    const option = document.createElement('option'); option.value = candidate.media_type + ':' + candidate.id;
                    option.textContent = `${candidate.media_type === 'tv' ? '剧集' : '电影'} · ${candidate.title || candidate.name} · ${(candidate.release_date || candidate.first_air_date || '').slice(0,4)} · ${candidate.source || 'TMDB'} ${candidate.id}`;
                    select.appendChild(option);
                }
                select.value = selected;
                toggle.textContent = showAll ? '只看符合判断的候选' : '查看全部候选';
                if (!visible.length) blank.textContent = '暂无符合类型的候选，可查看全部候选';
            };
            toggle.hidden = !preference.type || !row.candidates.some(candidate => candidate.media_type !== preference.type);
            toggle.onclick = () => { showAll = !showAll; update(); };
            box.appendChild(toggle); update(); return select;
        };
        const render = () => {
            const expanded = new Map([...ui.get('mediaRows').querySelectorAll('details[data-layout-key]')].map(box => [box.dataset.layoutKey,box.open]));
            ui.get('mediaRows').textContent = '';
            let ready = 0;
            const groups = new Map(), pendingGroups = new Map();
            for (const row of rows) {
                if (!row.include) continue;
                if (!groups.has(row.group)) groups.set(row.group, []);
                groups.get(row.group).push(row);
                if (readyRow(row)) { ready++; continue; }
                if (!pendingGroups.has(row.group)) pendingGroups.set(row.group, []);
                pendingGroups.get(row.group).push(row);
            }
            const skipped = rows.filter(row => !row.include).length;
            ui.get('mediaSummary').textContent = rows.length ? `已匹配 ${ready} 个视频 · 待确认 ${rows.length - skipped - ready} 个 · 已跳过 ${skipped} 个` : '';
            if (rows.length) ui.get('mediaSummary').textContent += ` · ${pendingGroups.size} 组待确认`;
            for (const pending of pendingGroups.values()) {
                const row = pending[0], group = groups.get(row.group);
                const matchedGroup = pending.every(item => item.detail);
                const box = document.createElement('details'); box.className = 'sync-item'; box.dataset.layoutKey = 'group:' + row.group; box.open = expanded.get(box.dataset.layoutKey) || false;
                const originalNames = [...new Set(group.map(item => group.length === 1 ? item.node.name : item.originalFolder || item.query || '未识别作品'))];
                const title = document.createElement('summary'); title.textContent = `原：${originalNames.join(' / ')} · ${group.length} 个视频（${pending.length} 个待处理）${matchedGroup ? (pending.some(item => /季号|集号|季集/.test(item.error)) ? ' · 已匹配，需补季集' : ' · 已匹配，需处理异常') : ''}`; box.appendChild(title);
                const matched = document.createElement('p'); matched.textContent = '匹配为：' + (row.detail ? `${row.title}（${row.year}） · ${row.detail.source || 'TMDB'}` : '尚未确定'); box.appendChild(matched);
                const edits = document.createElement('details'), editTitle = document.createElement('summary'); editTitle.textContent = '修改搜索或命名'; edits.appendChild(editTitle);
                field(edits, '搜索片名', row.query, value => { for (const item of group) { item.query = value; item.detail = null; item.match = ''; item.aiType = ''; item.aiAssisted = false; item.error = '搜索片名已修改，请重新匹配'; } });
                const search = document.createElement('button'); search.textContent = '重新匹配整组'; edits.appendChild(search);
                const select = candidatePicker(box, row, true);
                const missingSeason = pending.find(item => item.detail && item.type === 'tv' && item.season == null);
                if (missingSeason) seasonPicker(box, missingSeason, true);
                search.onclick = () => editRows(async () => { try { await matchGroup(peers(row), row.query); progress('已重新匹配同组，明确的结果自动采用'); } catch (e) { progress('匹配失败：' + e.message); } });
                select.onchange = () => editRows(async () => { try { for (const item of peers(row)) { await choose(item, select.value); await validateEpisode(item); } } catch (e) { progress('读取作品失败：' + e.message); } });
                if (row.detail) {
                    field(edits, '标准片名（整组）', row.title, value => { for (const item of group) item.title = value; }); field(edits, '年份（整组，剧集用首播年份）', row.year, value => { for (const item of group) item.year = value; });

                }
                box.appendChild(edits);
                const groupActions = document.createElement('div'); groupActions.className = 'panel-actions';
                const skipGroup = document.createElement('button'); skipGroup.textContent = '跳过本组'; skipGroup.onclick = () => skipRows(group);
                groupActions.appendChild(skipGroup); box.appendChild(groupActions);
                const state = document.createElement('p'); state.textContent = [...new Set(pending.map(item => item.error).filter(Boolean))].join('；') || '请检查待确认项目'; box.appendChild(state);
                const files = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = `查看 ${group.length} 个原文件／调整季集`; files.appendChild(summary);
                for (const item of matchedGroup ? [] : group) {
                    const line = document.createElement('div'), name = document.createElement('p'); name.textContent = item.node.path; line.appendChild(name);
                    if (item.detail && item.type === 'tv') { seasonPicker(line, item); episodePicker(line, item); }
                    files.appendChild(line);
                }
                if (!matchedGroup) box.appendChild(files);
                ui.get('mediaRows').appendChild(box);
                if (matchedGroup) for (const item of pending) {
                    const card = document.createElement('details'); card.className = 'sync-item media-file-issue'; card.dataset.layoutKey = 'file:' + item.node.id; card.open = expanded.get(card.dataset.layoutKey) || false;
                    const heading = document.createElement('summary'); heading.textContent = '待处理文件：' + item.node.name; card.appendChild(heading);
                    const original = document.createElement('p'); original.textContent = '原位置：' + (item.node.originalPath || item.node.path); card.appendChild(original);
                    const issue = document.createElement('p'); issue.textContent = item.error || '请检查文件信息'; card.appendChild(issue);
                    const work = document.createElement('p'); work.textContent = '已匹配：' + item.title + (item.type === 'tv' ? '（整剧首播 ' + item.year + '）' + (item.season != null ? ' · 第 ' + item.season + ' 季' + (item.seasonYear ? '（' + item.seasonYear + '）' : '') : '') : '（' + item.year + '）') + ' · ' + (item.detail.source || 'TMDB'); card.appendChild(work);
                    if (item.type === 'tv') {
                        seasonPicker(card, item);
                        episodePicker(card, item);
                    }
                    const edits = document.createElement('details'), caption = document.createElement('summary'); caption.textContent = '单独修改这个文件的作品或命名'; edits.appendChild(caption);
                    field(edits, '搜索片名（仅本文件）', item.query, value => { item.query = value; item.detail = null; item.match = ''; item.aiType = ''; item.aiAssisted = false; item.error = '搜索片名已修改，请重新匹配'; });
                    const search = document.createElement('button'); search.textContent = '查询候选作品'; edits.appendChild(search);
                    const select = candidatePicker(edits, item);
                    search.onclick = () => editRows(async () => { try { item.candidates = await client.search(item.query); } catch (e) { progress('查询失败：' + e.message); } });
                    select.onchange = () => editRows(async () => { try { await choose(item, select.value); await validateEpisode(item); } catch (e) { item.error = e.message; } });
                    field(edits, '标准片名（仅本文件）', item.title, v => { item.title = v; });
                    field(edits, '年份（仅本文件）', item.year, v => { item.year = v; });
                    card.appendChild(edits);
                    const actions = document.createElement('div'); actions.className = 'panel-actions';
                    const validate = document.createElement('button'); validate.textContent = '检查此文件';
                    validate.onclick = () => editRows(async () => { await validateEpisode(item); progress(readyRow(item) ? '此文件已通过季集与命名检查，已从异常列表移除；预览会自动更新' : item.error || '仍需处理'); });
                    const skip = document.createElement('button'); skip.textContent = '跳过此文件'; skip.onclick = () => skipRows([item]);
                    actions.appendChild(validate); actions.appendChild(skip); card.appendChild(actions); ui.get('mediaRows').appendChild(card);
                }
            }
        };
        async function choose(row, match) {
            checkStopped();
            if (row.episodeInferred) { row.episode = null; row.episodeInferred = false; }
            row.match = match; row.detail = null; row.error = ''; row.title = ''; row.seasonEpisodes = [];
            if (!match) return;
            const [type, id] = match.split(':'); const detail = await mediaWorkDetail(client,type,id,checkStopped);
            row.detail = detail; row.type = type; row.title = detail.title || detail.name; row.year = (detail.release_date || detail.first_air_date || '').slice(0, 4); row.category = mediaCategory(detail, type); row.error = '';
        }
        async function validateEpisode(row) {
            checkStopped();
            if (!row.detail) return;
            row.error = '';
            try {
                if (row.type === 'tv' && row.season == null) {
                    const regular = (row.detail.seasons || []).filter(s => s.season_number > 0);
                    const byYear = row.sourceYear ? regular.filter(s => (s.air_date || '').startsWith(row.sourceYear)) : [];
                    if (byYear.length === 1) row.season = byYear[0].season_number;
                    else if (regular.length === 1) row.season = regular[0].season_number;
                }
                if (row.type === 'tv' && row.season != null) {
                    const season = await mediaSeasonEpisodes(client, row.detail.id, row.season);
                    row.seasonEpisodes = season.episodes;
                    row.seasonYear = season.year;
                    if (row.episode == null) {
                        const parsed = parseMediaName(row.node.name, row.node.folders || []);
                        if (parsed.episode != null) { row.episode = parsed.episode; row.endEpisode = parsed.endEpisode; }
                        else {
                            const original = key(mediaStem(row.node.name));
                            const matches = row.seasonEpisodes.filter(ep => (ep.aliases || [ep.name]).some(name => { const title = key(name || ''); return title.length >= 3 && original.includes(title); }));
                            if (matches.length === 1) { row.episode = matches[0].episode_number; row.episodeInferred = true; }
                        }
                    }
                    if (row.episode == null) throw new Error('已应用季号，但文件名无法唯一对应本季某集，请下拉选择集名');
                    const numbers = new Set(row.seasonEpisodes.map(ep => ep.episode_number));
                    for (let n = row.episode; n <= (row.endEpisode ?? row.episode); n++)
                        if (!numbers.has(n)) throw new Error((row.detail.source || 'TMDB') + ' 没有对应季集，请确认季号和集号');
                }
                mediaPath(row);
            } catch (e) { row.error = e.message; }
        }
        async function matchGroup(group, query, identifyFirst = false, identified = null) {
            checkStopped();
            if (identifyFirst && aiSettings().enabled) {
                for (let offset = 0; offset < group.length; offset += 12) {
                    checkStopped();
                    const chunk = group.slice(offset, offset + 12);
                    for (const row of chunk) { row.query = ''; row.detail = null; row.match = ''; row.candidates = []; row.aiAssisted = false; }
                    progress(`AI 翻译完整作品名：${offset + 1}–${offset + chunk.length}/${group.length}`);
                    try {
                        const results = await identifyMediaAIFiles(chunk, createMediaAI(aiSettings()));
                        checkStopped();
                        for (let index = 0; index < chunk.length; index++) {
                            checkStopped();
                            const row = chunk[index], result = results[index];
                            if (result.error) { row.error = result.error; continue; }
                            await matchGroup([row], result.title, false, result);
                        }
                    } catch (error) { checkStopped(); for (const row of chunk) row.error = error.message; }
                }
                return;
            }
            for (const row of group) { row.detail = null; row.match = ''; row.error = ''; row.matchFailure = ''; row.query = query; row.aiAssisted = false; row.aiType = ''; row.candidates = []; }
            try {
                if (identified) {
                    checkStopped();
                    query = identified.title;
                    for (const row of group) { row.group = JSON.stringify([row.node.parentId, identified.type, query, row.tv && identified.type !== 'movie' ? '' : row.node.id]); row.query = query; row.aiAssisted = true; row.aiType = identified.type; if (!row.explicitYear && identified.year) row.sourceYear = identified.year; }
                    for (const hint of identified.episodes) {
                        const row = group[hint.index];
                        if (row.explicitSeason == null && hint.season !== null) row.season = hint.season;
                        if (row.episode == null && hint.episode !== null) row.episode = hint.episode;
                    }
                    log('大模型填写搜索片名：' + group[0].node.name + ' → ' + query);
                }
                checkStopped();
                if (!query) { group.forEach(row => { row.matchFailure = 'unmatched'; }); throw new Error('未提取到片名，请填写搜索片名后重新匹配'); }
                let candidates = [], lookupError = '';
                const reference = group.find(row => row.tv) || group[0];
                const reliable = async list => {
                    const preference = mediaCandidatePreference(reference);
                    if (preference.conflict) return [];
                    const named = list.filter(c => (!preference.type || c.media_type === preference.type) && [c.title,c.name,c.original_title,c.original_name].filter(Boolean).some(title => key(title) === key(query)));
                    const matches = [];
                    for (const candidate of named) {
                        if (!reference.sourceYear || (candidate.release_date || candidate.first_air_date || '').startsWith(reference.sourceYear)) { matches.push(candidate); continue; }
                        if (candidate.media_type !== 'tv') continue;
                        const detail = await client.get('/tv/' + candidate.id);
                        if ((detail.seasons || []).some(season => (reference.season == null || season.season_number === reference.season) && season.season_number > 0 && (season.air_date || '').startsWith(reference.sourceYear))) matches.push(candidate);
                    }
                    return matches;
                };
                try { candidates = await client.search(query, async results => (await reliable(results)).length === 1); }
                catch (error) { lookupError = error.message; }
                const exact = await reliable(candidates);
                for (const row of group) row.candidates = candidates;
                if (exact.length !== 1) {
                    const failure = exact.length > 1 ? 'ambiguous' : lookupError ? 'lookup-error' : 'unmatched';
                    group.forEach(row => { row.matchFailure = failure; });
                    for (const row of group) row.error = exact.length > 1 ? '同名作品不唯一，请为同组选择一次' : '名称或年份无法可靠匹配，可修改搜索片名、选择候选或跳过' + (lookupError ? '；' + lookupError : '');
                    return;
                }
                for (const row of group) { await choose(row, exact[0].media_type + ':' + exact[0].id); await validateEpisode(row); }
            } catch (error) { for (const row of group) row.error = error.message; }
        }
        ui.get('scanMedia').onclick = async () => {
            const shouldPreview = await runTask(scan, true);
            if (shouldPreview && !cancelled) await generatePreview();
        };
        async function scan() {
            reused = 0;
            invalidate(); clearLog(); rows = []; render();
            meter('读取选中内容');
            try {
                const context = await mediaContext(provider); session = context.session; source = context.source;
                const selected = context.selected;
                if (!selected.length) throw new Error('请先在 ' + provider + ' 勾选文件或文件夹');
                const parentPath = context.path;
                const root = mediaClassificationRoot(source, parentPath); targetPath = root.path; targetSession = { ...session, parent: root.id };
                const target = ui.get('mediaTarget');
                target.title = target.textContent = '分类保存到：/' + targetPath + '（纪录片独立分类，动画电影归电影）';
                history = mediaFileHistory(session);
                const collected = await collectMediaSelection(selected, source, progress, node => mediaAlreadyStandard(node, parentPath), checkStopped, false, history);
                if (!collected.videos.length) { meter('检查完成', collected.skipped, collected.skipped); progress(`已跳过 ${collected.skipped} 个命名和所在作品目录均规范的视频，没有需要匹配的项目。`); return; }
                if (!ui.get('tmdbKey').value.trim()) ui.openSettings('mediaSettings');
                client = tmdbClient(ui.get('tmdbKey').value);
                for (const node of collected.videos) {
                    const parsed = parseMediaName(node.name, [...parentPath.split('/').filter(Boolean), ...node.folders]);
                    node.originalPath = '/' + [parentPath, node.path].filter(Boolean).join('/');
                    for (const sub of collected.linked.get(node.id)) sub.originalPath = '/' + [parentPath, sub.path].filter(Boolean).join('/');
                    const originalFolder = node.folders.length ? node.folders.join('/') : parentPath;
                    const explicit = parseMediaName(node.name);
                    const row = { node, ...parsed, recognitionFolders:[...parentPath.split('/').filter(Boolean), ...node.folders], explicitSeason:explicit.season, explicitEpisode:explicit.episode, explicitYear:explicit.year, originalFolder, sourceYear: parsed.year, title: '', candidates: [], include: true, subtitles: collected.linked.get(node.id), error: '' }; row.group = mediaRecognitionGroup(row, false); rows.push(row);
                }
                mediaWorkCounts(rows);
                const groups = new Map();
                for (const row of rows) {
                    checkStopped();
                    const saved = mediaRecords.get(row.node);
                    if (saved && !mediaBonusName(row.node.name)) {
                        try {
                            Object.assign(row, {query:saved.query, sourceYear:saved.sourceYear, season:saved.season, episode:saved.episode, endEpisode:saved.endEpisode, aiAssisted:saved.aiAssisted});
                            await choose(row, saved.match); await validateEpisode(row);
                            if (readyRow(row)) { row.group = JSON.stringify([row.node.parentId, row.type, row.title, row.type === 'tv' ? '' : row.node.id]); row.reusedRecord = true; reused++; continue; }
                        } catch (error) { checkStopped(); }
                    }
                    if (mediaBonusName(row.node.name)) { row.include = false; row.error = '非正片附加视频，未参与匹配；可在清理文件中检查非正片'; continue; }
                    if (!groups.has(row.group)) groups.set(row.group, []); groups.get(row.group).push(row);
                }
                let matched = 0;
                meter('匹配作品', 0, groups.size);
                for (const group of groups.values()) {
                    checkStopped(); progress(`匹配作品 ${matched + 1}/${groups.size}：${group[0].query}（${group.length} 个视频）`);
                    await matchGroup(group, group[0].query);
                    const failed = group.filter(mediaNeedsAI);
                    if (failed.length && aiSettings().enabled) { checkStopped(); await matchGroup(failed, '', true); }
                    meter('匹配作品', ++matched, groups.size);
                }
                checkStopped();
                mediaWorkCounts(rows);
                progress('核对同一作品目录中的特别篇');
                for (const row of await resolveMediaSpecials(rows.filter(row => !row.reusedRecord), client, parentPath)) await validateEpisode(row);
                checkStopped();
                for (const row of rows) if (readyRow(row)) mediaRecords.remember(row);
                mediaRecords.save();
                ui.get('mediaRecordState').textContent = `本次复用 ${reused} 个已确认视频；识别记录已保存，刷新后仍可复用。`;
                meter('识别结束', matched, groups.size);
                for (const sub of collected.unmatched) log('字幕未唯一关联，保留原状：' + sub.path);
                progress(`已跳过 ${collected.skipped} 个规范视频；待处理 ${rows.length} 个视频，按 ${groups.size} 组识别；已匹配 ${rows.filter(readyRow).length} 个。正在自动生成预览，待确认项跳过。`);
                return rows.some(readyRow);
            } catch (error) { stopMeter(); progress('识别失败：' + error.message); }
            finally { render(); }
        }
        const generatePreview = () => runTask(async () => {
            invalidate();
            meter('检查命名', 0, rows.filter(r => r.include).length);
            try {
                if (!rows.length) throw new Error('请先识别选中的视频');
                const items = [], paths = new Map(), conflicts = new Set();
                const included = rows.filter(r => r.include), sourceLists = cachedDriveChildren(source,new Map(),checkStopped); let checked = 0;
                for (const row of included) {
                    checkStopped();
                    await validateEpisode(row);
                    meter('检查命名', ++checked, included.length);
                    if (!readyRow(row)) { log('待确认，已跳过：' + row.node.path + '；' + (row.error || '未匹配作品')); continue; }
                    Object.assign(row.node, await mediaFileMetadata(row.node, source));
                    const fresh = mediaSubtitleLinks(await sourceLists(row.node.parentId),row.node.parentId,history);
                    row.subtitles = (fresh.linked.get(String(row.node.id)) || []).map(sub => ({...sub,
                        originalPath:row.node.originalPath?.replace(/[^/]+$/,() => sub.name),path:sub.name}));
                    mediaRecords.remember(row);
                    for (const sub of row.subtitles) { checkStopped(); Object.assign(sub, await mediaFileMetadata(sub, source)); }
                    const destination = mediaPath(row);
                    const group = [{ node: row.node, destination, videoId: row.node.id }];
                    for (const sub of row.subtitles) group.push({ node: sub, destination: mediaStem(destination) + sub.suffix + sub.name.slice(sub.name.lastIndexOf('.')), videoId: row.node.id });
                    for (const item of group) {
                        const previous = paths.get(item.destination);
                        if (previous && previous.node.id !== item.node.id) {
                            conflicts.add(previous.videoId); conflicts.add(item.videoId);
                            log('同名冲突，两组均跳过：' + item.destination);
                        }
                        paths.set(item.destination, item); items.push(item);
                    }
                }
                if (!items.length) throw new Error('没有可执行的已匹配视频，请处理待确认项');
                const children = cachedDriveChildren(source, new Map(), checkStopped);
                let checkedPaths = 0; meter('检查目标路径', 0, items.length);
                for (const item of items) {
                    let parentId = targetSession.parent;
                    const parts = relativeParts(item.destination);
                    for (let i = 0; i < parts.length; i++) {
                        const matches = (await children(parentId)).filter(node => node.name === parts[i]);
                        if (!matches.length) break;
                        if (matches.length > 1 || i < parts.length - 1 && !matches[0].directory || i === parts.length - 1 && matches[0].id !== item.node.id) {
                            conflicts.add(item.videoId); log('目标同名冲突，视频及字幕已跳过：' + item.destination); break;
                        }
                        parentId = matches[0].id;
                    }
                    meter('检查目标路径', ++checkedPaths, items.length);
                }
                for (const row of rows) if (conflicts.has(row.node.id)) row.error = '目标同名冲突，请修改名称或取消此项；本次已跳过';
                const accepted = items.filter(item => !conflicts.has(item.videoId));
                if (!accepted.length) throw new Error('所有已匹配项目存在同名冲突，请调整后重试');
                checkStopped();
                mediaRecords.save();
                ui.get('mediaRecordState').textContent = `已保存 ${mediaRecords.count()} 个本盘视频的识别记录；本次复用 ${reused} 个。`;
                const writer = mediaOrganizerWriter(targetSession, source);
                const directoryPlans = await writer.prepare(accepted, checkStopped); checkStopped();
                const directoryPreview = directoryPlans.map(plan => `文件夹整体改名/移动：${plan.folder.path || plan.folder.name}\n目标：/${[targetPath,plan.destination].filter(Boolean).join('/')}\n随文件夹保留并移动的内容（${plan.contents.length} 项）：\n${plan.contents.map(node => '  ' + node.path + (node.directory ? '/' : '')).join('\n')}`).join('\n\n');
                previewRevision = history?.revision(accepted.map(item => item.videoId)) || '';
                batch = accepted; batchWriter = writer; ui.get('mediaPreview').textContent = (directoryPreview ? directoryPreview + '\n\n逐文件目标：\n' : '') + accepted.map(item => `原：${item.node.originalPath || item.node.path}\n新：/${[targetPath, item.destination].filter(Boolean).join('/')}`).join('\n\n');
                meter('预览就绪', items.length, items.length);
                progress(`预览 ${accepted.length} 个文件（含字幕），跳过 ${rows.filter(r => r.include && (!readyRow(r) || conflicts.has(r.node.id))).length} 个待确认视频。点击确认执行即可整批处理。`);
            } catch (error) { stopMeter(); progress('无法生成预览：' + error.message); }
            finally { render(); }
        }, true);
        const refreshStalePreview = () => {
            if (!batch || previewRevision === (history?.revision(batch.map(item => item.videoId)) || '')) return false;
            invalidate();
            ui.get('mediaPreview').textContent = '关联字幕已变化，请重新生成预览。';
            progress('关联字幕已变化，请重新生成预览后确认执行。');
            return true;
        };
        ui.onActivate?.(refreshStalePreview);
        ui.get('runMedia').onclick = () => runTask(async () => {
            if (refreshStalePreview()) return;
            if (!batch) return;

            const items = batch, writer = batchWriter; batch = null; batchWriter = null;
            meter('重命名文件', 0, items.length);
            let completed = 0, failed = 0; const failedVideos = new Set();
            const rowsById = new Map(rows.map(row => [row.node.id, row]));
            try { if (!writer) throw new Error('执行计划已失效，请重新生成预览'); checkStopped(); await writer.validate(); }
            catch (error) { progress('无法执行：' + error.message); return; }
            for (let i = 0; i < items.length; i++) {
                if (cancelled) break;
                const item = items[i]; progress(`重命名 ${i + 1}/${items.length}：${item.node.name}`);
                if (failedVideos.has(item.videoId)) { failed++; log('视频未完成，字幕保留：' + item.node.path); meter('重命名文件', completed + failed, items.length); continue; }
                try { log(item.destination + '：' + await writer.execute(item)); completed++; const row = rowsById.get(item.node.id); if (row) { mediaRecords.remember(row); mediaRecords.save(); } }
                catch (error) { failed++; if (item.node.id === item.videoId) failedVideos.add(item.videoId); log(item.node.path + '：未完成；' + error.message); if (error.stop) break; }
                meter('重命名文件', completed + failed, items.length);
            }
            meter(failed || completed + failed < items.length ? '处理结束（含未完成项）' : '整理完成', completed + failed, items.length);

            progress(`整理结束：已确认 ${completed}，未完成 ${failed}，未处理 ${items.length - completed - failed}。原文件夹直接改名，分类时整体移动；本次未自动删除任何项目。`);
        }, true);
    }
