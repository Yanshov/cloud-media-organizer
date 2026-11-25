async function readPages(load, keyOf) {
    const items = [],
        seen = new Set();
    let expectedTotal = null;
    const inconsistent = (message) => Object.assign(new Error(message), { directoryChanged: true });
    for (let pageNumber = 1; pageNumber <= 10000; pageNumber++) {
        const result = await load(pageNumber, items.length);
        if (!result || !Array.isArray(result.items)) throw new Error('目录列表格式不正确');
        if (result.total != null) {
            if (expectedTotal != null && result.total !== expectedTotal)
                throw inconsistent('读取期间目录项目数发生变化，请重试');
            expectedTotal = result.total;
        }
        let added = 0;
        for (const item of result.items) {
            const key = keyOf(item);
            if (!key) throw new Error('目录列表缺少 ID');
            if (seen.has(key)) throw inconsistent('目录分页没有进展或包含重复项目，请重新读取，避免漏文件');
            seen.add(key);
            items.push(item);
            added++;
        }
        if (!result.more) {
            if (expectedTotal != null && items.length !== expectedTotal)
                throw inconsistent(
                    `目录项目数不一致：应有 ${expectedTotal}，实际读到 ${items.length}；请重新读取`
                );
            return items;
        }
        if (expectedTotal != null && items.length >= expectedTotal)
            throw inconsistent('目录分页与总数不一致，请重新读取');
        if (!added) throw inconsistent('目录分页没有进展，已停止，避免漏文件');
    }
    throw new Error('目录分页超过上限，请分批读取');
}
function decimalId(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return '';
    return /^(0|[1-9]\d*)$/.test(String(value)) ? String(value) : '';
}
function selectedGuangyaItems() {
    const seen = new Set();
    for (const element of document.querySelectorAll('#app *')) {
        const key = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
        let fiber = key && element[key];
        while (fiber && !seen.has(fiber)) {
            seen.add(fiber);
            const props = fiber.memoizedProps;
            if (
                props?.rowKey === 'fileId' &&
                Array.isArray(props.dataSource) &&
                Array.isArray(props.selectedItems)
            ) {
                const ids = props.selectedItems.map(decimalId);
                if (ids.some((id) => !id)) throw new Error('光鸭选中项目缺少有效 ID，请重新勾选');
                return ids.map((id) => ({ id, names: [] }));
            }
            fiber = fiber.return;
        }
    }
    throw new Error('无法读取光鸭文件列表，请刷新页面后重试');
}
function installHooks() {
    const targetOf = (value) => {
        try {
            const url = new URL(value, location.href);
            return url.origin === 'https://api.guangyapan.com' ? url : null;
        } catch {
            return null;
        }
    };
    const captureHeaders = (headers) => {
        const auth = headers.get('authorization');
        if (auth && /^Bearer\s+\S+/i.test(auth)) capture.token = auth.replace(/^Bearer\s+/i, '').trim();
    };
    page.fetch = function (input, init) {
        try {
            const isRequest = input && typeof input === 'object' && typeof input.url === 'string';
            if (targetOf(isRequest ? input.url : String(input)))
                captureHeaders(
                    new page.Headers(
                        init?.headers !== undefined ? init.headers : isRequest ? input.headers : undefined
                    )
                );
        } catch (_) {}
        return nativeFetch(...arguments);
    };
    const proto = page.XMLHttpRequest?.prototype;
    if (!proto) return;
    const metadata = new WeakMap(),
        open = proto.open,
        setHeader = proto.setRequestHeader,
        send = proto.send;
    proto.open = function (_method, url) {
        const result = open.apply(this, arguments);
        metadata.delete(this);
        try {
            const target = targetOf(String(url));
            if (target) metadata.set(this, new page.Headers());
        } catch (_) {}
        return result;
    };
    proto.setRequestHeader = function (name, value) {
        const result = setHeader.apply(this, arguments);
        const headers = metadata.get(this);
        if (headers) {
            try {
                headers.append(name, value);
            } catch (_) {}
        }
        return result;
    };
    proto.send = function (body) {
        const headers = metadata.get(this);
        if (headers) captureHeaders(headers);
        return send.apply(this, arguments);
    };
}
async function readPages(load, keyOf) {
    const items = [],
        seen = new Set();
    let expectedTotal = null;
    const inconsistent = (message) => Object.assign(new Error(message), { directoryChanged: true });
    for (let pageNumber = 1; pageNumber <= 10000; pageNumber++) {
        const result = await load(pageNumber, items.length);
        if (!result || !Array.isArray(result.items)) throw new Error('目录列表格式不正确');
        if (result.total != null) {
            if (expectedTotal != null && result.total !== expectedTotal)
                throw inconsistent('读取期间目录项目数发生变化，请重试');
            expectedTotal = result.total;
        }
        let added = 0;
        for (const item of result.items) {
            const key = keyOf(item);
            if (!key) throw new Error('目录列表缺少 ID');
            if (seen.has(key)) throw inconsistent('目录分页没有进展或包含重复项目，请重新读取，避免漏文件');
            seen.add(key);
            items.push(item);
            added++;
        }
        if (!result.more) {
            if (expectedTotal != null && items.length !== expectedTotal)
                throw inconsistent(
                    `目录项目数不一致：应有 ${expectedTotal}，实际读到 ${items.length}；请重新读取`
                );
            return items;
        }
        if (expectedTotal != null && items.length >= expectedTotal)
            throw inconsistent('目录分页与总数不一致，请重新读取');
        if (!added) throw inconsistent('目录分页没有进展，已停止，避免漏文件');
    }
    throw new Error('目录分页超过上限，请分批读取');
}
function decimalId(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return '';
    return /^(0|[1-9]\d*)$/.test(String(value)) ? String(value) : '';
}
function selectedGuangyaItems() {
    const seen = new Set();
    for (const element of document.querySelectorAll('#app *')) {
        const key = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
        let fiber = key && element[key];
        while (fiber && !seen.has(fiber)) {
            seen.add(fiber);
            const props = fiber.memoizedProps;
            if (
                props?.rowKey === 'fileId' &&
                Array.isArray(props.dataSource) &&
                Array.isArray(props.selectedItems)
            ) {
                const ids = props.selectedItems.map(decimalId);
                if (ids.some((id) => !id)) throw new Error('光鸭选中项目缺少有效 ID，请重新勾选');
                return ids.map((id) => ({ id, names: [] }));
            }
            fiber = fiber.return;
        }
    }
    throw new Error('无法读取光鸭文件列表，请刷新页面后重试');
}
function installHooks() {
    const targetOf = (value) => {
        try {
            const url = new URL(value, location.href);
            return url.origin === 'https://api.guangyapan.com' ? url : null;
        } catch {
            return null;
        }
    };
    const captureHeaders = (headers) => {
        const auth = headers.get('authorization');
        if (auth && /^Bearer\s+\S+/i.test(auth)) capture.token = auth.replace(/^Bearer\s+/i, '').trim();
    };
    page.fetch = function (input, init) {
        try {
            const isRequest = input && typeof input === 'object' && typeof input.url === 'string';
            if (targetOf(isRequest ? input.url : String(input)))
                captureHeaders(
                    new page.Headers(
                        init?.headers !== undefined ? init.headers : isRequest ? input.headers : undefined
                    )
                );
        } catch (_) {}
        return nativeFetch(...arguments);
    };
    const proto = page.XMLHttpRequest?.prototype;
    if (!proto) return;
    const metadata = new WeakMap(),
        open = proto.open,
        setHeader = proto.setRequestHeader,
        send = proto.send;
    proto.open = function (_method, url) {
        const result = open.apply(this, arguments);
        metadata.delete(this);
        try {
            if (targetOf(String(url))) metadata.set(this, new page.Headers());
        } catch (_) {}
        return result;
    };
    proto.setRequestHeader = function (name, value) {
        const result = setHeader.apply(this, arguments);
        const headers = metadata.get(this);
        if (headers) {
            try {
                headers.append(name, value);
            } catch (_) {}
        }
        return result;
    };
    proto.send = function () {
        const headers = metadata.get(this);
        if (headers) captureHeaders(headers);
        return send.apply(this, arguments);
    };
}
async function guangyaListPage(post, parentId, page, loaded = 0) {
    const response = await post(GUANGYA_API.list, {
        parentId: parentId === '0' ? '' : parentId,
        page: page - 1,
        pageSize: 100,
        dirType: 0,
        orderBy: 0,
        sortType: 0,
        fileTypes: [],
        resType: 0,
        needPlayRecord: false,
        needSubFolderStat: true,
    });
    if (guangyaCode(response) !== 0) throw apiError('读取光鸭目录', response);
    const data = response.data === undefined ? {} : response.data;
    if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('光鸭目录响应格式异常，未将其视为空目录');
    const total = nonNegativeInteger(data.total);
    if (
        (data.list !== undefined && !Array.isArray(data.list)) ||
        (data.list === undefined && (data.hasMore === true || total > 0))
    )
        throw new Error(`光鸭目录列表不完整（目录 ID：${parentId || '根目录'}），未将其视为空目录`);
    const items = data.list || [];
    const more =
        typeof data.hasMore === 'boolean'
            ? data.hasMore
            : total != null
              ? loaded + items.length < total
              : items.length >= 100;
    return { items, more, total };
}

function currentGuangyaFolder() {
    // 光鸭网页路由：#/home/all/目录ID-名称/子目录ID-名称。
    const url = new URL(location.href);
    const route = url.hash.startsWith('#/') ? new URL(url.hash.slice(1), url.origin).pathname : url.pathname;
    const parts = route.split('/').filter(Boolean);
    if (parts[0] !== 'home' || parts[1] !== 'all') return null;
    const breadcrumbs = [];
    for (const part of parts.slice(2)) {
        let segment;
        try {
            segment = decodeURIComponent(part);
        } catch (_) {
            return null;
        }
        const match = /^(0|[1-9]\d*)(?:-([\s\S]*))?$/.exec(segment);
        if (!match) return null;
        breadcrumbs.push({ id: match[1], name: match[2] ?? match[1] });
    }
    const names = breadcrumbs.map((folder) => folder.name || folder.id);
    return {
        id: breadcrumbs.at(-1)?.id ?? '0',
        path: names.length ? names.join(' / ') : '根目录',
        relativePath: names.join('/'),
        breadcrumbs,
    };
}

const guangyaAccounts = new Map();

/** Reads the account subject from the same profile endpoint used by the web app. */
function guangyaAccount(token) {
    if (!guangyaAccounts.has(token)) {
        const profile = requestJson(
            'https://account.guangyapan.com/v1/user/me',
            { credentials: 'omit', headers: { Authorization: 'Bearer ' + token } },
            6000
        )
            .then(({ sub }) => {
                const account =
                    typeof sub === 'string' || Number.isSafeInteger(sub) ? String(sub).trim() : '';
                if (!account) throw new Error('光鸭未返回账号 ID');
                return account;
            })
            .catch(() => {
                if (guangyaAccounts.get(token) === profile) guangyaAccounts.delete(token);
                return null;
            });
        guangyaAccounts.set(token, profile);
        evict(guangyaAccounts, 4);
    }
    return guangyaAccounts.get(token);
}

/** Pins an operation to the selected account while allowing that account to renew its token. */
function createGuangyaSession(token, parent) {
    let account = guangyaAccount(token);
    let authorizedToken = token;
    return {
        provider: '光鸭',
        token,
        parent,
        async getToken() {
            const latest = capture.token;
            if (latest && latest === authorizedToken) return latest;
            if (!latest) throw new Error('暂时无法读取光鸭登录状态，请稍后重试。');
            const [originalAccount, nextAccount] = await Promise.all([
                account.then((value) => value || guangyaAccount(token)),
                guangyaAccount(latest),
            ]);
            if (originalAccount) account = Promise.resolve(originalAccount);
            if (capture.token !== latest || !originalAccount || !nextAccount)
                throw new Error('暂时无法核对光鸭登录状态，请稍后重试。');
            if (originalAccount !== nextAccount)
                throw Object.assign(new Error('光鸭账号已变化，请重新识别并检查。'), {
                    accountChanged: true,
                    stop: true,
                });
            authorizedToken = latest;
            return latest;
        },
    };
}

function guangyaSource(session) {
    const post = paced(180, requestGuangya.bind(null, session));
    const node = (file) => {
        const id = decimalId(file?.fileId);
        if (!id || typeof file.fileName !== 'string') throw new Error('光鸭目录项目缺少 ID 或名称');
        return {
            key: id,
            id,
            name: file.fileName,
            directory: Number(file.resType) === 2,
            md5: file.md5,
            size: nonNegativeInteger(file.fileSize),
            gcid: file.gcid,
            cid: file.cid,
        };
    };
    return {
        async children(folder) {
            return readPages(
                async (page, count) => {
                    const result = await guangyaListPage(post, folder.id, page, count);
                    return { ...result, items: result.items.map(node) };
                },
                (file) => file.key
            );
        },
        async metadata(file) {
            const response = await post('/userres/v1/file/get_file_detail', { fileId: file.id });
            if (guangyaCode(response) !== 0) throw apiError('读取光鸭文件详情', response);
            const info = response.data?.fileInfo ?? response.data;
            return {
                md5: info?.md5 ?? info?.etag ?? '',
                size: nonNegativeInteger(info?.fileSize ?? file.size),
                gcid: info?.gcid,
                cid: info?.cid,
            };
        },
    };
}
async function waitGuangyaDelete(taskId, post, wait = sleep, stage = '删除') {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (attempt) await wait(1000);
        const response = await post(GUANGYA_API.task, { taskId });
        if (guangyaCode(response) !== 0) throw apiError('查询' + stage + '任务', response);
        const status = nonNegativeInteger(response.data?.status),
            detail = response.data?.detail;
        if (status === 3 || (status === 2 && detail?.code != null && Number(detail.code) !== 0))
            throw Object.assign(
                apiError(stage + '任务', { code: detail?.code || -1, msg: detail?.msg || '任务失败' }),
                { terminal: true }
            );
        if (status === 2) return;
    }
    throw new Error(stage + '任务仍未完成，结果待确认；任务 ID：' + taskId);
}

async function removeGuangyaNode(node, source, post, wait, saveTask, taskId = '') {
    if (!taskId) {
        const response = await post(GUANGYA_API.remove, { fileIds: [node.id] });
        if (guangyaCode(response) !== 0) throw apiError('移入回收站', response);
        taskId = taskIdOf(response.data);
        saveTask(taskId);
    }
    if (taskId) await waitGuangyaDelete(taskId, post, wait);
    for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt) await wait(500);
        if (!(await source.children({ id: node.parentId })).some((item) => item.id === node.id)) return;
    }
    throw Object.assign(new Error('回收请求已提交，但文件仍存在；ID：' + node.id), { terminal: true });
}
