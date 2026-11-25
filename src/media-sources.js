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

const pan123Domains = ['123pan.com', '123pan.cn', '123865.com', '123684.com', '123912.com'];
const is123Host = (host) => pan123Domains.some((domain) => host === domain || host.endsWith('.' + domain));
// 新版云盘的文件接口已迁至独立域名；仅信任网页公开配置中的生产接口。
const pan123ApiOrigins = new Set([
    'https://api.123278.com',
    'https://api.123panapi.com',
    'https://api.123panapi.cn',
]);
function is123ApiUrl(url) {
    return (
        url.protocol === 'https:' &&
        (pan123ApiOrigins.has(url.origin) || is123Host(url.hostname)) &&
        /^\/(?:[ab]\/)?api\//.test(url.pathname)
    );
}
function read123Storage(key) {
    try {
        return page.localStorage?.getItem(key) ?? '';
    } catch (_) {
        return '';
    }
}
function stored123Token(key) {
    let value = read123Storage(key);
    try {
        value = JSON.parse(value);
    } catch (_) {}
    if (typeof value !== 'string') return '';
    value = value.trim().replace(/^Bearer\s+/i, '');
    return value && !/^(?:null|undefined)$/i.test(value) && !/[\s"\x00-\x1f]/.test(value) ? value : '';
}
function current123Parent() {
    const url = new URL(location.href);
    const raw = url.searchParams.get('homeFilePath') ?? routeHashParams(url.hash).get('homeFilePath');
    if (raw != null && raw.trim()) {
        const ids = raw.split(',').map((id) => decimalId(id.trim()));
        if (ids.some((id) => !id))
            throw new Error('网址中的 homeFilePath 不是有效目录路径，请重新打开所需文件夹');
        return ids.at(-1);
    }
    // 新网页根目录没有 homeFilePath；不能沿用上一个目录的捕获值。
    if (url.pathname === '/' && (!url.hash || raw != null)) return '0';
    if (capture.parent123 != null) return capture.parent123;
    throw new Error('未识别到当前目录，请打开“全部文件”中的目标文件夹');
}
async function media123ParentPath(source, breadcrumbs) {
    if (source.parentId === '0') return '';
    const url = new URL(location.href);
    const raw = url.searchParams.get('homeFilePath') ?? routeHashParams(url.hash).get('homeFilePath');
    const ids = (raw || source.parentId)
        .split(',')
        .map((id) => decimalId(id.trim()))
        .filter((id) => id !== '0');
    if (ids.some((id) => !id) || ids.at(-1) !== source.parentId)
        throw new Error('无法确认当前目录路径，请重新打开文件夹后重试');
    let parent = '0';
    const names = [];
    for (const id of ids) {
        const folder = (await source.children({ id: parent })).find(
            (item) => item.id === id && item.directory
        );
        if (!folder || relativeParts(folder.name).length !== 1)
            throw new Error('无法读取完整源目录树，请从网盘根目录逐层打开文件夹后重试');
        names.push(folder.name);
        breadcrumbs?.push({ id, name: folder.name });
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
    const hashParams = routeHashParams(url.hash);
    const category = url.searchParams.get('category') ?? hashParams.get('category');
    if (
        (category != null && category !== '' && category !== '0') ||
        url.searchParams.get('search') ||
        hashParams.get('search')
    )
        throw new Error('请先进入“全部文件”的实际文件夹；分类、搜索和回收站页面不支持');
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
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
}
function signed123Url(base, params, now = Date.now(), random = Math.round(Math.random() * 1e7)) {
    const url = new URL(base + '/file/list/new');
    const minute = new Date(now + 8 * 3600000).toISOString().slice(0, 16).replace(/\D/g, '');
    const letters = ['a', 'd', 'e', 'f', 'g', 'h', 'l', 'm', 'y', 'i'];
    const key = String(crc32([...minute].map((char) => letters[Number(char)]).join('')));
    const timestamp = Math.floor(now / 1000);
    const signature = crc32(`${timestamp}|${random}|${url.pathname}|web|3|${key}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    url.searchParams.set(key, `${timestamp}-${random}-${signature}`);
    return url.href;
}
function pan123Node(file) {
    const id = decimalId(file?.FileId);
    if (
        !id ||
        id === '0' ||
        typeof file.FileName !== 'string' ||
        ![0, 1].includes(nonNegativeInteger(file.Type))
    )
        throw new Error('123 文件元数据格式不正确');
    return {
        key: id,
        id,
        name: file.FileName,
        directory: Number(file.Type) === 1,
        md5: file.Etag,
        s3keyFlag: file.S3KeyFlag,
        size: nonNegativeInteger(file.Size),
    };
}
function pan123Source(session = recover123Session()) {
    // 固定本次整理使用的凭证和 API 地址，避免网页状态变化影响扫描。
    const { base, parent, headers } = session;
    // 123 接口使用通配来源的 CORS；携带 Cookie 会被浏览器拒绝，登录仅使用上面的 Bearer Token。
    const get = paced(250, (url) => requestJson(url, { credentials: 'omit', headers }));
    return {
        parentId: parent,
        async children(node) {
            let next = '0';
            return readPages(
                async (pageNumber, count) => {
                    const url = signed123Url(base, {
                        driveId: 0,
                        limit: 100,
                        next,
                        orderBy: 'file_id',
                        orderDirection: 'desc',
                        parentFileId: node.id,
                        trashed: false,
                        SearchData: '',
                        Page: pageNumber,
                        OnlyLookAbnormalFile: 0,
                        event: 'homeListFile',
                        operateType: 4,
                        inDirectSpace: false,
                    });
                    const data = await get(url);
                    if (![0, 200].includes(apiCode(data))) throw apiError('123 目录读取', data);
                    if (!Array.isArray(data.data?.InfoList)) throw new Error('123 没有返回文件列表');
                    const items = data.data.InfoList.map(pan123Node);
                    next = String(data.data.Next ?? '0');
                    const total = nonNegativeInteger(data.data.Total);
                    const more =
                        next !== '-1' &&
                        (total != null ? count + items.length < total : next !== '0' || items.length >= 100);
                    return { items, more, total };
                },
                (file) => file.key
            );
        },
    };
}

function selected123State() {
    // 新版使用虚拟列表；从当前 React 组件读取完整勾选 ID，包含滚出屏幕的项。
    const containers = document.querySelectorAll(
        '.file-table-list-wrapper, .tiled-list-content-scroll, .file-wrapper[data-file]'
    );
    for (const element of containers) {
        const key = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
        let fiber = key && element[key];
        if (!fiber) continue;
        let root = fiber;
        while (root.return) root = root.return;
        if (root.stateNode?.current && root.stateNode.current !== root) fiber = fiber.alternate || fiber;
        while (fiber) {
            const props = fiber.memoizedProps;
            const state = props?.value?.browserBridge?.homeState || props?.value?.homeState;
            const ids = props?.rowSelection?.selectedRowKeys ?? state?.selectedRowKeys;
            if (Array.isArray(ids)) return ids.map((id) => ({ id: decimalId(id), names: [] }));
            fiber = fiber.return;
        }
    }
    return null;
}

function selected123Items() {
    const state = selected123State();
    if (state !== null) {
        if (state.some((item) => !item.id)) throw new Error('选中项目缺少有效 ID，请重新选择');
        return state;
    }
    const rows = new Set(
        document.querySelectorAll(
            '.ant-table-row-selected, .ant-table-row[aria-selected="true"], tr[aria-selected="true"][data-row-key], .file-wrapper.selected[data-file], .file-wrapper[aria-selected="true"][data-file]'
        )
    );
    for (const checkbox of document.querySelectorAll(
        'input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"]'
    )) {
        const row = checkbox.closest('.ant-table-row, tr[data-row-key], .file-wrapper[data-file]');
        if (row) rows.add(row);
    }
    const items = new Map();
    for (const row of rows) {
        const id = ['data-row-key', 'data-id', 'data-file-id', 'data-file']
            .map((key) => decimalId(row.getAttribute(key)))
            .find(Boolean);
        const names = id
            ? []
            : [...row.querySelectorAll('[title]')]
                  .map((element) => element.getAttribute('title'))
                  .filter(Boolean);
        if (!id && !names.length) throw new Error('选中项目缺少 ID 和文件名，请切换列表视图后重试');
        items.set(id || row, { id, names });
    }
    return [...items.values()];
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

function inspectRequest(target, headers, body) {
    const pan123 = is123ApiUrl(target);
    const tokenKey = pan123 ? 'token123' : 'token';
    const auth = headers.get('authorization');
    if (auth && /^Bearer\s+\S+/i.test(auth)) {
        const token = auth.replace(/^Bearer\s+/i, '').trim();
        capture[tokenKey] = token;
    }
    if (pan123) {
        const uuid = headers.get('LoginUuid');
        if (uuid) capture.loginUuid123 = uuid;
    }
    const isList = pan123
        ? /\/(?:[ab]\/)?api\/file\/list(?:\/new)?$/.test(target.pathname)
        : target.pathname === GUANGYA_API.list;
    if (isList) {
        const key = pan123 ? 'parentFileId' : 'parentId';
        let parent = target.searchParams.get(key);
        if (typeof body === 'string' && body.trim()) {
            try {
                parent = JSON.parse(body)?.[key] ?? parent;
            } catch (_) {}
            if (
                parent == null &&
                /application\/x-www-form-urlencoded/i.test(headers.get('content-type') || '')
            )
                parent = new URLSearchParams(body).get(key);
        } else if (body && typeof body.get === 'function') parent = body.get(key) ?? parent;
        const id = parent === '' ? '0' : decimalId(parent);
        if (pan123 && id) {
            capture.parent123 = id;
            capture.base123 = target.origin + target.pathname.replace(/\/file\/list(?:\/new)?$/, '');
        }
    }
    return isList;
}
