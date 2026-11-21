    function mediaOrganizerMarkup() { return `
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
            <div class="panel-actions"><button id="scanMedia">识别并检查</button><button id="previewMedia" disabled>生成整理预览</button><button id="runMedia" disabled>确认执行</button><button id="openMediaCleanup" type="button" aria-controls="mediaCleanup" aria-expanded="false">清理文件</button></div>
            <label id="allowWithoutSubtitles"><input id="mediaAllowMissing" type="checkbox">允许无字幕整理</label>
            <div id="mediaPreview"></div>
            <div id="mediaRows"></div>
            <section id="mediaCleanup" class="sync-preview" hidden>
            <label>清理规则<select id="cleanupMode"><option value="extras">非正片与附件</option><option value="empty">仅空文件夹</option><option value="nonstandard">所有不规范项目</option></select></label>
            <label id="cleanupSubtitleOption"><input id="cleanupSubtitles" type="checkbox">同时清理字幕及字体（默认保留）</label>
            <p id="cleanupRule">清理图片、附件及已标记的花絮/预告；默认保留字幕、字体和普通视频。</p>
            <div class="panel-actions"><button id="checkCleanup">识别并检查清理范围</button><button id="runEmpty" disabled>确认清理</button></div>
            <div id="emptyPreview" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto"></div></section>`; }
    function initMediaOrganizer(provider, flow) {
        const {ui} = flow;
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
        let history = null, previewRevision = '';
        let readSubtitleLinks;
        const checkStopped = () => flow.check();
        const progress = message => flow.status(message);
        const meter = (stage, done = 0, total = null) => {
            const bar = ui.get('subtitleMeter');
            const label = total === null ? stage + '…' : `${stage} · ${done}/${total}`;
            if (bar.getAttribute('aria-label') !== stage || ui.get('subtitleProgress').textContent === bar.getAttribute('aria-valuetext'))
                progress(label);
            bar.hidden = false;
            bar.setAttribute('aria-label', stage);
            bar.setAttribute('aria-valuetext', label);
            bar.max = Math.max(1, total ?? 1);
            if (total === null) bar.removeAttribute('value');
            else bar.value = done;
        };
        const stopMeter = () => {
            const bar = ui.get('subtitleMeter');
            if (!bar.hasAttribute('value')) bar.value = 0;
            bar.setAttribute('aria-valuetext', '本阶段未完成');
        };
        const log = message => flow.log('影视整理',message);
        const invalidate = () => { batch = null; batchWriter = null; ui.get('runMedia').disabled = true; ui.get('mediaPreview').textContent = ''; };
        let mediaBusy = false;
        const updateRowControls = () => {
            for (const control of host.querySelectorAll('input, select, button')) {
                control.disabled = mediaBusy || control.hasAttribute('data-media-disabled');
            }
        };
        const updateControls = busy => {
            mediaBusy = busy;
            for (const id of ['scanMedia', 'openMediaCleanup', 'saveMediaKey', 'forgetMediaKey', 'tmdbKey', 'checkCleanup', 'cleanupMode', 'cleanupSubtitles', 'enableMediaAI', 'mediaAIProvider', 'mediaAIBase', 'mediaAIKey', 'mediaAIModel', 'mediaAIModelSelect', 'fetchMediaAIModels', 'saveMediaAI', 'testMediaAI', 'forgetMediaAI']) ui.get(id).disabled = busy;
            updateRowControls();
            ui.get('runMedia').disabled = busy || !batch;
            ui.get('runEmpty').disabled = busy || !emptyPlan.length;
            ui.get('previewMedia').disabled = busy || !flow.registryReady;
            ui.get('mediaAllowMissing').disabled = busy;
        };
        const runTask = flow.run;
        flow.controls.push(updateControls);
        const previewCleanup = () => runTask(async () => {
            const extras = ui.get('cleanupMode').value === 'extras';
            const emptyOnly = ui.get('cleanupMode').value === 'empty';
            emptyPlan = []; ui.get('emptyPreview').textContent = ''; meter(emptyOnly ? '检查空文件夹' : extras ? '检查非正片与附件' : '检查不规范项目');
            try {
                const context = await mediaContext(provider); emptySession = context.session; emptySource = context.source; checkStopped();
                const canonical = extras || emptyOnly ? null : mediaCanonicalResolver(tmdbClient(ui.get('tmdbKey').value),checkStopped);
                const plan = await planMediaCleanup(context.selected, emptySource, message => {
                    checkStopped(); progress(message);
                    if (message.startsWith('保留，未确认')) log(message);
                }, {extras,emptyOnly,includeSubtitles:extras && ui.get('cleanupSubtitles').checked,resolveCanonical:canonical,parentPath:context.path,check:checkStopped,log});
                checkStopped();
                ui.get('emptyPreview').textContent = plan.map(item => `${emptyOnly ? '回收空文件夹' : item.directory ? '删除整个文件夹及全部内容' : '删除文件'}：${item.path}${item.reason ? '\n原因：' + item.reason : ''}${item.expectedName ? '\n应为标准名称：' + item.expectedName : ''}`).join('\n\n') || (emptyOnly ? '未发现空文件夹。' : extras ? '未发现非正片文件。' : '没有已确认命名不规范的项目。未确认的作品已保留，详见日志。');
                emptyPlan = plan;
                meter('检查结束', emptyPlan.length, emptyPlan.length); progress(`可清理 ${emptyPlan.length} 个${emptyOnly ? '空文件夹' : extras ? '非正片文件' : '不规范项目（文件夹包含全部内容）'}；尚未删除`);
            } catch (error) { stopMeter(); progress('检查失败：' + error.message); }
        }, true);
        const changeCleanupRule = () => {
            emptyPlan = []; ui.get('runEmpty').disabled = true; ui.get('emptyPreview').textContent = '';
            ui.get('cleanupRule').textContent = ui.get('cleanupMode').value === 'extras'
                ? (ui.get('cleanupSubtitles').checked ? '清理选中范围内的字幕、字体、图片、其他附件、花絮和预告；保留普通视频及特别篇。' : '清理图片、其他附件、花絮和预告；保留字幕、字体、普通视频及特别篇。')
                : ui.get('cleanupMode').value === 'empty' ? '预览所选范围内的空文件夹，回收前再次检查。' : '使用 TMDB 识别所选范围，核对标准命名。无法确认的作品会保留。清单中的整文件夹包含全部内容。';
        };
        ui.get('cleanupMode').onchange = () => { ui.get('cleanupSubtitleOption').hidden = ui.get('cleanupMode').value !== 'extras'; changeCleanupRule(); };
        ui.get('cleanupSubtitles').onchange = changeCleanupRule;
        ui.get('openMediaCleanup').onclick = () => {
            const section = ui.get('mediaCleanup');
            section.hidden = !section.hidden;
            ui.get('openMediaCleanup').setAttribute('aria-expanded',String(!section.hidden));
            if (section.hidden) changeCleanupRule();
        };
        ui.get('checkCleanup').onclick = previewCleanup;
        ui.get('runEmpty').onclick = () => runTask(async () => {
            if (!emptyPlan.length) return;

            const plan = emptyPlan; emptyPlan = []; invalidate();
            flow.reset();
            let deleted = 0, retained = 0, failed = 0, pending = 0;
            try { await batchStage(plan,'回收站清理（文件或独立目录）',log,async (item,verify,_index,observe) => {
                let outcome;
                verify();
                try { log(item.path + '：' + await removeMediaNonstandard(item,emptySession,emptySource,verify)); deleted++; }
                catch (error) { observe(error); outcome = error.retained ? 'skipped' : 'failed'; if (error.retained) { retained++; log(item.path + '：保留；' + error.message); } else if (error.pending) { pending++; log(item.path + '：删除结果待确认；' + error.message); } else { failed++; log(item.path + '：删除失败；' + error.message); } if (error.stop) { log('登录或权限异常，停止后续清理'); throw error; } }
                meter('清理所选项目', deleted + retained + failed + pending, plan.length);
                return outcome;
            },checkStopped,8,'整目录回收项已排除其子项'); }
            catch (error) { log('清理中断：' + error.message); }

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
        const refreshWorks = () => {
            mediaWorkCounts(rows);
            return runTask(() => flow.syncWorks(rows),true);
        };
        const editRows = async work => {
            let started = false;
            try {
                await runTask(async () => {
                    started = true;
                    invalidate();
                    try { await work(); }
                    finally { render(); }
                });
            } finally { if (started) await refreshWorks(); }
        };
        const field = (box, label, value, change, type = 'text') => {
            const wrapper = document.createElement('label'), input = document.createElement('input'); wrapper.textContent = label; input.type = type; input.value = value ?? ''; wrapper.appendChild(input); box.appendChild(wrapper);
            input.oninput = () => { change(input.value); invalidate(); flow.syncWorks(rows,false); };
            input.onchange = () => label.startsWith('搜索片名') ? undefined : refreshWorks(); return input;
        };
        const key = titleKey;
        const peers = row => rows.filter(r => r.group === row.group);
        const readyRow = row => {
            if (!row.detail || row.error || !row.type || !row.title || !row.year) return false;
            try { mediaPath(row); return true; } catch { return false; }
        };
        flow.workReady = readyRow;
        const skipRows = async targets => {
            for (const row of targets) row.include = false;
            invalidate(); render(); progress('已跳过 ' + targets.length + ' 个视频，未修改网盘文件'); await refreshWorks();
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
                    await batchStage(targets,'核对新季号（视频）',log,async item => {
                        if (item.episodeInferred) { item.episode = null; item.episodeInferred = false; }
                        item.season = season;
                        await validateEpisode(item);
                        return item.error ? 'failed' : undefined;
                    },checkStopped,8,'复用同一季资料，TMDB 保持节流');
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
            select.value = String(row.episode ?? ''); if (row.season == null) select.setAttribute('data-media-disabled',''); label.appendChild(select); box.appendChild(label);
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
        const results = ui.get('subtitleResults'), host = ui.get('mediaRows');
        let detail = null;
        const rowStateLabel = row => !row.include ? '已跳过' : readyRow(row) ? '已匹配' : '待确认';
        const textElement = (tag, text, className = '') => {
            const el = document.createElement(tag);
            el.textContent = text;
            if (className) el.className = className;
            return el;
        };
        const action = (box, label, click) => {
            const button = textElement('button',label);
            button.type = 'button';
            button.onclick = click;
            box.append(button);
            return button;
        };
        const resetQuery = (row, value) => {
            Object.assign(row,{query:value,detail:null,match:'',aiType:'',aiAssisted:false,error:'搜索片名已修改，请重新匹配'});
        };
        const renderFileDetail = (box, item) => {
            box.append(textElement('p','原位置：' + (item.node.originalPath || item.node.path),'media-file-path'));
            if (item.error) box.append(textElement('p',item.error));
            if (!item.include) return;
            if (item.detail) {
                const season = item.type === 'tv' && item.season != null ? ' · ' + (item.season ? '第 ' + item.season + ' 季' : '特别篇') : '';
                box.append(textElement('p','已匹配：' + item.title + '（' + item.year + '）' + season));
                if (item.type === 'tv') {
                    seasonPicker(box,item);
                    episodePicker(box,item);
                }
            }
            const edits = document.createElement('details');
            edits.append(textElement('summary','修改此文件的作品或命名'));
            field(edits,'搜索片名（仅本文件）',item.query,value => resetQuery(item,value));
            action(edits,'查询候选作品',() => editRows(async () => {
                try { item.candidates = await client.search(item.query); }
                catch (error) { progress('查询失败：' + error.message); }
            }));
            const select = candidatePicker(edits,item);
            select.onchange = () => {
                if (!select.value) return;
                return editRows(async () => {
                    try { await choose(item,select.value); await validateEpisode(item); }
                    catch (error) { item.error = error.message; }
                });
            };
            field(edits,'标准片名（仅本文件）',item.title,value => { item.title = value; });
            field(edits,'年份（仅本文件）',item.year,value => { item.year = value; });
            box.append(edits);
            const actions = document.createElement('div');
            actions.className = 'panel-actions';
            action(actions,'检查此文件',() => editRows(async () => {
                await validateEpisode(item);
                progress(readyRow(item) ? '此文件已就绪，正在更新预览。' : item.error || '此文件仍需处理。');
            }));
            action(actions,'跳过此文件',() => skipRows([item]));
            box.append(actions);
        };
        const renderDetail = (group, title) => {
            const box = document.createElement('section');
            box.className = 'sync-item media-detail';
            const back = action(box,'返回结果',() => {
                const {scrollTop} = detail;
                detail = null;
                flow.closeWork();
                results.scrollTop = scrollTop;
            });
            back.id = 'mediaBack';
            box.append(textElement('h5',title));
            const included = group.filter(row => row.include);
            const pending = included.filter(row => !readyRow(row));
            const reference = pending[0] || included[0];
            if (reference && included.length > 1) {
                const controls = document.createElement('details');
                controls.open = !!pending.length;
                controls.append(textElement('summary','调整整组匹配'));
                field(controls,'搜索片名（整组）',reference.query,value => included.forEach(row => resetQuery(row,value)));
                action(controls,'重新匹配整组',() => editRows(async () => {
                    await matchGroup(included,reference.query);
                    progress('已重新匹配整组。');
                }));
                const select = candidatePicker(controls,reference,true);
                select.onchange = () => {
                    if (!select.value) return;
                    return editRows(async () => {
                        try {
                            await batchStage(included,'核对手选作品与季集（视频）',log,async (row,verify) => {
                                await choose(row,select.value);
                                verify();
                                await validateEpisode(row);
                                return row.error ? 'failed' : undefined;
                            },checkStopped,8,'TMDB 详情和季集复用请求');
                        } catch (error) { progress('读取作品失败：' + error.message); }
                    });
                };
                const missingSeason = pending.find(row => row.detail && row.type === 'tv' && row.season == null);
                if (missingSeason) seasonPicker(controls,missingSeason,true);
                if (reference.detail) {
                    field(controls,'标准片名（整组）',reference.title,value => included.forEach(row => { row.title = value; }));
                    field(controls,'年份（整组，剧集用首播年份）',reference.year,value => included.forEach(row => { row.year = value; }));
                }
                action(controls,'跳过本组',() => skipRows(included));
                box.append(controls);
            }
            const item = group.includes(detail.file) ? detail.file : pending[0] || included[0] || group[0];
            detail.file = item;
            if (group.length > 1) {
                const label = textElement('label','选择文件');
                const select = document.createElement('select');
                select.id = 'mediaDetailFile';
                for (const [index,row] of group.entries()) {
                    const option = textElement('option',rowStateLabel(row) + ' · ' + row.node.name);
                    option.value = String(index);
                    select.append(option);
                }
                select.value = String(group.indexOf(item));
                select.onchange = () => {
                    detail.file = group[Number(select.value)];
                    render();
                    host.querySelector('#mediaDetailFile')?.focus({preventScroll:true});
                };
                label.append(select);
                box.append(label);
            }
            renderFileDetail(box,item);
            host.append(box);
        };
        const render = () => {
            if (!detail) return;
            host.textContent = '';
            const {group} = detail;
            renderDetail(group,group[0].title || group[0].query);
            updateRowControls();
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
                    const packageRange = mediaSeasonPackageRange(row.recognitionFolders);
                    const packageEpisode = mediaMapSeasonPackageEpisode(packageRange,regular,row.explicitEpisode);
                    if (packageEpisode) {
                        row.season = packageEpisode.season;
                        row.episode = packageEpisode.episode;
                        row.endEpisode = null;
                        row.episodeInferred = true;
                        log('整季集号映射', row.node.name + ' · 包内第 ' + row.explicitEpisode + ' 集 → S'
                            + String(row.season).padStart(2,'0') + 'E' + String(row.episode).padStart(2,'0')
                            + ' · TMDB 季集总数与目录范围一致');
                    }
                    const byYear = row.sourceYear ? regular.filter(s => (s.air_date || '').startsWith(row.sourceYear)) : [];
                    if (row.season == null && byYear.length === 1) row.season = byYear[0].season_number;
                    else if (row.season == null && row.sourceYear && regular.length === 1) row.season = regular[0].season_number;
                    else if (row.season == null && regular.length === 1 && row.explicitEpisode > 0 && row.explicitEpisode <= regular[0].episode_count
                        && !row.standalone && !/特别篇|特別篇|剧场版|劇場版|特典|番外|\b(?:special|sp|ova|oad|movie)\b/i.test([row.node.name,...(row.node.folders || [])].join(' '))) row.season = regular[0].season_number;
                }
                if (row.type === 'tv' && row.season != null && row.explicitSeason == null) {
                    const absolute = mediaMapAbsoluteSeasonEpisode(row.detail.seasons || [],row.season,row.explicitEpisode);
                    if (absolute) {
                        row.episode = absolute.episode;
                        row.endEpisode = null;
                        row.episodeInferred = true;
                        log('跨季集号映射', row.node.name + ' · 全剧第 ' + row.explicitEpisode + ' 集 → S'
                            + String(row.season).padStart(2,'0') + 'E' + String(row.episode).padStart(2,'0'));
                    }
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
            } catch (e) { if (e.stop) throw e; row.error = e.message; }
        }
        async function matchGroup(group, query, identifyFirst = false, identified = null, verify = checkStopped) {
            verify();
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
                            await matchGroup([row],result.title,false,result,verify);
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
                const reliable = async (list, theatrical = false, searchTitle = query) => {
                    const preference = mediaCandidatePreference(reference);
                    if (preference.conflict) return [];
                    const named = list.filter(c => (theatrical ? c.media_type === 'movie' && preference.type !== 'tv'
                        : !preference.type || c.media_type === preference.type) && [c.title,c.name,c.original_title,c.original_name].filter(Boolean)
                        .some(title => theatrical ? key(mediaTheatricalQuery(title)) === key(mediaTheatricalQuery(searchTitle)) : key(title) === key(searchTitle)));
                    const matches = [];
                    for (const candidate of named) {
                        if (candidate.media_type === 'tv' && !reference.sourceYear && reference.workNumberedCount > 1) {
                            const detail = await client.get('/tv/' + candidate.id);
                            const episodeCount = (detail.seasons || []).filter(season => season.season_number > 0)
                                .reduce((total,season) => total + (Number(season.episode_count) || 0),0);
                            if (episodeCount && reference.workNumberedCount > episodeCount) continue;
                        }
                        if (!reference.sourceYear || (candidate.release_date || candidate.first_air_date || '').startsWith(reference.sourceYear)) { matches.push(candidate); continue; }
                        if (candidate.media_type !== 'tv') continue;
                        const detail = await client.get('/tv/' + candidate.id);
                        if ((detail.seasons || []).some(season => (reference.season == null || season.season_number === reference.season) && season.season_number > 0 && (season.air_date || '').startsWith(reference.sourceYear))) matches.push(candidate);
                    }
                    return matches;
                };
                try { candidates = await client.search(query, reference.sourceYear ? async results => (await reliable(results)).length === 1 : undefined); }
                catch (error) { lookupError = error.message; }
                let exact = await reliable(candidates);
                if (!exact.length && !lookupError && /剧场版|劇場版/.test(query)) {
                    const shorter = mediaTheatricalQuery(query);
                    if (shorter && key(shorter) !== key(query) && mediaCandidatePreference(reference).type !== 'tv') {
                        verify();
                        log('剧场版片名补搜：' + shorter);
                        try {
                            const fallback = await client.search(shorter);
                            candidates = [...new Map([...candidates,...fallback].map(item => [item.media_type + ':' + item.id,item])).values()];
                            exact = await reliable(candidates,true);
                        } catch (error) {
                            if (error.stop) throw error;
                            verify(); lookupError = error.message;
                        }
                    }
                }
                if (!exact.length && !lookupError && reference.tv && !reference.standalone) {
                    const parts = query.split(/\s*[:：·｜|]\s*|\s+[-–—]\s+|\s+/u).filter(Boolean);
                    for (let length = parts.length - 1; length > 0; length--) {
                        const shorter = parts.slice(0,length).join(' ').trim();
                        if (key(shorter).length < 2 || key(shorter) === key(query)) continue;
                        verify();
                        log('作品识别回退搜索：' + query + ' → ' + shorter);
                        try {
                            const fallback = await client.search(shorter);
                            candidates = [...new Map([...candidates,...fallback].map(item => [item.media_type + ':' + item.id,item])).values()];
                            exact = await reliable(fallback,false,shorter);
                            if (exact.length) break;
                        } catch (error) {
                            if (error.stop) throw error;
                            verify(); lookupError = error.message; break;
                        }
                    }
                }
                for (const row of group) row.candidates = candidates;
                if (exact.length !== 1) {
                    const failure = exact.length > 1 ? 'ambiguous' : lookupError ? 'lookup-error' : 'unmatched';
                    group.forEach(row => { row.matchFailure = failure; });
                    for (const row of group) row.error = exact.length > 1 ? '同名作品不唯一，请为同组选择一次' : '名称或年份无法可靠匹配，可修改搜索片名、选择候选或跳过' + (lookupError ? '；' + lookupError : '');
                    return;
                }
                for (const row of group) {
                    verify();
                    await choose(row,exact[0].media_type + ':' + exact[0].id);
                    verify();
                    await validateEpisode(row);
                }
            } catch (error) { if (error.stop) throw error; verify(); for (const row of group) row.error = error.message; }
        }
        const identityAIQueue = new Map();
        async function resolveUnmatched(group,verify) {
            const failed = group.filter(mediaNeedsAI);
            if (failed.length && aiSettings().enabled) await enqueueByKey(identityAIQueue,'ai',() => matchGroup(failed,'',true,null,verify));
        }
        async function recoverWorkFromSubtitle(row, verify) {
            if (!client || readyRow(row)) return;
            const hint = flow.subtitleWorkHints(row);
            if (!hint) return;
            const preference = mediaCandidatePreference(row);
            if (preference.conflict || preference.type && preference.type !== hint.type || row.match && hint.id && row.match !== hint.type + ':' + hint.id) return;
            if (['season','episode'].some(field => { const explicit = row[field === 'season' ? 'explicitSeason' : 'explicitEpisode']; return explicit != null && hint[field] != null && explicit !== hint[field]; })) { log('字幕季集与视频明确编号冲突：' + row.node.name); return; }
            const draft = () => ({...row, season:row.explicitSeason ?? hint.season ?? row.season, episode:row.explicitEpisode ?? hint.episode ?? row.episode,
                endEpisode:row.endEpisode ?? hint.endEpisode, episodeInferred:false, sourceYear:row.explicitYear || row.sourceYear || hint.year, aiType:hint.type, subtitleTitleHints:hint.queries});
            const matches = new Map();
            const add = candidate => {
                if (readyRow(candidate) && candidate.type === hint.type &&
                    (hint.type !== 'movie' || !candidate.sourceYear || candidate.year === String(candidate.sourceYear)))
                    matches.set(candidate.match,candidate);
            };
            if (hint.id) {
                const candidate = draft();
                await choose(candidate, hint.type + ':' + hint.id);
                verify();
                await validateEpisode(candidate);
                add(candidate);
            } else {
                let last;
                for (const query of hint.queries) {
                    const candidate = draft();
                    await matchGroup([candidate],query,false,null,verify);
                    last = candidate;
                    verify();
                    if (candidate.matchFailure === 'lookup-error') return;
                    if (candidate.matchFailure === 'ambiguous') await resolveUnmatched([candidate],verify);
                    verify();
                    add(candidate);
                    if (matches.size > 1) return;
                }
                if (!matches.size && last) { await resolveUnmatched([last],verify); verify(); add(last); }
            }
            if (matches.size !== 1) return;
            Object.assign(row,matches.values().next().value);
            await flow.acceptSubtitleWork(row,verify);
            log('已用字幕线索确认作品：' + row.node.name + ' → ' + row.title + '（' + row.year + '）');
        }
        flow.resolveSubtitleWorks = async (inventory, verify) => {
            const recoverable = inventory.filter(item => item.media && !readyRow(item.media)
                && (flow.coverage(item.node.id) === 'complete' || item.identityClues?.length) && !item.writeBlocked && item.media.include !== false && !item.organized && !item.organizePending);
            let done = 0;
            await batchStage(recoverable,'字幕线索复核作品身份（视频）',log,async (item,check,_index,observe) => {
                try { await recoverWorkFromSubtitle(item.media,check); }
                catch (error) {
                    observe(error);
                    check();
                    if (error.stop || error.phase === 'drive-auth' || [401,403].includes(error.status)) throw error;
                    log('字幕线索复核失败：' + item.node.name + '；' + error.message);
                    return 'failed';
                }
                meter('字幕线索复核',++done,recoverable.length);
                return readyRow(item.media) ? undefined : 'skipped';
            },verify,8,'字幕线索沿用作品候选、TMDB 详情和季集核对流程');
            flow.requestRender();
        };
        ui.get('scanMedia').onclick = () => runTask(scan,true);
        async function scan() {
            flow.reset();
            invalidate(); rows = []; detail = null;
            readSubtitleLinks = undefined;
            results.scrollTop = 0;
            ui.get('mediaPreviewPanel').open = false;
            render();
            meter('读取选中内容');
            try {
                const context = await mediaContext(provider); session = context.session; source = context.source;
                const selected = context.selected;
                if (!selected.length) throw new Error('请先在 ' + provider + ' 勾选文件或文件夹');
                const parentPath = context.path;
                const root = mediaClassificationRoot(source, parentPath); targetPath = root.path; targetSession = { ...session, parent: root.id };
                history = mediaFileHistory(session);
                const collected = await collectMediaSelection(selected,source,progress,checkStopped,history,log);
                readSubtitleLinks = collected.readSubtitleLinks;
                context.readSubtitleLinks = readSubtitleLinks;
                if (!collected.videos.length) {
                    meter('检查完成', 0, 0);
                    progress(collected.unmatched.length ? '选区里只有待配对的字幕，请一并勾选视频所在目录。' : '当前选区没有可识别的视频。');
                    return;
                }
                const credential = ui.get('tmdbKey').value.trim();
                client = credential ? tmdbClient(credential) : null;
                for (const node of collected.videos) {
                    const parsed = parseMediaName(node.name, [...parentPath.split('/').filter(Boolean), ...node.folders]);
                    node.originalPath = '/' + [parentPath, node.path].filter(Boolean).join('/');
                    for (const sub of collected.linked.get(node.id)) sub.originalPath = '/' + [parentPath, sub.path].filter(Boolean).join('/');
                    const originalFolder = node.folders.length ? node.folders.join('/') : parentPath;
                    const explicit = parseMediaName(node.name);
                    const row = { node, ...parsed, recognitionFolders:[...parentPath.split('/').filter(Boolean), ...node.folders], explicitSeason:explicit.season, explicitEpisode:explicit.episode, explicitYear:explicit.year, originalFolder, sourceYear: parsed.year, title: '', candidates: [], include: true, subtitles: collected.linked.get(node.id), error: '' }; row.group = mediaRecognitionGroup(row, false); rows.push(row);
                }
                flow.context = context;
                flow.seed(context,collected,rows);
                if (!client) {
                    for (const row of rows) row.error = '请在设置中填写 TMDB 密钥后识别作品';
                    flow.log('作品识别','缺少 TMDB 密钥，继续检查字幕');
                    return await flow.inspect(context,collected);
                }
                mediaWorkCounts(rows);
                const groups = new Map();
                await batchStage(rows,'复用整理记录与核对季集（视频）',log,async (row,verify) => {
                    const saved = mediaRecords.get(row.node);
                    if (saved && !mediaSkipBonusVideo(row.node)) {
                        try {
                            Object.assign(row, {query:saved.query, sourceYear:saved.sourceYear, season:saved.season, episode:saved.episode, endEpisode:saved.endEpisode, aiAssisted:saved.aiAssisted});
                            await choose(row, saved.match); await validateEpisode(row);
                            const conflict = mediaRecordScopeConflict(row,saved.type,row.detail);
                            if (conflict) {
                                const parsed = parseMediaName(row.node.name,row.recognitionFolders);
                                Object.assign(row,parsed,{query:parsed.query,sourceYear:parsed.year,title:'',type:'',year:'',category:'',
                                    detail:null,match:'',matchFailure:'',seasonEpisodes:[],error:'',aiAssisted:false,aiType:'',episodeInferred:false});
                                row.group = mediaRecognitionGroup(row,false);
                                log('整理记录冲突',row.node.name + ' · ' + conflict + '；忽略旧记录，重新识别整组选集');
                                return 'skipped';
                            }
                            if (readyRow(row)) { row.group = JSON.stringify([row.node.parentId, row.type, row.title, row.type === 'tv' ? '' : row.node.id]); row.reusedRecord = true; return; }
                        } catch (error) { verify(); if (error.stop) throw error; }
                    }
                    return 'skipped';
                },checkStopped,8,'已保存记录优先，同一作品与季集读同一份 TMDB 结果');
                for (const row of rows) {
                    if (row.reusedRecord) continue;
                    if (mediaSkipBonusVideo(row.node)) {
                        row.include = false; row.error = '文件名匹配附加内容规则，未参与作品识别';
                        log('识别跳过：' + row.node.path + '；' + row.error);
                        continue;
                    }
                    if (!groups.has(row.group)) groups.set(row.group, []); groups.get(row.group).push(row);
                }
                let matched = 0;
                meter('匹配作品', 0, groups.size);
                await batchStage([...groups.values()],'作品识别与季集核对（作品组）',log,async (group,verify) => {
                    verify(); progress(`匹配作品 ${matched + 1}/${groups.size}：${group[0].query}（${group.length} 个视频）`);
                    await matchGroup(group,group[0].query,false,null,verify);
                    await resolveUnmatched(group,verify);
                    meter('匹配作品', ++matched, groups.size);
                    flow.requestRender();
                    return group.every(row => !readyRow(row)) ? 'failed' : undefined;
                },checkStopped,8,'TMDB 请求沿用节流，同组季集及 AI 回退顺序检查');
                checkStopped();
                mediaWorkCounts(rows);
                progress('核对同一作品目录中的特别篇');
                const specials = await resolveMediaSpecials(rows.filter(row => !row.reusedRecord),client,parentPath,checkStopped,log);
                await batchStage(specials,'特别篇季集核对（视频）',log,async row => {
                    await validateEpisode(row);
                    return row.error ? 'failed' : undefined;
                },checkStopped,8,'特别篇归属先比对已有作品，再读取相同季资料');
                checkStopped();
                for (const row of rows) if (readyRow(row)) mediaRecords.remember(row);
                mediaRecords.save();
                if (collected.unmatched.length) collected.refreshSubtitleLinks();
                meter('识别结束', matched, groups.size);
                for (const sub of collected.unmatched) log('字幕未唯一关联，保留原状：' + sub.path);
                return await flow.inspect(context,collected);
            } catch (error) { stopMeter(); progress('识别失败：' + error.message); log('识别中断：' + error.message); flow.interrupt(); }
            finally { render(); }
        }
        const generatePreview = () => runTask(async () => {
            invalidate();
            meter('检查命名', 0, rows.filter(r => r.include).length);
            try {
                if (!rows.length) throw new Error('请先识别选中的视频');
                await flow.requireScope();
                const items = [], paths = new Map(), conflicts = new Set(), without = [];
                const included = rows.filter(r => r.include), sourceLists = cachedDriveChildren(source,new Map(),checkStopped); let checked = 0;
                const selectedLinks = readSubtitleLinks ? await readSubtitleLinks(sourceLists) : null;
                const states = flow.videoStates();
                const blocked = new Map();
                const noteBlocker = reason => blocked.set(reason,(blocked.get(reason) || 0) + 1);
                const planned = [];
                await batchStage(included,'元数据与文件名预览（视频组）',log,async (row,verify,index,observe) => {
                  try {
                    meter('检查命名', ++checked, included.length);
                    const state = states.get(String(row.node.id));
                    if (!state?.canOrganize) {
                        const reason = state?.blocker || '作品或字幕状态未确认';
                        noteBlocker(reason);
                        log('预览跳过：' + row.node.path + '；' + reason);
                        return 'skipped';
                    }
                    const fresh = selectedLinks || mediaSubtitleLinks(await sourceLists(row.node.parentId),row.node.parentId,history);
                    if (!flow.sameSubtitles(row,fresh.linked.get(String(row.node.id)) || []))
                        throw new Error('目录字幕已变化，请重新识别并检查：' + row.node.name);
                    if (!readyRow(row)) {
                        const reason = row.error || '作品匹配未确认'; noteBlocker(reason);
                        log('预览跳过：' + row.node.path + '；' + reason); return 'skipped';
                    }
                    Object.assign(row.node, await mediaFileMetadata(row.node, source));
                    row.subtitles = (fresh.linked.get(String(row.node.id)) || []).map(sub => ({...sub,
                        originalPath:sub.path ? '/' + [flow.context?.path,sub.path].filter(Boolean).join('/')
                            : row.node.originalPath?.replace(/[^/]+$/,() => sub.name),path:sub.path || sub.name}));
                    mediaRecords.remember(row);
                    for (const sub of row.subtitles) { verify(); Object.assign(sub, await mediaFileMetadata(sub, source)); }
                    const destination = mediaPath(row);
                    const group = [{ node: row.node, destination, videoId: row.node.id }];
                    for (const sub of row.subtitles) group.push({ node: sub, destination: mediaStem(destination) + sub.suffix + sub.name.slice(sub.name.lastIndexOf('.')), videoId: row.node.id });
                    planned[index] = group;
                  } catch (error) {
                    observe(error);
                    verify();
                    if (error.stop || error.phase === 'drive-auth' || [401,403].includes(error.status)) throw error;
                    noteBlocker(error.message);
                    log('预览跳过：' + row.node.path + '；' + error.message);
                    return 'failed';
                  }
                },checkStopped,8,'同组字幕依次读取');
                for (const item of planned.flat()) {
                        const pathKey = item.destination.normalize('NFKC').toLowerCase();
                        const previous = paths.get(pathKey);
                        if (previous && previous.node.id !== item.node.id) {
                            conflicts.add(previous.videoId); conflicts.add(item.videoId);
                            log('同名冲突，两组均跳过：' + item.destination);
                        }
                        paths.set(pathKey,item); items.push(item);
                }
                if (!items.length) {
                    const reasons = [...blocked].map(([reason,count]) => `${reason}（${count} 项）`).join('；');
                    throw new Error('当前没有可执行的整理项目'
                        + (reasons ? '。阻塞原因：' + reasons : '。请检查作品识别和字幕覆盖状态'));
                }
                const children = cachedDriveChildren(source, new Map(), checkStopped);
                let checkedPaths = 0; meter('检查目标路径', 0, items.length);
                await batchStage(items,'目标路径预检（文件）',log,async (item,verify) => {
                    let parentId = targetSession.parent;
                    let exactFolders = true;
                    const parts = relativeParts(item.destination);
                    for (let i = 0; i < parts.length; i++) {
                        verify();
                        const name = parts[i], nameKey = name.normalize('NFKC').toLowerCase();
                        const matches = (await children(parentId)).filter(node => node.name.normalize('NFKC').toLowerCase() === nameKey);
                        if (!matches.length) break;
                        const [match] = matches, leaf = i === parts.length - 1;
                        if (matches.length > 1 || (leaf ? match.directory || String(match.id) !== String(item.node.id) : !match.directory)) {
                            conflicts.add(item.videoId); log('目标同名冲突，视频及字幕已跳过：' + item.destination); break;
                        }
                        if (leaf) {
                            item.atDestination = exactFolders && match.name === name && item.node.name === name
                                && String(parentId) === String(item.node.parentId);
                        } else {
                            exactFolders &&= match.name === name;
                            parentId = match.id;
                        }
                    }
                    meter('检查目标路径', ++checkedPaths, items.length);
                    if (conflicts.has(item.videoId)) return 'failed';
                    if (item.atDestination) return 'skipped';
                },checkStopped,8,'共享目录列表合并读取，按完整预览判定冲突');
                for (const row of rows) if (conflicts.has(row.node.id)) row.error = '目标同名冲突，请修改名称或取消此项；本次已跳过';
                const accepted = items.filter(item => !conflicts.has(item.videoId));
                if (!accepted.length) throw new Error('所有已匹配项目存在同名冲突，请调整后重试');
                checkStopped();
                mediaRecords.save();
                const changes = accepted.filter(item => !item.atDestination);
                const changingVideos = new Set(changes.map(item => item.videoId));
                const unchanged = accepted.length - changes.length;
                const skipped = [...blocked.values()].reduce((total,count) => total + count,conflicts.size);
                const unchangedNote = unchanged ? '名称和位置已规范，略过 ' + unchanged + ' 个文件。' : '';
                const skippedNote = skipped ? '另有 ' + skipped + ' 个视频暂无法整理，原因见日志。' : '';
                const unmatchedNote = selectedLinks?.unmatched.length ? '未配对字幕，保留原位（' + selectedLinks.unmatched.length + ' 个）\n'
                    + selectedLinks.unmatched.map(sub => sub.path).join('\n') : '';
                if (unchangedNote) log(unchangedNote);
                if (unmatchedNote) log('未配对字幕，保留原位（' + selectedLinks.unmatched.length + ' 个），路径见整理预览。');
                if (!changes.length) {
                    await flow.requireScope();
                    const message = ['当前没有文件需要改名或移动。',unchangedNote,skippedNote].filter(Boolean).join(' ');
                    ui.get('mediaPreview').textContent = [message,unmatchedNote].filter(Boolean).join('\n\n');
                    ui.get('mediaPreviewPanel').open = true;
                    flow.previewShown();
                    meter('预览完成', items.length, items.length);
                    progress(message);
                    return;
                }
                const writer = mediaOrganizerWriter(targetSession, source, readSubtitleLinks);
                const plannedGroups = accepted.filter(item => changingVideos.has(item.videoId));
                const directoryPlans = await writer.prepare(plannedGroups,checkStopped,log); checkStopped();
                const directoryPreview = directoryPlans.map(plan => `文件夹整体改名/移动：${plan.folder.path || plan.folder.name}\n目标：/${[targetPath,plan.destination].filter(Boolean).join('/')}\n随文件夹保留并移动的内容（${plan.contents.length} 项）：\n${plan.contents.map(node => '  ' + node.path + (node.directory ? '/' : '')).join('\n')}`).join('\n\n');
                await flow.requireScope();
                for (const id of changingVideos) if (flow.coverage(String(id)) === 'missing') without.push(String(id));
                const note = without.length ? '允许无字幕整理（' + without.length + ' 个视频）\n' + changes.filter(item => String(item.node.id) === String(item.videoId) && without.includes(String(item.videoId))).map(item => item.node.originalPath || item.node.path).join('\n') : '';
                const filePreview = changes.map(item => `原：${item.node.originalPath || item.node.path}\n新：/${[targetPath, item.destination].filter(Boolean).join('/')}`).join('\n\n');
                const cleanupNote = changes.some(item => mediaStandardSeasonFolder(relativeParts(item.destination).at(-2)))
                    ? '整理后，搬空的剧集来源目录将移入回收站。' : '';
                previewRevision = history?.revision([...changingVideos]) || '';
                batch = changes; batchWriter = writer;
                ui.get('mediaPreview').textContent = [note,directoryPreview,directoryPreview ? '逐文件目标：\n' + filePreview : filePreview,unmatchedNote,cleanupNote].filter(Boolean).join('\n\n');
                ui.get('mediaPreviewPanel').open = true;
                flow.previewShown();
                meter('预览就绪', items.length, items.length);
                progress([`待整理 ${changes.length} 个文件（含字幕）。`,unchangedNote,skippedNote].filter(Boolean).join(' '));
            } catch (error) { stopMeter(); progress('无法生成预览：' + error.message); log('预览失败：' + error.message); }
            finally { render(); }
        }, true);
        const refreshStalePreview = () => {
            if (!batch || previewRevision === (history?.revision(batch.map(item => item.videoId)) || '')) return false;
            invalidate();
            ui.get('mediaPreview').textContent = '关联字幕已变化，请重新生成预览。';
            progress('关联字幕已变化，请重新生成预览后确认执行。');
            return true;
        };
        ui.get('previewMedia').onclick = generatePreview;
        ui.get('mediaAllowMissing').onchange = () => flow.invalidate('整理选项已更改');
        flow.invalidateMedia = invalidate;
        flow.openWork = group => {
            detail = {file:group[0],scrollTop:results.scrollTop,group};
            flow.showWork();
            results.scrollTop = 0;
            render();
            host.querySelector('#mediaBack')?.focus();
        };
        ui.get('runMedia').onclick = () => runTask(async () => {
            if (refreshStalePreview()) return;
            if (!batch) return;
            try { await flow.requireScope(); } catch (error) { progress(error.message); return; }
            if (!batch) return;

            const items = batch, writer = batchWriter; invalidate();
            meter('重命名文件', 0, items.length);
            let completed = 0, failed = 0, skipped = 0, interrupted = false;
            const failedVideos = new Set();
            const rowsById = new Map(rows.map(row => [row.node.id, row]));
            const organized = new Set(), uncertain = new Set();
            try { if (!writer) throw new Error('执行计划已失效，请重新生成预览'); checkStopped(); await writer.validate(log); }
            catch (error) { progress('无法执行：' + error.message); return; }
            const units = groupBatch(items,item => item.videoId);
            const groups = connectedBatch(units,unit => unit.flatMap(item => writer.executionKeys?.(item) || []));
            try { await batchStage(groups,'改名与移动（独立视频组）',log,async (group,verify,_index,observe) => {
              let outcome;
              for (const unit of group) for (const item of unit) {
                verify();
                progress(`重命名 ${completed + failed + skipped + 1}/${items.length}：${item.node.name}`);
                if (failedVideos.has(item.videoId)) { skipped++; log('视频未完成，字幕保留：' + item.node.path); meter('重命名文件',completed + failed + skipped,items.length); continue; }
                try {
                    log(item.destination + '：' + await writer.execute(item,verify));
                    completed++;
                    const row = rowsById.get(item.videoId);
                    if (row && !organized.has(String(item.videoId))) {
                        organized.add(String(item.videoId)); mediaRecords.remember(row); mediaRecords.save();
                    }
                }
                catch (error) { observe(error); outcome = 'failed'; failed++; uncertain.add(String(item.videoId)); if (item.node.id === item.videoId) failedVideos.add(item.videoId); log(item.node.path + '：未完成；' + error.message); if (error.stop || error.phase === 'drive-auth' || [401,403].includes(error.status)) throw error; }
                meter('重命名文件',completed + failed + skipped,items.length);
              }
              return outcome;
            },checkStopped,8,'同组先视频后字幕，共享移动目录和文件冲突顺序执行'); }
            catch (error) { interrupted = true; log('整理中断：' + error.message); }
            const processed = completed + failed + skipped;
            meter(failed || processed < items.length ? '处理结束（含未完成项）' : '整理完成',processed,items.length);

            let cleanup = '';
            if (completed && !interrupted) {
                try {
                    const count = await writer.recycleEmptySeasonSources(checkStopped,log);
                    if (count) cleanup = ' · 已回收空目录 ' + count;
                } catch (error) { cleanup = ' · 空目录待核对'; log('空目录清理中断：' + error.message); }
            }
            const message = `整理结束 · 已处理 ${processed}/${items.length} · 已整理 ${completed} · 跳过 ${skipped} · 失败 ${failed} · 未处理 ${items.length - processed} · 待核对 ${uncertain.size} 组${cleanup}`;
            progress(message);
            log(message);
            flow.finishOrganizing(organized,uncertain);
        }, true);
    }
