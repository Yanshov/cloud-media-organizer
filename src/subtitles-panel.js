    function subtitleInventory(collected, parentPath = '') {
        return collected.videos.filter(node => !mediaBonusName(node.name)).map(node => {
            const row = {node, subtitles:[...(collected.linked.get(node.id) || [])], complete:false,
                siblingNames:collected.namesByParent?.get(node.parentId),
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
        const editions = [...(node.originalName || node.name).normalize('NFKC').matchAll(/\b(?:2160p|1080p|720p|480p|4k|8k|blu[ ._-]?ray|bdrip|web[ ._-]?(?:dl|rip|edition|version)|remux|hdtv|dvd(?:rip)?|director['’]?s[ ._-]*cut|extended(?:[ ._-]*cut)?|theatrical(?:[ ._-]*cut)?)\b|导演剪辑|導演剪輯|加长版|加長版|未删减|未刪減|剧场版|劇場版|网络版|網絡版|特别篇|特別篇/gi)]
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
    async function readSubtitleImport(files, check) {
        if (files.length > 200) throw new Error('一次最多选择 200 个本地文件');
        const limit = 4 * 1024 * 1024, batchLimit = 32 * 1024 * 1024;
        let totalBytes = 0, inputBytes = 0, totalEntries = 0;
        const entries = [];
        for (const file of files) {
            check();
            const name = file.name;
            const ext = name.split('.').pop().toLowerCase();
            try {
                if (!['srt','ass','ssa','vtt','zip'].includes(ext)) throw new Error('仅支持 SRT、ASS、SSA、VTT 或 ZIP');
                if (file.size > (ext === 'zip' ? SUBTITLE_LIMIT : limit))
                    throw new Error(ext === 'zip' ? 'ZIP 超过 16 MiB' : '字幕超过 4 MiB');
                if (inputBytes + file.size > 64 * 1024 * 1024) throw new Error('本批读取的本地文件合计超过 64 MiB');
                inputBytes += file.size;
                const bytes = new Uint8Array(await file.arrayBuffer());
                check();
                if (bytes.length !== file.size) throw new Error('本地文件大小已变化，请重新选择');
                const index = ext === 'zip' ? subtitleArchiveIndex(bytes,check,true) : null;
                if (index && !index.files.length) throw new Error('ZIP 内没有支持的字幕');
                const count = index ? index.files.length : 1;
                const expanded = index ? index.files.reduce((sum,entry) => sum + entry.length,0) : bytes.length;
                if (totalEntries + count > 200 || totalBytes + expanded > batchLimit)
                    throw new Error('本批最多检测 200 个条目和 32 MiB 字幕');
                totalEntries += count;
                totalBytes += expanded;
                const loaded = [];
                if (index) for (const entry of index.files) {
                    const subtitle = await subtitleArchiveExtract(bytes,index,entry,check);
                    loaded.push({...subtitle, label:name + ' / ' + entry.path});
                }
                else loaded.push({name,label:name,ext,bytes});
                entries.push(...loaded);
            } catch (error) {
                check();
                entries.push({name,label:name,error:error.message});
            }
        }
        return entries;
    }
    function matchSubtitleImport(name, rows) {
        const stem = mediaStem(name).normalize('NFKC');
        const marks = [...stem.matchAll(/(?:^|[^\dA-Z])S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)/gi)];
        const parsed = parseMediaName(name);
        if (marks.length > 1 || parsed.endEpisode && parsed.endEpisode !== parsed.episode
            || /E\d+(?:[ ._-]*[-~][ ._-]*(?:E)?|\s*E)\d+/i.test(stem)) return {reason:'暂不支持合并多集字幕'};
        let targets = rows;
        if (rows[0].parsed.tv) {
            if (!marks.length) return {reason:'需要明确的季集标记，例如 S01E02'};
            const [,season,episode] = marks[0];
            targets = rows.filter(row => row.parsed.season === Number(season) && row.parsed.episode === Number(episode));
            if (targets.length !== 1) return {reason:targets.length ? '同一集有多个目标版本' : '季集与所选目标不符'};
            if (targets[0].parsed.endEpisode && targets[0].parsed.endEpisode !== targets[0].parsed.episode)
                return {reason:'暂不支持导入到合并多集视频'};
        } else if (parsed.tv || marks.length) return {reason:'剧集字幕与电影目标不符'};
        if (targets.length !== 1) return {reason:'请选择一个明确的视频'};
        const row = targets[0];
        const editions = value => [
            /导演剪辑|導演剪輯|\bdirector['’]?s[ ._-]*cut\b/i,
            /加长版|加長版|\bextended\b/i,
            /未删减|未刪減|\buncut\b/i,
            /剧场版|劇場版|\btheatrical\b/i,
            /网络版|網絡版|ネット版|\b(?:net|web)[ ._-]*(?:movie|edition|version)\b/i
        ].map(pattern => pattern.test(value));
        const subtitleEditions = editions(stem), videoEditions = editions(row.node.name);
        const release = value => /\b(?:blu[ ._-]?ray|bdrip|web[ ._-]?(?:dl|rip)|hdtv|dvd(?:rip)?|hd[ ._-]?cam|hd[ ._-]?ts)\b/i
            .exec(value)?.[0]?.toLowerCase().replace(/[ ._-]/g,'').replace(/bdrip/,'bluray').replace(/web(?:dl|rip)/,'web');
        const subtitleRelease = release(stem), videoRelease = release(row.node.name);
        if (subtitleEditions.some((marked,index) => marked && !videoEditions[index])
            || subtitleRelease && videoRelease && subtitleRelease !== videoRelease)
            return {row,reason:'字幕标注的剪辑版本与目标不一致或未确认'};
        const identity = subtitleWorkIdentity(row.parsed,[],name);
        if (identity.hardMismatch) return {row,reason:identity.matchReason};
        if (identity.titleMatched || mediaSubtitleSuffix(row.node.name,name) !== null) return {row};
        const title = (marks.length ? stem.slice(0,marks[0].index) : stem).trim();
        if (!title || /^(?:subtitles?|字幕|中文|简中|繁中|chs|cht|zh(?:[-_. ]?(?:cn|tw))?)[ ._-]*$/i.test(title))
            return {row,needsIdentity:true};
        return {row,reason:'文件名中的作品归属未确认'};
    }
    function subtitleImportGroups(inventory) {
        const groups = new Map();
        for (const row of inventory) {
            const {parsed} = row;
            if (parsed.tv && (parsed.season == null || parsed.episode == null)) continue;
            const key = parsed.tv ? row.groupKey : row;
            if (!groups.has(key)) groups.set(key,[]);
            groups.get(key).push(row);
        }
        return [...groups.values()];
    }
    function planSubtitleImport(entries, rows, language, confirmed, log) {
        const counts = new Map();
        const planned = entries.map(entry => {
            if (entry.error) return {...entry,state:'invalid',reason:entry.error};
            const match = matchSubtitleImport(entry.name,rows), {row} = match;
            if (!match.reason) counts.set(row,(counts.get(row) || 0) + 1);
            try {
                const {text, ...verification} = subtitleValidateContent(match.reason ? {node:{name:entry.label}} : row,entry.bytes,entry.ext,language,log);
                if (match.reason) return {...entry,row,state:'unmatched',reason:match.reason};
                if (subtitleCovered(row)) return {...entry,row,state:'skip',reason:'已有可用字幕'};
                if (row.writeBlocked) return {...entry,row,state:'unmatched',reason:'请重新检查目录，核对此前的操作结果'};
                if (match.needsIdentity && !confirmed.has(entry)) return {...entry,row,state:'unmatched',needsIdentity:true,reason:'文件名未标明作品，请确认归属'};
                const marked = subtitleFileInfo(entry.name).language;
                if (['zh-cn','zh-tw'].includes(language) && marked !== language)
                    return {...entry,row,state:'invalid',reason:'字幕文件未标注当前设置要求的简繁语言'};
                const suffix = language === 'en' ? 'en' : marked?.startsWith('zh') ? marked : 'zh';
                const name = subtitleUploadName(entry.name,entry.ext);
                if (row.siblingNames?.has(name.toLowerCase())) return {...entry,row,state:'unmatched',reason:'目标目录已有同名项目，待处理'};
                return {...entry,row,verification,state:'ready',name,language:suffix};
            } catch (error) {
                return {...entry,row,state:'invalid',reason:error.message};
            }
        });
        for (const entry of planned) if ((entry.state === 'ready' || entry.needsIdentity) && counts.get(entry.row) > 1) {
            entry.state = 'unmatched'; entry.needsIdentity = false; entry.reason = '同一目标匹配到多份字幕，请仅重新选择其中一份';
        }
        return planned;
    }
    function checkSubtitleImportDirectory(row, name, nodes) {
        const signature = sub => JSON.stringify([String(sub.id),sub.name,sub.size,String(sub.md5 || '').toLowerCase()]);
        if (nodes.some(sub => sub.name.toLowerCase() === name.toLowerCase()))
            throw new Error('目标已有同名项目，待处理');
        const before = row.subtitles.map(signature).sort();
        const after = (mediaSubtitleLinks(nodes,row.node.parentId,row.history).linked.get(String(row.node.id)) || []).map(signature).sort();
        if (before.length !== after.length || before.some((sub,index) => sub !== after[index]))
            throw new Error('目录中的关联字幕已变化，请重新检查目录后导入');
    }
    function subtitleCandidateNameIssue(row, candidate) {
        if (!candidate || candidate.ext === 'zip') return '';
        try {
            const name = subtitleUploadName(candidate.name,candidate.ext);
            return row.siblingNames?.has(name.toLowerCase()) ? '目标目录已有同名项目，待处理：' + name : '';
        } catch (error) { return error.message; }
    }
    function subtitleEpisodeRange(rows) {
        const ranges = [];
        const episodes = rows.map(({parsed}) => [parsed.episode, parsed.endEpisode ?? parsed.episode]).filter(([start]) => start != null)
            .sort(([a],[b]) => a - b);
        for (const [start,end] of episodes) {
            const last = ranges.at(-1);
            if (last && start <= last[1] + 1) last[1] = Math.max(last[1],end);
            else ranges.push([start,end]);
        }
        const pad = value => String(value).padStart(2,'0');
        return ranges.length ? ranges.map(([a,b]) => a === b ? pad(a) : pad(a) + '—' + pad(b)).join('、') + ' 集' : '';
    }
    function initSubtitles(provider = '123') {
        const ui = makePanel(provider + ' 字幕', `
            <p>选中视频或文件夹，先“检查目录字幕”查看哪些缺字幕，再查找、补齐到视频所在目录。</p>
            <div class="panel-actions"><button id="readSubtitles">查找字幕</button><button id="fillSubtitles" disabled>补齐字幕</button><button id="reviewSubtitleDeletes" disabled>删除字幕</button><button id="importSubtitles" type="button">导入字幕</button><button id="stopSubtitles" hidden>停止</button></div>
            <input id="subtitleImportFiles" type="file" accept=".srt,.ass,.ssa,.vtt,.zip" multiple hidden>
            <p id="subtitleScope"></p>
            <p id="subtitleProgress" role="status">先在网页勾选视频或文件夹。</p>
            <progress id="subtitleMeter" max="1" value="0" hidden style="width:100%;accent-color:#666"></progress>
            <div id="subtitleFilters"><label><input id="selectAllSubtitleDeletes" type="checkbox" disabled>全选</label><select id="subtitleView" aria-label="筛选字幕检查结果"><option id="subtitleViewAll" value="all">全部</option><option id="subtitleViewIncomplete" value="incomplete">未补齐</option><option id="subtitleViewReady" value="ready">待补齐</option><option id="subtitleViewChoice" value="choice">手动选择</option><option id="subtitleViewComplete" value="complete">有字幕</option></select><span id="subtitleDeleteSelectionCount" role="status" hidden></span></div>
            <div id="subtitleResults" role="region" aria-labelledby="subtitleResultsTitle" tabindex="0">
                <div id="subtitleSummary" hidden class="sync-preview"></div>
                <p id="subtitleEmpty">先勾选目录或视频，再点击“检查目录字幕”。</p>
                <div id="subtitleRows"></div>
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
        let scan = null, searching = false, seasonView = null, importDraft = null, importPicker = null;
        const seasonChoices = new Map();
        ui.get('subtitleView').value = 'incomplete';
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
        const meter = (done, total) => {
            const bar = ui.get('subtitleMeter');
            bar.hidden = total === 0;
            bar.max = total || 1;
            bar.value = done;
        };
        const awaitingCheck = row => row.checkState && row.checkState !== 'done';
        const covered = row => !awaitingCheck(row) && subtitleCovered(row);
        const needsChoice = row => !awaitingCheck(row) && !covered(row) && !row.writeBlocked && subtitleSearchState(row) === 'choice';
        const readyToFill = row => searching && checkedScope !== null && !awaitingCheck(row) && !covered(row)
            && !row.writeBlocked && !!row.selectedCandidate && !row.selectedCandidate.downloadFailed
            && !subtitleCandidateNameIssue(row,row.selectedCandidate);
        const inView = (row, view) => {
            if (view === 'all') return true;
            if (view === 'incomplete') return !covered(row);
            if (view === 'ready') return readyToFill(row);
            if (view === 'choice') return needsChoice(row);
            return covered(row);
        };
        const canDelete = (row, sub) => checkedScope !== null && !awaitingCheck(row) && !row.embedded?.chinese && !pendingDeletes.has(String(sub.id));
        const selectedForDelete = (row, sub) => canDelete(row, sub) && deleteSelection.has(String(sub.id));
        const viewSubtitleIds = view => inventory.filter(row => inView(row, view))
            .flatMap(row => row.subtitles.filter(sub => canDelete(row, sub)).map(sub => String(sub.id)));
        const selectAll = ui.get('selectAllSubtitleDeletes');
        const results = ui.get('subtitleResults'), host = ui.get('subtitleRows');
        const showImport = (trackFocus, addButton) => {
            const draft = importDraft;
            const box = document.createElement('section'); box.className = 'sync-item subtitle-action-view';
            const heading = document.createElement('h5'); heading.textContent = '本地字幕导入预览'; box.append(heading);
            const target = document.createElement('select');
            target.setAttribute?.('aria-label','选择导入目标');
            trackFocus(target,'import-target');
            const option = (value,label) => {
                const item = document.createElement('option'); item.value = value; item.textContent = label; item.title = label;
                target.append(item);
            };
            option('','请选择一部电影或一季剧集');
            for (const [index,rows] of draft.groups.entries()) {
                const first = rows[0], folder = first.path.slice(0,first.path.lastIndexOf('/'));
                const season = first.parsed.tv ? ' · 第 ' + first.parsed.season + ' 季 · ' + rows.length + ' 项' : '';
                option(String(index),(first.parsed.tv ? first.parsed.query : first.node.name) + season + ' · ' + folder
                    + (first.parsed.tv ? ' · ' + first.node.name : ''));
            }
            target.value = draft.target;
            target.disabled = busy;
            target.onchange = () => {
                if (busy) return;
                draft.target = target.value;
                draft.confirmed.clear();
                reviewImport();
                render();
            };
            box.append(target);
            addButton(box,'取消导入','import-cancel',() => {
                importDraft = null;
                status('已取消导入');
                render();
                ui.get('importSubtitles').focus?.();
            });
            if (draft.plan) {
                const label = {ready:'可导入',skip:'已补齐跳过',invalid:'检测失败',unmatched:'待匹配'};
                const summary = document.createElement('p');
                summary.textContent = Object.entries(label).map(([state,text]) => {
                    const found = draft.plan.filter(entry => entry.state === state);
                    const range = subtitleEpisodeRange(found.filter(entry => entry.row).map(entry => entry.row));
                    return text + ' ' + found.length + ' 项' + (range ? '（' + range + '）' : '');
                }).join(' · ');
                box.append(summary);
                const count = draft.plan.filter(entry => entry.state === 'ready').length;
                const plan = draft.plan;
                if (count) addButton(box,'确认导入 ' + count + ' 项','import-confirm',() => commitImport(draft,plan));
                if (draft.plan.some(entry => entry.state === 'unmatched' || entry.state === 'invalid')) {
                    addButton(box,draft.showIssues ? '查看可导入项' : '处理待匹配与失败项','import-issues',() => {
                        draft.showIssues = !draft.showIssues;
                        render();
                    });
                }
                for (const [index,entry] of draft.plan.entries()) {
                    const issue = entry.state === 'unmatched' || entry.state === 'invalid';
                    if (issue !== draft.showIssues) continue;
                    const detail = document.createElement('p');
                    const timing = entry.state === 'ready' ? '正文可用 · 归属已核对 · ' + (entry.verification.evidence === 'file'
                        ? '对白范围已按视频文件时长检查，未核对播放同步'
                        : '时间轴未验证' + (entry.verification.duration ? '（TMDB 仅作作品时长参考）' : '')) : entry.reason;
                    detail.textContent = safeDiagnostic(entry.label + (entry.row ? ' → ' + entry.row.path : '') + ' · ' + label[entry.state] + ' · ' + timing);
                    box.append(detail);
                    if (entry.needsIdentity) addButton(box,'确认文件归属','import-identity-' + index,() => {
                        draft.confirmed.add(draft.entries[index]); reviewImport(); render();
                    });
                }
            } else for (const entry of draft.entries.filter(entry => entry.error)) {
                const line = document.createElement('p'); line.textContent = safeDiagnostic(entry.label + ' · ' + entry.error); box.append(line);
            }
            host.append(box);
        };
        const render = () => {
            const scope = ui.get('subtitleScope');
            scope.textContent = scan?.scope || '';
            scope.title = scope.textContent;
            const missing = inventory.filter(row => !covered(row));
            const ready = inventory.filter(readyToFill).length;
            const view = ui.get('subtitleView').value;
            const visibleIds = viewSubtitleIds(view), selectedCount = visibleIds.filter(id => deleteSelection.has(id)).length;
            selectAll.disabled = busy || !!importDraft || !visibleIds.length;
            selectAll.checked = visibleIds.length > 0 && selectedCount === visibleIds.length;
            selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleIds.length;
            const choices = inventory.filter(needsChoice).length;
            for (const [id,label,count] of [['Incomplete','未补齐',missing.length],['Ready','待补齐',ready],['Choice','手动选择',choices],['Complete','有字幕',inventory.length - missing.length],['All','全部',inventory.length]]) ui.get('subtitleView' + id).textContent = `${label}（${count}）`;
            const summary = ui.get('subtitleSummary');
            const checked = inventory.filter(row => !awaitingCheck(row));
            const remaining = inventory.length - checked.length;
            summary.hidden = !inventory.length;
            const coverage = searching ? subtitleSearchSummary(checked) : [
                '有字幕 ' + checked.filter(covered).length,
                '没字幕 ' + checked.filter(row => subtitleCoverageState(row) === 'missing').length,
                '检查未确认 ' + checked.filter(row => subtitleCoverageState(row) === 'unconfirmed').length
            ].join(' · ');
            summary.textContent = '共 ' + inventory.length + ' 项 · 已检查 ' + checked.length + ' · '
                + (scan?.interrupted ? '未检查完成 ' : '待检查 ') + remaining + ' · ' + coverage;
            const totalSelected = new Set(inventory.flatMap(row => row.subtitles.filter(sub => selectedForDelete(row, sub)).map(sub => String(sub.id)))).size;
            const selectionCount = ui.get('subtitleDeleteSelectionCount');
            selectionCount.hidden = !totalSelected;
            selectionCount.textContent = '已选 ' + totalSelected + ' 项' + (selectedCount === totalSelected ? '' : ' · 当前筛选 ' + selectedCount + ' 项');
            ui.get('reviewSubtitleDeletes').disabled = busy || !!importDraft || !totalSelected;
            ui.get('confirmSubtitleDeletes').disabled = busy || !!importDraft || !deletePlan?.length;
            ui.get('cancelSubtitleDeletes').disabled = busy;
            ui.get('fillSubtitles').disabled = busy || !!importDraft || checkedScope === null || !ready;
            const scrollTop = results.scrollTop;
            const active = host.getRootNode?.().activeElement;
            const focusKey = active && host.contains?.(active) ? active.dataset.subtitleFocus : undefined;
            const trackFocus = (control, key) => { control.dataset.subtitleFocus = key; };
            const addButton = (box, label, key, click) => {
                const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
                trackFocus(button,key); button.disabled = busy; button.onclick = click; box.append(button);
            };
            host.replaceChildren();
            const renderRow = (row, mode) => {
                const item = document.createElement('div'); item.className = 'subtitle-result';
                const text = document.createElement('p');
                const pending = awaitingCheck(row);
                const coverage = pending ? row.checkState : subtitleCoverageState(row);
                const embedded = pending ? null : row.embedded;
                const label = {complete:'有字幕',missing:'缺可用字幕',unconfirmed:'检查未确认',waiting:'待检查',checking:'检查中',interrupted:'未检查完成'}[coverage];
                item.dataset.state = needsChoice(row) ? 'choice' : coverage;
                const badge = document.createElement('span');
                badge.className = 'subtitle-badge';
                const state = searching && !pending && !embedded?.chinese && !row.writeBlocked ? subtitleSearchLabels[subtitleSearchState(row)] : '';
                badge.textContent = embedded?.chinese ? '内嵌中文 · 已补齐'
                    : (label === '缺可用字幕' && !searching ? '没字幕' : label) + (state && coverage !== 'complete' ? ' · ' + state : '');
                if (row.parsed.episode != null && mode) {
                    const episode = document.createElement('strong');
                    episode.textContent = subtitleEpisodeRange([row]);
                    text.append(episode);
                }
                text.append(badge);
                const failedSource = row.sources?.find(source => source.error || source.paused);
                const reason = !pending && (row.error || subtitleCandidateNameIssue(row,row.selectedCandidate) || embedded?.unconfirmed && embedded.message
                    || row.coverageUnconfirmed && row.searchMessage || failedSource?.error || failedSource?.paused);
                if (reason && !embedded?.chinese) {
                    const detail = document.createElement('span'); detail.className = 'subtitle-detail';
                    const message = safeDiagnostic(reason).split(/\r?\n/,1)[0];
                    detail.textContent = message.length > 64 ? message.slice(0,61) + '…' : message;
                    text.append(detail);
                }
                item.append(text);
                if (pending) return item;
                if (mode === 'delete') for (const sub of row.subtitles) {
                    if (row.embedded?.chinese) break;
                    const line = document.createElement('label'), checkbox = document.createElement('input'), name = document.createElement('span');
                    checkbox.type = 'checkbox'; checkbox.checked = selectedForDelete(row, sub); checkbox.disabled = busy || !canDelete(row, sub);
                    trackFocus(checkbox, JSON.stringify(['delete',row.node.id,sub.id]));
                    name.textContent = '移入回收站：' + sub.name; name.title = name.textContent;
                    checkbox.onchange = () => {
                        if (busy || !canDelete(row, sub)) return;
                        if (checkbox.checked) deleteSelection.add(String(sub.id));
                        else deleteSelection.delete(String(sub.id));
                        clearDeletePreview();
                        render();
                    };
                    line.append(checkbox, name); item.append(line);
                }
                if (!searching || mode === 'delete' || subtitleCovered(row) || row.writeBlocked || checkedScope === null || !row.candidates?.length) return item;
                const select = document.createElement('select'); select.disabled = busy || checkedScope === null;
                trackFocus(select, JSON.stringify(['candidate',row.node.id]));
                const blank = document.createElement('option'); blank.value = ''; blank.textContent = '跳过此视频 / 请选择字幕'; select.append(blank);
                const available = row.candidates.filter(candidate => !candidate.downloadFailed);
                available.forEach((candidate, index) => {
                    const option = document.createElement('option'); option.value = String(index);
                    const issue = subtitleCandidateNameIssue(row,candidate);
                    option.textContent = subtitleCandidateLabel(candidate) + (issue ? ' · ' + issue : '');
                    option.title = option.textContent;
                    select.append(option);
                });
                const selected = available.indexOf(row.selectedCandidate);
                select.value = selected < 0 ? '' : String(selected);
                select.title = selected < 0 ? blank.textContent : subtitleCandidateLabel(row.selectedCandidate);
                select.onchange = () => {
                    if (busy) return;
                    row.selectedCandidate = select.value === '' ? null : available[Number(select.value)];
                    row.error = '';
                    row.manualCandidate = true;
                    row.aiSuggested = false;
                    row.searchMessage = subtitleSearchMessage(row);
                    diag('手动选择', row.node.name + ' · ' + (row.selectedCandidate ? subtitleCandidateLabel(row.selectedCandidate) : '跳过此视频'));
                    render();
                };
                item.append(select);
                return item;
            };
            const groups = new Map();
            for (const row of inventory) {
                if (!groups.has(row.groupKey)) groups.set(row.groupKey, []);
                groups.get(row.groupKey).push(row);
            }
            let visible = 0;
            if (seasonView && !groups.has(seasonView.key)) seasonView = null;
            if (importDraft) {
                showImport(trackFocus,addButton);
                visible++;
            } else if (seasonView) {
                const {key,mode,exceptions:exceptionIds} = seasonView;
                const rows = groups.get(key);
                const box = document.createElement('section'); box.className = 'sync-item subtitle-action-view';
                const heading = document.createElement('h5');
                heading.textContent = (rows[0].parsed.query || rows[0].node.name) + (mode === 'delete' ? ' · 选择外置字幕' : ' · 处理待确认项');
                box.append(heading);
                addButton(box,'返回结果','subtitle-back',() => {
                    const origin = seasonView;
                    seasonView = null;
                    render();
                    results.scrollTop = origin.scrollTop;
                    [...host.querySelectorAll('[data-subtitle-focus]')].find(control => control.dataset.subtitleFocus === origin.focus)?.focus({preventScroll:true});
                });
                const exceptions = rows.filter(row => mode === 'delete' ? inView(row,view) && row.subtitles.some(sub => canDelete(row,sub))
                    : exceptionIds.has(row.node.id) && !covered(row) && !row.writeBlocked && row.candidates?.length);
                for (const row of exceptions) box.append(renderRow(row,mode));
                if (!exceptions.length) {
                    const empty = document.createElement('p'); empty.textContent = '当前没有可处理的项目。'; box.append(empty);
                }
                host.append(box);
                visible++;
            } else for (const [key, rows] of groups) {
                const shown = rows.filter(row => inView(row, view));
                if (!shown.length) continue;
                visible += shown.length;
                const first = rows[0];
                const season = first.parsed.tv && first.parsed.season != null;
                const title = (first.parsed.query || first.node.name) + (season ? ' · 第 ' + first.parsed.season + ' 季' : '');
                const box = document.createElement('section'); box.className = 'sync-item subtitle-card';
                const heading = document.createElement('h5'); heading.textContent = title; heading.title = title;
                box.append(heading);
                const open = (mode, exceptions = []) => {
                    seasonView = {key,mode,exceptions:new Set(exceptions.map(row => row.node.id)),
                        scrollTop:results.scrollTop,focus:JSON.stringify([mode,key])};
                    results.scrollTop = 0;
                    render();
                    [...host.querySelectorAll('[data-subtitle-focus]')].find(control => control.dataset.subtitleFocus === 'subtitle-back')?.focus({preventScroll:true});
                };
                if (!season) {
                    for (const row of shown) box.append(renderRow(row));
                } else {
                    const completed = rows.filter(covered);
                    const unchecked = rows.filter(awaitingCheck);
                    const unknown = rows.filter(row => !covered(row) && !awaitingCheck(row) && subtitleCoverageState(row) === 'unconfirmed');
                    const missing = rows.filter(row => !covered(row) && !awaitingCheck(row) && subtitleCoverageState(row) === 'missing');
                    const summary = document.createElement('p'); summary.className = 'subtitle-group-count';
                    summary.textContent = '共 ' + rows.length + ' 集' + (shown.length !== rows.length ? ' · 当前筛选 ' + shown.length + ' 集' : '');
                    box.append(summary);
                    const count = (label, subset, includeRange = true) => {
                        const line = document.createElement('p');
                        const range = includeRange ? subtitleEpisodeRange(subset) : '';
                        line.textContent = label + ' ' + subset.length + ' 集' + (range ? ' · ' + range : '');
                        box.append(line);
                    };
                    const allEmbedded = completed.length && completed.every(row => row.embedded?.chinese);
                    count(allEmbedded ? '有字幕（内嵌中文）' : '有字幕',completed);
                    count('没字幕',missing);
                    if (unknown.length) count('检查未确认',unknown);
                    if (unchecked.length) count(scan?.interrupted ? '未检查完成' : '待检查／检查中',unchecked);
                    if (searching) {
                        const targets = rows.filter(row => !covered(row) && !awaitingCheck(row) && !row.writeBlocked);
                        const blocked = shown.filter(row => !covered(row) && row.writeBlocked);
                        const unselected = targets.filter(row => !row.selectedCandidate || row.selectedCandidate.downloadFailed);
                        const pending = unselected.filter(row => row.candidates?.some(candidate => !candidate.downloadFailed));
                        const failures = unselected.filter(row => subtitleSearchState(row) === 'failed');
                        const packs = new Map();
                        for (const row of targets) for (const candidate of row.autoCandidates || []) {
                            if (!candidate.seasonPackVerified || candidate.downloadFailed || candidate.hardMismatch || !candidate.url
                                || candidate.parsed?.season !== row.parsed.season || candidate.parsed?.episode !== row.parsed.episode) continue;
                            const id = JSON.stringify([candidate.source,candidate.url,candidate.language]);
                            if (!packs.has(id)) packs.set(id,{candidate,choices:new Map()});
                            packs.get(id).choices.set(row,candidate);
                        }
                        const ready = targets.filter(readyToFill);
                        const nameIssues = shown.filter(row => subtitleCandidateNameIssue(row,row.selectedCandidate));
                        if (nameIssues.length) {
                            const note = document.createElement('p');
                            note.textContent = nameIssues.length + ' 集原名待处理 · ' + subtitleEpisodeRange(nameIssues)
                                + ' · ' + safeDiagnostic(subtitleCandidateNameIssue(nameIssues[0],nameIssues[0].selectedCandidate));
                            box.append(note);
                        }
                        if (ready.length || pending.length || packs.size) {
                            const select = document.createElement('select'); select.disabled = busy;
                            trackFocus(select,JSON.stringify(['plan',key]));
                            select.setAttribute?.('aria-label','字幕方案 · ' + title);
                            const option = (value, label) => {
                                const entry = document.createElement('option'); entry.value = value; entry.textContent = label; entry.title = label; select.append(entry);
                            };
                            const automatic = targets.filter(row => row.autoCandidates?.some(candidate => !candidate.downloadFailed)).length;
                            option('', '自动逐集择优（可能跨来源或版本） · ' + automatic + '/' + targets.length + ' 集');
                            const plans = [...packs].map(([id,pack], index) => ({...pack,id,value:String(index)}));
                            for (const pack of plans) option(pack.value, safeDiagnostic(subtitleCandidateLabel(pack.candidate)) + ' · 覆盖待补 ' + pack.choices.size + '/' + targets.length + ' 集');
                            select.value = plans.find(plan => plan.id === seasonChoices.get(key))?.value ?? '';
                            select.title = select.children[select.value === '' ? 0 : Number(select.value)+1].title;
                            select.onchange = () => {
                                if (busy) return;
                                const plan = select.value === '' ? null : plans[Number(select.value)];
                                if (plan) seasonChoices.set(key,plan.id);
                                else seasonChoices.delete(key);
                                for (const row of targets) {
                                    row.selectedCandidate = plan ? plan.choices.get(row) || null : row.autoCandidates?.find(candidate => !candidate.downloadFailed) || null;
                                    row.manualCandidate = !!plan;
                                    row.aiSuggested = !!row.selectedCandidate?.aiAccepted;
                                    row.searchMessage = subtitleSearchMessage(row);
                                }
                                diag('季字幕方案', title + ' · ' + (plan ? subtitleCandidateLabel(plan.candidate) : '自动逐集择优'));
                                render();
                            };
                            box.append(select);
                        }
                        if (ready.length) count('待补齐',ready,false);
                        if (pending.length || failures.length || blocked.length) {
                            const note = document.createElement('p');
                            note.textContent = [
                                pending.length && ('需手选 ' + pending.length + ' 集 · ' + subtitleEpisodeRange(pending)),
                                failures.length && ('查询失败 ' + failures.length + ' 集，请查看日志'),
                                blocked.length && ('结果待核对 ' + blocked.length + ' 集，请重新检查')
                            ].filter(Boolean).join(' / ');
                            box.append(note);
                        }
                        const unmatched = unselected.filter(row => !row.candidates?.some(candidate => !candidate.downloadFailed)
                            && subtitleSearchState(row) === 'notFound');
                        if (unmatched.length) count('未找到匹配项',unmatched,false);
                        if (pending.length) addButton(box,'处理待确认项',JSON.stringify(['choice',key]),() => open('choice',pending));
                    }
                }
                if (!busy && shown.some(row => row.subtitles.some(sub => canDelete(row,sub)))) {
                    addButton(box, season ? '选择本季外置字幕' : '选择外置字幕',JSON.stringify(['delete',key]),() => open('delete'));
                }
                if (checkedScope !== null)
                    addButton(box,'重新检测',JSON.stringify(['audit',key]),() => recheckWork(rows));
                host.append(box);
            }
            ui.get('subtitleEmpty').hidden = visible > 0;
            ui.get('subtitleEmpty').textContent = !inventory.length ? '本次检查没有视频，或尚未检查。请勾选目录或视频，再点击“查找字幕”或“导入字幕”。' : view === 'incomplete' && !missing.length ? '所选范围内的视频都有字幕。' : view === 'ready' ? '当前没有已选中可用候选的待补齐项目。' : view === 'choice' ? '没有需要手动选择的字幕。' : '当前筛选下没有视频。';
            results.scrollTop = scrollTop;
            if (focusKey) [...host.querySelectorAll('[data-subtitle-focus]')].find(control => control.dataset.subtitleFocus === focusKey)?.focus({preventScroll:true});
        };
        const runTask = createPanelTask(ui, (value, stoppable) => {
            busy = value;
            if (value) cancelled = false;
            for (const id of ['readSubtitles','reviewSubtitleDeletes','confirmSubtitleDeletes','cancelSubtitleDeletes','importSubtitles','saveSubtitleSettings','forgetSubtitleKey','loginSubtitles','openSubtitlesKey','subtitleUsername','subtitlePassword','useOpenSubtitles','useThunder','subtitleLanguage','useSubdl','subdlKey']) ui.get(id).disabled = value;
            const stop = ui.get('stopSubtitles');
            stop.hidden = stop.disabled = !value || !stoppable;
            render();
        });
        const reviewImport = () => {
            const draft = importDraft;
            const rows = draft.groups[draft.target];
            draft.showIssues = false;
            draft.plan = rows && planSubtitleImport(draft.entries,rows,draft.language,draft.confirmed,diag);
            for (const entry of draft.plan || []) {
                const outcome = entry.state === 'ready' ? subtitleVerificationMessage(entry.verification) : entry.reason;
                diag('导入检测', entry.label + (entry.row ? ' → ' + entry.row.path : '') + ' · ' + outcome);
            }
        };
        const picker = ui.get('subtitleImportFiles');
        ui.get('importSubtitles').onclick = () => {
            if (busy) return;
            importPicker = {language:settings().language};
            picker.value = '';
            picker.click();
        };
        picker.oncancel = () => {importPicker = null;};
        picker.onchange = () => {
            const files = Array.from(picker.files || []);
            picker.value = '';
            const draft = importPicker;
            importPicker = null;
            if (!files.length || !draft || busy) return;
            return runTask(async () => {
                if (!await ensureSubtitleCheck()) return;
                const groups = subtitleImportGroups(inventory);
                if (!groups.length) { status('当前选区没有可导入的电影或季集。'); return; }
                Object.assign(draft,{scan,drive,groups});
                importDraft = null;
                meter(0,0);
                status('正在读取本地字幕…');
                try {
                    const entries = await readSubtitleImport(files,check);
                    check();
                    if (draft.scan !== scan || draft.drive !== drive) throw new Error('检查范围已改变，请重新选择本地文件');
                    clearDeletePreview();
                    seasonView = null;
                    importDraft = {...draft, entries, target:'', confirmed:new Set(), showIssues:false, plan:null};
                    for (const entry of entries) if (entry.error) diag('导入读取失败',entry.label + ' · ' + entry.error);
                    results.scrollTop = 0;
                    status('请选择导入目标并核对预览。');
                } catch (error) {
                    status('导入检测结束 · ' + error.message);
                    diag('导入检测结束',error.message);
                }
            }, true);
        };
        const commitImport = (draft, plan) => runTask(async () => {
            const targets = plan.filter(entry => entry.state === 'ready');
            if (!targets.length || draft !== importDraft || draft.plan !== plan || draft.scan !== scan || draft.drive !== drive
                || draft.language !== settings().language || checkedScope === null) {
                status('导入计划已失效，请重新检查目录并预览。');
                return;
            }
            try { await requireCheckedSelection(); }
            catch (error) { importDraft = null; status(error.message); return; }
            importDraft = null;
            meter(0,targets.length);
            let done = 0, failed = 0, pending = 0, interrupted = '';
            const verify = () => {
                check();
                if (draft.scan !== scan || draft.drive !== drive || checkedScope === null)
                    throw Object.assign(new Error('检查范围已改变，请重新检查目录'), {stop:true});
            };
            for (const {row,name,bytes,verification,label,language} of targets) {
                try {
                    verify();
                    if (!inventory.includes(row) || covered(row) || row.writeBlocked) throw new Error('目标状态已变，请重新检查目录');
                    status('正在导入 · ' + row.node.name);
                    diag('导入开始',label + ' → ' + row.path);
                    const target = await draft.drive.save(row,name,bytes,phase => {
                        status(phase + ' · ' + row.node.name);
                        diag('导入网盘',row.node.name + ' · ' + phase);
                    },verify,{language,beforeWrite:nodes => checkSubtitleImportDirectory(row,name,nodes)});
                    row.subtitles.push(target);
                    row.siblingNames?.add(name.toLowerCase());
                    row.complete = true;
                    row.verification = verification;
                    row.error = '';
                    row.searchMessage = '已导入，上传内容一致 · ' + subtitleVerificationMessage(verification);
                    done++;
                    diag('导入成功',row.path + ' · 上传字节一致 · 未核对播放同步');
                } catch (error) {
                    row.error = error.message;
                    if (error.pendingUpload) {
                        row.writeBlocked = true;
                        pending++;
                    } else if (!cancelled && !error.stop && error.phase !== 'drive-auth') failed++;
                    diag(error.pendingUpload ? '导入待对账' : '导入未完成',row.path + ' · ' + error.message);
                    if (cancelled || error.stop || error.phase === 'drive-auth' || [401,403].includes(error.status)) {
                        interrupted = error.message;
                        break;
                    }
                }
                meter(done + failed + pending,targets.length);
                render();
            }
            const summary = '已处理 ' + (done + failed + pending) + '/' + targets.length + ' · 已导入 ' + done
                + ' · 失败 ' + failed + ' · 待对账 ' + pending + (interrupted ? ' · ' + interrupted : '');
            meter(done + failed + pending,targets.length);
            status((interrupted ? '导入中断 · ' : '导入结束 · ') + summary);
            diag('导入结果',summary);
        }, true);
        const searchRows = async rows => {
            meter(0,0);
            rows = rows.filter(row => !awaitingCheck(row) && subtitleCoverageState(row) === 'missing');
            if (!rows.length) { status(inventory.length ? '本次检查范围内没有可查找的缺字幕项目。' : '本次检查范围内没有正片视频。'); return; }
            const config = settings();
            if (!config.thunder && !(config.open && config.key) && !(config.subdl && config.subdlKey)) { ui.openSettings('subtitleSettings'); status('请启用迅雷免 Key 搜索，或配置其他字幕来源。'); return; }
            meter(0,rows.length);
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
                    if (row.candidates.length) diag('字幕候选', row.node.name + ' · ' + row.candidates.map(candidate =>
                        subtitleCandidateLabel(candidate) + (!candidate.titleMatched && !candidate.identityMatched && !candidate.aiAccepted
                            ? ' · ' + (candidate.matchReason || '需确认作品或语言') : '')).join('；'));
                    diag('视频结果', `${row.node.name} · ${subtitleSearchLabels[subtitleSearchState(row)]}${row.selectedCandidate ? ' · ' + subtitleCandidateLabel(row.selectedCandidate) : ''}`);
                    diag('单片耗时', `${row.node.name} · ${((Date.now() - started) / 1000).toFixed(1)} 秒`);
                    meter(++done, rows.length); render();
                  }
                }, check);
                const sourceFailures = rows.filter(row => row.sources?.some(source => source.error || source.paused || source.cacheError
                    || source.queries?.some(query => query.error))).length;
                const message = '已处理 ' + done + '/' + rows.length + ' · ' + (sourceFailures ? sourceFailures + ' 项遇到来源错误 · ' : '')
                    + subtitleSearchSummary(rows);
                status('查找结束 · ' + message); diag('查找结束',message);
            } catch (error) {
                const message = '已处理 ' + done + '/' + rows.length + ' · ' + error.message;
                status((cancelled ? '查找已停止 · ' : '查找中断 · ') + message);
                diag(cancelled ? '已停止' : '查找中断',message);
            }
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
        const checkDirectory = async captured => {
            diag('检查开始','读取当前选中的视频与已有字幕');
            searching = false; seasonView = null; seasonChoices.clear();
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
            inventory = []; drive = null; subtitleContext = null; checkedScope = null; importDraft = null; importPicker = null;
            deleteSelection.clear(); clearDeletePreview();
            ui.get('subtitleView').value = 'incomplete';
            ui.get('subtitleResults').scrollTop = 0;
            meter(0,0);
            let done = 0, total = 0;
            status('正在读取目录…');
            render();
            try {
                const context = captured || await mediaContext(provider); verifyScan();
                context.history = mediaFileHistory(context.session);
                const currentDrive = subtitleDrive(context);
                const collected = await collectMediaSelection(context.selected, context.source,
                    message => { verifyScan(); status('正在读取目录 · ' + message); }, () => false, verifyScan, false, context.history);
                verifyScan();
                const names = context.selected.slice(0, 3).map(item => item.name).filter(Boolean);
                const selection = names.length ? '（' + names.join('、') + (context.selected.length > names.length ? '等' : '') + '）' : '';
                const rows = subtitleInventory(collected, context.path);
                total = rows.length;
                for (const row of rows) { row.checkState = 'waiting'; row.history = context.history; }
                inventory = rows;
                batch.scope = '本次范围：/' + (context.path || '') + ' · 选中 ' + context.selected.length + ' 项' + selection + ' · 视频 ' + rows.length;
                batch.running = true;
                if (rows.length) meter(0, rows.length);
                status(rows.length ? '正在检查目录字幕…' : '选中范围没有正片视频。');
                render();
                const language = settings().language;
                diag('目录扫描', '视频 ' + rows.length + '，已关联字幕 ' + rows.filter(row => row.subtitles.length).length + ' 组');
                const fatal = error => error.stop || error.phase === 'drive-auth' || [401,403].includes(error.status);
                await forEachConcurrent(rows, 3, async (row, verify) => {
                    verify();
                    row.checkState = 'checking';
                    refresh();
                    const node = row.node;
                    diag('检查文件', row.path);
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
                        await inspectExistingSubtitles(row, currentDrive, language, diag, verify);
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
                const unconfirmed = rows.filter(row => subtitleCoverageState(row) === 'unconfirmed').length;
                const message = rows.length ? '已检查 ' + done + '/' + total + ' · 有字幕 ' + rows.filter(covered).length
                    + (unconfirmed ? ' · 检查未确认 ' + unconfirmed : '') : '选中范围没有正片视频';
                status(message); diag('字幕检查',message);
            } catch (error) {
                if (scan !== batch) return false;
                batch.interrupted = true;
                for (const row of inventory) if (awaitingCheck(row)) row.checkState = 'interrupted';
                const message = (total ? '已检查 ' + done + '/' + total + ' · ' : '目录读取未完成 · ') + error.message;
                status('检查结束 · ' + message);
                diag('检查失败',message);
            } finally {
                batch.running = false;
                if (scan === batch) render();
            }
            return checkedScope !== null;
        };
        ui.get('readSubtitles').onclick = () => runTask(async () => {
            if (!await ensureSubtitleCheck()) return;
            if (inventory.length && inventory.every(covered)) { meter(0,0); status('全部已补齐'); return; }
            importDraft = null; importPicker = null;
            searching = true; seasonView = null; seasonChoices.clear();
            await searchRows(inventory);
        }, true);
        const scopeKey = context => JSON.stringify([context.session.parent, context.path,
            context.selected.map(item => JSON.stringify([item.id ?? '', [...(item.names || [item.name || ''])].sort()])).sort()]);
        const sameCheckedSelection = current => checkedScope !== null && subtitleContext
            && current.session.token === subtitleContext.session.token && scopeKey(current) === scopeKey(subtitleContext);
        const requireCheckedSelection = async () => {
            const current = await mediaContext(provider,subtitleContext); check();
            if (!sameCheckedSelection(current)) {
                checkedScope = null;
                throw new Error('账号或选区已变化，请重新查找字幕或导入。');
            }
            drive.assertReady?.();
        };
        const ensureSubtitleCheck = async () => {
            try {
                const current = await mediaContext(provider, subtitleContext); check();
                if (sameCheckedSelection(current)) {
                    try { drive.assertReady?.(); return true; }
                    catch (error) { diag('重新检查',error.message); }
                }
                return await checkDirectory(current);
            } catch (error) {
                checkedScope = null;
                meter(0,0);
                status('无法使用当前检查结果：' + error.message);
                return false;
            }
        };
        const recheckWork = rows => runTask(async () => {
            const context = subtitleContext, currentDrive = drive;
            if (checkedScope === null || !context || !rows.every(row => inventory.includes(row))) return;
            clearDeletePreview(); importDraft = null; importPicker = null;
            const {language} = settings();
            const ai = configuredAI(), review = ai ? createSubtitleBodyReviewer(ai,diag,check) : null;
            const children = cachedDriveChildren(context.source,new Map(),check);
            const links = new Map();
            let done = 0;
            meter(0,rows.length);
            diag('复查范围',ai ? '格式、语言、已有时长参考及 AI 对白证据；不核对音画同步' : '格式、语言及已有时长参考；作品归属和音画同步未确认');
            try {
                await requireCheckedSelection();
                seasonChoices.delete(rows[0].groupKey);
                for (const row of rows) {
                    check();
                    const {node} = row;
                    const siblings = await children(node.parentId); check();
                    const fresh = siblings.find(file => !file.directory && String(file.id) === String(node.id));
                    if (!fresh || fresh.name !== node.name || fresh.size !== node.size || node.md5 && fresh.md5 && node.md5 !== fresh.md5) {
                        checkedScope = null;
                        throw new Error('目标视频已变化，请重新查找字幕');
                    }
                    if (!links.has(node.parentId)) links.set(node.parentId,mediaSubtitleLinks(siblings,node.parentId,context.history).linked);
                    const next = {...row,subtitles:[...(links.get(node.parentId).get(String(node.id)) || [])],embedded:undefined,
                        siblingNames:new Set(siblings.map(file => file.name.toLowerCase())),error:''};
                    const recovered = await currentDrive.reconcile(next, phase => diag('上传对账',phase),check);
                    for (const sub of recovered) if (!next.subtitles.some(item => String(item.id) === String(sub.id))) next.subtitles.push(sub);
                    next.writeBlocked = false;
                    await inspectExistingSubtitles(next,currentDrive,language,diag,check,{force:true,review});
                    await inspectEmbedded(next,check,currentDrive); check();
                    for (const sub of row.subtitles) { deleteSelection.delete(String(sub.id)); pendingDeletes.delete(String(sub.id)); }
                    Object.assign(row,next,{selectedCandidate:null,candidates:[],autoCandidates:[],sources:[]});
                    meter(++done,rows.length); render();
                }
                status('重新检测完成 · ' + done + '/' + rows.length);
            } catch (error) {
                if (error.pendingUpload || error.stop || error.phase === 'drive-auth') checkedScope = null;
                status('重新检测中断 · ' + done + '/' + rows.length + ' · ' + error.message);
            }
        }, true);
        ui.get('reviewSubtitleDeletes').onclick = () => {
            if (busy || importDraft) return;
            deletePlan = inventory.flatMap(row => row.subtitles.filter(sub => selectedForDelete(row, sub)).map(sub => ({row,sub})));
            if (!deletePlan.length) return;
            ui.get('subtitleDeleteList').textContent = deletePlan.map(({row,sub}) => `${row.path.slice(0,row.path.lastIndexOf('/') + 1)}${sub.name}`).join('\n');
            ui.get('subtitleDeleteHeading').textContent = '确认删除清单（' + deletePlan.length + ' 项）';
            const preview = ui.get('subtitleDeletePreview'); preview.hidden = false; preview.open = true; render();
        };
        ui.get('cancelSubtitleDeletes').onclick = clearDeletePreview;
        ui.get('confirmSubtitleDeletes').onclick = () => runTask(async () => {
            if (importDraft || !deletePlan?.length || !subtitleContext || !drive) return;
            const targets = deletePlan.filter(({row,sub}) => selectedForDelete(row, sub)); clearDeletePreview();
            if (!targets.length) return;
            let deleted = 0; const touched = new Set(), failures = [];
            try {
                await requireCheckedSelection();
                for (const {row,sub} of targets) {
                    check(); status(`删除字幕 ${deleted + failures.length + 1}/${targets.length}：${sub.name}`);
                    try {
                        const siblings = await subtitleContext.source.children({id:row.node.parentId}); check();
                        const current = siblings.find(node => String(node.id) === String(sub.id));
                        const video = siblings.find(node => String(node.id) === String(row.node.id));
                        const sameFile = (now, before) => now && !now.directory && String(now.id) === String(before.id) && now.name === before.name && now.size === before.size && String(now.md5 || '').toLowerCase() === String(before.md5 || '').toLowerCase();
                        const linked = mediaSubtitleLinks(siblings,row.node.parentId,subtitleContext.history).linked.get(String(row.node.id)) || [];
                        if (!sameFile(current,sub) || !sameFile(video,row.node) || !linked.some(item => String(item.id) === String(sub.id)) || !MEDIA_SUB.test(current.name))
                            throw new Error('字幕或关联视频已变化，未删除；请重新检查目录');
                        if (!canDelete(row, sub)) continue;
                        await recycleMedia({...current,parentId:row.node.parentId},subtitleContext.session,subtitleContext.source);
                        try { drive.verified?.forget(sub); } catch (error) { diag('核验缓存清理失败', `${sub.name} · ${error.message}`); }
                        row.subtitles = row.subtitles.filter(item => String(item.id) !== String(sub.id)); row.siblingNames?.delete(sub.name.toLowerCase()); deleteSelection.delete(String(sub.id)); touched.add(row); deleted++;
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
            if (importDraft) return;
            meter(0,0);
            if (!drive) { status('请先查找字幕。'); return; }
            const rows = inventory.filter(readyToFill), config = settings();
            if (!rows.length) { status('当前没有可补齐的字幕候选。'); return; }
            meter(0,rows.length);
            config.reviewCandidates = reviewCandidates;
            let done = 0, failed = 0;
            const pausedDownloads = new Set();
            try {
                await requireCheckedSelection();
                for (const row of rows) {
                    check(); row.error = '';
                    try {
                        status(`下载字幕 ${done + failed + 1}/${rows.length}：${row.node.name}`);
                        const candidates = row.manualCandidate ? [row.selectedCandidate] : [row.selectedCandidate, ...(row.autoCandidates || []).filter(item => item !== row.selectedCandidate)];
                        diag('下载开始', `${row.node.name} · ${candidates.length} 个候选`);
                        let payload = null, suspicious = false;
                        const failures = [], attempted = new Set();
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
                            if (pausedDownloads.has(candidate.source)) {
                                failures.push(candidate.source + ' 本批下载已暂停');
                                continue;
                            }
                            try {
                                const issue = subtitleCandidateNameIssue(row,candidate);
                                if (issue) throw new Error(issue);
                                diag('候选下载', `${row.node.name} · ${subtitleCandidateLabel(candidate)} 开始`);
                                const {result, bytes} = await service.fetchFile(candidate, config, (phase, message) => diag(phase, `${row.node.name} · ${message}`), check); check();
                                const {text, ...verification} = subtitleValidateContent(row, bytes, result.ext, config.language, diag);
                                diag('正文校验', `${row.node.name} · ${candidate.source} 格式与语言通过，${bytes.length} 字节，${result.ext.toUpperCase()} · ${subtitleVerificationMessage(verification)}`);
                                const name = subtitleUploadName(result.fileName ?? (candidate.ext === 'zip' ? undefined : candidate.name),result.ext);
                                if (row.siblingNames?.has(name.toLowerCase())) throw new Error('目标目录已有同名项目，待处理：' + name);
                                const detected = subtitleFileInfo(name).language;
                                const language = detected || candidate.language || (config.language === 'en' ? 'en' : 'zh');
                                payload = {name, bytes, verification, language}; break;
                            } catch (error) {
                                check();
                                if (error.phase === 'drive-auth' || error.stop && !isSubtitleSourceError(error)) throw error;
                                candidate.downloadFailed = true;
                                suspicious ||= !!error.subtitleSuspicious;
                                const source = row.sources?.find(source => source.name === candidate.source);
                                if (source) saveSubtitleSourceReport(source, config, {downloadErrors:[error.message]});
                                const paused = isSubtitleSourceError(error) && subtitleSourcePaused(candidate.source,error)
                                    || error.phase === 'transfer' && [429,509].includes(error.status);
                                if (paused) {
                                    pausedDownloads.add(candidate.source);
                                    service.pauseSearchSource?.(candidate.source,error.message);
                                    if (source) source.paused = subtitleDiagnosticText(error.message,config);
                                }
                                if (row.manualCandidate) row.selectedCandidate = null;
                                else selectSubtitleCandidate(row, config.language);
                                row.searchMessage = subtitleSearchMessage(row);
                                failures.push(candidate.source + ' · ' + (candidate.name || candidate.release) + '：' + error.message);
                                diag('候选失败', `${row.node.name} · ${candidate.source}：${error.message}`);
                            }
                        }
                        if (!payload) {
                            if (suspicious) row.coverageUnconfirmed = true;
                            throw new Error((suspicious ? '字幕可疑，待确认：' : '候选均未通过下载/正文检查：') + failures.join('；'));
                        }
                        const {name, bytes, verification, language} = payload;
                        const target = await drive.save(row, name, bytes, phase => { status(phase + '：' + row.node.name); diag('网盘写入', `${row.node.name} · ${phase}`); }, check,
                            {language,beforeWrite:nodes => checkSubtitleImportDirectory(row,name,nodes)});
                        row.subtitles.push(target); row.siblingNames?.add(name.toLowerCase()); row.complete = true; row.verification = verification; row.searchMessage = '已补齐，上传内容一致：' + name + ' · ' + subtitleVerificationMessage(verification); done++;
                        diag('补齐成功', `${row.node.name} · 上传字节已核验 ${name}`);
                    } catch (error) {
                        row.error = error.message;
                        if (error.pendingUpload) row.writeBlocked = true;
                        diag(cancelled ? '已停止' : '未补齐', `${row.node.name}：${error.message}`);
                        if (cancelled || error.stop || error.phase === 'drive-auth') throw error;
                        failed++;
                    }
                    meter(done + failed, rows.length); render();
                }
                const message = `已处理 ${done + failed}/${rows.length} · 已补齐 ${done} · 未补齐 ${failed}`;
                status('补齐结束 · ' + message); diag('补齐结束',message);
            } catch (error) {
                // An interrupted item may have a receipt, but it did not finish processing.
                const message = `已处理 ${done + failed}/${rows.length} · 已补齐 ${done} · ${error.message}`;
                status('补齐中断 · ' + message); diag('补齐中断',message);
            }
        }, true);
        ui.get('stopSubtitles').onclick = () => { cancelled = true; ui.get('stopSubtitles').disabled = true; status('等待当前请求结束后停止…'); };
        ui.get('clearSubtitleLog').onclick = () => { logLines.length = 0; ui.get('subtitleLog').value = ''; diag('日志', '已清空'); };
        selectAll.onchange = () => {
            if (busy || importDraft) return;
            for (const id of viewSubtitleIds(ui.get('subtitleView').value)) {
                if (selectAll.checked) deleteSelection.add(id); else deleteSelection.delete(id);
            }
            clearDeletePreview(); render();
        };
        ui.get('subtitleView').onchange = () => { seasonView = null; results.scrollTop = 0; render(); };
        ui.get('openSubtitlesKey').onchange = () => { service.logout(); ui.get('subtitleLoginState').textContent = '未登录'; };
        ui.get('subtitleLanguage').onchange = () => { scan = null; searching = false; seasonView = null; importDraft = null; importPicker = null; seasonChoices.clear(); inventory = []; drive = null; subtitleContext = null; checkedScope = null; deleteSelection.clear(); clearDeletePreview(); render(); status('语言已更改，请重新查找。'); };
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
