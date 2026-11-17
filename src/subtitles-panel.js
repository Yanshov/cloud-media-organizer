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
            return { node, parsed, subtitles, complete:false, pendingVerification:false, path: '/' + [parentPath, node.path].filter(Boolean).join('/') };
        });
    }
    async function subtitleEnrichAliases(parsed, credential, check = () => {}, log = () => {}) {
        if (!credential || parsed.tmdbId && parsed.aliases?.length) return false;
        const client = tmdbClient(credential), type = parsed.tv ? 'tv' : 'movie';
        if (parsed.tmdbId) {
            const detail = await client.get(`/${type}/${parsed.tmdbId}`, {append_to_response:'alternative_titles'}); check();
            if (String(detail.id) !== String(parsed.tmdbId) || !parsed.tv && parsed.year && detail.release_date && !detail.release_date.startsWith(String(parsed.year))) throw new Error('已确认作品的编号或年份与资料不一致');
            if (!parsed.tv && Number(detail.runtime) > 0) parsed.runtimeSeconds = Number(detail.runtime) * 60;
            parsed.aliases = [...new Set([detail.title,detail.original_title,detail.name,detail.original_name,
                ...(detail.alternative_titles?.titles || detail.alternative_titles?.results || []).filter(item => ['CN','TW','HK','US','GB'].includes(item.iso_3166_1)).map(item => item.title)].filter(Boolean))].slice(0,40);
        } else {
            if (!parsed.year) return false;
            const title = subtitleQueryTitle(parsed.query, parsed.year), key = subtitleTitleKey(title);
            if (!key) return false;
            const results = await client.search(title); check();
            const matches = [];
            for (const item of results.filter(item => item.media_type === type && String(item.release_date || item.first_air_date || '').slice(0,4) === String(parsed.year))) {
                let names = [item.title,item.name,item.original_title,item.original_name];
                if (!names.some(value => value && subtitleTitleKey(value) === key)) {
                    for (const language of ['zh-CN','zh-TW']) {
                        const localized = await client.get(`/${type}/${item.id}`, {language}); check();
                        if (String(localized.id) === String(item.id) && String(localized.release_date || localized.first_air_date || '').slice(0,4) === String(parsed.year)) names.push(localized.title, localized.name);
                    }
                }
                if (names.some(value => value && subtitleTitleKey(value) === key)) matches.push(item);
            }
            if (matches.length !== 1) return false;
            const match = matches[0];
            log('TMDB 作品', `${type} · ${match.id} · ${match.original_title || match.original_name || ''} · ${parsed.year}`);
            const english = await client.get(`/${type}/${match.id}`, {language:'en-US'}); check();
            if (String(english.id) !== String(match.id) || String(english.release_date || english.first_air_date || '').slice(0,4) !== String(parsed.year)) throw new Error('英文资料的编号或年份与搜索结果不一致');
            if (!parsed.tv && Number(english.runtime) > 0) parsed.runtimeSeconds = Number(english.runtime) * 60;
            parsed.aliases = [...new Set([...(parsed.aliases || []),match.original_title,match.original_name,english.title,english.name].filter(Boolean))].slice(0,40);
        }
        return true;
    }
    function initSubtitles(provider = '123') {
        const ui = makePanel(provider + ' 字幕', `
            <p>选中视频或文件夹，查找字幕后批量补齐到视频所在目录。</p>
            <div class="panel-actions"><button id="readSubtitles">查找字幕</button><button id="recheckSubtitles" disabled>重新检查目录</button><button id="fillSubtitles" disabled>补齐字幕</button><button id="stopSubtitles" hidden>停止</button></div>
            <p id="subtitleProgress" role="status">先在网页勾选视频或文件夹。</p>
            <progress id="subtitleMeter" max="1" value="0" hidden style="width:100%;accent-color:#666"></progress>
            <div id="subtitleSummary" hidden class="sync-preview"></div>
            <label><input id="onlyChoiceSubtitles" type="checkbox" checked>只看待选择</label>
            <div id="subtitleRows"></div>
            <div class="panel-actions"><button id="searchSubtitles" disabled>重搜未完成项</button><button id="copyMissingSubtitles" disabled>复制未补齐路径</button><button id="copySubtitleReport" disabled>复制完整报告</button></div>
            <details id="subtitleSettings"><summary>字幕来源与设置</summary>
            <label><input id="useThunder" type="checkbox" checked>迅雷 · 按片名搜索（免 Key，免费）</label>
            <label><input id="useShooter" type="checkbox" checked>射手 · 优先按视频指纹匹配（免 Key）</label>
            <p>射手仅取四段各 4KB 视频数据，不下载完整视频。网盘拒绝分段读取时跳过该来源。<a href="https://www.shooter.cn/" target="_blank" rel="noopener noreferrer">射手官网 ↗</a></p>
            <label><input id="useAssrt" type="checkbox" checked>Assrt 射手网 · 按片名搜索（需 Token）</label>
            <label><span class="credential-head"><span>Assrt API Token</span><a href="https://assrt.net/api/user/token" target="_blank" rel="noopener noreferrer">获取 Token ↗</a></span><input id="assrtToken" type="password" autocomplete="off"></label>
            <p>电影按不带年份的片名搜索；剧集先按片名＋季集搜索，没结果再按片名搜索。需要个人 Token，额度以服务返回为准；未配置不算作“未找到”。获取页面不可用时，无法在脚本内代办 Token。</p>
            <label><input id="useOpenSubtitles" type="checkbox">OpenSubtitles（需 API Key，可选）</label>
            <label><span class="credential-head"><span>OpenSubtitles API Key</span><a href="https://www.opensubtitles.com/en/consumers" target="_blank" rel="noopener noreferrer">获取 API ↗</a></span><input id="openSubtitlesKey" type="password" autocomplete="off"></label>
            <p>注册并登录官网 → API Consumers → 创建应用 → 复制 API Key。下载配额以账号返回为准。</p>
            <label>字幕语言<select id="subtitleLanguage"><option value="zh-cn,zh-tw,zh">中文（简体 / 繁体）</option><option value="zh-cn">简体中文</option><option value="zh-tw">繁体中文</option><option value="en">英文</option></select></label>
            <p>中文自动选择顺序：双语优先（简体双语优于繁体双语），其次简体中文，再次繁体中文。可在文件列表手动指定某份字幕。</p>
            <div class="panel-actions"><button id="saveSubtitleSettings">保存设置</button><button id="forgetSubtitleKey">清除凭证</button></div>
            </details>
            <details id="subtitleAccountSettings"><summary>OpenSubtitles 账号（提高下载配额，可选）</summary><label>用户名<input id="subtitleUsername" autocomplete="off"></label><label>密码<input id="subtitlePassword" type="password" autocomplete="off"></label><button id="loginSubtitles">登录</button><p id="subtitleLoginState">未登录；密码不保存，令牌仅本页有效。</p></details>
            <details id="subtitleDiagnostics"><summary>字幕运行日志</summary><div class="panel-actions"><button id="copySubtitleLog">复制日志</button><button id="clearSubtitleLog">清空日志</button></div><textarea id="subtitleLog" readonly rows="8" spellcheck="false" aria-label="字幕运行日志" style="width:100%;font:12px/1.45 monospace;resize:vertical"></textarea></details>
            <p>仅检查外置字幕，不检测内嵌字幕。保留原字幕格式；同名不同内容不覆盖。中文内容检查不区分简繁，简繁筛选依赖来源语言标注。</p>
`, 'subtitle');
        ui.moveSettings(['subtitleSettings','subtitleAccountSettings']);
        let inventory = [], drive = null, busy = false, cancelled = false, reviewCandidates = null;
        const service = createSubtitleService({check:() => check(), log:(event, detail) => diag(event, detail)});
        const prefs = GM_getValue('cross-drive-subtitle-settings', {});
        const shooterMigration = 'cross-drive-subtitle-shooter-default-v1';
        if (!GM_getValue(shooterMigration, false)) {
            prefs.shooter = true;
            GM_setValue('cross-drive-subtitle-settings', {...prefs, shooter:true});
            GM_setValue(shooterMigration, true);
        }
        ui.get('openSubtitlesKey').value = prefs.key || '';
        ui.get('useOpenSubtitles').checked = prefs.open === true;
        ui.get('useShooter').checked = prefs.shooter !== false;
        ui.get('useAssrt').checked = prefs.assrt !== false;
        ui.get('useThunder').checked = prefs.thunder !== false;
        ui.get('assrtToken').value = prefs.assrtToken || '';
        ui.get('subtitleLanguage').value = prefs.language || 'zh-cn,zh-tw,zh';
        const settings = () => ({key:ui.get('openSubtitlesKey').value.trim(), language:ui.get('subtitleLanguage').value, open:ui.get('useOpenSubtitles').checked, shooter:ui.get('useShooter').checked, assrt:ui.get('useAssrt').checked, thunder:ui.get('useThunder').checked, assrtToken:ui.get('assrtToken').value.trim()});
        const status = text => { ui.get('subtitleProgress').textContent = text; };
        const diag = (event, detail = '') => {
            const config = settings();
            let message = String(detail ?? '').replace(/https?:\/\/[^\s"'<>]+/gi, value => {
                try { return new URL(value).origin + '/[地址已隐藏]'; } catch { return '[地址已隐藏]'; }
            });
            for (const secret of [config.key, config.assrtToken]) if (secret) message = message.split(secret).join('[凭证已隐藏]');
            message = message.replace(/(token|api[-_ ]?key|authorization|signature|security[-_ ]?token)=?[^\s&,;]*/gi, '$1=[已隐藏]').replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]');
            const line = `${new Date().toLocaleTimeString()} [${event}]${message ? ' ' + message : ''}`;
            const box = ui.get('subtitleLog'), lines = (box.value ? box.value.split('\n') : []);
            lines.push(line);
            box.value = lines.slice(-2000).join('\n');
            box.scrollTop = box.scrollHeight;
        };
        const check = () => { if (cancelled) throw new Error('已停止'); };
        const meter = (done, total) => { const bar = ui.get('subtitleMeter'); bar.hidden = false; bar.max = total || 1; bar.value = done; };
        const render = () => {
            const missing = inventory.filter(row => !row.complete), searchable = missing.filter(row => !row.pendingVerification), ready = searchable.filter(row => row.selectedCandidate);
            ui.get('subtitleSummary').hidden = !inventory.length;
            ui.get('subtitleSummary').textContent = subtitleSearchSummary(inventory);
            ui.get('copySubtitleReport').disabled = busy || !inventory.length;
            ui.get('searchSubtitles').disabled = busy || !searchable.length;
            ui.get('copyMissingSubtitles').disabled = busy || !missing.length;
            ui.get('recheckSubtitles').disabled = busy || !inventory.length;
            ui.get('fillSubtitles').disabled = busy || !ready.length;
            const host = ui.get('subtitleRows'), expanded = new Set([...host.querySelectorAll('details[open]')].map(box => box.dataset.group));
            host.replaceChildren();
            const groups = new Map();
            for (const row of inventory) {
                const key = JSON.stringify([row.node.folders, row.parsed.query, row.parsed.year, row.parsed.season]);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(row);
            }
            for (const [key, rows] of groups) {
                const shown = ui.get('onlyChoiceSubtitles').checked ? rows.filter(row => subtitleSearchState(row) === 'choice') : rows;
                if (!shown.length) continue;
                const box = document.createElement('details'); box.className = 'sync-item'; box.dataset.group = key;
                box.open = expanded.has(key) || rows.some(row => subtitleSearchState(row) === 'failed');
                const summary = document.createElement('summary'), first = rows[0];
                summary.textContent = `${first.parsed.query || first.node.name}${first.parsed.season != null ? ' · 第 ' + first.parsed.season + ' 季' : ''} · 待补齐 ${rows.filter(row => !row.complete).length}/${rows.length} · 可补齐 ${rows.filter(row => subtitleSearchState(row) === 'ready').length} · 待核验 ${rows.filter(row => subtitleSearchState(row) === 'pending').length} · 待选择 ${rows.filter(row => subtitleSearchState(row) === 'choice').length} · 未找到 ${rows.filter(row => subtitleSearchState(row) === 'missing').length} · 失败 ${rows.filter(row => subtitleSearchState(row) === 'failed').length}`;
                box.append(summary);
                for (const row of shown) {
                    const text = document.createElement('p'); text.style.whiteSpace = 'pre-wrap';
                    text.textContent = `${({complete:'已有字幕',pending:'待核验',ready:'可补齐',choice:'待选择',missing:'未找到',failed:'失败',unsearched:'未查询'})[subtitleSearchState(row)]}：${row.node.name}\n${row.error || row.searchMessage || row.path}`; box.append(text);
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
        };
        const lock = value => {
            busy = value; ui.busy(value);
            for (const id of ['readSubtitles','recheckSubtitles','saveSubtitleSettings','forgetSubtitleKey','loginSubtitles','openSubtitlesKey','subtitleUsername','subtitlePassword','useOpenSubtitles','useShooter','useAssrt','useThunder','assrtToken','subtitleLanguage']) ui.get(id).disabled = value;
            ui.get('stopSubtitles').hidden = !value; ui.get('stopSubtitles').disabled = !value; render();
        };
        const searchRows = async rows => {
            rows = rows.filter(row => !row.complete && !row.pendingVerification);
            if (!rows.length) return;
            const config = settings();
            if (!config.thunder && !config.shooter && !(config.assrt && config.assrtToken) && !(config.open && config.key)) { ui.openSettings('subtitleSettings'); status('请启用迅雷免 Key 搜索，或配置其他字幕来源。'); return; }
            diag('查找开始', `视频 ${rows.length}，语言 ${config.language}，启用来源：${[config.assrt && 'Assrt', config.thunder && '迅雷', config.open && config.key && 'OpenSubtitles', config.shooter && '射手'].filter(Boolean).join('、') || '无'}`);
            if (!config.assrt) diag('来源跳过', 'Assrt 已关闭');
            if (!config.thunder) diag('来源跳过', '迅雷 已关闭');
            if (!config.open) diag('来源跳过', 'OpenSubtitles 已关闭');
            else if (!config.key) diag('来源跳过', 'OpenSubtitles 未配置 API Key');
            if (!config.shooter) diag('来源跳过', '射手已关闭');
            cancelled = false; lock(true); let done = 0;
            const aiConfig = GM_getValue('cross-drive-media-ai', {}) || {};
            let ai = null;
            if (aiConfig.enabled && aiConfig.base && aiConfig.model) {
                try { mediaAIEndpoint(aiConfig); ai = createMediaAI(aiConfig); }
                catch (error) { diag('AI 字幕建议', 'AI 设置无效，跳过候选消歧：' + error.message); }
            }
            service.resetSearchBatch?.();
            reviewCandidates = ai ? createSubtitleReviewer(ai, config.language, diag, check) : null;
            config.reviewCandidates = reviewCandidates;
            diag('查找策略', `${config.shooter ? '先按视频指纹匹配，未命中再查迅雷' : '视频指纹来源关闭，迅雷优先'}；${ai ? '名称有歧义时交给 AI 判断' : 'AI 未启用，使用严格片名匹配'}；限流或射手超时后本批跳过该来源`);
            try {
                drive.assertReady?.();
                for (const row of rows) {
                    check(); status(`查找字幕 ${done + 1}/${rows.length}：${row.node.name}`);
                    diag('源文件', row.node.name);
                    diag('作品解析', `片名：${row.parsed.query || '空'} · 年份：${row.parsed.year || '未知'} · 类型：${row.parsed.tv ? '剧集' : '电影/特别篇'} · 季：${row.parsed.season ?? '未知'} · 集：${row.parsed.episode ?? '未知'} · TMDB：${row.parsed.tmdbId || '无记录'}`);
                    if (!row.parsed.tmdbId || !row.parsed.aliases?.length) {
                        const credential = GM_getValue('cross-drive-tmdb-key', '');
                        if (credential) {
                            try {
                                const parsed = row.parsed;
                                if (await subtitleEnrichAliases(parsed, credential, check, diag)) diag('作品别名', `已按${parsed.tmdbId ? '确认的 TMDB 编号' : '唯一同名同年结果'}读取 ${parsed.aliases.length} 个片名；搜索词仍为 ${subtitleQueryTitle(parsed.query, parsed.year)}`);
                            } catch (error) { check(); diag('作品别名', '读取失败，继续按原片名严格匹配：' + error.message); }
                        }
                    }
                    diag('作品别名', row.parsed.aliases?.length ? row.parsed.aliases.join('；') : '无');
                    await searchSubtitleSources(row, config, service, drive, diag, check);
                    if (!row.selectedCandidate && row.candidates.length) diag('待选样例', row.candidates.slice(0, 8).map(candidate => `${subtitleCandidateLabel(candidate)}（${candidate.matchReason || '未满足自动选择条件'}）`).join('；'));
                    diag('视频结果', `${row.node.name} · ${row.selectedCandidate ? (row.aiSuggested ? 'AI 建议 ' : '自动选择 ') + subtitleCandidateLabel(row.selectedCandidate) : row.candidates.length ? '有候选待手选' : row.sources.some(source => source.error) ? '查询失败' : '未找到'}`);
                    meter(++done, rows.length); render();
                }
                status('查找结束：' + subtitleSearchSummary(inventory) + '。展开作品可查看每个来源的结果。'); diag('查找结束', subtitleSearchSummary(inventory));
            } catch (error) { render(); status(error.message); diag(cancelled ? '已停止' : '查找中断', error.message); }
            finally { lock(false); }
        };
        const readSubtitles = async (searchAfter = true) => {
            diag('检查开始', '读取当前选中的视频与已有字幕');
            cancelled = false; inventory = []; drive = null; lock(true);
            try {
                const context = await mediaContext(provider); check(); drive = subtitleDrive(context);
                const collected = await collectMediaSelection(context.selected, context.source, status, () => false, check, false); check();
                for (const node of collected.videos) {
                    try { await mediaRecords.restore?.(node, context.source, check); }
                    catch (error) { check(); if (error.stop || error.phase === 'drive-auth') throw error; diag('识别记录', `${node.name} · 元数据读取失败：${error.message}`); }
                }
                inventory = subtitleInventory(collected, context.path);
                const linkedSubtitleGroups = [...collected.linked.values()].filter(subtitles => subtitles.length).length;
                diag('检查完成', `视频 ${inventory.length}，已关联字幕 ${linkedSubtitleGroups} 组`);
                for (const row of inventory) {
                    const names = row.subtitles.map(sub => sub.name);
                    diag('现有字幕', `${row.node.name} · ${names.length ? names.join('、') : '未发现字幕文件'} · ${row.complete ? '文件名语言标记匹配' : '尚未确认语言'}`);
                }
                let done = 0;
                for (const row of inventory) {
                    check();
                    await inspectExistingSubtitles(row, drive, settings().language, diag, check);
                    try {
                        const recovered = await drive.reconcile(row, phase => diag('上传对账', `${row.node.name} · ${phase}`), check);
                        if (recovered.some(sub => subtitleLanguageMatch(sub.name, settings().language))) { row.complete = true; row.pendingVerification = false; row.error = ''; row.searchMessage = '此前上传的字幕已核验，无需重复上传'; }
                    } catch (error) { check(); if (error.stop) throw error; if (!row.complete) { row.pendingVerification = true; row.error = error.message; } diag('上传待核验', `${row.node.name} · ${error.message}`); }
                    meter(++done, inventory.length);
                }
                status(inventory.length ? '已检查选中范围。' : '选中范围没有正片视频。'); diag('字幕检查', inventory.length ? `完成，已有字幕确认 ${inventory.filter(row => row.complete).length}/${inventory.length}` : '选中范围没有正片视频');
            } catch (error) { inventory = []; drive = null; status('检查结束：' + error.message); diag('检查失败', error.message); }
            finally { lock(false); }
            if (searchAfter && !cancelled) await searchRows(inventory);
        };
        ui.get('readSubtitles').onclick = () => readSubtitles();
        ui.get('recheckSubtitles').onclick = () => readSubtitles(false);
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
                                const text = subtitlePayload(bytes, result.ext, config.language, message => diag('字幕解码', message));
                                subtitleCheckDuration(row, text, result.ext, diag);
                                diag('正文校验', `${row.node.name} · ${candidate.source} 通过，${bytes.length} 字节，${result.ext.toUpperCase()}`);
                                payload = {candidate, result, bytes}; break;
                            } catch (error) {
                                candidate.downloadFailed = true;
                                check(); if (error.stop) throw error; failures.push(candidate.source + ' · ' + (candidate.name || candidate.release) + '：' + error.message);
                                diag('候选失败', `${row.node.name} · ${candidate.source}：${error.message}`);
                                if (error.status === 493 && candidate.source === 'Assrt') candidates.sort((a,b) => Number(a.source === 'Assrt' && a.assrtId === candidate.assrtId) - Number(b.source === 'Assrt' && b.assrtId === candidate.assrtId));
                            }
                        }
                        if (!payload) throw new Error('候选均未通过下载/正文检查：' + failures.join('；'));
                        const {candidate, result, bytes} = payload;
                        const language = candidate.language || (config.language === 'en' ? 'en' : 'zh');
                        const name = mediaStem(row.node.name) + '.' + language.replace(/[^a-z0-9-]/gi, '') + '.' + result.ext;
                        const target = await drive.save(row, name, bytes, phase => { status(phase + '：' + row.node.name); diag('网盘写入', `${row.node.name} · ${phase}`); }, check);
                        row.subtitles.push(target); row.complete = true; row.searchMessage = '已补齐并核验：' + name; done++;
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
                status(`补齐结束：已核验 ${done}，待核验 ${pending}，失败 ${failed}。待核验项请先点击“重新检查目录”；同名不同内容不会覆盖。`); diag('补齐结束', `已核验 ${done}，待核验 ${pending}，失败 ${failed}`);
            } catch (error) { render(); status(`已中断：已核验 ${done}，待核验 ${pending}，失败 ${failed}；${error.message}`); diag('补齐中断', error.message); }
            finally { lock(false); }
        };
        ui.get('searchSubtitles').onclick = () => searchRows(inventory.filter(row => !row.complete));
        ui.get('stopSubtitles').onclick = () => { cancelled = true; ui.get('stopSubtitles').disabled = true; status('等待当前请求结束后停止…'); };
        ui.get('clearSubtitleLog').onclick = () => { ui.get('subtitleLog').value = ''; diag('日志', '已清空'); };
        ui.get('onlyChoiceSubtitles').onchange = render;
        ui.get('openSubtitlesKey').onchange = () => { service.logout(); ui.get('subtitleLoginState').textContent = '未登录'; };
        ui.get('subtitleLanguage').onchange = () => { inventory = []; drive = null; render(); status('语言已更改，请重新查找。'); };
        ui.get('saveSubtitleSettings').onclick = () => { GM_setValue('cross-drive-subtitle-settings', settings()); status('设置已保存。'); };
        ui.get('forgetSubtitleKey').onclick = () => {
            const currentDrive = drive || subtitleDrive({session:provider === '光鸭' ? {provider,token:capture.token} : recover123Session(),source:{}});
            currentDrive.verified?.clear();
            ui.get('openSubtitlesKey').value = ''; ui.get('assrtToken').value = ''; ui.get('subtitlePassword').value = ''; service.logout(); ui.get('subtitleLoginState').textContent = '未登录'; GM_setValue('cross-drive-subtitle-settings', settings()); status('已清除凭证和当前账号的字幕核验记录。');
        };
        ui.get('loginSubtitles').onclick = async () => {
            lock(true);
            try { await service.login(ui.get('subtitleUsername').value.trim(), ui.get('subtitlePassword').value, settings()); ui.get('subtitleLoginState').textContent = '已登录（仅本页有效）'; status('登录成功。'); }
            catch (error) { status('登录失败：' + error.message); }
            finally { ui.get('subtitlePassword').value = ''; lock(false); }
        };
        ui.get('copySubtitleReport').onclick = async () => {
            const report = subtitleSearchSummary(inventory) + '\n\n' + inventory.map(row => row.path + '\n' + (row.error || row.searchMessage || '未查询')).join('\n\n');
            try { await navigator.clipboard.writeText(report); status('查询结果已复制，不包含密钥和下载地址。'); }
            catch (error) { status('复制失败：' + error.message); }
        };
        ui.get('copySubtitleLog').onclick = async () => {
            try { await navigator.clipboard.writeText(ui.get('subtitleLog').value || '（暂无字幕运行日志）'); status('字幕运行日志已复制。'); }
            catch (error) { status('复制日志失败：' + error.message); }
        };
        ui.get('copyMissingSubtitles').onclick = async () => {
            try { await navigator.clipboard.writeText(inventory.filter(row => !row.complete).map(row => row.path).join('\n')); status('已复制缺失清单。'); }
            catch (error) { status('复制失败：' + error.message); }
        };
    }
