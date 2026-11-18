    function subtitleInventory(collected, parentPath = '') {
        return collected.videos.filter(node => !mediaBonusName(node.name)).map(node => {
            const row = {node, subtitles:[...(collected.linked.get(node.id) || [])], complete:false,
                path:'/' + [parentPath, node.path].filter(Boolean).join('/')};
            subtitleRowIdentity(row, parentPath);
            return row;
        });
    }
    function subtitleRowIdentity(row, parentPath) {
        const {node} = row;
        const parsed = parseMediaName(node.name, [...parentPath.split('/').filter(Boolean), ...node.folders]);
        const saved = mediaRecords.get(node);
        if (saved) {
            const filenameQuery = parsed.query;
            Object.assign(parsed, {query:saved.query, aliases:saved.aliases || [], year:saved.year, tv:saved.type === 'tv', season:saved.season ?? null, episode:saved.episode ?? null, endEpisode:saved.endEpisode ?? null, tmdbId:saved.match.split(':')[1], runtimeSeconds:saved.runtimeSeconds});
            // Repair old records which accidentally truncated a numeric title suffix.
            if (!parsed.tv && filenameQuery.startsWith(parsed.query) && /^\s*\d{4}$/.test(filenameQuery.slice(parsed.query.length))) parsed.query = filenameQuery;
        }
        const editions = [...node.name.normalize('NFKC').matchAll(/\b(?:2160p|1080p|720p|480p|4k|8k|blu[ ._-]?ray|bdrip|web[ ._-]?(?:dl|rip|edition|version)|remux|hdtv|dvd(?:rip)?|director['’]?s[ ._-]*cut|extended(?:[ ._-]*cut)?|theatrical(?:[ ._-]*cut)?)\b|导演剪辑|導演剪輯|加长版|加長版|未删减|未刪減|剧场版|劇場版|网络版|網絡版|特别篇|特別篇/gi)]
            .map(match => match[0].toLowerCase().replace(/[ .'’_-]/g, ''));
        // Keep the scan's grouping stable when a later search enriches the parsed work identity.
        row.groupKey = JSON.stringify([node.parentId, node.folders, parsed.query, parsed.year, parsed.season, parsed.tmdbId, [...new Set(editions)].sort()]);
        row.parsed = parsed;
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
            <div class="panel-actions"><button id="recheckSubtitles">检查目录字幕</button><button id="readSubtitles">查找字幕</button><button id="auditSubtitles" disabled>强制复查已有字幕</button><button id="fillSubtitles" disabled>补齐字幕</button><button id="reviewSubtitleDeletes" disabled>删除字幕</button><button id="stopSubtitles" hidden>停止</button></div>
            <p id="subtitleScope"></p>
            <p id="subtitleProgress" role="status">先在网页勾选视频或文件夹。</p>
            <progress id="subtitleMeter" max="1" value="0" hidden style="width:100%;accent-color:#666"></progress>
            <div id="subtitleFilters"><label><input id="selectAllSubtitleDeletes" type="checkbox" disabled>全选</label><select id="subtitleView" aria-label="筛选字幕检查结果"><option id="subtitleViewAll" value="all">全部</option><option id="subtitleViewIncomplete" value="incomplete">未补齐</option><option id="subtitleViewChoice" value="choice">手动选择</option><option id="subtitleViewComplete" value="complete">有字幕</option></select><span id="subtitleDeleteSelectionCount" role="status" hidden></span></div>
            <div id="subtitleResults" role="region" aria-labelledby="subtitleResultsTitle" tabindex="0">
                <div id="subtitleSummary" hidden class="sync-preview"></div>
                <p id="subtitleEmpty">先勾选目录或视频，再点击“检查目录字幕”。</p>
                <div id="subtitleRows" class="tool-results"></div>
            </div>
            <details id="subtitleDeletePreview" name="subtitleFooter" hidden><summary id="subtitleDeleteHeading">确认删除清单</summary><div id="subtitleDeleteList" style="white-space:pre-wrap"></div><div class="panel-actions"><button id="confirmSubtitleDeletes">确认并移入回收站</button><button id="cancelSubtitleDeletes">取消</button></div></details>
            <section id="subtitleSettings" title="ZIP 只提取通过核验的文本字幕，不支持 RAR。">
            <label><input id="useThunder" type="checkbox" checked>迅雷 · 按片名搜索（免 Key，免费）</label>
            <label><input id="useSubdl" type="checkbox">SubDL（需个人 API Key，可选）</label>
            <label><span class="credential-head"><span>SubDL API Key</span><a href="https://subdl.com/api-doc" target="_blank" rel="noopener noreferrer">官网 API 说明 ↗</a></span><input id="subdlKey" type="password" autocomplete="off"></label>
            <details id="openSubtitlesSettings"><summary>账号与 API</summary>
            <label><input id="useOpenSubtitles" type="checkbox">启用搜索</label>
            <label><span class="credential-head"><span>API Key</span><a href="https://www.opensubtitles.com/en/consumers" target="_blank" rel="noopener noreferrer">获取 API ↗</a></span><input id="openSubtitlesKey" type="password" autocomplete="off"></label>
            <details id="subtitleAccountSettings"><summary title="提高下载配额">账号登录</summary><div><label>用户名<input id="subtitleUsername" autocomplete="off"></label><label>密码<input id="subtitlePassword" type="password" autocomplete="off"></label></div><button id="loginSubtitles">登录</button><p id="subtitleLoginState">密码不保存；令牌仅当前页面有效。</p></details>
            </details>
            <label>字幕语言<select id="subtitleLanguage" title="中文优先双语、简体，再繁体。"><option value="zh-cn,zh-tw,zh">中文（简体 / 繁体）</option><option value="zh-cn">简体中文</option><option value="zh-tw">繁体中文</option><option value="en">英文</option></select></label>
            <div class="panel-actions"><button id="saveSubtitleSettings">保存设置</button><button id="forgetSubtitleKey">清除凭证</button></div>
            </section>
            <details id="subtitleDiagnostics" name="subtitleFooter"><summary>字幕运行日志</summary><div class="panel-actions"><button id="copySubtitleLog">复制日志</button><button id="clearSubtitleLog">清空日志</button></div><textarea id="subtitleLog" readonly spellcheck="false" aria-label="字幕运行日志"></textarea></details>
`, 'subtitle');
        ui.moveSettings(['subtitleSettings'], '字幕来源与设置');
        ui.moveSettings(['openSubtitlesSettings'], 'OpenSubtitles', '#settingsModels');
        let inventory = [], drive = null, subtitleContext = null, checkedScope = null, deletePlan = null, busy = false, cancelled = false, reviewCandidates = null;
        const deleteSelection = new Set(), pendingDeletes = new Set();
        const openGroups = new Set(), renderedGroups = new Map();
        let scan = null;
        ui.get('subtitleView').value = 'all';
        const service = createSubtitleService({check:() => check(), log:(event, detail) => diag(event, detail)});
        const prefs = GM_getValue('cross-drive-subtitle-settings', {});
        ui.get('openSubtitlesKey').value = prefs.key || '';
        ui.get('useOpenSubtitles').checked = prefs.open === true;
        ui.get('useThunder').checked = prefs.thunder !== false;
        ui.get('useSubdl').checked = prefs.subdl === true;
        ui.get('subdlKey').value = prefs.subdlKey || '';
        ui.get('subtitleLanguage').value = prefs.language || 'zh-cn,zh-tw,zh';
        const settings = () => ({key:ui.get('openSubtitlesKey').value.trim(), language:ui.get('subtitleLanguage').value, open:ui.get('useOpenSubtitles').checked, thunder:ui.get('useThunder').checked, subdl:ui.get('useSubdl').checked, subdlKey:ui.get('subdlKey').value.trim()});
        const safeDiagnostic = text => subtitleDiagnosticText(text, {...settings(), password:ui.get('subtitlePassword').value});
        const status = text => { ui.get('subtitleProgress').textContent = safeDiagnostic(text); };
        const clearDeletePreview = () => { deletePlan = null; const preview = ui.get('subtitleDeletePreview'); preview.hidden = true; preview.open = false; ui.get('subtitleDeleteList').textContent = ''; };
        const logLines = [];
        const diag = (event, detail = '') => {
            const message = safeDiagnostic(detail);
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
        const awaitingCheck = row => row.checkState && row.checkState !== 'done';
        const covered = row => !awaitingCheck(row) && subtitleCovered(row);
        const needsChoice = row => !awaitingCheck(row) && !covered(row) && !row.writeBlocked && subtitleSearchState(row) === 'choice';
        const inView = (row, view) => view === 'all' || (view === 'incomplete' ? !covered(row) : view === 'choice' ? needsChoice(row) : covered(row));
        const canDelete = (row, sub) => checkedScope !== null && !awaitingCheck(row) && !row.embedded?.chinese && !pendingDeletes.has(String(sub.id));
        const selectedForDelete = (row, sub) => canDelete(row, sub) && deleteSelection.has(String(sub.id));
        const viewSubtitleIds = view => inventory.filter(row => inView(row, view))
            .flatMap(row => row.subtitles.filter(sub => canDelete(row, sub)).map(sub => String(sub.id)));
        const selectAll = ui.get('selectAllSubtitleDeletes');
        const render = () => {
            const scope = ui.get('subtitleScope');
            scope.textContent = scan?.scope || '';
            scope.title = scope.textContent;
            const missing = inventory.filter(row => !covered(row));
            const ready = missing.filter(row => !awaitingCheck(row) && !row.writeBlocked && row.selectedCandidate);
            const view = ui.get('subtitleView').value;
            const visibleIds = viewSubtitleIds(view), selectedCount = visibleIds.filter(id => deleteSelection.has(id)).length;
            selectAll.disabled = busy || !visibleIds.length;
            selectAll.checked = visibleIds.length > 0 && selectedCount === visibleIds.length;
            selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleIds.length;
            const choices = inventory.filter(needsChoice).length;
            for (const [id,label,count] of [['Incomplete','未补齐',missing.length],['Choice','手动选择',choices],['Complete','有字幕',inventory.length - missing.length],['All','全部',inventory.length]]) ui.get('subtitleView' + id).textContent = `${label}（${count}）`;
            const summary = ui.get('subtitleSummary');
            const checked = inventory.filter(row => !awaitingCheck(row));
            const remaining = inventory.length - checked.length;
            summary.hidden = !inventory.length;
            summary.textContent = '共 ' + inventory.length + ' 项 · 已检查 ' + checked.length + ' · '
                + (scan?.interrupted ? '未检查完成 ' : '待检查 ') + remaining + ' · ' + subtitleSearchSummary(checked);
            const totalSelected = new Set(inventory.flatMap(row => row.subtitles.filter(sub => selectedForDelete(row, sub)).map(sub => String(sub.id)))).size;
            const selectionCount = ui.get('subtitleDeleteSelectionCount');
            selectionCount.hidden = !totalSelected;
            selectionCount.textContent = '已选 ' + totalSelected + ' 项' + (selectedCount === totalSelected ? '' : ' · 当前筛选 ' + selectedCount + ' 项');
            ui.get('reviewSubtitleDeletes').disabled = busy || !totalSelected;
            ui.get('confirmSubtitleDeletes').disabled = busy || !deletePlan?.length;
            ui.get('cancelSubtitleDeletes').disabled = busy;
            ui.get('recheckSubtitles').disabled = busy;
            ui.get('auditSubtitles').disabled = busy || !inventory.some(row => row.subtitles.length);
            ui.get('fillSubtitles').disabled = busy || checkedScope === null || !ready.length;
            const host = ui.get('subtitleRows');
            const results = ui.get('subtitleResults'), scrollTop = results.scrollTop;
            const active = host.getRootNode?.().activeElement;
            const focusKey = active && host.contains?.(active) ? active.dataset.subtitleFocus : undefined;
            const trackFocus = (control, key) => { control.dataset.subtitleFocus = key; };
            for (const [key, details] of renderedGroups) {
                if (details.open) openGroups.add(key);
                else openGroups.delete(key);
            }
            renderedGroups.clear();
            host.replaceChildren();
            const renderRow = row => {
                const item = document.createElement('div'); item.className = 'subtitle-result';
                const text = document.createElement('p');
                const pending = awaitingCheck(row);
                const coverage = pending ? row.checkState : subtitleCoverageState(row);
                const embedded = pending ? null : row.embedded;
                const label = {complete:'有字幕',missing:'缺可用字幕',unconfirmed:'检查未确认',waiting:'待检查',checking:'检查中',interrupted:'未检查完成'}[coverage];
                const messages = pending ? [] : [coverage !== 'complete' && subtitleSearchLabels[subtitleSearchState(row)],
                    embedded?.message, row.error, !embedded?.chinese && row.searchMessage];
                text.textContent = safeDiagnostic([label + '：' + row.node.name, row.path, ...messages].filter(Boolean).join('\n'));
                item.append(text);
                if (pending) return item;
                for (const sub of row.subtitles) {
                    if (row.embedded?.chinese) break;
                    const line = document.createElement('label'), checkbox = document.createElement('input'), name = document.createElement('span');
                    checkbox.type = 'checkbox'; checkbox.checked = selectedForDelete(row, sub); checkbox.disabled = busy || !canDelete(row, sub);
                    trackFocus(checkbox, JSON.stringify(['delete',row.node.id,sub.id]));
                    name.textContent = '移入回收站：' + sub.name;
                    checkbox.onchange = () => {
                        if (busy || !canDelete(row, sub)) return;
                        if (checkbox.checked) deleteSelection.add(String(sub.id));
                        else deleteSelection.delete(String(sub.id));
                        clearDeletePreview();
                        render();
                    };
                    line.append(checkbox, name); item.append(line);
                }
                if (subtitleCovered(row) || row.writeBlocked || checkedScope === null) return item;
                const select = document.createElement('select'); select.disabled = busy || checkedScope === null;
                trackFocus(select, JSON.stringify(['candidate',row.node.id]));
                const blank = document.createElement('option'); blank.value = ''; blank.textContent = '跳过此视频 / 请选择字幕'; select.append(blank);
                (row.candidates || []).forEach((candidate, index) => {
                    const option = document.createElement('option'); option.value = String(index);
                    option.textContent = subtitleCandidateLabel(candidate);
                    option.title = option.textContent;
                    select.append(option);
                });
                select.value = row.selectedCandidate ? String(row.candidates.indexOf(row.selectedCandidate)) : '';
                select.onchange = () => { row.selectedCandidate = select.value === '' ? null : row.candidates[Number(select.value)]; row.error = ''; row.manualCandidate = true; row.aiSuggested = false; row.searchMessage = subtitleSearchMessage(row); diag('手动选择', `${row.node.name} · ${row.selectedCandidate ? row.selectedCandidate.source + ' · ' + (row.selectedCandidate.name || row.selectedCandidate.release) : '跳过此视频'}`); render(); };
                item.append(select);
                return item;
            };
            const groups = new Map();
            for (const row of inventory) {
                if (!groups.has(row.groupKey)) groups.set(row.groupKey, []);
                groups.get(row.groupKey).push(row);
            }
            let visible = 0;
            for (const [key, rows] of groups) {
                const shown = rows.filter(row => inView(row, view));
                if (!shown.length) continue;
                visible += shown.length;
                const box = document.createElement('section'); box.className = 'sync-item';
                const heading = document.createElement('h5'), first = rows[0];
                const collapsibleRow = row => covered(row) && !row.writeBlocked;
                const episodes = first.parsed.tv && first.parsed.season != null && rows.every(row => row.parsed.episode != null);
                const collapsible = episodes && rows.length > 1;
                heading.textContent = (first.parsed.query || first.node.name) + (first.parsed.season != null ? ' · 第 ' + first.parsed.season + ' 季' : '');
                box.append(heading);
                if (rows.length > 1) {
                    const completed = rows.filter(covered);
                    const unfinished = rows.filter(awaitingCheck).length;
                    const embedded = completed.filter(row => row.embedded?.chinese).length;
                    const summary = document.createElement('p'); summary.className = 'subtitle-group-count';
                    const unit = episodes ? '集' : '项';
                    summary.textContent = '共 ' + rows.length + ' ' + unit + ' · 已补齐 ' + completed.length + ' · 未补齐 ' + (rows.length - completed.length - unfinished)
                        + (unfinished ? ' · 已检查 ' + (rows.length - unfinished) + ' · ' + (scan?.interrupted ? '未检查完成 ' : '待检查 ') + unfinished : '')
                        + (embedded ? ' · 内嵌中文 ' + embedded : '') + (view !== 'all' ? ' · 当前筛选 ' + shown.length + ' ' + unit : '');
                    box.append(summary);
                }
                const completedShown = collapsible ? shown.filter(collapsibleRow) : [];
                for (const row of shown) if (!collapsible || !collapsibleRow(row)) box.append(renderRow(row));
                if (completedShown.length) {
                    const details = document.createElement('details'); details.className = 'subtitle-group-details';
                    const summary = document.createElement('summary');
                    trackFocus(summary, JSON.stringify(['details',key]));
                    summary.textContent = '查看 ' + completedShown.length + ' 集详情';
                    details.open = openGroups.has(key);
                    details.append(summary);
                    for (const row of completedShown) details.append(renderRow(row));
                    renderedGroups.set(key, details);
                    box.append(details);
                }
                host.append(box);
            }
            ui.get('subtitleEmpty').hidden = visible > 0;
            ui.get('subtitleEmpty').textContent = !inventory.length ? '本次检查没有视频，或尚未检查。请勾选目录或视频，再点击“检查目录字幕”。' : view === 'incomplete' && !missing.length ? '所选范围内的视频都有字幕。' : view === 'choice' ? '没有需要手动选择的字幕。' : '当前筛选下没有视频。';
            if (focusKey) [...host.querySelectorAll('[data-subtitle-focus]')].find(control => control.dataset.subtitleFocus === focusKey)?.focus({preventScroll:true});
            results.scrollTop = scrollTop;
        };
        const runTask = createPanelTask(ui, (value, stoppable) => {
            busy = value;
            if (value) cancelled = false;
            for (const id of ['readSubtitles','recheckSubtitles','auditSubtitles','reviewSubtitleDeletes','confirmSubtitleDeletes','cancelSubtitleDeletes','saveSubtitleSettings','forgetSubtitleKey','loginSubtitles','openSubtitlesKey','subtitleUsername','subtitlePassword','useOpenSubtitles','useThunder','subtitleLanguage','useSubdl','subdlKey']) ui.get(id).disabled = value;
            const stop = ui.get('stopSubtitles');
            stop.hidden = stop.disabled = !value || !stoppable;
            render();
        });
        const searchRows = async rows => {
            rows = rows.filter(row => !subtitleCovered(row) && !row.writeBlocked);
            if (!rows.length) { status(inventory.length ? '本次检查范围内没有可查找的缺字幕项目。' : '本次检查范围内没有正片视频。'); return; }
            const config = settings();
            if (!config.thunder && !(config.open && config.key) && !(config.subdl && config.subdlKey)) { ui.openSettings('subtitleSettings'); status('请启用迅雷免 Key 搜索，或配置其他字幕来源。'); return; }
            diag('查找开始', `视频 ${rows.length}，语言 ${config.language}，启用来源：${[config.thunder && '迅雷', config.subdl && 'SubDL', config.open && config.key && 'OpenSubtitles'].filter(Boolean).join('、') || '无'}`);
            if (!config.thunder) diag('来源跳过', '迅雷 已关闭');
            if (!config.open) diag('来源跳过', 'OpenSubtitles 已关闭');
            else if (!config.key) diag('来源跳过', 'OpenSubtitles 未配置 API Key');
            let done = 0;
            const ai = configuredAI();
            const credential = GM_getValue('cross-drive-tmdb-key', '');
            const ask = ai && paced(0, (method, payload) => { check(); return ai[method](payload); });
            const correctWork = ai?.correctSubtitleWork && credential
                ? createSubtitleWorkCorrection({correctSubtitleWork:payload => ask('correctSubtitleWork',payload)}, credential) : null;
            service.resetSearchBatch?.();
            reviewCandidates = ai ? createSubtitleReviewer({disambiguateSubtitle:payload => ask('disambiguateSubtitle',payload)}, config.language, diag, check) : null;
            config.reviewCandidates = reviewCandidates;
            diag('查找策略', `剧集先按季搜索并建立文件索引；缺集再搜索迅雷、SubDL、OpenSubtitles；${ai ? '名称有歧义时交给 AI 判断' : 'AI 未启用，使用严格片名匹配'}；来源限流后本批跳过该来源`);
            try {
                drive.assertReady?.();
                diag('并发策略', '搜索最多同时处理 2 组作品，同一季逐集复用缓存；各来源继续独立限速');
                await forEachConcurrent(subtitleSearchGroups(rows), 2, async (group, verify) => {
                  for (const row of group) {
                    const check = verify;
                    if (!row.parsed.workResolved) {
                        status('读取作品资料：' + row.node.name);
                        const aliasStarted = Date.now();
                        row.workLookupFailed = false;
                        try {
                            const parsed = row.parsed;
                            if (await resolveMediaWork(parsed,credential,check,diag)) {
                                mediaRecords.rememberParsed?.(row.node,parsed); mediaRecords.save?.();
                                diag('作品别名', `已复用或确认作品资料，取得 ${parsed.aliases.length} 个片名用于搜索`);
                            }
                        } catch (error) { check(); if (error.stop) throw error; row.workLookupFailed = true; diag('作品别名', '读取失败，继续按原片名严格匹配：' + error.message); }
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
                    await applySubtitleWorkCorrection(row, correctWork, config, service, drive, diag, check);
                    if (!row.selectedCandidate && row.candidates.length) diag('待选样例', row.candidates.slice(0, 8).map(candidate => subtitleCandidateLabel(candidate) + (candidate.matchReason ? '' : ' · 待确认：未满足自动选择条件')).join('；'));
                    diag('视频结果', `${row.node.name} · ${subtitleSearchLabels[subtitleSearchState(row)]}${row.selectedCandidate ? ' · ' + subtitleCandidateLabel(row.selectedCandidate) : ''}`);
                    diag('单片耗时', `${row.node.name} · ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
                    meter(++done, rows.length); render();
                  }
                }, check);
                status('查找结束：' + subtitleSearchSummary(inventory) + '。'); diag('查找结束', subtitleSearchSummary(inventory));
            } catch (error) { status(error.message); diag(cancelled ? '已停止' : '查找中断', error.message); }
        };
        const inspectEmbedded = async (row, check, currentDrive = drive) => {
            if (row.embedded) return;
            if (/\.mkv$/i.test(row.node.name) && row.complete) return;
            const embedded = await currentDrive.inspectEmbedded?.(row.node, check);
            check();
            row.embedded = embedded;
            if (row.embedded) diag('内嵌字幕', `${row.node.name} · ${row.embedded.message}`);
            if (row.embedded?.chinese) {
                for (const sub of row.subtitles) deleteSelection.delete(String(sub.id));
                if (deletePlan?.some(entry => entry.row === row)) clearDeletePreview();
            }
        };
        const checkDirectory = async (force = false) => {
            diag('检查开始', force ? '强制复查已有字幕：跳过缓存，重读正文' : '读取当前选中的视频与已有字幕');
            const batch = scan = {scope:'', interrupted:false};
            let framePending = false;
            const refresh = () => {
                if (framePending) return;
                framePending = true;
                const update = () => {
                    framePending = false;
                    if (scan === batch && batch.running && !cancelled) render();
                };
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(update);
                else Promise.resolve().then(update);
            };
            const verifyScan = () => {
                if (scan !== batch) throw new Error('检查范围已改变');
                check();
            };
            inventory = []; drive = null; subtitleContext = null; checkedScope = null;
            deleteSelection.clear(); openGroups.clear(); renderedGroups.clear(); clearDeletePreview();
            ui.get('subtitleView').value = 'all';
            ui.get('subtitleResults').scrollTop = 0;
            ui.get('subtitleMeter').hidden = true;
            status('正在读取目录…');
            render();
            try {
                const context = await mediaContext(provider); verifyScan();
                const currentDrive = subtitleDrive(context);
                const collected = await collectMediaSelection(context.selected, context.source,
                    message => { verifyScan(); status('正在读取目录 · ' + message); }, () => false, verifyScan, false);
                verifyScan();
                const names = context.selected.slice(0, 3).map(item => item.name).filter(Boolean);
                const selection = names.length ? '（' + names.join('、') + (context.selected.length > names.length ? '等' : '') + '）' : '';
                const rows = subtitleInventory(collected, context.path);
                for (const row of rows) row.checkState = 'waiting';
                inventory = rows;
                batch.scope = '本次范围：/' + (context.path || '') + ' · 选中 ' + context.selected.length + ' 项' + selection + ' · 视频 ' + rows.length;
                batch.running = true;
                if (rows.length) meter(0, rows.length);
                status(rows.length ? '正在检查目录字幕…' : '选中范围没有正片视频。');
                render();
                const language = settings().language;
                const ai = force ? configuredAI() : null;
                const review = ai ? createSubtitleBodyReviewer(ai, diag, verifyScan) : null;
                if (force) diag('复查范围', ai ? '格式、语言、已有时长参考及 AI 对白证据；不核对音画同步' : 'AI 未启用，仅检查格式、语言、已有时长参考；作品归属和音画同步未确认');
                diag('目录扫描', '视频 ' + rows.length + '，已关联字幕 ' + rows.filter(row => row.subtitles.length).length + ' 组');
                let done = 0;
                const fatal = error => error.stop || error.phase === 'drive-auth' || [401,403].includes(error.status);
                await forEachConcurrent(rows, 3, async (row, verify) => {
                    verify();
                    row.checkState = 'checking';
                    refresh();
                    const node = row.node;
                    try {
                        await mediaRecords.restore?.(node, context.source, verify);
                        verify();
                        subtitleRowIdentity(row, context.path);
                    } catch (error) {
                        verify();
                        if (fatal(error)) throw error;
                        diag('识别记录', node.name + ' · 元数据读取失败：' + error.message);
                    }
                    if (mediaRecords.explain) diag('识别记录', node.name + ' · ' + mediaRecords.explain(node));
                    const names = row.subtitles.map(sub => sub.name);
                    diag('现有字幕', node.name + ' · ' + (names.join('、') || '未发现字幕文件'));
                    try {
                        const recovered = await currentDrive.reconcile(row, phase => diag('上传对账', node.name + ' · ' + phase), verify);
                        verify();
                        for (const sub of recovered) if (!row.subtitles.some(existing => existing.id === sub.id)) row.subtitles.push(sub);
                        await inspectExistingSubtitles(row, currentDrive, language, diag, verify, {force, review});
                    } catch (error) {
                        verify();
                        if (fatal(error)) throw error;
                        row.writeBlocked = true; row.error = error.message;
                        diag('上传对账失败', node.name + ' · ' + error.message);
                    }
                    try { await inspectEmbedded(row, verify, currentDrive); }
                    catch (error) {
                        verify();
                        if (fatal(error)) throw error;
                        row.coverageUnconfirmed = true;
                        row.error = error.message;
                        diag('内嵌字幕检查失败', node.name + ' · ' + error.message);
                    }
                    verify();
                    row.checkState = 'done';
                    meter(++done, rows.length);
                    refresh();
                }, verifyScan);
                verifyScan();
                pendingDeletes.clear();
                drive = currentDrive;
                subtitleContext = context;
                checkedScope = batch.scope;
                status(rows.length ? '已检查选中范围。' : '选中范围没有正片视频。');
                diag('字幕检查', rows.length ? '完成，已有字幕确认 ' + rows.filter(covered).length + '/' + rows.length : '选中范围没有正片视频');
            } catch (error) {
                if (scan !== batch) return false;
                batch.interrupted = true;
                for (const row of inventory) if (awaitingCheck(row)) row.checkState = 'interrupted';
                status('检查结束：' + error.message);
                diag('检查失败', error.message);
            } finally {
                batch.running = false;
                if (scan === batch) render();
            }
            return checkedScope !== null;
        };
        ui.get('readSubtitles').onclick = () => runTask(async () => {
            if (checkedScope === null && !await checkDirectory()) return;
            await searchRows(inventory);
        }, true);
        ui.get('recheckSubtitles').onclick = () => runTask(checkDirectory, true);
        ui.get('auditSubtitles').onclick = () => runTask(() => checkDirectory(true), true);
        ui.get('reviewSubtitleDeletes').onclick = () => {
            if (busy) return;
            deletePlan = inventory.flatMap(row => row.subtitles.filter(sub => selectedForDelete(row, sub)).map(sub => ({row,sub})));
            if (!deletePlan.length) return;
            ui.get('subtitleDeleteList').textContent = deletePlan.map(({row,sub}) => `${row.path.slice(0,row.path.lastIndexOf('/') + 1)}${sub.name}`).join('\n');
            ui.get('subtitleDeleteHeading').textContent = '确认删除清单（' + deletePlan.length + ' 项）';
            const preview = ui.get('subtitleDeletePreview'); preview.hidden = false; preview.open = true; render();
        };
        ui.get('cancelSubtitleDeletes').onclick = clearDeletePreview;
        ui.get('confirmSubtitleDeletes').onclick = () => runTask(async () => {
            if (!deletePlan?.length || !subtitleContext || !drive) return;
            const targets = deletePlan.filter(({row,sub}) => selectedForDelete(row, sub)); clearDeletePreview();
            if (!targets.length) return;
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
                        if (!canDelete(row, sub)) continue;
                        await recycleMedia({...current,parentId:row.node.parentId},subtitleContext.session,subtitleContext.source);
                        try { drive.verified?.forget(sub); } catch (error) { diag('核验缓存清理失败', `${sub.name} · ${error.message}`); }
                        row.subtitles = row.subtitles.filter(item => String(item.id) !== String(sub.id)); deleteSelection.delete(String(sub.id)); touched.add(row); deleted++;
                        diag('字幕已删除', `${row.node.name} · ${sub.name} · 已移入回收站`);
                    } catch (error) {
                        if (error.pending) {
                            pendingDeletes.add(String(sub.id)); deleteSelection.delete(String(sub.id));
                            row.writeBlocked = true; row.complete = false; row.error = '字幕删除结果不明，请重新检查目录：' + error.message;
                        }
                        check();
                        if (error.stop || [401,403].includes(error.status)) throw error;
                        failures.push(`${sub.name}：${error.message}`); diag('字幕删除失败', `${row.node.name} · ${sub.name} · ${error.message}`);
                    }
                }
                for (const row of touched) { check(); if (row.writeBlocked) continue; await inspectExistingSubtitles(row,drive,settings().language,(event,detail)=>diag(event,`${row.node.name} · ${detail}`),check); await inspectEmbedded(row,check); }
                status(`批量删除结束：已移入回收站 ${deleted} 个，失败 ${failures.length} 个。` + (failures.length ? ` ${failures.slice(0,5).join('；')}` : ''));
            } catch (error) {
                if (cancelled) for (const row of touched) if (!row.writeBlocked) {
                    row.complete = false; row.writeBlocked = true; row.error = '请重新检查目录，确认剩余字幕。';
                }
                status(`删除中断：已移入回收站 ${deleted} 个；${error.message}`);
            }
        }, true);
        ui.get('fillSubtitles').onclick = () => runTask(async () => {
            if (!drive) return;
            const rows = inventory.filter(row => !subtitleCovered(row) && !row.writeBlocked && row.selectedCandidate), config = settings();
            config.reviewCandidates = reviewCandidates;
            let done = 0, failed = 0;
            try {
                drive.assertReady?.();
                for (const row of rows) {
                    check(); row.error = '';
                    try {
                        status(`下载字幕 ${done + failed + 1}/${rows.length}：${row.node.name}`);
                        const candidates = row.manualCandidate ? [row.selectedCandidate] : [row.selectedCandidate, ...(row.autoCandidates || []).filter(item => item !== row.selectedCandidate)];
                        diag('下载开始', `${row.node.name} · ${candidates.length} 个候选`);
                        let payload = null; const failures = [], attempted = new Set();
                        while (candidates.length || !row.manualCandidate && row.sources.some(source => source.deferred || source.deferredTerms?.length)) {
                            if (!candidates.length) {
                                diag('来源补查', `${row.node.name} · 已有候选下载失败，查询此前暂缓的来源`);
                                await searchSubtitleSources(row, config, service, drive, diag, check, true);
                                candidates.push(...row.autoCandidates.filter(candidate => !attempted.has(candidate)));
                                if (!candidates.length) break;
                            }
                            const candidate = candidates.shift();
                            attempted.add(candidate);
                            check();
                            try {
                                diag('候选下载', `${row.node.name} · ${subtitleCandidateLabel(candidate)} 开始`);
                                const {result, bytes} = await service.fetchFile(candidate, config, (phase, message) => diag(phase, `${row.node.name} · ${message}`), check); check();
                                const {text, ...verification} = subtitleValidateContent(row, bytes, result.ext, config.language, diag);
                                diag('正文校验', `${row.node.name} · ${candidate.source} 通过，${bytes.length} 字节，${result.ext.toUpperCase()}`);
                                payload = {candidate, result, bytes, verification}; break;
                            } catch (error) {
                                candidate.downloadFailed = true;
                                check();
                                const source = row.sources?.find(source => source.name === candidate.source);
                                if (source) saveSubtitleSourceReport(source, config, {downloadErrors:[error.message]});
                                if (!row.manualCandidate) selectSubtitleCandidate(row, config.language);
                                row.searchMessage = subtitleSearchMessage(row);
                                if (error.stop) { row.selectedCandidate = null; throw error; }
                                failures.push(candidate.source + ' · ' + (candidate.name || candidate.release) + '：' + error.message);
                                diag('候选失败', `${row.node.name} · ${candidate.source}：${error.message}`);
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
                        row.error = error.message;
                        if (error.pendingUpload) row.writeBlocked = true;
                        diag(cancelled ? '已停止' : '未补齐', `${row.node.name}：${error.message}`);
                        if (cancelled) throw error;
                        failed++;
                        if (error.stop) throw error;
                    }
                    meter(done + failed, rows.length); render();
                }
                status(`补齐结束：已补齐 ${done}，未补齐 ${failed}。`); diag('补齐结束', `已补齐 ${done}，未补齐 ${failed}`);
            } catch (error) { status(`已中断：已补齐 ${done}，未补齐 ${rows.length - done}；${error.message}`); diag('补齐中断', error.message); }
        }, true);
        ui.get('stopSubtitles').onclick = () => { cancelled = true; ui.get('stopSubtitles').disabled = true; status('等待当前请求结束后停止…'); };
        ui.get('clearSubtitleLog').onclick = () => { logLines.length = 0; ui.get('subtitleLog').value = ''; diag('日志', '已清空'); };
        selectAll.onchange = () => {
            if (busy) return;
            for (const id of viewSubtitleIds(ui.get('subtitleView').value)) {
                if (selectAll.checked) deleteSelection.add(id); else deleteSelection.delete(id);
            }
            clearDeletePreview(); render();
        };
        ui.get('subtitleView').onchange = () => { render(); ui.get('subtitleResults').scrollTop = 0; };
        ui.get('openSubtitlesKey').onchange = () => { service.logout(); ui.get('subtitleLoginState').textContent = '未登录'; };
        ui.get('subtitleLanguage').onchange = () => { scan = null; inventory = []; drive = null; subtitleContext = null; checkedScope = null; deleteSelection.clear(); openGroups.clear(); renderedGroups.clear(); clearDeletePreview(); render(); status('语言已更改，请重新查找。'); };
        ui.get('saveSubtitleSettings').onclick = () => { GM_setValue('cross-drive-subtitle-settings', settings()); status('设置已保存。'); };
        ui.get('forgetSubtitleKey').onclick = () => {
            const currentDrive = drive || subtitleDrive({session:provider === '光鸭' ? {provider,token:capture.token} : recover123Session(),source:{}});
            currentDrive.verified?.clear();
            ui.get('openSubtitlesKey').value = ''; ui.get('subdlKey').value = ''; ui.get('subtitlePassword').value = ''; service.logout(); ui.get('subtitleLoginState').textContent = '未登录'; GM_setValue('cross-drive-subtitle-settings', settings()); status('已清除凭证和当前账号的字幕核验记录。');
        };
        ui.get('loginSubtitles').onclick = () => runTask(async () => {
            try {
                await service.login(ui.get('subtitleUsername').value.trim(), ui.get('subtitlePassword').value, settings());
                check();
                ui.get('subtitleLoginState').textContent = '已登录（仅本页有效）';
                status('登录成功。');
            } catch (error) {
                if (cancelled) { service.logout(); ui.get('subtitleLoginState').textContent = '未登录'; status('登录已停止。'); }
                else status('登录失败：' + error.message);
            } finally { ui.get('subtitlePassword').value = ''; }
        }, true);
        ui.get('copySubtitleLog').onclick = async () => {
            try { await navigator.clipboard.writeText(ui.get('subtitleLog').value || '（暂无字幕运行日志）'); status('字幕运行日志已复制。'); }
            catch (error) { status('复制日志失败：' + error.message); }
        };
    }
