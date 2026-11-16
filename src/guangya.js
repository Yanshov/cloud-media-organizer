    function currentGuangyaFolder() {
        // 光鸭网页路由：#/home/all/目录ID-名称/子目录ID-名称。
        const url = new URL(location.href);
        const route = url.hash.startsWith('#/') ? new URL(url.hash.slice(1), url.origin).pathname : url.pathname;
        const parts = route.split('/').filter(Boolean);
        if (parts[0] !== 'home' || parts[1] !== 'all') return null;
        let id = '0';
        const names = [];
        for (const part of parts.slice(2)) {
            let segment;
            try { segment = decodeURIComponent(part); } catch (_) { return null; }
            const match = /^(0|[1-9]\d*)(?:-([\s\S]*))?$/.exec(segment);
            if (!match) return null;
            id = match[1];
            names.push(match[2] || id);
        }
        return { id, path: names.length ? names.join(' / ') : '根目录', exportPath: names.join('/') };
    }
    function alignGuangyaImport(files, target) {
        const prefix = target.exportPath;
        // Full exported paths may already include the open destination folder.
        // Only align when the entire manifest belongs to that exact path.
        if (!prefix || !files.every(file => file.path.startsWith(prefix + '/') || file.type === 'directory' && (file.path === prefix || prefix.startsWith(file.path + '/')))) return { files, alignedPath: '' };
        return {
            files: files.filter(file => file.path.startsWith(prefix + '/')).map(file => ({ ...file, path: file.path.slice(prefix.length + 1) })),
            alignedPath: prefix
        };
    }
    function guangyaSource(token, reuseHistory = true) {
        const knownContent = new Map();
        for (const signature of Object.values(reuseHistory ? readExportHistory('光鸭') : {})) {
            const entry = JSON.parse(signature);
            if (hasFileMetadata(entry) && /^[a-f0-9]{40}$/i.test(entry.gcid || '')) knownContent.set(entry.gcid.toUpperCase(), entry);
        }
        const post = paced(180, (endpoint, body) => requestJson(`https://api.guangyapan.com${endpoint}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json;charset=utf-8', Authorization: `Bearer ${token}`, dt: '4' }, body: JSON.stringify(body)
        }));
        const node = file => {
            const id = decimalId(file?.fileId);
            if (!id || typeof file.fileName !== 'string') throw new Error('光鸭目录项目缺少 ID 或名称');
            return { key: id, id, name: file.fileName, directory: Number(file.resType) === 2, md5: file.md5, size: nonNegativeInteger(file.fileSize), gcid: file.gcid, cid: file.cid };
        };
        return {
            async children(folder) {
                return readPages(async (page, count) => {
                    const result = await guangyaListPage(post, folder.id, page, count);
                    return { ...result, items: result.items.map(node) };
                }, file => file.key);
            },
            async metadata(file) {
                const cached = knownContent.get(String(file.gcid || '').toUpperCase());
                if (cached && cached.size === file.size && (!file.cid || String(file.cid).toUpperCase() === cached.cid)) return cached;
                const response = await post('/userres/v1/file/get_file_detail', { fileId: file.id });
                if (guangyaCode(response) !== 0) throw apiError('读取光鸭文件详情', response);
                const info = response.data?.fileInfo ?? response.data;
                return {
                    md5: info?.md5 ?? info?.etag ?? '',
                    size: nonNegativeInteger(info?.fileSize ?? file.size),
                    gcid: info?.gcid,
                    cid: info?.cid
                };
            }
        };
    }
    function replacementJournalKey(target) { return 'cross-drive-replacement-v1:' + target.id + ':' + (target.exportPath || ''); }
    function readReplacementJournal(target) {
        const key = replacementJournalKey(target);
        return GM_getValue(key, {});
    }
    function writeReplacementJournal(target, journal) {
        const key = replacementJournalKey(target);
        GM_setValue(key, journal);
    }
    const replacementKey = file => JSON.stringify([file.path, file.md5, file.size]);
    async function buildGuangyaReplacementPlan(files, target, source, progress = () => {}, history = readExportHistory('光鸭'), journal = readReplacementJournal(target)) {
        const byPath = new Map(), byContent = new Map(), seen = new Set(), unverified = [];
        const contentKey = file => file.md5.toLowerCase() + ':' + file.size;
        const neededDirectories = new Set(['']), fileParents = new Set();
        const includeParents = (path, isFile) => {
            const parts = relativeParts(path);
            for (let i = 1; i < parts.length; i++) neededDirectories.add(parts.slice(0, i).join('/'));
            if (isFile) fileParents.add(parts.slice(0, -1).join('/'));
        };
        for (const file of files) includeParents(file.path, file.type !== 'directory');
        const wantedContent = new Set(files.filter(file => file.type !== 'directory').map(contentKey)), historicalPaths = new Map();
        const wantedSizes = new Set(files.filter(file => file.type !== 'directory').map(file => file.size));
        for (const signature of Object.values(history)) {
            const old = JSON.parse(signature);
            if (!hasFileMetadata(old) || !wantedContent.has(contentKey(old))) continue;
            const path = target.exportPath
                ? old.path.startsWith(target.exportPath + '/') ? old.path.slice(target.exportPath.length + 1) : ''
                : target.id === '0' ? old.path : '';
            if (path) {
                includeParents(path, true);
                const key = contentKey(old);
                if (!historicalPaths.has(key)) historicalPaths.set(key, []);
                historicalPaths.get(key).push(path);
            }
        }
        for (const file of files) {
            const record = journal[replacementKey(file)];
            if (record?.old) includeParents(record.old.path, true);
            for (const node of record?.directories || []) includeParents(node.path + '/placeholder', true);
        }
        // Name formatting only selects directories to read. File identity is
        // always checked against live MD5 and size before replacing anything.
        const directoryKey = path => path.split('/').map(name => name.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '') || name).join('/');
        const directoryKeys = new Set([...neededDirectories].map(directoryKey));
        const fileParentKeys = new Set([...fileParents].map(directoryKey));
        const stack = [{ id: target.id, path: '' }];
        while (stack.length) {
            const folder = stack.pop();
            progress('正在核对 JSON 对应目录：' + (folder.path || target.path));
            for (const node of await source.children(folder)) {
                if (!node.id || node.id === '0' || relativeParts(node.name).length !== 1 || seen.has(node.id)) throw new Error('目标目录结构异常，请刷新后重新预览');
                seen.add(node.id);
                const path = folder.path ? folder.path + '/' + node.name : node.name;
                if (byPath.has(path)) throw new Error('目标存在多个同名项目：' + path);
                const entry = { ...node, path, parentId: folder.id };
                byPath.set(path, entry);
                if (entry.directory) {
                    if (directoryKeys.has(directoryKey(path))) stack.push(entry);
                    continue;
                }
                if (!fileParentKeys.has(directoryKey(folder.path))) continue;
                if (entry.size != null && !wantedSizes.has(entry.size)) continue;
                let metadata;
                try { metadata = hasFileMetadata(entry) ? entry : await source.metadata(entry); }
                catch (error) { if (error.stop) throw error; unverified.push(entry); continue; }
                if (!hasFileMetadata(metadata)) { unverified.push(entry); continue; }
                Object.assign(entry, { md5: metadata.md5.toLowerCase(), size: metadata.size });
                const key = contentKey(entry);
                if (!byContent.has(key)) byContent.set(key, []);
                byContent.get(key).push(entry);
            }
        }
        // Every requested destination is protected from old-file cleanup.
        const requestedPaths = new Set(files.map(file => file.path));
        const demand = new Map();
        for (const file of files) {
            if (file.type !== 'directory') {
                const key = contentKey(file);
                demand.set(key, (demand.get(key) || 0) + 1);
            }
        }
        const plan = new Map();
        for (const file of files) {
            const parts = relativeParts(file.path);
            let blocked = false;
            for (let i = 1; i < parts.length; i++) {
                const ancestor = byPath.get(parts.slice(0, i).join('/'));
                if (ancestor && !ancestor.directory) { blocked = true; break; }
            }
            const existing = byPath.get(file.path);
            let action;
            if (blocked) action = { kind: 'conflict', reason: '父目录位置被文件占用' };
            else if (file.type === 'directory') action = existing && !existing.directory
                ? { kind: 'conflict', reason: '目录位置被文件占用' } : { kind: 'directory', node: existing };
            else if (existing && (existing.directory || !hasFileMetadata(existing) || contentKey(existing) !== contentKey(file)))
                action = { kind: 'conflict', reason: '目标同名项目内容不同或无法验证，不覆盖' };
            else if (unverified.some(node => node.size == null || node.size === file.size))
                action = { kind: 'conflict', reason: '相关目录有文件无法核对内容，旧版对应关系不确定，跳过且不删除' };
            else {
                const key = contentKey(file);
                const candidates = (byContent.get(key) || []).filter(node => !requestedPaths.has(node.path));
                const record = journal[replacementKey(file)];
                if (record?.old && !candidates.some(node => node.id === record.old.id) && !byPath.has(record.old.path) && !requestedPaths.has(record.old.path)) candidates.push(record.old);
                if (candidates.length > 1 || candidates.length && demand.get(key) > 1) action = { kind: 'conflict', reason: '旧文件无法唯一对应，跳过且不删除' };
                else {
                    const old = candidates[0];
                    action = { kind: existing ? old ? 'reuse-cleanup' : 'reuse' : old ? 'replace' : 'import', node: existing, old };
                }
            }
            plan.set(file.path, action);
        }
        const protectedDirectories = new Set(['']);
        for (const file of files) {
            const parts = relativeParts(file.path);
            const depth = file.type === 'directory' ? parts.length : parts.length - 1;
            for (let i = 1; i <= depth; i++) protectedDirectories.add(parts.slice(0, i).join('/'));
        }
        for (const file of files.filter(file => file.type !== 'directory')) {
            const action = plan.get(file.path);
            if (action.kind === 'conflict' || action.old) continue;
            const dirs = new Map((journal[replacementKey(file)]?.directories || []).map(node => [node.id, node]));
            for (const path of historicalPaths.get(contentKey(file)) || []) {
                if (byPath.has(path)) continue;
                const parts = relativeParts(path);
                for (let i = 1; i < parts.length; i++) {
                    const parent = parts.slice(0, i).join('/'), node = byPath.get(parent);
                    if (node?.directory && !protectedDirectories.has(parent) && node.id !== target.id) dirs.set(node.id, node);
                }
            }
            action.cleanupDirectories = [...dirs.values()].filter(node => !protectedDirectories.has(node.path));
        }
        return { actions: plan, directories: new Map([...byPath].filter(([, node]) => node.directory)), protectedDirectories };
    }
    function confirmGuangyaReplacement(ui, plan, target) {
        const preview = ui.get('syncPreview'), list = ui.get('syncList');
        list.textContent = '';
        const counts = { replace: 0, 'reuse-cleanup': 0, reuse: 0, import: 0, conflict: 0, directory: 0 };
        const basePath = target.exportPath ? '/' + target.exportPath : target.id === '0' ? '' : target.path;
        const fullPath = path => basePath + '/' + path;
        const labels = { replace: '导入并替换', 'reuse-cleanup': '复用新版并清理旧版', reuse: '复用已有新版', import: '仅导入', conflict: '跳过' };
        for (const [path, action] of plan.actions) {
            counts[action.kind]++;
            const item = document.createElement('div'), heading = document.createElement('strong');
            item.className = 'sync-item';
            heading.textContent = action.kind === 'directory' ? action.node ? '复用目录' : '新建目标目录' : labels[action.kind];
            item.appendChild(heading);
            const location = (label, value) => {
                const row = document.createElement('div'), caption = document.createElement('span'), text = document.createElement('span');
                row.className = 'sync-location';
                caption.textContent = label;
                text.textContent = value;
                row.appendChild(caption); row.appendChild(text); item.appendChild(row);
            };
            if (action.kind === 'conflict') {
                location('清单要求位置', fullPath(path));
                location('跳过原因', action.reason);
            } else {
                location('新版位置', fullPath(path));
                if (action.kind !== 'directory') location('成功后删除', action.old ? fullPath(action.old.path) : '无；保留其他现有内容');
                if (action.cleanupDirectories?.length) location('空目录清理', action.cleanupDirectories.map(node => fullPath(node.path)).join('\n'));
            }
            list.appendChild(item);
        }
        ui.get('syncDestination').textContent = '导入到：光鸭 ' + (basePath || '/（根目录）');
        ui.get('syncSummary').textContent = `导入替换 ${counts.replace} 项 · 复用并清理 ${counts['reuse-cleanup']} 项 · 复用 ${counts.reuse} 项 · 仅导入 ${counts.import} 项 · 跳过 ${counts.conflict} 项 · 目录 ${counts.directory} 项`;
        preview.hidden = false;
        return new Promise(resolve => {
            const finish = accepted => {
                preview.hidden = true;
                ui.get('confirmSync').onclick = ui.get('cancelSync').onclick = null;
                resolve(accepted);
            };
            ui.get('confirmSync').onclick = () => finish(true);
            ui.get('cancelSync').onclick = () => finish(false);
        });
    }
    async function checkedGuangyaContent(node, file, source) {
        const metadata = hasFileMetadata(node) ? node : await source.metadata(node);
        if (node.directory || !hasFileMetadata(metadata) || metadata.md5.toLowerCase() !== file.md5 || metadata.size !== file.size)
            throw new Error('文件 MD5 或大小不符，或无法验证：' + (node.path || node.name));
        return { ...node, ...metadata, id: node.id, parentId: node.parentId, path: node.path, name: node.name, md5: metadata.md5.toLowerCase() };
    }
    async function readGuangyaDestination(file, target, source) {
        const parts = relativeParts(file.path);
        let parentId = target.id;
        for (let i = 0; i < parts.length; i++) {
            const matches = (await source.children({ id: parentId })).filter(node => node.name === parts[i]);
            if (!matches.length) return null;
            if (matches.length !== 1) throw new Error('目标路径存在多个同名项目：' + file.path);
            const node = { ...matches[0], parentId, path: parts.slice(0, i + 1).join('/') };
            if (i === parts.length - 1) return checkedGuangyaContent(node, file, source);
            if (!node.directory) throw new Error('目标父目录被文件占用：' + node.path);
            parentId = node.id;
        }
    }
    async function waitGuangyaDelete(taskId, post, wait = sleep, stage = '删除') {
        for (let attempt = 0; attempt < 30; attempt++) {
            if (attempt) await wait(1000);
            const response = await post(API.task, { taskId });
            if (guangyaCode(response) !== 0) throw apiError('查询' + stage + '任务', response);
            const status = nonNegativeInteger(response.data?.status), detail = response.data?.detail;
            if (status === 3 || status === 2 && detail?.code != null && Number(detail.code) !== 0)
                throw Object.assign(apiError(stage + '任务', { code: detail?.code || -1, msg: detail?.msg || '任务失败' }), { terminal: true });
            if (status === 2) return;
        }
        throw new Error(stage + '任务仍未完成，结果待确认；任务 ID：' + taskId);
    }
    async function removeGuangyaNode(node, source, post, wait, saveTask, taskId = '') {
        if (!taskId) {
            const response = await post(API.remove, { fileIds: [node.id] });
            if (guangyaCode(response) !== 0) throw apiError('删除旧版', response);
            taskId = taskIdOf(response.data);
            saveTask(taskId);
        }
        if (taskId) await waitGuangyaDelete(taskId, post, wait);
        for (let attempt = 0; attempt < 5; attempt++) {
            if (attempt) await wait(500);
            if (!(await source.children({ id: node.parentId })).some(item => item.id === node.id)) return;
        }
        throw Object.assign(new Error('删除请求已提交，但旧项目仍存在；ID：' + node.id), { terminal: true });
    }
    async function replaceGuangyaFile(file, action, target, plan, source, post, ensureDirectory, journal, progress, wait = sleep) {
        const key = replacementKey(file), old = action.old;
        let original = null;
        if (old) {
            const current = (await source.children({ id: old.parentId })).find(node => node.id === old.id);
            if (current) {
                if (current.name !== old.name) throw new Error('预览后旧文件已改名，请重新预览：' + old.path);
                original = await checkedGuangyaContent({ ...current, parentId: old.parentId, path: old.path }, file, source);
            } else if (!journal[key]) throw new Error('预览后旧文件已变化，请重新预览：' + old.path);
        }
        let destination = await readGuangyaDestination(file, target, source);
        const reused = !!destination;
        if (!destination) {
            if (old && !original) throw new Error('新版和记录中的旧文件均未找到，保留待核对记录');
            let input = file;
            if (original && (!file.gcid || !file.cid)) {
                let metadata = original;
                if (!/^[a-f0-9]{40}$/i.test(metadata.gcid || '') || !/^[a-f0-9]{40}$/i.test(metadata.cid || '')) metadata = await source.metadata(original);
                if (!hasFileMetadata(metadata) || metadata.md5.toLowerCase() !== file.md5 || metadata.size !== file.size) throw new Error('旧文件详情无法核对，未提交新版');
                if (/^[a-f0-9]{40}$/i.test(metadata.gcid || '') && /^[a-f0-9]{40}$/i.test(metadata.cid || '')) input = { ...file, gcid: metadata.gcid.toUpperCase(), cid: metadata.cid.toUpperCase() };
            }
            progress('导入中：' + file.path);
            const parent = await ensureDirectory(relativeParts(file.path).slice(0, -1).join('/'));
            const result = await importFile(input, parent || '0', post, wait);
            if (result.status !== 'saved') return { status: result.status, message: result.message + '；旧版保留', stop: result.stop };
            progress('验证中：' + file.path);
            for (let attempt = 0; attempt < 5 && !destination; attempt++) {
                if (attempt) await wait(500);
                destination = await readGuangyaDestination(file, target, source);
            }
            if (!destination) return { status: 'pending', message: '目录已创建，但未在目标路径验证到新文件；旧版保留' };
        }
        progress('验证中：' + file.path);
        if (!old || old.id === destination.id) {
            if (action.cleanupDirectories?.length) {
                journal[key] = { ...journal[key], file, old: null, newFileId: destination.id, stage: 'old-deleted', directories: action.cleanupDirectories };
                writeReplacementJournal(target, journal);
                return { status: 'done', reused, cleanupKey: key, message: '新版已验证，继续检查对应的空旧目录' };
            }
            return { status: 'done', reused, message: '新版已在目标路径验证，未删除其他文件' };
        }
        const directories = new Map((journal[key]?.directories || []).map(node => [node.id, node]));
        const parts = relativeParts(old.path);
        for (let i = 1; i < parts.length; i++) {
            const path = parts.slice(0, i).join('/'), node = plan.directories.get(path);
            if (node && !plan.protectedDirectories.has(path) && node.id !== target.id) directories.set(node.id, node);
        }
        const record = journal[key] = { ...journal[key], file, old, newFileId: destination.id, directories: [...directories.values()] };
        writeReplacementJournal(target, journal);
        try {
            const checked = await readGuangyaDestination(file, target, source);
            if (!checked || checked.id !== destination.id || checked.id === old.id) throw new Error('目标文件已变化');
        } catch (error) {
            return { status: 'pending', message: '新版在清理前无法再次验证，旧版保留：' + error.message, stop: error.stop };
        }
        try {
            const current = (await source.children({ id: old.parentId })).find(node => node.id === old.id);
            if (current) {
                if (current.name !== old.name) throw new Error('旧文件名称已变化，未删除');
                await checkedGuangyaContent({ ...current, path: old.path }, file, source);
                progress('清理旧版：' + old.path);
                await removeGuangyaNode(old, source, post, wait, taskId => {
                    record.taskId = taskId; record.stage = 'delete-pending'; writeReplacementJournal(target, journal);
                }, record.stage === 'delete-pending' ? record.taskId : '');
            } else if (record.stage === 'delete-pending' && record.taskId) await waitGuangyaDelete(record.taskId, post, wait);
            record.stage = 'old-deleted'; record.taskId = '';
            writeReplacementJournal(target, journal);
            return { status: 'done', reused, deleted: true, cleanupKey: key, message: '新版验证成功，对应旧文件已删除' };
        } catch (error) {
            if (record.stage !== 'delete-pending' || error.terminal) { record.stage = 'cleanup-failed'; record.taskId = ''; }
            writeReplacementJournal(target, journal);
            return { status: 'cleanup-failed', reused, message: '新版已就绪，旧版清理失败：' + error.message, stop: error.stop };
        }
    }
    async function cleanupGuangyaOldDirectories(keys, target, plan, source, post, journal, progress, log, wait = sleep) {
        const candidates = new Map(), failed = new Set(), retained = new Set();
        for (const key of keys) {
            const record = journal[key];
            try {
                const destination = await readGuangyaDestination(record.file, target, source);
                if (!destination || destination.id !== record.newFileId) throw new Error('新版已变化，保留旧目录待核对');
                for (const node of record.directories) if (!plan.protectedDirectories.has(node.path) && node.id !== target.id) {
                    if (!candidates.has(node.id)) candidates.set(node.id, { node, keys: [] });
                    candidates.get(node.id).keys.push(key);
                }
            } catch (error) {
                failed.add(key); log(record.file.path + '：新版已就绪，旧目录清理失败：' + error.message);
                if (error.stop) { writeReplacementJournal(target, journal); return { removed: 0, failed: keys.size }; }
            }
        }
        let removed = 0;
        for (const { node, keys: related } of [...candidates.values()].sort((a, b) => b.node.path.split('/').length - a.node.path.split('/').length)) {
            if (related.some(key => failed.has(key))) continue;
            try {
                const current = (await source.children({ id: node.parentId })).find(item => item.id === node.id);
                if (!current) continue;
                if (!current.directory || current.name !== node.name) throw new Error('旧目录已变化，保留待核对：' + node.path);
                let children = await source.children({ id: node.id });
                for (let attempt = 0; children.length && attempt < 3; attempt++) {
                    await wait(500);
                    children = await source.children({ id: node.id });
                }
                if (children.length) {
                    for (const key of related) retained.add(key);
                    log('旧目录仍有内容，保留并记录待清理：' + node.path); continue;
                }
                progress('清理空旧目录：' + node.path);
                const first = journal[related[0]], taskId = first.directoryTasks?.[node.id] || '';
                await removeGuangyaNode(node, source, post, wait, taskId => {
                    for (const key of related) (journal[key].directoryTasks ||= {})[node.id] = taskId;
                    writeReplacementJournal(target, journal);
                }, taskId);
                removed++; log('已清理空旧目录：' + node.path);
            } catch (error) {
                for (const key of related) failed.add(key);
                if (error.terminal) for (const key of related) delete journal[key].directoryTasks?.[node.id];
                log('旧目录清理失败：' + node.path + '；' + error.message);
                if (error.stop) { writeReplacementJournal(target, journal); return { removed, failed: keys.size }; }
            }
        }
        for (const key of keys) if (!failed.has(key) && !retained.has(key)) delete journal[key];
        writeReplacementJournal(target, journal);
        return { removed, failed: failed.size };
    }
    async function runGuangyaReplacement(files, target, plan, source, post, ensureDirectory, progress, log, wait = sleep) {
        const journal = readReplacementJournal(target), cleanupKeys = new Set();
        const verifiedEntries = [], fileDirectories = new Set();
        let stopped = false;
        for (const file of files) if (file.type !== 'directory') {
            const parts = relativeParts(file.path);
            for (let i = 1; i < parts.length; i++) fileDirectories.add(parts.slice(0, i).join('/'));
        }
        const counts = { processed: 0, verified: 0, imported: 0, reused: 0, deleted: 0, pending: 0, missed: 0, failed: 0, skipped: 0, cleanupFailed: 0, directories: 0 };
        for (let i = 0; i < files.length; i++) {
            const file = files[i], action = plan.actions.get(file.path), label = `[${i + 1}/${files.length}] ${file.path}`;
            counts.processed++;
            try {
                if (action.kind === 'conflict') { counts.skipped++; log(label + '：跳过；' + action.reason); continue; }
                if (file.type === 'directory') {
                    if (!fileDirectories.has(file.path)) await ensureDirectory(file.path);
                    continue;
                }
                const result = await replaceGuangyaFile(file, action, target, plan, source, post, ensureDirectory, journal,
                    message => progress(`[${i + 1}/${files.length}] ${message}`), wait);
                log(label + '：' + result.message);
                if (result.status === 'done' || result.status === 'cleanup-failed') {
                    counts.verified++; counts[result.reused ? 'reused' : 'imported']++;
                    verifiedEntries.push({ path: target.exportPath ? target.exportPath + '/' + file.path : file.path, md5: file.md5, size: file.size });
                    if (result.deleted) counts.deleted++;
                    if (result.cleanupKey) cleanupKeys.add(result.cleanupKey);
                    if (result.status === 'cleanup-failed') counts.cleanupFailed++;
                } else counts[result.status === 'miss' ? 'missed' : 'pending']++;
                if (result.stop) { stopped = true; break; }
            } catch (error) { counts.failed++; log(label + '：未完成；' + error.message); if (error.stop) { stopped = true; break; } }
        }
        const cleanup = stopped ? { removed: 0, failed: cleanupKeys.size } : await cleanupGuangyaOldDirectories(cleanupKeys, target, plan, source, post, journal, progress, log, wait);
        if (stopped) log('任务已停止，不再执行后续替换和旧目录清理；保留任务记录供下次核对');
        counts.directories = cleanup.removed; counts.cleanupFailed += cleanup.failed;
        if (verifiedEntries.length) {
            const history = { ...readExportHistory('光鸭') };
            for (const entry of verifiedEntries) Object.defineProperty(history, entry.path, { value: JSON.stringify(entry), enumerable: true, configurable: true, writable: true });
            writeExportHistory('光鸭', history);
        }
        return counts;
    }
    function initGuangya() {
        const ui = makePanel(`光鸭跨盘 JSON ${VERSION}`, `
            <p id="status"></p><p id="target"></p><p id="progress"></p>
            <textarea id="json" placeholder="导出的 JSON 会显示在这里；也可粘贴待导入 JSON"></textarea>
            <input id="jsonFile" type="file" accept=".json,application/json" hidden>
            <div class="export-options"><label><input id="syncExisting" type="checkbox" checked>导入新版，成功后删除对应旧版</label></div>
            <div id="syncPreview" class="sync-preview" hidden><h4>导入预览</h4><p id="syncDestination"></p><p id="syncSummary"></p><div id="syncList"></div><div class="sync-actions"><button id="confirmSync">确认执行</button><button id="cancelSync">取消</button></div></div>
            <div class="panel-actions"><button id="exportManifest">导出 JSON</button><button id="start">导入 JSON</button><button id="chooseJsonFile">选择文件</button><button id="copyJson">复制 JSON</button><button id="saveJson">保存 JSON</button><button id="clear">清除</button></div>
            <div id="log"></div>`);
        bindExportHistory(ui, '光鸭');
        const controls = panelControls(ui);
        let lockedTarget = null;
        refreshStatus = () => {
            ui.get('status').textContent = capture.token ? '已捕获登录凭证（不显示凭证内容）' : '未捕获凭证：请在光鸭网页里切换文件夹后重试';
            const target = lockedTarget || currentGuangyaFolder();
            ui.get('target').textContent = target ? `${lockedTarget ? '本次固定目标' : '当前导入目标'}：${target.path}；ID：${target.id}` : '请先进入“全部”中的目标文件夹；最近、搜索和分类页没有唯一目标目录';
        };
        refreshStatus();
        for (const event of ['hashchange', 'popstate']) page.addEventListener(event, refreshStatus);
        for (const method of ['pushState', 'replaceState']) {
            const original = page.history[method];
            page.history[method] = function() {
                const result = original.apply(this, arguments);
                refreshStatus();
                return result;
            };
        }
        ui.onActivate(refreshStatus);
        const log = message => appendLog(ui, message);
        ui.get('exportManifest').onclick = async () => {
            ui.busy(true); controls.forEach(control => { control.disabled = true; });
            ui.get('json').value = '';
            ui.get('progress').textContent = '';
            ui.get('status').textContent = '正在读取选中项目…';
            try {
                const target = currentGuangyaFolder();
                if (!target) throw new Error('请先进入“全部”中的目标目录');
                if (!capture.token) throw new Error('未捕获光鸭登录状态，请刷新页面后重试');
                const selected = selectedGuangyaItems();
                if (!selected.length) throw new Error('没有识别到选中项，请先勾选要导出的文件或文件夹；未导出任何内容');
                const source = guangyaSource(capture.token, ui.get('incremental').checked);
                const children = await source.children({ id: target.id, name: target.path, directory: true });
                const roots = matchSelected(children, selected);
                if (!roots.length) throw new Error('选中项目不在当前目录中，请重新选择');
                const result = await collectTree(roots, source, state => {
                    ui.get('status').textContent = `正在导出：${state.path}；文件 ${state.files}，目录 ${state.directories}`;
                }, target.exportPath);
                if (!result.entries.length) throw new Error('没有可导出的项目');
                const summary = exportManifestJson(ui, '光鸭', result);
                ui.get('status').textContent = `导出完成：选中 ${roots.length} 项，${summary}；缺少有效 MD5 的文件 ${result.skipped.length} 个。` + (!ui.get('json').value ? '没有可导出的内容。' : '');
            } catch (error) { ui.get('status').textContent = '导出失败：' + error.message; }
            finally { controls.forEach(control => { control.disabled = false; }); ui.busy(false); }
        };
        ui.get('copyJson').onclick = () => copyManifest(ui);
        ui.get('saveJson').onclick = () => {
            const value = ui.get('json').value;
            if (!value) { ui.get('status').textContent = '请先导出 JSON'; return; }
            saveJsonFile(value, `光鸭-跨盘-${Date.now()}.json`, message => { ui.get('status').textContent = message; });
        };
        ui.get('clear').onclick = () => {
            ui.get('json').value = '';
            ui.get('jsonFile').value = '';
            ui.get('log').textContent = '';
            ui.get('progress').textContent = '';
            refreshStatus();
        };
        ui.get('jsonFile').onchange = event => { const file = event.target.files?.[0]; if (file) return startImport(file); };
        ui.get('chooseJsonFile').onclick = () => ui.get('jsonFile').click();
        const startImport = async file => {
            ui.busy(true); controls.forEach(control => { control.disabled = true; });
            try {
                if (file) { ui.get('json').value = await file.text(); }
                await importIntoTarget();
            } catch (error) { log('导入失败：' + error.message); ui.get('progress').textContent = '导入失败：' + error.message; }
            finally { ui.get('jsonFile').value = ''; controls.forEach(control => { control.disabled = false; }); ui.busy(false); }
        };
        const importIntoTarget = async () => {
            const target = currentGuangyaFolder();
            const parentId = target?.id;
            let files, alignedPath;
            ui.get('log').textContent = '';
            try {
                if (!capture.token) throw new Error('尚未捕获 Token，请在光鸭网页里切换文件夹');
                if (!target) throw new Error('请先打开“全部”中的目标文件夹，再开始导入');
                ({ files, alignedPath } = alignGuangyaImport(normalizeFiles(JSON.parse(ui.get('json').value)), target));
            } catch (error) { log('无法开始：' + error.message); ui.get('progress').textContent = '导入失败：' + error.message; return; }
            if (alignedPath) log(`清单中的 /${alignedPath} 就是当前目录，直接复用，不再重复嵌套`);
            if (!files.length) { ui.get('progress').textContent = '清单目录就是当前目录，没有需要导入的子项目'; return; }
            let saved = 0, pending = 0, missed = 0, failed = 0, processed = 0, directories = 0, skipped = 0;
            let cancelled = false, setupError = '', replacementCounts = null;
            const token = capture.token;
            const post = paced(650, (endpoint, body) => requestJson(`https://api.guangyapan.com${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json;charset=utf-8', Authorization: `Bearer ${token}`, dt: '4' },
                body: JSON.stringify(body)
            }));
            const ensureDirectory = directoryResolver(parentId, post, log);
            const existingSource = guangyaSource(token, false);
            lockedTarget = target;
            refreshStatus();
            log(`开始处理 ${files.length} 个项目；固定目标：${target.path}；目录 ID：${parentId}`);
            ui.get('progress').textContent = `准备导入 ${files.length} 项…`;
            try {
                if (ui.get('syncExisting').checked) {
                    const source = guangyaSource(token, false);
                    const plan = await buildGuangyaReplacementPlan(files, target, source, message => { ui.get('progress').textContent = message; });
                    ui.get('progress').textContent = '预览已生成，等待确认；尚未修改网盘文件';
                    if (!await confirmGuangyaReplacement(ui, plan, target)) { cancelled = true; return; }
                    replacementCounts = await runGuangyaReplacement(files, target, plan, source, post, ensureDirectory,
                        message => { ui.get('progress').textContent = message; }, log);
                    refreshHistorySummary(ui, '光鸭');
                    return;
                }
                for (let i = 0; i < files.length; i++) {
                    const f = files[i];
                    processed++;
                    ui.get('progress').textContent = `导入进度：${i + 1}/${files.length}（已处理 ${Math.floor(i * 100 / files.length)}%） ${f.path}`;
                    const label = `[${i + 1}/${files.length}] ${f.path}`;
                    try {
                        if (f.type === 'directory') {
                            await ensureDirectory(f.path);
                            directories++;
                            log(label + '：目录已就绪');
                        } else {
                            const target = await ensureDirectory(relativeParts(f.path).slice(0, -1).join('/'));
                            const matches = (await existingSource.children({id:target})).filter(node => node.name === f.name);
                            if (matches.length > 1) throw new Error('目标存在多个同名项目，未上传');
                            if (matches.length) {
                                const message = existingFileMessage(matches[0], f);
                                skipped++; log(label + '：' + message); continue;
                            }
                            const result = await importFile(f, target, post);
                            if (result.status === 'saved') saved++;
                            else if (result.status === 'pending') pending++;
                            else missed++;
                            log(label + '：' + result.message);
                            if (result.stop) { log('任务已停止，不再处理后续项目'); break; }
                        }
                    } catch (error) {
                        failed++; log(label + '：失败，' + error.message);
                        if (error.stop) { log('任务已停止，不再处理后续项目'); break; }
                    }
                    if ((i + 1) % 128 === 0) await sleep(0);
                }
            } catch (error) {
                setupError = error.message;
                log('导入未完成：' + setupError);
            } finally {
                if (replacementCounts) {
                    const c = replacementCounts;
                    const incomplete = c.pending + c.missed + c.failed + c.skipped + c.cleanupFailed + files.length - c.processed;
                    ui.get('progress').textContent = `${incomplete ? '未全部完成' : '完成'}：新版已验证 ${c.verified}，新导入 ${c.imported}，复用 ${c.reused}，旧文件已删除 ${c.deleted}，空旧目录已清理 ${c.directories}；待确认 ${c.pending}，未命中 ${c.missed}，失败 ${c.failed}，跳过 ${c.skipped}，旧版清理失败 ${c.cleanupFailed}，未处理 ${files.length - c.processed}。`;
                } else ui.get('progress').textContent = cancelled ? '已取消，未修改网盘文件' : setupError ? '导入未完成：' + setupError : `导入结束：已处理 ${processed}/${files.length} 项；确认生成 ${saved}，同名跳过 ${skipped}，待确认 ${pending}，未命中 ${missed}，失败 ${failed}，目录就绪 ${directories}。`;
                if (!replacementCounts) log(`结束：文件已确认生成 ${saved}，同名跳过 ${skipped}，待确认 ${pending}，秒传未命中 ${missed}；目录就绪 ${directories}，失败项目 ${failed}，未处理 ${files.length - processed}。`);
                if (!cancelled) log('请刷新目录核对结果；未完成项目保留旧版，已验证的新版可在下次复用。');
                lockedTarget = null;
                refreshStatus();
            }
        };
        ui.get('start').onclick = () => startImport();
    }
