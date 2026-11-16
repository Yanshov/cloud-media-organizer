    function exportHistoryKey(provider) { return 'cross-drive-export-history-v1:' + provider; }
    function readExportHistory(provider) {
        const key = exportHistoryKey(provider);
        return GM_getValue(key, {});
    }
    function writeExportHistory(provider, history) {
        const key = exportHistoryKey(provider);
        GM_setValue(key, history);
    }
    function bindExportHistory(ui, provider) {
        refreshHistorySummary(ui, provider);
        ui.get('importHistory').onclick = () => ui.get('historyFile').click();
        ui.get('historyFile').onchange = async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            const controls = panelControls(ui);
            ui.busy(true); controls.forEach(control => { control.disabled = true; });
            try {
                const files = normalizeFiles(JSON.parse(await file.text()));
                const count = importExportHistory(provider, files);
                refreshHistorySummary(ui, provider);
                ui.get('status').textContent = `已合并 ${count} 项旧记录。下次自动对照更新，生成所选内容的完整 JSON。`;
            } catch (error) { ui.get('status').textContent = '导入历史失败：' + error.message; }
            finally { ui.get('historyFile').value = ''; controls.forEach(control => { control.disabled = false; }); ui.busy(false); }
        };
        ui.get('resetHistory').onclick = () => {
            writeExportHistory(provider, {});
            historyImportInfo(provider, null);
            refreshHistorySummary(ui, provider);
            ui.get('status').textContent = '已重置导出记录，下次将导出所有选中内容';
        };
    }
    function refreshHistorySummary(ui, provider, history = readExportHistory(provider)) {
        const count = Object.keys(history).length;
        const imported = historyImportInfo(provider);
        ui.get('historySummary').textContent = (imported ? `旧清单已导入：${imported.count} 项（${new Date(imported.time).toLocaleString()}）。` : '') + (count ? `已载入历史记录：${count} 项 · 刷新后仍保留` : '暂无历史记录 · 可导入以前保存的 JSON');
    }
    function historyImportInfo(provider, value) {
        const key = exportHistoryKey(provider) + ':last-import';
        if (arguments.length === 2) {
            GM_setValue(key, value);
        }
        return GM_getValue(key, null);
    }
    function importExportHistory(provider, files) {
        const next = { ...readExportHistory(provider) };
        for (const file of files) {
            const path = file.path;
            const entry = file.type === 'directory' ? { path, type: 'directory' } : { path, md5: file.md5, size: file.size };
            if (file.gcid && file.cid) Object.assign(entry, { gcid: file.gcid, cid: file.cid });
            Object.defineProperty(next, path, { value: JSON.stringify(entry), enumerable: true, configurable: true, writable: true });
        }
        writeExportHistory(provider, next);
        historyImportInfo(provider, { count: files.length, time: Date.now() });
        return files.length;
    }
    function exportManifestJson(ui, provider, result) {
        const previous = readExportHistory(provider), next = { ...previous };
        const has = path => Object.prototype.hasOwnProperty.call(previous, path);
        let unchanged = 0, directories = 0;
        const entries = result.entries;
        for (const entry of entries) {
            const signature = JSON.stringify(entry);
            const key = entry.path;
            const changed = !has(key) || previous[key] !== signature;
            if (!changed) unchanged++;
            Object.defineProperty(next, key, { value: signature, enumerable: true, configurable: true, writable: true });
            if (entry.type === 'directory') directories++;
        }
        const text = entries.length ? JSON.stringify(entries, null, 2) : '';
        writeExportHistory(provider, next);
        ui.get('json').value = text;
        refreshHistorySummary(ui, provider, next);
        return `本次导出 ${entries.length - directories} 个文件、${directories} 个目录（完整清单）；未变化 ${unchanged} 项，新增或更新 ${entries.length - unchanged} 项`;
    }
    async function getBdstoken() {
        const readers = [
            () => page.locals && page.locals.bdstoken,
            () => page.locals && typeof page.locals.get === 'function' && page.locals.get('bdstoken'),
            () => page.yunData && page.yunData.MYBDSTOKEN
        ];
        for (const read of readers) {
            try { const value = read(); if (typeof value === 'string' && value) return value; } catch (_) {}
        }
        const params = new URLSearchParams({ clienttype: '0', app_id: '250528', web: '1', fields: '["bdstoken"]' });
        const data = await requestJson(`${location.origin}/api/gettemplatevariable?${params}`, { credentials: 'include' });
        if (nonNegativeInteger(data.errno) === 0 && typeof data.result?.bdstoken === 'string' && data.result.bdstoken) return data.result.bdstoken;
        throw new Error('没有获取到 bdstoken，请确认已登录百度网盘');
    }
    async function collectTree(roots, source, progress = () => {}, parentPath = '') {
        const stack = roots.slice().reverse().map(node => ({ node, path: relativeParts(node.exportPath || (parentPath ? parentPath + '/' + node.name : node.name)).join('/') }));
        const seen = new Set(), paths = new Map(), entries = [], skipped = [];
        let files = 0, directories = 0, processed = 0, lastProgress = 0;
        while (stack.length) {
            const { node, path } = stack.pop();
            if (relativeParts(node.name).length !== 1) throw new Error('云盘返回了包含路径分隔符的文件名');
            if (!node.key) throw new Error('文件列表缺少项目 ID');
            if (seen.has(node.key)) continue;
            seen.add(node.key);
            if (paths.has(path) && paths.get(path) !== node.key) throw new Error(`不同项目导出为同一路径：${path}；请分开导出`);
            paths.set(path, node.key);
            if (node.directory) {
                entries.push({ path, type: 'directory' });
                directories++;
                const children = await source.children(node);
                for (let i = children.length - 1; i >= 0; i--) {
                    stack.push({ node: children[i], path: path + '/' + children[i].name });
                }
            } else {
                const file = hasFileMetadata(node) ? node : await source.metadata?.(node);
                if (!hasFileMetadata(file)) skipped.push(path);
                else {
                    const entry = { path, md5: file.md5.toLowerCase(), size: file.size };
                    if (typeof file.gcid === 'string' && typeof file.cid === 'string' && /^[a-f0-9]{40}$/i.test(file.gcid) && /^[a-f0-9]{40}$/i.test(file.cid)) Object.assign(entry, { gcid: file.gcid.toUpperCase(), cid: file.cid.toUpperCase() });
                    entries.push(entry); files++;
                }
            }
            if (Date.now() - lastProgress >= 100 || !stack.length) {
                progress({ files, directories, skipped: skipped.length, path });
                lastProgress = Date.now();
            }
            if (++processed % 128 === 0) await sleep(0);
        }
        return { entries, files, directories, skipped };
    }
    async function readPages(load, keyOf) {
        const items = [], seen = new Set();
        let expectedTotal = null;
        for (let pageNumber = 1; pageNumber <= 10000; pageNumber++) {
            const result = await load(pageNumber, items.length);
            if (!result || !Array.isArray(result.items)) throw new Error('目录列表格式不正确');
            if (result.total != null) {
                if (expectedTotal != null && result.total !== expectedTotal) throw new Error('读取期间目录项目数发生变化，请重试');
                expectedTotal = result.total;
            }
            let added = 0;
            for (const item of result.items) {
                const key = keyOf(item);
                if (!key) throw new Error('目录列表缺少 ID');
                if (seen.has(key)) throw new Error('目录分页没有进展或包含重复项目，请重新读取，避免漏文件');
                seen.add(key); items.push(item); added++;
            }
            if (!result.more) {
                if (expectedTotal != null && items.length !== expectedTotal) throw new Error(`目录项目数不一致：应有 ${expectedTotal}，实际读到 ${items.length}；请重新读取`);
                return items;
            }
            if (expectedTotal != null && items.length >= expectedTotal) throw new Error('目录分页与总数不一致，请重新读取');
            if (!added) throw new Error('目录分页没有进展，已停止，避免漏文件');
        }
        throw new Error('目录分页超过上限，请分批读取');
    }
    function decimalId(value) {
        if (typeof value === 'number' && !Number.isSafeInteger(value)) return '';
        return /^(0|[1-9]\d*)$/.test(String(value)) ? String(value) : '';
    }
    function baiduNode(file) {
        if (!file || typeof file.path !== 'string' || !file.path.startsWith('/') || typeof file.server_filename !== 'string' || ![0, 1].includes(nonNegativeInteger(file.isdir))) throw new Error('百度文件元数据不完整');
        return { key: file.path, name: file.server_filename, directory: Number(file.isdir) === 1, md5: decodeMd5(file.md5), size: nonNegativeInteger(file.size), id: decimalId(file.fs_id) };
    }
    function baiduSource(token) {
        const get = paced(180, async (endpoint, params) => {
            const query = new URLSearchParams({ ...params, channel: 'chunlei', web: '1', app_id: '250528', bdstoken: token });
            const data = await requestJson(`${location.origin}${endpoint}?${query}`, { credentials: 'include' });
            if (nonNegativeInteger(data.errno) !== 0) throw new Error(`百度接口错误：${data.errno ?? '未知'}`);
            return data;
        });
        const source = {
            async selected(ids) {
                const roots = [];
                for (let i = 0; i < ids.length; i += 100) {
                    const data = await get('/api/filemetas', { fsids: `[${ids.slice(i, i + 100).join(',')}]`, dlink: '0', detail: '1' });
                    if (!Array.isArray(data.info) || data.info.length !== ids.slice(i, i + 100).length) throw new Error('选中项目的元数据返回不完整，请重新选择');
                    roots.push(...data.info.map(baiduNode));
                }
                const directories = new Set(roots.filter(node => node.directory).map(node => node.key));
                return roots.filter(node => {
                    let parent = node.key;
                    while ((parent = parent.slice(0, parent.lastIndexOf('/')))) if (directories.has(parent)) return false;
                    return true;
                });
            },
            async children(node) {
                return readPages(async pageNumber => {
                    const data = await get('/api/list', { dir: node.key, num: '1000', page: String(pageNumber), order: 'name', desc: '0' });
                    if (!Array.isArray(data.list)) throw new Error('百度没有返回目录列表');
                    const more = data.has_more != null ? Number(data.has_more) === 1 : data.list.length >= 1000;
                    return { items: data.list.map(baiduNode), more };
                }, file => file.key);
            },
            async metadata(node) {
                if (!node.id) return null;
                const roots = await source.selected([node.id]);
                if (roots[0]?.key !== node.key) throw new Error('读取期间文件发生变化，请重新导出');
                return roots[0];
            }
        };
        return source;
    }
    function currentBaiduPath() {
        const hash = location.hash || '';
        const fromHash = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash.slice(1)).get('path');
        const path = fromHash ?? new URLSearchParams(location.search).get('path');
        if (path == null || !path.startsWith('/')) throw new Error('未识别到当前目录路径，请勾选文件或文件夹后点“导出 JSON”');
        return path === '/' ? path : path.replace(/\/$/, '');
    }
    const pan123Domains = ['123pan.com', '123pan.cn', '123865.com', '123684.com', '123912.com'];
    const is123Host = host => pan123Domains.some(domain => host === domain || host.endsWith('.' + domain));
    // 新版云盘的文件接口已迁至独立域名；仅信任网页公开配置中的生产接口。
    const pan123ApiOrigins = new Set(['https://api.123278.com', 'https://api.123panapi.com', 'https://api.123panapi.cn']);
    function is123ApiUrl(url) {
        return url.protocol === 'https:' && (pan123ApiOrigins.has(url.origin) || is123Host(url.hostname)) && /^\/(?:[ab]\/)?api\//.test(url.pathname);
    }
    function read123Storage(key) {
        try { return page.localStorage?.getItem(key) ?? ''; } catch (_) { return ''; }
    }
    function stored123Token(key) {
        let value = read123Storage(key);
        try { value = JSON.parse(value); } catch (_) {}
        if (typeof value !== 'string') return '';
        value = value.trim().replace(/^Bearer\s+/i, '');
        return value && !/^(?:null|undefined)$/i.test(value) && !/[\s"\x00-\x1f]/.test(value) ? value : '';
    }
    function current123Parent() {
        const url = new URL(location.href);
        const hash = url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : url.hash.slice(1);
        const query = url.searchParams.has('homeFilePath') ? url.searchParams : new URLSearchParams(hash);
        const raw = query.get('homeFilePath');
        if (raw != null && raw.trim()) {
            const ids = raw.split(',').map(id => decimalId(id.trim()));
            if (ids.some(id => !id)) throw new Error('网址中的 homeFilePath 不是有效目录路径，请重新打开所需文件夹');
            return ids.at(-1);
        }
        // 新网页根目录没有 homeFilePath；不能沿用上一个目录的捕获值。
        if (url.pathname === '/' && (!url.hash || raw != null)) return '0';
        if (capture.parent123 != null) return capture.parent123;
        throw new Error('未识别到当前目录，请打开“全部文件”中的目标文件夹');
    }
    async function export123ParentPath(source) {
        if (source.parentId === '0') return '';
        const url = new URL(location.href);
        const hash = url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : url.hash.slice(1);
        const raw = url.searchParams.get('homeFilePath') ?? new URLSearchParams(hash).get('homeFilePath');
        const ids = (raw || source.parentId).split(',').map(id => decimalId(id.trim())).filter(id => id !== '0');
        if (ids.some(id => !id) || ids.at(-1) !== source.parentId) throw new Error('无法确认源目录路径，请重新打开源文件夹后导出');
        let parent = '0';
        const names = [];
        for (const id of ids) {
            const folder = (await source.children({ id: parent })).find(item => item.id === id && item.directory);
            if (!folder || relativeParts(folder.name).length !== 1) throw new Error('无法读取完整源目录树，请从网盘根目录逐层打开源文件夹后导出');
            names.push(folder.name);
            parent = id;
        }
        return names.join('/');
    }
    function recover123Session() {
        const token = stored123Token('authorToken') || capture.token123 || stored123Token('accessToken');
        if (!token) throw new Error('没有读到 123 登录状态，请确认当前网页已登录后刷新；无需填写或复制 Token');
        capture.token123 = token;
        let base = capture.base123;
        if (!base) {
            try {
                const entries = page.performance?.getEntriesByType('resource') || [];
                for (let index = entries.length - 1; index >= 0; index--) {
                    const url = new URL(entries[index].name, location.href);
                    if (is123ApiUrl(url) && /^\/[ab]\/api\//.test(url.pathname)) {
                        base = url.origin + url.pathname.match(/^\/[ab]\/api/)[0];
                        break;
                    }
                }
            } catch (_) {}
        }
        if (!base) base = 'https://api.123278.com/b/api';
        const target = new URL(base + '/file/list/new');
        if (!is123ApiUrl(target)) throw new Error('123 接口地址不受支持，请刷新页面后重试');
        const url = new URL(location.href);
        const hashParams = new URLSearchParams(url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : url.hash.slice(1));
        const category = url.searchParams.get('category') ?? hashParams.get('category');
        if ((category != null && category !== '' && category !== '0') || url.searchParams.get('search') || hashParams.get('search')) throw new Error('请先进入“全部文件”的实际文件夹，再导入或导出；分类、搜索和回收站页面不支持');
        const headers = { Authorization: `Bearer ${token}`, platform: 'web', 'app-version': '3' };
        const loginUuid = read123Storage('LoginUuid') || capture.loginUuid123;
        if (loginUuid) headers.LoginUuid = loginUuid;
        return { token, base, parent: current123Parent(), headers };
    }
    // CRC32 请求签名格式参考 OpenList 的 123 驱动；只用于当前已登录网页的只读文件列表。
    function crc32(value) {
        let crc = -1;
        for (const byte of new TextEncoder().encode(value)) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
        return (crc ^ -1) >>> 0;
    }
    function signed123Url(base, params, now = Date.now(), random = Math.round(Math.random() * 1e7)) {
        const url = new URL(base + '/file/list/new');
        const minute = new Date(now + 8 * 3600000).toISOString().slice(0, 16).replace(/\D/g, '');
        const letters = ['a', 'd', 'e', 'f', 'g', 'h', 'l', 'm', 'y', 'i'];
        const key = String(crc32([...minute].map(char => letters[Number(char)]).join('')));
        const timestamp = Math.floor(now / 1000);
        const signature = crc32(`${timestamp}|${random}|${url.pathname}|web|3|${key}`);
        for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
        url.searchParams.set(key, `${timestamp}-${random}-${signature}`);
        return url.href;
    }
    function pan123Node(file) {
        const id = decimalId(file?.FileId);
        if (!id || id === '0' || typeof file.FileName !== 'string' || ![0, 1].includes(nonNegativeInteger(file.Type))) throw new Error('123 文件元数据格式不正确');
        return { key: id, id, name: file.FileName, directory: Number(file.Type) === 1, md5: file.Etag, s3keyFlag: file.S3KeyFlag, size: nonNegativeInteger(file.Size) };
    }
    function pan123Source(session = recover123Session()) {
        // 一次导出的凭证和 API 地址固定，切换网页不会改变正在遍历的目录。
        const { base, parent, headers } = session;
        // 123 接口使用通配来源的 CORS；携带 Cookie 会被浏览器拒绝，登录仅使用上面的 Bearer Token。
        const get = paced(250, url => requestJson(url, { credentials: 'omit', headers }));
        return {
            parentId: parent,
            async children(node) {
                let next = '0';
                return readPages(async (pageNumber, count) => {
                    const url = signed123Url(base, { driveId: 0, limit: 100, next, orderBy: 'file_id', orderDirection: 'desc', parentFileId: node.id, trashed: false, SearchData: '', Page: pageNumber, OnlyLookAbnormalFile: 0, event: 'homeListFile', operateType: 4, inDirectSpace: false });
                    const data = await get(url);
                    if (![0, 200].includes(apiCode(data))) throw apiError('123 目录读取', data);
                    if (!Array.isArray(data.data?.InfoList)) throw new Error('123 没有返回文件列表');
                    const items = data.data.InfoList.map(pan123Node);
                    next = String(data.data.Next ?? '0');
                    const total = nonNegativeInteger(data.data.Total);
                    const more = next !== '-1' && (total != null ? count + items.length < total : next !== '0' || items.length >= 100);
                    return { items, more, total };
                }, file => file.key);
            }
        };
    }
    function selected123State() {
        // 新版使用虚拟列表；从当前 React 组件读取完整勾选 ID，包含滚出屏幕的项。
        const containers = document.querySelectorAll('.file-table-list-wrapper, .tiled-list-content-scroll, .file-wrapper[data-file]');
        for (const element of containers) {
            const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
            let fiber = key && element[key];
            if (!fiber) continue;
            let root = fiber;
            while (root.return) root = root.return;
            if (root.stateNode?.current && root.stateNode.current !== root) fiber = fiber.alternate || fiber;
            while (fiber) {
                const props = fiber.memoizedProps;
                const state = props?.value?.browserBridge?.homeState || props?.value?.homeState;
                const ids = props?.rowSelection?.selectedRowKeys ?? state?.selectedRowKeys;
                if (Array.isArray(ids)) return ids.map(id => ({ id: decimalId(id), names: [] }));
                fiber = fiber.return;
            }
        }
        return null;
    }
    function selectedItems(provider) {
        if (provider === '123') {
            const state = selected123State();
            if (state !== null) {
                if (state.some(item => !item.id)) throw new Error('选中项目缺少有效 ID，请重新选择');
                return state;
            }
        }
        const baidu = provider === '百度';
        const rows = new Set(document.querySelectorAll(baidu
            ? '.mouse-choose-item.selected, .mouse-choose-item[aria-selected="true"], .wp-s-pan-table__body-row.selected, .wp-s-pan-table__body-row[aria-selected="true"], tr.selected[data-id], tr[aria-selected="true"][data-row-key]'
            : '.ant-table-row-selected, .ant-table-row[aria-selected="true"], tr[aria-selected="true"][data-row-key], .file-wrapper.selected[data-file], .file-wrapper[aria-selected="true"][data-file]'));
        // 兼容只更新复选框、未给行添加 selected 类的视图；表头全选框不会匹配文件行。
        const rowSelector = baidu ? '.mouse-choose-item, .wp-s-pan-table__body-row, tr[data-id], tr[data-fs-id], tr[data-row-key]'
            : '.ant-table-row, tr[data-row-key], .file-wrapper[data-file]';
        for (const checkbox of document.querySelectorAll('input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"]')) {
            const row = checkbox.closest(rowSelector);
            if (row) rows.add(row);
        }
        const items = new Map();
        for (const row of rows) {
            const id = ['data-row-key', 'data-id', 'data-fs-id', 'data-file-id', 'data-file'].map(key => decimalId(row.getAttribute(key))).find(Boolean);
            const names = id ? [] : [...row.querySelectorAll('[title]')].map(element => element.getAttribute('title')).filter(Boolean);
            if (!id && !names.length) throw new Error('选中项目缺少 ID 和文件名，请切换列表视图后重试');
            items.set(id || row, { id, names });
        }
        return [...items.values()];
    }
    function selectedGuangyaItems() {
        const seen = new Set();
        for (const element of document.querySelectorAll('#app *')) {
            const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
            let fiber = key && element[key];
            while (fiber && !seen.has(fiber)) {
                seen.add(fiber);
                const props = fiber.memoizedProps;
                if (props?.rowKey === 'fileId' && Array.isArray(props.dataSource) && Array.isArray(props.selectedItems)) {
                    const ids = props.selectedItems.map(decimalId);
                    if (ids.some(id => !id)) throw new Error('光鸭选中项目缺少有效 ID，请重新勾选');
                    return ids.map(id => ({ id, names: [] }));
                }
                fiber = fiber.return;
            }
        }
        throw new Error('无法读取光鸭文件列表，请刷新页面后重试');
    }
    function matchSelected(nodes, selected) {
        const byId = new Map(), byName = new Map();
        for (const node of nodes) {
            byId.set(node.id, node);
            byName.set(node.name, byName.has(node.name) ? null : node);
        }
        const roots = new Map();
        for (const item of selected) {
            if (!item.id && item.names.some(name => byName.has(name) && byName.get(name) === null)) throw new Error('选中项目存在同名歧义，请切换列表视图后重试');
            const matches = item.id ? [byId.get(item.id)].filter(Boolean) : [...new Set(item.names.map(name => byName.get(name)).filter(Boolean))];
            if (matches.length !== 1) throw new Error('选中项目无法唯一匹配，请重新勾选后重试');
            roots.set(matches[0].key, matches[0]);
        }
        return [...roots.values()];
    }
    function initExporter(provider) {
        const ui = makePanel(`${provider} 跨盘 JSON ${VERSION}`, `
            <p id="scope">先在网盘页面选中文件/文件夹，再导出 JSON；可粘贴后导入，也可点“选择文件”。</p>
            <textarea id="json" placeholder="导出的 JSON 会显示在这里；导入时也可粘贴 JSON"></textarea>
            <input id="manifest" type="file" accept=".json,application/json" hidden>
            <div class="panel-actions"><button id="generate">导出 JSON</button><button id="transfer">导入 JSON</button><button id="chooseManifest">选择文件</button><button id="copy">复制 JSON</button><button id="save">保存 JSON</button><button id="clear">清除</button></div>
            <p id="status"></p><p id="progress"></p><div id="log"></div>`);
        bindExportHistory(ui, provider);
        ui.get('incremental').closest('label').hidden = true;
        const generate = async () => {
            const controls = panelControls(ui);
            ui.busy(true); controls.forEach(button => { button.disabled = true; });
            ui.get('json').value = '';
            ui.get('progress').textContent = '';
            ui.get('status').textContent = '正在读取…';
            try {
                const selected = selectedItems(provider);
                if (!selected.length) throw new Error('没有识别到选中项，请先勾选文件或文件夹；未导出任何内容');
                let source, roots, parentPath = '';
                if (provider === '百度') {
                    const path = selected.some(item => !item.id) ? currentBaiduPath() : null;
                    source = baiduSource(await getBdstoken());
                    if (selected.some(item => !item.id)) {
                        roots = await source.children({ key: path, directory: true });
                        roots = matchSelected(roots, selected);
                    } else roots = await source.selected([...new Set(selected.map(item => item.id))]);
                    roots = roots.map(node => ({ ...node, exportPath: node.key.slice(1) }));
                } else {
                    source = pan123Source();
                    if (source.parentId !== '0') parentPath = await export123ParentPath(source);
                    roots = await source.children({ id: source.parentId });
                    roots = matchSelected(roots, selected);
                }
                const scope = `选中 ${roots.length} 项（含子目录）`;
                if (!roots.length) throw new Error('当前目录没有可导出的项目');
                const result = await collectTree(roots, source, state => {
                    ui.get('status').textContent = `范围：${scope}；已读 ${state.files} 个文件、${state.directories} 个目录，跳过 ${state.skipped} 项；正在处理：${state.path}`;
                }, parentPath);
                if (!result.entries.length) throw new Error('没有可导出的文件信息');
                const summary = exportManifestJson(ui, provider, result);
                ui.get('status').textContent = `完成（${scope}）：${summary}。` + (!ui.get('json').value ? '没有可导出的内容。' : '请复制或保存 JSON，到目标盘导入。') + (result.skipped.length ? ` 缺少有效 MD5/大小，已跳过 ${result.skipped.length} 项：${result.skipped.slice(0, 5).join('、')}` : '');
            } catch (error) { ui.get('status').textContent = '失败：' + error.message; }
            finally { controls.forEach(button => { button.disabled = false; }); ui.busy(false); }
        };
        ui.get('clear').onclick = () => {
            ui.get('manifest').value = ''; ui.get('json').value = ''; ui.get('log').textContent = '';
            ui.get('status').textContent = ''; ui.get('progress').textContent = '';
        };
        ui.get('generate').onclick = () => generate();
        ui.get('save').onclick = () => {
            const value = ui.get('json').value;
            if (!value) { ui.get('status').textContent = '请先生成 JSON'; return; }
            saveJsonFile(value, `${provider}-跨盘清单-${Date.now()}.json`, message => { ui.get('status').textContent = message; });
        };
        ui.get('copy').onclick = () => copyManifest(ui);
        return ui;
    }
    function inspectRequest(target, headers, body) {
        const pan123 = is123ApiUrl(target);
        const tokenKey = pan123 ? 'token123' : 'token';
        const auth = headers.get('authorization');
        let changed = false;
        if (auth && /^Bearer\s+\S+/i.test(auth)) {
            const token = auth.replace(/^Bearer\s+/i, '').trim();
            changed = capture[tokenKey] !== token;
            capture[tokenKey] = token;
        }
        if (pan123) {
            const uuid = headers.get('LoginUuid');
            if (uuid) capture.loginUuid123 = uuid;
        }
        const isList = pan123 ? /\/(?:[ab]\/)?api\/file\/list(?:\/new)?$/.test(target.pathname) : target.pathname === API.list;
        if (isList) {
            const key = pan123 ? 'parentFileId' : 'parentId';
            let parent = target.searchParams.get(key);
            if (typeof body === 'string' && body.trim()) {
                try { parent = JSON.parse(body)?.[key] ?? parent; } catch (_) {}
                if (parent == null && /application\/x-www-form-urlencoded/i.test(headers.get('content-type') || '')) parent = new URLSearchParams(body).get(key);
            } else if (body && typeof body.get === 'function') parent = body.get(key) ?? parent;
            const id = !pan123 && parent === '' ? '0' : decimalId(parent);
            if (id) {
                const parentKey = pan123 ? 'parent123' : 'parent';
                changed = changed || capture[parentKey] !== id;
                capture[parentKey] = id;
                if (pan123) capture.base123 = target.origin + target.pathname.replace(/\/file\/list(?:\/new)?$/, '');
            }
        }
        if (!pan123 && changed) refreshStatus();
        return isList;
    }
    function initManifestImporter(provider, ui) {
        const controls = panelControls(ui);
        const log = message => appendLog(ui, message);
        ui.get('manifest').onchange = event => { const file = event.target.files?.[0]; if (file) return runImport(file); };
        ui.get('chooseManifest').onclick = () => ui.get('manifest').click();
        const runImport = async file => {
            ui.busy(true); controls.forEach(control => { control.disabled = true; });
            ui.get('log').textContent = '';
            try {
                if (file) { ui.get('json').value = await file.text(); ui.get('status').textContent = `已载入：${file.name}，正在导入…`; }
                const files = normalizeFiles(JSON.parse(ui.get('json').value));
                ui.get('progress').textContent = `准备导入 ${files.length} 项…`;
                const target = { id: provider === '123' ? current123Parent() : currentBaiduPath() };
                if (provider === '123') {
                    const session = recover123Session(), { base, headers } = session;
                    const post = paced(750, (path, body) => requestJson(`${base}${path}`, { method: 'POST', credentials: 'omit', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
                    const folders = new Map([['', target.id]]), childLists = new Map(), source = pan123Source(session);
                    const unresolvedFolders = new Map();
                    const children = async parentId => {
                        if (!childLists.has(parentId)) childLists.set(parentId, await source.children({ id: parentId }));
                        return childLists.get(parentId);
                    };
                    await children(target.id);
                    const locateDirectory = async (parent, name, path) => {
                        try {
                            for (let attempt = 0; attempt < 3; attempt++) {
                                if (attempt) await sleep(350);
                                childLists.delete(parent);
                                const matches = (await children(parent)).filter(item => item.name === name);
                                if (matches.length === 1 && matches[0].directory && matches[0].id !== '0' && matches[0].id !== parent) return matches[0].id;
                                if (matches.length) throw new Error(`目录 ${path} 存在同名冲突或异常 ID`);
                            }
                            throw new Error(`创建后未能在父目录 ID ${parent} 中确认 ${path}；本次跳过该目录及其内容，避免重复创建或放错位置`);
                        } catch (error) { unresolvedFolders.set(path, error); throw error; }
                    };
                    let saved = 0, missed = 0, skipped = 0, failed = 0, pending = 0, processed = 0;
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        processed++;
                        ui.get('progress').textContent = `导入进度：${i + 1}/${files.length}（已处理 ${Math.floor(i * 100 / files.length)}%） ${file.path}`;
                        try {
                            const parts = relativeParts(file.path), name = parts.pop();
                            let parent = target.id, relative = '';
                            const folderParts = file.type === 'directory' ? [...parts, name] : parts;
                            for (const part of folderParts) {
                                relative = relative ? `${relative}/${part}` : part;
                                if (unresolvedFolders.has(relative)) throw unresolvedFolders.get(relative);
                                if (folders.has(relative)) { parent = folders.get(relative); continue; }
                                const parentChildren = await children(parent);
                                const matches = parentChildren.filter(item => item.name === part);
                                if (matches.length > 1) throw new Error('多个同名项目，无法确认目录：' + relative);
                                const old = matches[0];
                                if (old) {
                                    if (!old.directory || old.id === '0' || old.id === parent) throw new Error(`同名文件或异常目录挡住路径：${relative}`);
                                    parent = old.id;
                                } else {
                                    let made;
                                    try { made = await post('/file/upload_request', { driveId: 0, parentFileId: parent, fileName: part, type: 1, size: 0, duplicate: 0 }); }
                                    catch (error) { unresolvedFolders.set(relative, error); throw error; }
                                    if ([0, 200].includes(apiCode(made))) {
                                        const createdId = decimalId(made.data?.FileId ?? made.data?.fileId);
                                        if (!createdId || createdId === '0' || createdId === parent) {
                                            const actualId = await locateDirectory(parent, part, relative);
                                            log(`目录已确认：${relative}；父目录 ID ${parent} → 目录 ID ${actualId}`);
                                            parent = actualId;
                                        } else {
                                            log(`目录：${relative}；父目录 ID ${parent} → 新目录 ID ${createdId}`);
                                            parent = createdId;
                                            parentChildren.push({ id: parent, name: part, directory: true });
                                            childLists.set(parent, []);
                                        }
                                    } else if (apiCode(made) === 5060) {
                                        parent = await locateDirectory(parent, part, relative);
                                    } else throw apiError('123 创建目录', made);
                                }
                                folders.set(relative, parent);
                            }
                            if (file.type === 'directory') continue;
                            const parentChildren = await children(parent);
                            const sameName = parentChildren.filter(item => item.name === name);
                            if (sameName.length > 1) throw new Error('目标存在多个同名项目，无法确认：' + file.path);
                            const old = sameName[0];
                            if (old) { const message = existingFileMessage(old, file); skipped++; log(`${file.path}：${message}`); continue; }
                            const response = await post('/file/upload_request', { driveId: 0, parentFileId: parent, fileName: name, type: 0, size: file.size, etag: file.md5, duplicate: 0 });
                            if (apiCode(response) === 5060) {
                                childLists.delete(parent);
                                const refreshed = await children(parent);
                                const matches = refreshed.filter(item => item.name === name);
                                if (matches.length > 1) throw new Error('目标存在多个同名项目，无法确认：' + file.path);
                                const existing = matches[0];
                                if (existing) {
                                    const message = existingFileMessage(existing, file); skipped++; log(`${file.path}：${message}`); continue;
                                }
                            }
                            if (![0, 200].includes(apiCode(response))) throw apiError('123 秒传', response);
                            if (response.data?.Reuse === true || response.data?.reuse === true) {
                                let verified = false;
                                for (let attempt = 0; attempt < 5; attempt++) {
                                    if (attempt) await sleep(500);
                                    childLists.delete(parent);
                                    const matches = (await children(parent)).filter(item => item.name === name);
                                    if (!matches.length) continue;
                                    if (matches.length !== 1) throw new Error('目标存在多个同名项目，无法验证：' + file.path);
                                    existingFileMessage(matches[0], file);
                                    if (hasFileMetadata(matches[0])) { verified = true; break; }
                                }
                                if (verified) saved++;
                                else { pending++; log(`${file.path}：接口报告复用，但尚未在目标目录验证到完整文件信息，结果待确认`); }
                            } else { missed++; log(`${file.path}：哈希未命中，需文件本体，未上传`); }
                        } catch (error) {
                            failed++;
                            log(`${file.path}：单项失败，已跳过；${error.message}`);
                            if (error.stop) { log('登录或权限异常，已停止后续项目'); break; }
                        }
                    }
                    ui.get('status').textContent = processed < files.length ? '导入已停止' : missed + failed + pending ? '导入结束，含未完成项' : '导入完成';
                    ui.get('progress').textContent = `导入结束：已处理 ${processed}/${files.length} 项；确认复用 ${saved}，未完成 ${missed}，待确认 ${pending}，同名跳过 ${skipped}，单项失败 ${failed}，未处理 ${files.length - processed}`;
                } else {
                    const token = await getBdstoken();
                    const source = baiduSource(token), rootPath = target.id;
                    const dirs = new Map([['', rootPath]]), cached = new Map();
                    const children = async path => {
                        if (!cached.has(path)) cached.set(path, await source.children({ key: path || '/', directory: true }));
                        return cached.get(path);
                    };
                    const create = async body => {
                        const response = await requestJson(`${location.origin}/api/create?${new URLSearchParams({ channel: 'chunlei', web: '1', app_id: '250528', bdstoken: token })}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                        if (nonNegativeInteger(response.errno) !== 0) throw new Error(`百度创建失败：${response.errno ?? '未知错误'}`);
                    };
                    let saved = 0, missed = 0, skipped = 0;
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        ui.get('progress').textContent = `导入进度：${i + 1}/${files.length}（已处理 ${Math.floor(i * 100 / files.length)}%） ${file.path}`;
                        const parts = relativeParts(file.path), name = parts.pop();
                        let parent = rootPath, relative = '';
                        const folderParts = file.type === 'directory' ? [...parts, name] : parts;
                        for (const part of folderParts) {
                            relative = relative ? `${relative}/${part}` : part;
                            if (dirs.has(relative)) { parent = dirs.get(relative); continue; }
                            const fullPath = `${parent.replace(/\/$/, '')}/${part}` || `/${part}`;
                            const entries = await children(parent);
                            let folder = entries.find(item => item.directory && item.name === part);
                            if (!folder) {
                                if (entries.some(item => item.name === part)) throw new Error(`同名文件挡住目录：${relative}`);
                                await create({ path: fullPath, isdir: 1, size: 0, block_list: '[]' });
                                folder = { key: fullPath, name: part, directory: true };
                                cached.delete(parent);
                            }
                            parent = folder.key; dirs.set(relative, parent);
                        }
                        if (file.type === 'directory') continue;
                        const entries = await children(parent);
                        if (entries.some(item => item.name === name)) { skipped++; log(`${file.path}：目标已有同名项目，跳过`); continue; }
                        if (file.size > 256 * 1024) { missed++; log(`${file.path}：百度需要前 256 KB 分片哈希；清单不含原文件，未提交`); continue; }
                        const path = `${parent.replace(/\/$/, '')}/${name}` || `/${name}`;
                        const params = new URLSearchParams({ channel: 'chunlei', web: '1', app_id: '250528', bdstoken: token, clienttype: '0', async: '2' });
                        const response = await requestJson(`${location.origin}/api/rapidupload?${params}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams({ path, 'content-md5': file.md5, 'slice-md5': file.md5, 'content-length': String(file.size), isdir: '0', rtype: '3' }).toString() });
                        if (nonNegativeInteger(response.errno) === 0) { saved++; cached.delete(parent); log(`${file.path}：百度秒传接口已接受`); }
                        else { missed++; log(`${file.path}：百度未命中秒传（${response.errno ?? '未知错误'}），需要原文件`); }
                    }
                    ui.get('status').textContent = '导入完成';
                    ui.get('progress').textContent = `导入完成：${files.length}/${files.length} 项；百度接口接受 ${saved}，未完成 ${missed}，同名跳过 ${skipped}；大于 256 KB 的项目需原文件分片哈希`;
                }
            } catch (error) { ui.get('status').textContent = '失败：' + error.message; ui.get('progress').textContent = '导入失败：' + error.message; }
            finally { ui.get('manifest').value = ''; controls.forEach(control => { control.disabled = false; }); ui.busy(false); }
        };
        ui.get('transfer').onclick = () => runImport();
    }
    function installHooks() {
        const pan123 = is123Host(location.hostname);
        const targetOf = value => {
            const url = new URL(value, location.href);
            return (pan123 ? is123ApiUrl(url) : url.origin === 'https://api.guangyapan.com') ? url : null;
        };
        page.fetch = function(input, init) {
            try {
                const isRequest = input && typeof input === 'object' && typeof input.url === 'string';
                const target = targetOf(isRequest ? input.url : String(input));
                if (target) {
                    const headers = new page.Headers(init?.headers !== undefined ? init.headers : isRequest ? input.headers : undefined);
                    const isList = inspectRequest(target, headers, init?.body);
                    // 仅观察列表请求的正文，避免复制上传等业务的大请求体。
                    if (isList && isRequest && init?.body === undefined && input.body && !input.bodyUsed && /json|x-www-form-urlencoded/i.test(headers.get('content-type') || '')) {
                        input.clone().text().then(body => inspectRequest(target, headers, body)).catch(() => {});
                    }
                }
            } catch (_) { /* 观察失败不影响网页原始请求 */ }
            return nativeFetch(...arguments);
        };
        const proto = page.XMLHttpRequest?.prototype;
        if (!proto) return;
        const metadata = new WeakMap();
        const open = proto.open, setHeader = proto.setRequestHeader, send = proto.send;
        proto.open = function(method, url) {
            const result = open.apply(this, arguments);
            metadata.delete(this);
            try {
                const target = targetOf(String(url));
                if (target) metadata.set(this, { target, headers: new page.Headers() });
            } catch (_) {}
            return result;
        };
        proto.setRequestHeader = function(name, value) {
            const result = setHeader.apply(this, arguments);
            const item = metadata.get(this);
            if (item) { try { item.headers.append(name, value); } catch (_) {} }
            return result;
        };
        proto.send = function(body) {
            const item = metadata.get(this);
            if (item) { try { inspectRequest(item.target, item.headers, body); } catch (_) {} }
            return send.apply(this, arguments);
        };
    }
