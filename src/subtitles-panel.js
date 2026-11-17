    function subtitleInventory(collected, parentPath = '') {
        return collected.videos.filter(node => !mediaBonusName(node.name)).map(node => {
            const parsed = parseMediaName(node.name, [...parentPath.split('/').filter(Boolean), ...node.folders]);
            const saved = mediaRecords.get(node);
            if (saved) {
                const filenameQuery = parsed.query;
                Object.assign(parsed, {query:saved.query, aliases:saved.aliases || [], year:saved.year, tv:saved.type === 'tv', season:saved.season ?? null, episode:saved.episode ?? null, endEpisode:saved.endEpisode ?? null, tmdbId:saved.match.split(':')[1], runtimeSeconds:saved.runtimeSeconds});
                // Repair old records which accidentally truncated a numeric title suffix.
                if (!parsed.tv && filenameQuery.startsWith(parsed.query) && /^\s*\d{4}$/.test(filenameQuery.slice(parsed.query.length))) parsed.query = filenameQuery;
            }
            const subtitles = collected.linked.get(node.id) || [];
            return { node, parsed, subtitles, inspected:false, complete:false, pendingVerification:false, path: '/' + [parentPath, node.path].filter(Boolean).join('/') };
        });
    }
    function subtitleCoverageState(row) {
        return row.complete ? 'complete' : row.pendingVerification ? 'pending' : row.inspected ? 'missing' : 'unchecked';
    }
    function subtitleSearchGroups(rows) {
        const groups = new Map();
        for (const row of rows) {
            const parsed = row.parsed;
            // A season runs sequentially so the first episode can establish shared caches.
            const key = parsed.tv ? JSON.stringify([parsed.tmdbId || '',titleKey(parsed.query),parsed.year || '',parsed.season]) : row;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        }
        return [...groups.values()];
    }
    function initSubtitles(provider = '123') {
        const ui = makePanel(provider + ' 字幕', `
            <p>选中视频或文件夹，先“检查目录字幕”查看哪些缺字幕，再查找、补齐到视频所在目录。</p>
            <div class="panel-actions"><button id="recheckSubtitles">检查目录字幕</button><button id="readSubtitles">查找字幕</button><button id="auditSubtitles" disabled>强制复查已有字幕</button><button id="fillSubtitles" disabled>补齐字幕</button><button id="stopSubtitles" hidden>停止</button></div>
            <p id="subtitleProgress" role="status">先在网页勾选视频或文件夹。</p>
            <progress id="subtitleMeter" max="1" value="0" hidden style="width:100%;accent-color:#666"></progress>
            <div id="subtitleCoverage" hidden class="sync-preview" style="white-space:pre-wrap" role="status"></div>
            <div id="subtitleSummary" hidden class="sync-preview"></div>
            <label>显示<select id="subtitleView"><option id="subtitleViewIncomplete" value="incomplete">未补齐</option><option id="subtitleViewChoice" value="choice">待选择</option><option id="subtitleViewPending" value="pending">待核验</option><option id="subtitleViewComplete" value="complete">已有字幕</option><option id="subtitleViewAll" value="all">全部</option></select></label>
            <p id="subtitleEmpty">先勾选目录或视频，再点击“检查目录字幕”。</p>
            <div id="subtitleRows"></div>
            <div class="panel-actions"><button id="searchSubtitles" disabled>重搜未完成项</button><button id="reviewSubtitleDeletes" disabled>预览删除清单</button><button id="copyMissingSubtitles" disabled>复制未补齐路径</button><button id="copySubtitleReport" disabled>复制完整报告</button></div>
            <details id="subtitleDeletePreview" hidden><summary>确认删除清单</summary><div id="subtitleDeleteList" style="white-space:pre-wrap"></div><div class="panel-actions"><button id="confirmSubtitleDeletes">确认并移入回收站</button><button id="cancelSubtitleDeletes">取消</button></div></details>
            <details id="subtitleSettings"><summary>字幕来源与设置</summary>
            <label><input id="useThunder" type="checkbox" checked>迅雷 · 按片名搜索（免 Key，免费）</label>
            <label><input id="useSubdl" type="checkbox">SubDL（需个人 API Key，可选）</label>
            <label><span class="credential-head"><span>SubDL API Key</span><a href="https://subdl.com/api-doc" target="_blank" rel="noopener noreferrer">官网 API 说明 ↗</a></span><input id="subdlKey" type="password" autocomplete="off"></label>
            <p>可直接下载字幕；ZIP 只提取通过核验的文本字幕，不支持 RAR。</p>
            <label><input id="useAssrt" type="checkbox" checked>Assrt · 按片名搜索（需 Token）</label>
            <label><span class="credential-head"><span>Assrt API Token</span><a href="https://assrt.net/api/user/token" target="_blank" rel="noopener noreferrer">获取 Token ↗</a></span><input id="assrtToken" type="password" autocomplete="off"></label>
            <p>电影按片名搜索；剧集先查季集、再查片名。需要 Token。</p>
            <details id="openSubtitlesSettings"><summary>OpenSubtitles · 可选</summary>
            <label><input id="useOpenSubtitles" type="checkbox">启用 OpenSubtitles（需 API Key）</label>
            <label><span class="credential-head"><span>OpenSubtitles API Key</span><a href="https://www.opensubtitles.com/en/consumers" target="_blank" rel="noopener noreferrer">获取 API ↗</a></span><input id="openSubtitlesKey" type="password" autocomplete="off"></label>
            <p>在官网创建 API Consumer 并复制 API Key。</p>
            <details id="subtitleAccountSettings"><summary>账号登录（提高下载配额）</summary><label>用户名<input id="subtitleUsername" autocomplete="off"></label><label>密码<input id="subtitlePassword" type="password" autocomplete="off"></label><button id="loginSubtitles">登录</button><p id="subtitleLoginState">密码不保存；令牌仅当前页面有效。</p></details>
            </details>
            <label>字幕语言<select id="subtitleLanguage"><option value="zh-cn,zh-tw,zh">中文（简体 / 繁体）</option><option value="zh-cn">简体中文</option><option value="zh-tw">繁体中文</option><option value="en">英文</option></select></label>
            <p>中文优先双语、简体，再繁体；也可手动指定。</p>
            <div class="panel-actions"><button id="saveSubtitleSettings">保存设置</button><button id="forgetSubtitleKey">清除凭证</button></div>
            </details>
            <details id="subtitleDiagnostics"><summary>字幕运行日志</summary><div class="panel-actions"><button id="copySubtitleLog">复制日志</button><button id="clearSubtitleLog">清空日志</button></div><textarea id="subtitleLog" readonly rows="8" spellcheck="false" aria-label="字幕运行日志" style="width:100%;font:14px/1.7 Consolas,monospace;resize:vertical"></textarea></details>
            <p>缺字幕指未发现符合当前语言要求的可用外置文本字幕；读取失败、疑似错片或上传结果未确认的单列为“待核验”，不当作确定缺失。只检查最近一次勾选的范围及其子目录，不检测视频内嵌字幕。“已有/已补齐”表示通过基础检查，不代表作品或音画同步已确认。强制复查跳过缓存；启用 AI 时会发送少量对白片段辅助判断作品。</p>
`, 'subtitle');
        ui.moveSettings(['subtitleSettings']);
        let inventory = [], drive = null, subtitleContext = null, deletePlan = null, busy = false, cancelled = false, reviewCandidates = null, scope = '';
        const deleteSelection = new Set();
        ui.get('subtitleView').value = 'incomplete';
        const service = createSubtitleService({check:() => check(), log:(event, detail) => diag(event, detail)});
        const prefs = GM_getValue('cross-drive-subtitle-settings', {});
        ui.get('openSubtitlesKey').value = prefs.key || '';
        ui.get('useOpenSubtitles').checked = prefs.open === true;
        ui.get('useAssrt').checked = prefs.assrt !== false;
        ui.get('useThunder').checked = prefs.thunder !== false;
        ui.get('useSubdl').checked = prefs.subdl === true;
        ui.get('subdlKey').value = prefs.subdlKey || '';
        ui.get('assrtToken').value = prefs.assrtToken || '';
        ui.get('subtitleLanguage').value = prefs.language || 'zh-cn,zh-tw,zh';
        const settings = () => ({key:ui.get('openSubtitlesKey').value.trim(), language:ui.get('subtitleLanguage').value, open:ui.get('useOpenSubtitles').checked, assrt:ui.get('useAssrt').checked, thunder:ui.get('useThunder').checked, assrtToken:ui.get('assrtToken').value.trim(), subdl:ui.get('useSubdl').checked, subdlKey:ui.get('subdlKey').value.trim()});
        const status = text => { ui.get('subtitleProgress').textContent = text; };
        const clearDeletePreview = () => { deletePlan = null; const preview = ui.get('subtitleDeletePreview'); preview.hidden = true; preview.open = false; ui.get('subtitleDeleteList').textContent = ''; };
        const logLines = [];
        const diag = (event, detail = '') => {
            const config = settings();
            let message = String(detail ?? '').replace(/https?:\/\/[^\s"'<>]+/gi, value => {
                try { return new URL(value).origin + '/[地址已隐藏]'; } catch { return '[地址已隐藏]'; }
            });
            for (const secret of [config.key, config.assrtToken, config.subdlKey]) if (secret) message = message.split(secret).join('[凭证已隐藏]');
            message = message.replace(/(token|api[-_ ]?key|authorization|signature|security[-_ ]?token)=?[^\s&,;]*/gi, '$1=[已隐藏]').replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]');
            const line = `${new Date().toLocaleTimeString()} [${event}]${message ? ' ' + message : ''}`;
            const box = ui.get('subtitleLog');
            logLines.push(line);
            if (logLines.length > 2000) logLines.shift();
            box.value = logLines.join('\n');
            box.scrollTop = box.scrollHeight;
        };
        const check = () => { if (cancelled) throw new Error('已停止'); };
        const configuredAI = () => {
            const config = GM_getValue('cross-drive-media-ai', {}) || {};
            if (!config.enabled || !config.base || !config.model) return null;
            try { mediaAIEndpoint(config); return createMediaAI(config); }
            catch (error) { diag('AI 设置', '设置无效，跳过 AI：' + error.message); return null; }
        };
        const meter = (done, total) => { const bar = ui.get('subtitleMeter'); bar.hidden = false; bar.max = total || 1; bar.value = done; };
        const render = (resetGroups = false) => {
            const missing = inventory.filter(row => !row.complete), searchable = missing.filter(row => !row.pendingVerification), ready = searchable.filter(row => row.selectedCandidate);
            const coverage = {complete:0,missing:0,pending:0,unchecked:0};
            for (const row of inventory) coverage[subtitleCoverageState(row)]++;
            const view = ui.get('subtitleView').value;
            const choices = inventory.filter(row => subtitleSearchState(row) === 'choice').length;
            ui.get('subtitleCoverage').hidden = !inventory.length;
            ui.get('subtitleCoverage').textContent = `检查范围：${scope}（最近一次勾选范围及其子目录）\n视频 ${inventory.length} · 已有可用字幕 ${coverage.complete} · 缺字幕 ${coverage.missing} · 待核验 ${coverage.pending}` + (coverage.unchecked ? ` · 尚未检查 ${coverage.unchecked}` : '');
            for (const [id,label,count] of [['Incomplete','未补齐',missing.length],['Choice','待选择',choices],['Pending','待核验',coverage.pending],['Complete','已有字幕',coverage.complete],['All','全部',inventory.length]]) ui.get('subtitleView' + id).textContent = `${label}（${count}）`;
            ui.get('subtitleSummary').hidden = !inventory.some(row => row.sources?.length);
            ui.get('subtitleSummary').textContent = subtitleSearchSummary(inventory);
            ui.get('copySubtitleReport').disabled = busy || !inventory.length;
            ui.get('reviewSubtitleDeletes').disabled = busy || !inventory.some(row => row.subtitles.some(sub => deleteSelection.has(String(sub.id))));
            ui.get('confirmSubtitleDeletes').disabled = busy || !deletePlan?.length;
            ui.get('cancelSubtitleDeletes').disabled = busy;
            ui.get('searchSubtitles').disabled = busy || !searchable.length;
            ui.get('copyMissingSubtitles').disabled = busy || !missing.length;
            ui.get('recheckSubtitles').disabled = busy;
            ui.get('auditSubtitles').disabled = busy || !inventory.some(row => row.subtitles.length);
            ui.get('fillSubtitles').disabled = busy || !ready.length;
            const host = ui.get('subtitleRows'), expanded = new Map([...host.querySelectorAll('details')].map(box => [box.dataset.group,box.open]));
            host.replaceChildren();
            const groups = new Map();
            for (const row of inventory) {
                const key = JSON.stringify([row.node.folders, row.parsed.query, row.parsed.year, row.parsed.season]);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(row);
            }
            let visible = 0;
            for (const [key, rows] of groups) {
                const shown = rows.filter(row => view === 'all' || (view === 'incomplete' ? !row.complete : view === 'choice' ? subtitleSearchState(row) === 'choice' : subtitleCoverageState(row) === view));
                if (!shown.length) continue;
                visible += shown.length;
                const box = document.createElement('details'); box.className = 'sync-item'; box.dataset.group = key;
                box.open = !resetGroups && expanded.has(key) ? expanded.get(key) : false;
                const summary = document.createElement('summary'), first = rows[0];
                const counts = [['ready','可补齐'],['pending','待核验'],['choice','待选择'],['missing','未找到'],['failed','失败']]
                    .map(([state,label]) => { const count = rows.filter(row => subtitleSearchState(row) === state).length; return count ? `${label} ${count}` : ''; }).filter(Boolean);
                summary.textContent = `${first.parsed.query || first.node.name}${first.parsed.season != null ? ' · 第 ' + first.parsed.season + ' 季' : ''} · 待补齐 ${rows.filter(row => !row.complete).length}/${rows.length}` + (counts.length ? ' · ' + counts.join(' · ') : '');
                box.append(summary);
                for (const row of shown) {
                    const text = document.createElement('p'); text.style.whiteSpace = 'pre-wrap';
                    const state = subtitleCoverageState(row), searchState = subtitleSearchState(row);
                    const label = state === 'missing' ? '缺字幕 · ' + ({ready:'可补齐',choice:'待选择',missing:'未找到',failed:'失败',unsearched:'未查询'})[searchState] : ({complete:'已有字幕',pending:'待核验',unchecked:'尚未检查'})[state];
                    text.textContent = `${label}：${row.node.name}\n${row.path}\n${row.error || row.searchMessage || '尚未搜索字幕'}`; box.append(text);
                    for (const sub of row.subtitles) {
                        const line = document.createElement('label'), checkbox = document.createElement('input'), name = document.createElement('span');
                        checkbox.type = 'checkbox'; checkbox.checked = deleteSelection.has(String(sub.id)); checkbox.disabled = busy;
                        name.textContent = '移入回收站：' + sub.name;
                        checkbox.onchange = () => { if (checkbox.checked) deleteSelection.add(String(sub.id)); else deleteSelection.delete(String(sub.id)); clearDeletePreview(); render(); };
                        line.append(checkbox, name); box.append(line);
                    }
                    if (row.complete || row.pendingVerification) continue;
                    const select = document.createElement('select'); select.disabled = busy;
                    const blank = document.createElement('option'); blank.value = ''; blank.textContent = '跳过此视频 / 请选择字幕'; select.append(blank);
                    (row.candidates || []).forEach((candidate, index) => {
                        const option = document.createElement('option'); option.value = String(index);
                        option.textContent = subtitleCandidateLabel(candidate);
                        option.title = option.textContent;
                        select.append(option);
                    });
                    select.value = row.selectedCandidate ? String(row.candidates.indexOf(row.selectedCandidate)) : '';
                    select.onchange = () => { row.selectedCandidate = select.value === '' ? null : row.candidates[Number(select.value)]; row.error = ''; row.manualCandidate = true; row.aiSuggested = false; row.searchMessage = subtitleSearchMessage(row); diag('手动选择', `${row.node.name} · ${row.selectedCandidate ? row.selectedCandidate.source + ' · ' + (row.selectedCandidate.name || row.selectedCandidate.release) : '跳过此视频'}`); render(); };
                    box.append(select);
                }
                host.append(box);
            }
            ui.get('subtitleEmpty').hidden = visible > 0;
            ui.get('subtitleEmpty').textContent = !inventory.length ? '本次检查没有视频，或尚未检查。请勾选目录或视频，再点击“检查目录字幕”。' : view === 'incomplete' && !missing.length ? '所选范围内的视频均已有可用外置字幕。' : view === 'choice' ? '没有待选择项。缺字幕但未找到候选的视频，请切换到“未补齐”查看。' : '当前筛选下没有视频。';
        };
        const lock = value => {
            busy = value; ui.busy(value);
            for (const id of ['readSubtitles','recheckSubtitles','auditSubtitles','reviewSubtitleDeletes','confirmSubtitleDeletes','cancelSubtitleDeletes','saveSubtitleSettings','forgetSubtitleKey','loginSubtitles','openSubtitlesKey','subtitleUsername','subtitlePassword','useOpenSubtitles','useAssrt','useThunder','assrtToken','subtitleLanguage','useSubdl','subdlKey']) ui.get(id).disabled = value;
            ui.get('stopSubtitles').hidden = !value; ui.get('stopSubtitles').disabled = !value; render();
        };
        const searchRows = async rows => {
            rows = rows.filter(row => !row.complete && !row.pendingVerification);
            if (!rows.length) return;
            const config = settings();
            if (!config.thunder && !(config.assrt && config.assrtToken) && !(config.open && config.key) && !(config.subdl && config.subdlKey)) { ui.openSettings('subtitleSettings'); status('请启用迅雷免 Key 搜索，或配置其他字幕来源。'); return; }
            diag('查找开始', `视频 ${rows.length}，语言 ${config.language}，启用来源：${[config.assrt && 'Assrt', config.thunder && '迅雷', config.subdl && 'SubDL', config.open && config.key && 'OpenSubtitles'].filter(Boolean).join('、') || '无'}`);
            if (!config.assrt) diag('来源跳过', 'Assrt 已关闭');
            if (!config.thunder) diag('来源跳过', '迅雷 已关闭');
            if (!config.open) diag('来源跳过', 'OpenSubtitles 已关闭');
            else if (!config.key) diag('来源跳过', 'OpenSubtitles 未配置 API Key');
            cancelled = false; lock(true); let done = 0;
            const ai = configuredAI();
            service.resetSearchBatch?.();
            reviewCandidates = ai ? createSubtitleReviewer(ai, config.language, diag, check) : null;
            config.reviewCandidates = reviewCandidates;
            diag('查找策略', `剧集先按季搜索并建立文件索引；缺集再搜索迅雷、SubDL、Assrt、OpenSubtitles；${ai ? '名称有歧义时交给 AI 判断' : 'AI 未启用，使用严格片名匹配'}；来源限流后本批跳过该来源`);
            try {
                drive.assertReady?.();
                diag('并发策略', '搜索最多同时处理 2 组作品，同一季逐集复用缓存；各来源继续独立限速');
                await forEachConcurrent(subtitleSearchGroups(rows), 2, async (group, verify) => {
                  for (const row of group) {
                    const check = verify;
                    if (!row.parsed.workResolved) {
                        status('读取作品资料：' + row.node.name);
                        const credential = GM_getValue('cross-drive-tmdb-key', ''), aliasStarted = Date.now();
                        try {
                            const parsed = row.parsed;
                            if (await resolveMediaWork(parsed,credential,check,diag)) {
                                mediaRecords.rememberParsed?.(row.node,parsed); mediaRecords.save?.();
                                diag('作品别名', `已复用或确认作品资料，取得 ${parsed.aliases.length} 个片名用于搜索`);
                            }
                        } catch (error) { check(); if (error.stop) throw error; diag('作品别名', '读取失败，继续按原片名严格匹配：' + error.message); }
                        finally { diag('别名耗时', `${row.node.name} · ${((Date.now() - aliasStarted) / 1000).toFixed(1)} 秒`); }
                    }
                  }
                  verify();
                  if (group[0]?.parsed.tv) { status('查找整季字幕：' + group[0].parsed.query); await service.prepareSeason?.(group,config,verify); }
                  for (const row of group) {
                    const check = verify;
                    const started = Date.now();
                    check(); status(`查找字幕 ${done + 1}/${rows.length}：${row.node.name}`);
                    diag('源文件', row.node.name);
                    diag('作品解析', `片名：${row.parsed.query || '空'} · 年份：${row.parsed.year || '未知'} · 类型：${row.parsed.tv ? '剧集' : '电影/特别篇'} · 季：${row.parsed.season ?? '未知'} · 集：${row.parsed.episode ?? '未知'} · TMDB：${row.parsed.tmdbId || '无记录'}`);
                    diag('作品别名', row.parsed.aliases?.length ? row.parsed.aliases.join('；') : '无');
                    await searchSubtitleSources(row, config, service, drive, diag, check);
                    if (!row.selectedCandidate && row.candidates.length) diag('待选样例', row.candidates.slice(0, 8).map(candidate => subtitleCandidateLabel(candidate) + (candidate.matchReason ? '' : ' · 待确认：未满足自动选择条件')).join('；'));
                    diag('视频结果', `${row.node.name} · ${row.selectedCandidate ? (row.aiSuggested ? 'AI 建议 ' : '自动选择 ') + subtitleCandidateLabel(row.selectedCandidate) : row.candidates.length ? '有候选待手选' : row.sources.some(source => source.error) ? '查询失败' : '未找到'}`);
                    diag('单片耗时', `${row.node.name} · ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
                    meter(++done, rows.length); render();
                  }
                }, check);
                status('查找结束：' + subtitleSearchSummary(inventory) + '。展开作品可查看每个来源的结果。'); diag('查找结束', subtitleSearchSummary(inventory));
            } catch (error) { render(); status(error.message); diag(cancelled ? '已停止' : '查找中断', error.message); }
            finally { lock(false); }
        };
        const readSubtitles = async (searchAfter = true, force = false) => {
            diag('检查开始', force ? '强制复查已有字幕：跳过缓存，重读正文' : '读取当前选中的视频与已有字幕');
            cancelled = false; inventory = []; drive = null; subtitleContext = null; deleteSelection.clear(); clearDeletePreview(); scope = ''; ui.get('subtitleView').value = force ? 'all' : 'incomplete'; lock(true);
            try {
                const context = subtitleContext = await mediaContext(provider); check(); drive = subtitleDrive(context);
                const collected = await collectMediaSelection(context.selected, context.source, status, () => false, check, false); check();
                await forEachConcurrent(collected.videos, 3, async (node, check) => {
                    try { await mediaRecords.restore?.(node, context.source, check); }
                    catch (error) { check(); if (error.stop || error.phase === 'drive-auth') throw error; diag('识别记录', `${node.name} · 元数据读取失败：${error.message}`); }
                }, check);
                inventory = subtitleInventory(collected, context.path);
                scope = '/' + (context.path || '').replace(/^\/+|\/+$/g, '') + ` · 勾选 ${context.selected.length} 项：` + context.selected.slice(0,3).map(node => node.name).join('、') + (context.selected.length > 3 ? '…' : '');
                render();
                const linkedSubtitleGroups = [...collected.linked.values()].filter(subtitles => subtitles.length).length;
                diag('检查完成', `视频 ${inventory.length}，已关联字幕 ${linkedSubtitleGroups} 组`);
                for (const row of inventory) {
                    if (mediaRecords.explain) diag('识别记录', `${row.node.name} · ${mediaRecords.explain(row.node)}`);
                    const names = row.subtitles.map(sub => sub.name);
                    diag('现有字幕', `${row.node.name} · ${names.length ? names.join('、') : '未发现字幕文件'} · ${row.complete ? '文件名语言标记匹配' : '尚未确认语言'}`);
                }
                const ai = force ? configuredAI() : null;
                const review = ai ? createSubtitleBodyReviewer(ai, diag, check) : null;
                if (force) diag('复查范围', ai ? '格式、语言、已有时长参考及 AI 对白证据；不核对音画同步' : 'AI 未启用，仅检查格式、语言、已有时长参考；作品归属和音画同步未确认');
                let done = 0;
                diag('并发策略', '目录检查最多同时处理 3 个视频；上传、写入及内容核验仍顺序执行');
                await forEachConcurrent(inventory, 3, async (row, check) => {
                    check();
                    status(`检查目录字幕 ${done + 1}/${inventory.length}：${row.node.name}`);
                    try {
                        const recovered = await drive.reconcile(row, phase => diag('上传对账', `${row.node.name} · ${phase}`), check);
                        check();
                        for (const sub of recovered) if (!row.subtitles.some(existing => existing.id === sub.id)) row.subtitles.push(sub);
                        await inspectExistingSubtitles(row, drive, settings().language, diag, check, {force, review});
                    } catch (error) { check(); if (error.stop || error.phase === 'drive-auth') throw error; if (!row.complete) { row.pendingVerification = true; row.error = error.message; } diag('上传待核验', `${row.node.name} · ${error.message}`); }
                    check();
                    row.inspected = true;
                    meter(++done, inventory.length); render();
                }, check);
                status(inventory.length ? '已检查选中范围。' : '选中范围没有正片视频。'); diag('字幕检查', inventory.length ? `完成，已有字幕确认 ${inventory.filter(row => row.complete).length}/${inventory.length}` : '选中范围没有正片视频');
            } catch (error) { inventory = []; drive = null; status('检查结束：' + error.message); diag('检查失败', error.message); }
            finally { lock(false); }
            if (searchAfter && !cancelled) await searchRows(inventory);
        };
        ui.get('readSubtitles').onclick = () => readSubtitles();
        ui.get('recheckSubtitles').onclick = () => readSubtitles(false);
        ui.get('auditSubtitles').onclick = () => readSubtitles(false, true);
        ui.get('reviewSubtitleDeletes').onclick = () => {
            deletePlan = inventory.flatMap(row => row.subtitles.filter(sub => deleteSelection.has(String(sub.id))).map(sub => ({row,sub})));
            if (!deletePlan.length) return;
            ui.get('subtitleDeleteList').textContent = deletePlan.map(({row,sub}) => `${row.path.slice(0,row.path.lastIndexOf('/') + 1)}${sub.name}`).join('\n');
            const preview = ui.get('subtitleDeletePreview'); preview.hidden = false; preview.open = true; render();
        };
        ui.get('cancelSubtitleDeletes').onclick = clearDeletePreview;
        ui.get('confirmSubtitleDeletes').onclick = async () => {
            if (!deletePlan?.length || !subtitleContext || !drive) return;
            const targets = [...deletePlan]; clearDeletePreview(); cancelled = false; lock(true);
            let deleted = 0; const touched = new Set(), failures = [];
            try {
                drive.assertReady?.();
                for (const {row,sub} of targets) {
                    check(); status(`删除字幕 ${deleted + failures.length + 1}/${targets.length}：${sub.name}`);
                    try {
                        const siblings = await subtitleContext.source.children({id:row.node.parentId}); check();
                        const current = siblings.find(node => String(node.id) === String(sub.id));
                        const video = siblings.find(node => String(node.id) === String(row.node.id));
                        const sameFile = (now, before) => now && !now.directory && String(now.id) === String(before.id) && now.name === before.name && now.size === before.size && String(now.md5 || '').toLowerCase() === String(before.md5 || '').toLowerCase();
                        const linkedVideos = current && siblings.filter(node => !node.directory && MEDIA_VIDEO.test(node.name) && mediaSubtitleSuffix(node.name,current.name) !== null);
                        if (!sameFile(current,sub) || !sameFile(video,row.node) || linkedVideos.length !== 1 || String(linkedVideos[0].id) !== String(row.node.id) || !MEDIA_SUB.test(current.name))
                            throw new Error('字幕或关联视频已变化，未删除；请重新检查目录');
                        await recycleMedia({...current,parentId:row.node.parentId},subtitleContext.session,subtitleContext.source); check();
                        try { drive.verified?.forget(sub); } catch (error) { diag('核验缓存清理失败', `${sub.name} · ${error.message}`); }
                        row.subtitles = row.subtitles.filter(item => String(item.id) !== String(sub.id)); deleteSelection.delete(String(sub.id)); touched.add(row); deleted++;
                        diag('字幕已删除', `${row.node.name} · ${sub.name} · 已移入回收站`);
                    } catch (error) {
                        check();
                        if (error.stop || [401,403].includes(error.status)) throw error;
                        failures.push(`${sub.name}：${error.message}`); diag('字幕删除失败', `${row.node.name} · ${sub.name} · ${error.message}`);
                        if (error.pending) { deleteSelection.delete(String(sub.id)); row.pendingVerification = true; row.complete = false; row.error = '字幕删除结果待确认，请重新检查目录：' + error.message; touched.add(row); }
                    }
                }
                for (const row of touched) { check(); await inspectExistingSubtitles(row,drive,settings().language,(event,detail)=>diag(event,`${row.node.name} · ${detail}`),check); row.inspected = true; }
                render();
                status(`批量删除结束：已移入回收站 ${deleted} 个，失败 ${failures.length} 个。` + (failures.length ? ` ${failures.slice(0,5).join('；')}` : ''));
            } catch (error) { render(); status(`删除中断：已移入回收站 ${deleted} 个；${error.message}`); }
            finally { lock(false); }
        };
        ui.get('fillSubtitles').onclick = async () => {
            const rows = inventory.filter(row => !row.complete && !row.pendingVerification && row.selectedCandidate), config = settings();
            config.reviewCandidates = reviewCandidates;
            cancelled = false; lock(true); let done = 0, failed = 0, pending = 0;
            service.resetDownloadBatch?.();
            try {
                drive.assertReady?.();
                for (const row of rows) {
                    check(); row.error = '';
                    try {
                        status(`下载字幕 ${done + failed + pending + 1}/${rows.length}：${row.node.name}`);
                        const candidates = row.manualCandidate ? [row.selectedCandidate] : [row.selectedCandidate, ...(row.autoCandidates || []).filter(item => item !== row.selectedCandidate)];
                        diag('下载开始', `${row.node.name} · ${candidates.length} 个候选`);
                        let payload = null; const failures = [], attempted = new Set();
                        while (candidates.length || !row.manualCandidate && row.sources.some(source => source.deferred)) {
                            if (!candidates.length) {
                                diag('来源补查', `${row.node.name} · 已有候选下载失败，查询此前暂缓的来源`);
                                await searchSubtitleSources(row, config, service, drive, diag, check, true);
                                candidates.push(...row.autoCandidates.filter(candidate => !attempted.has(candidate)));
                                if (!candidates.length) break;
                            }
                            const candidate = candidates.shift();
                            attempted.add(candidate);
                            if (candidate.source === 'Assrt' && service.assrtDownloadUnavailable?.()) { candidate.downloadFailed = true; diag('候选跳过', `${row.node.name} · Assrt 下载已熔断`); continue; }
                            check();
                            try {
                                diag('候选下载', `${row.node.name} · ${subtitleCandidateLabel(candidate)} 开始`);
                                const {result, bytes} = await service.fetchFile(candidate, config, (phase, message) => diag(phase, `${row.node.name} · ${message}`), check); check();
                                const {text, ...verification} = subtitleValidateContent(row, bytes, result.ext, config.language, diag);
                                diag('正文校验', `${row.node.name} · ${candidate.source} 通过，${bytes.length} 字节，${result.ext.toUpperCase()}`);
                                payload = {candidate, result, bytes, verification}; break;
                            } catch (error) {
                                candidate.downloadFailed = true;
                                check(); if (error.stop) throw error; failures.push(candidate.source + ' · ' + (candidate.name || candidate.release) + '：' + error.message);
                                diag('候选失败', `${row.node.name} · ${candidate.source}：${error.message}`);
                                if (error.status === 493 && candidate.source === 'Assrt') candidates.sort((a,b) => Number(a.source === 'Assrt' && a.assrtId === candidate.assrtId) - Number(b.source === 'Assrt' && b.assrtId === candidate.assrtId));
                            }
                        }
                        if (!payload) throw new Error('候选均未通过下载/正文检查：' + failures.join('；'));
                        const {candidate, result, bytes, verification} = payload;
                        const language = candidate.language || (config.language === 'en' ? 'en' : 'zh');
                        const name = mediaStem(row.node.name) + '.' + language.replace(/[^a-z0-9-]/gi, '') + '.' + result.ext;
                        const target = await drive.save(row, name, bytes, phase => { status(phase + '：' + row.node.name); diag('网盘写入', `${row.node.name} · ${phase}`); }, check);
                        row.subtitles.push(target); row.complete = true; row.verification = verification; row.searchMessage = '已补齐，上传内容一致：' + name + ' · ' + subtitleVerificationMessage(verification); done++;
                        diag('补齐成功', `${row.node.name} · 已核验 ${name}`);
                    } catch (error) {
                        if (error.assrtCooldown) { row.searchMessage = error.message + '；冷却后可继续补齐'; diag('下载暂停', `${row.node.name}：${error.message}`); throw error; }
                        row.error = error.message;
                        if (error.pendingUpload) { row.pendingVerification = true; pending++; }
                        diag(cancelled ? '已停止' : error.pendingUpload ? '上传待核验' : '补齐失败', `${row.node.name}：${error.message}`);
                        if (cancelled) throw error;
                        if (!error.pendingUpload) failed++;
                        if (error.stop) throw error;
                    }
                    meter(done + failed + pending, rows.length); render();
                }
                status(`补齐结束：已核验 ${done}，待核验 ${pending}，失败 ${failed}。待核验项请先点击“检查目录字幕”；同名不同内容不会覆盖。`); diag('补齐结束', `已核验 ${done}，待核验 ${pending}，失败 ${failed}`);
            } catch (error) { render(); status(`已中断：已核验 ${done}，待核验 ${pending}，失败 ${failed}；${error.message}`); diag('补齐中断', error.message); }
            finally { lock(false); }
        };
        ui.get('searchSubtitles').onclick = () => searchRows(inventory.filter(row => !row.complete));
        ui.get('stopSubtitles').onclick = () => { cancelled = true; ui.get('stopSubtitles').disabled = true; status('等待当前请求结束后停止…'); };
        ui.get('clearSubtitleLog').onclick = () => { logLines.length = 0; ui.get('subtitleLog').value = ''; diag('日志', '已清空'); };
        ui.get('subtitleView').onchange = () => render(true);
        ui.get('openSubtitlesKey').onchange = () => { service.logout(); ui.get('subtitleLoginState').textContent = '未登录'; };
        ui.get('subtitleLanguage').onchange = () => { inventory = []; drive = null; render(); status('语言已更改，请重新查找。'); };
        ui.get('saveSubtitleSettings').onclick = () => { GM_setValue('cross-drive-subtitle-settings', settings()); status('设置已保存。'); };
        ui.get('forgetSubtitleKey').onclick = () => {
            const currentDrive = drive || subtitleDrive({session:provider === '光鸭' ? {provider,token:capture.token} : recover123Session(),source:{}});
            currentDrive.verified?.clear();
            ui.get('openSubtitlesKey').value = ''; ui.get('assrtToken').value = ''; ui.get('subdlKey').value = ''; ui.get('subtitlePassword').value = ''; service.logout(); ui.get('subtitleLoginState').textContent = '未登录'; GM_setValue('cross-drive-subtitle-settings', settings()); status('已清除凭证和当前账号的字幕核验记录。');
        };
        ui.get('loginSubtitles').onclick = async () => {
            lock(true);
            try { await service.login(ui.get('subtitleUsername').value.trim(), ui.get('subtitlePassword').value, settings()); ui.get('subtitleLoginState').textContent = '已登录（仅本页有效）'; status('登录成功。'); }
            catch (error) { status('登录失败：' + error.message); }
            finally { ui.get('subtitlePassword').value = ''; lock(false); }
        };
        ui.get('copySubtitleReport').onclick = async () => {
            const report = ui.get('subtitleCoverage').textContent + '\n' + subtitleSearchSummary(inventory) + '\n\n' + inventory.map(row => row.path + '\n' + (row.error || row.searchMessage || '未查询')).join('\n\n');
            try { await navigator.clipboard.writeText(report); status('查询结果已复制，不包含密钥和下载地址。'); }
            catch (error) { status('复制失败：' + error.message); }
        };
        ui.get('copySubtitleLog').onclick = async () => {
            try { await navigator.clipboard.writeText(ui.get('subtitleLog').value || '（暂无字幕运行日志）'); status('字幕运行日志已复制。'); }
            catch (error) { status('复制日志失败：' + error.message); }
        };
        ui.get('copyMissingSubtitles').onclick = async () => {
            try { const rows = inventory.filter(row => !row.complete); await navigator.clipboard.writeText(rows.map(row => row.path).join('\n')); status(`已复制未补齐路径 ${rows.length} 条；待核验项也包含在内，不代表已确认缺失。`); }
            catch (error) { status('复制失败：' + error.message); }
        };
    }
