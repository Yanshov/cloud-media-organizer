if (
    typeof navigator !== 'undefined' &&
    (navigator.userAgentData?.mobile ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
)
    return;

const VERSION = '3.0.48';
let jsonTaskStopped = false;
const page = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
const nativeFetch = page.fetch.bind(page);
const capture = { token: '', parent: '', token123: '', parent123: null, base123: '', loginUuid123: '' };
const API = {
    create: '/userres/v2/get_res_center_token',
    check: '/userres/v1/check_can_flash_upload',
    info: '/userres/v1/file/get_info_by_task_id',
    list: '/userres/v1/file/get_file_list',
    mkdir: '/userres/v1/file/create_dir',
    remove: '/userres/v1/file/delete_file',
    task: '/userres/v1/get_task_status',
};
let refreshStatus = () => {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function paced(interval, request) {
    let last = 0,
        queue = Promise.resolve();
    return (...args) => {
        const result = queue.then(async () => {
            const delay = interval - (Date.now() - last);
            if (delay > 0) await sleep(delay);
            last = Date.now();
            return request(...args);
        });
        queue = result.catch(() => {}); // A failed request must not block the next queued call.
        return result;
    };
}
function evict(map, max) {
    while (map.size > max) map.delete(map.keys().next().value);
}
/** Runs a limited number of tasks at once and drains active tasks after the first failure. */
async function forEachConcurrent(items, limit, run, check = () => {}) {
    let next = 0,
        failure;
    const verify = () => {
        if (failure) throw failure.error;
        check();
    };
    const worker = async () => {
        try {
            while (next < items.length) {
                verify();
                const index = next++;
                await run(items[index], verify, index);
            }
        } catch (error) {
            failure ??= { error };
        }
    };
    // Drain active work before allowing another UI task to start.
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    verify();
}

/** Collects one batch summary across one or more sequential groups of concurrent tasks. */
function createBatchStage(label, log, limit, reason = '') {
    const started = Date.now();
    let total = 0,
        active = 0,
        peak = 0,
        success = 0,
        failed = 0,
        skipped = 0,
        timeout = 0,
        limited = 0;
    const seen = new WeakSet();
    const observe = (error) => {
        if (!error) return;
        if (typeof error === 'object') {
            if (seen.has(error)) return;
            seen.add(error);
        }
        if ([408, 504].includes(error.status) || /超时|timed? ?out|timeout/i.test(error.message || error))
            timeout++;
        if (
            [429, 509].includes(error.status) ||
            /限流|请求过频|HTTP (?:429|509)|返回码 (?:429|509)/i.test(error.message || error)
        )
            limited++;
    };
    return {
        /** Runs a group and adds its results to the stage totals. */
        run(items, run, check) {
            total += items.length;
            return forEachConcurrent(
                items,
                limit,
                async (item, verify, index) => {
                    active++;
                    peak = Math.max(peak, active);
                    try {
                        const state = await run(item, verify, index, observe);
                        if (state === 'skipped') skipped++;
                        else if (state === 'failed') failed++;
                        else success++;
                    } catch (error) {
                        observe(error);
                        failed++;
                        throw error;
                    } finally {
                        active--;
                    }
                },
                check
            );
        },
        /** Logs the final counts and peak concurrency. */
        report() {
            log?.(
                label +
                    ' · 总量 ' +
                    total +
                    ' · 上限 ' +
                    limit +
                    ' · 峰值 ' +
                    peak +
                    ' · 耗时 ' +
                    ((Date.now() - started) / 1000).toFixed(2) +
                    ' 秒 · 成功 ' +
                    success +
                    ' · 失败 ' +
                    failed +
                    ' · 跳过 ' +
                    skipped +
                    ' · 未派发 ' +
                    (total - success - failed - skipped) +
                    ' · 超时 ' +
                    timeout +
                    ' · 限流 ' +
                    limited +
                    (reason ? ' · ' + reason : '')
            );
        },
    };
}

/** Runs one batch and reports its outcome, including after cancellation. */
async function batchStage(items, label, log, run, check = () => {}, limit = 8, reason = '') {
    const stage = createBatchStage(label, log, limit, reason);
    try {
        await stage.run(items, run, check);
    } finally {
        stage.report();
    }
}
function groupBatch(items, keyOf) {
    const groups = new Map();
    for (const item of items) {
        const key = keyOf(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    return [...groups.values()];
}
/** Groups items that share keys, including connections through other items. */
function connectedBatch(items, keysOf) {
    const groups = [],
        byKey = new Map();
    const root = (group) => {
        while (group.parent) {
            if (group.parent.parent) group.parent = group.parent.parent;
            group = group.parent;
        }
        return group;
    };
    for (const item of items) {
        const group = { item, parent: null };
        groups.push(group);
        for (const key of keysOf(item)) {
            if (byKey.has(key)) {
                const other = root(byKey.get(key)),
                    first = root(group);
                if (other !== first) other.parent = first;
            } else byKey.set(key, group);
        }
    }
    return groupBatch(groups, root).map((group) => group.map((record) => record.item));
}
function enqueueByKey(queues, key, run) {
    const previous = queues.get(key) || Promise.resolve();
    const task = previous.then(run);
    const tail = task.catch(() => {});
    queues.set(key, tail);
    tail.then(() => {
        if (queues.get(key) === tail) queues.delete(key);
    });
    return task;
}
/** Visits each unique node by layer while tracking its original tree position. */
async function walkTree(roots, keyOf, visit, check, log, label = '目录遍历（目录/文件）') {
    check();
    let pending = roots.map((node, index) => ({ node, order: [index] }));
    const seen = new Set();
    const stage = createBatchStage(label, log, 8);
    try {
        while (pending.length) {
            const layer = pending.filter(({ node }) => {
                const key = keyOf(node);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            const next = [];
            await stage.run(
                layer,
                async ({ node, order }, verify, index) => {
                    const children = await visit(node, verify, order);
                    verify();
                    next[index] = (children || []).map((node, childIndex) => ({
                        node,
                        order: [...order, childIndex],
                    }));
                },
                check
            );
            pending = next.flat();
        }
    } finally {
        stage.report();
    }
}
function compareTreeOrder(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
}
function cachedDriveChildren(source, cache = new Map(), check) {
    return async (id) => {
        check?.();
        if (!cache.has(id)) {
            const loading = Promise.resolve().then(() => {
                check?.();
                return source.children({ id });
            });
            cache.set(id, loading);
            loading.catch(() => {
                if (cache.get(id) === loading) cache.delete(id);
            });
        }
        const nodes = await cache.get(id);
        check?.();
        return nodes;
    };
}
function titleKey(value) {
    // Strip Latin accents without removing Japanese dakuten/handakuten.
    return String(value || '')
        .normalize('NFD')
        .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/(\p{Script=Latin})[. _-]*&[. _-]*(?=\p{Script=Latin})/gu, '$1 and ')
        .replace(/[\p{P}\p{Z}\s]/gu, '');
}
function guangyaAuthHeaders(token) {
    return { 'Content-Type': 'application/json;charset=utf-8', Authorization: 'Bearer ' + token, dt: '4' };
}
function requestGuangya(token, endpoint, body) {
    return requestJson('https://api.guangyapan.com' + endpoint, {
        method: 'POST',
        headers: guangyaAuthHeaders(token),
        body: JSON.stringify(body),
    });
}
function nonNegativeInteger(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function createMd5() {
    const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const constants = Array.from(
        { length: 64 },
        (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0
    );
    let a0 = 0x67452301,
        b0 = 0xefcdab89,
        c0 = 0x98badcfe,
        d0 = 0x10325476;
    const tail = new Uint8Array(64);
    const tailView = new DataView(tail.buffer);
    let length = 0;
    let remaining = 0;
    const block = (view, offset) => {
        let a = a0,
            b = b0,
            c = c0,
            d = d0;
        for (let i = 0; i < 64; i++) {
            let f, g;
            if (i < 16) {
                f = (b & c) | (~b & d);
                g = i;
            } else if (i < 32) {
                f = (d & b) | (~d & c);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                g = (7 * i) % 16;
            }
            const v = (a + f + constants[i] + view.getUint32(offset + g * 4, true)) | 0;
            const shift = shifts[(i >>> 4) * 4 + (i % 4)];
            a = d;
            d = c;
            c = b;
            b = (b + ((v << shift) | (v >>> (32 - shift)))) | 0;
        }
        a0 = (a0 + a) | 0;
        b0 = (b0 + b) | 0;
        c0 = (c0 + c) | 0;
        d0 = (d0 + d) | 0;
    };
    const update = (bytes) => {
        length += bytes.length;
        let offset = 0;
        if (remaining) {
            offset = Math.min(64 - remaining, bytes.length);
            tail.set(bytes.subarray(0, offset), remaining);
            remaining += offset;
            if (remaining < 64) return;
            block(tailView, 0);
        }
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (; offset + 64 <= bytes.length; offset += 64) block(view, offset);
        remaining = bytes.length - offset;
        tail.set(bytes.subarray(offset), 0);
    };
    // Finalize once, adding the 64-bit length required for multi-gigabyte files.
    const digest = () => {
        const final = new Uint8Array(remaining < 56 ? 64 : 128);
        final.set(tail.subarray(0, remaining));
        final[remaining] = 128;
        const view = new DataView(final.buffer);
        view.setUint32(final.length - 8, (length % 0x20000000) * 8, true);
        view.setUint32(final.length - 4, Math.floor(length / 0x20000000), true);
        for (let offset = 0; offset < final.length; offset += 64) block(view, offset);
        return [a0, b0, c0, d0]
            .map((n) =>
                [0, 8, 16, 24].map((shift) => ((n >>> shift) & 255).toString(16).padStart(2, '0')).join('')
            )
            .join('');
    };
    return { update, digest };
}

function hasFileMetadata(file) {
    return (
        file &&
        typeof file.md5 === 'string' &&
        /^[a-f0-9]{32}$/i.test(file.md5) &&
        Number.isSafeInteger(file.size) &&
        file.size >= 0
    );
}
function existingFileMessage(existing, file) {
    if (existing.directory) throw new Error('同名文件夹占用了文件位置：' + file.path);
    if (existing.size != null && existing.size !== file.size)
        throw new Error('同名文件大小不同，未覆盖：' + file.path);
    if (/^[a-f0-9]{32}$/i.test(existing.md5 || '') && existing.md5.toLowerCase() !== file.md5)
        throw new Error('同名文件 MD5 不同，未覆盖：' + file.path);
    return hasFileMetadata(existing) ? '目标已有相同文件，跳过' : '目标已有同名文件，内容无法核对，跳过';
}
function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
}
function decodeMd5(value) {
    const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (/^[0-9a-f]{32}$/.test(s)) return s;
    if (s.length !== 32) return '';
    // 保留原脚本的百度混淆值还原算法；真实文件是否匹配仍需验证。
    const offset = s.charCodeAt(9) - 'g'.charCodeAt(0);
    if (offset < 0 || offset > 15) return '';
    const chars = s.split('');
    chars[9] = offset.toString(16);
    if (!/^[0-9a-f]{32}$/.test(chars.join(''))) return '';
    const d = chars.map((ch, i) => (parseInt(ch, 16) ^ (i & 15)).toString(16));
    return d.slice(8, 16).join('') + d.slice(0, 8).join('') + d.slice(24).join('') + d.slice(16, 24).join('');
}
function relativeParts(value) {
    if (typeof value !== 'string') throw new Error('缺少相对路径');
    const parts = value.replace(/\\/g, '/').split('/');
    if (parts.some((part) => !part.trim() || part === '.' || part === '..' || /[\x00-\x1f]/.test(part)))
        throw new Error('路径包含空名称、控制字符或 . / ..');
    return parts;
}
function normalizeFiles(parsed) {
    const items = Array.isArray(parsed) ? parsed : parsed && parsed.files;
    if (!Array.isArray(items) || !items.length)
        throw new Error('JSON 必须是非空文件数组，或包含 files 数组的对象');
    const paths = new Map(),
        unique = [];
    for (let i = 0; i < items.length; i++) {
        const f = items[i];
        const prefix = `第 ${i + 1} 项：`;
        if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(prefix + '不是文件对象');
        const rawName = f.path ?? f.name;
        if (typeof rawName !== 'string') throw new Error(prefix + '缺少文件名');
        let parts;
        try {
            parts = relativeParts(rawName);
        } catch (error) {
            throw new Error(prefix + error.message);
        }
        const name = parts.at(-1),
            path = parts.join('/');
        let item = { name, path, type: 'directory' };
        if (f.type !== 'directory') {
            if (f.type != null && f.type !== 'file') throw new Error(prefix + '未知项目类型');
            const rawMd5 = f.md5 ?? f.etag;
            if (typeof rawMd5 !== 'string' || !/^[0-9a-f]{32}$/i.test(rawMd5.trim()))
                throw new Error(prefix + 'MD5 必须是 32 位十六进制字符串');
            const size = nonNegativeInteger(f.size);
            if (size == null) throw new Error(prefix + '文件大小必须是非负安全整数');
            item = { name, path, type: 'file', md5: rawMd5.trim().toLowerCase(), size };
            if (f.gcid != null || f.cid != null) {
                if (typeof f.gcid !== 'string' || !/^[0-9a-f]{40}$/i.test(f.gcid.trim()))
                    throw new Error(prefix + 'GCID 必须是 40 位十六进制字符串');
                item.gcid = f.gcid.trim().toUpperCase();
                if (f.cid != null) {
                    if (typeof f.cid !== 'string' || !/^[0-9a-f]{40}$/i.test(f.cid.trim()))
                        throw new Error(prefix + 'CID 必须是 40 位十六进制字符串');
                    item.cid = f.cid.trim().toUpperCase();
                }
            }
        }
        const type = paths.get(path);
        if (type) {
            if (type === 'directory' && item.type === 'directory') continue;
            throw new Error('JSON 包含重复或类型冲突的路径：' + path);
        }
        paths.set(path, item.type);
        unique.push(item);
    }
    for (const item of unique) {
        const parts = item.path.split('/');
        for (let i = 1; i < parts.length; i++) {
            const prefix = parts.slice(0, i).join('/');
            if (paths.get(prefix) === 'file') throw new Error('文件不能作为父目录：' + prefix);
        }
    }
    return unique;
}
function apiCode(data) {
    const value = data?.code;
    return (typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value))) &&
        Number.isSafeInteger(Number(value))
        ? Number(value)
        : null;
}
function guangyaCode(data) {
    // 光鸭成功响应允许省略默认值 code: 0；123 仍使用严格的 apiCode。
    return data && typeof data === 'object' && !Array.isArray(data) && data.code === undefined
        ? 0
        : apiCode(data);
}
function apiError(stage, data) {
    const code = apiCode(data);
    const raw = [data?.msg, data?.message, data?.errorMsg, data?.error_description].find(
        (value) => typeof value === 'string' && value.trim()
    );
    let message = raw ? raw.trim() : '接口未提供错误说明';
    for (const token of [capture.token, capture.token123])
        if (token) message = message.split(token).join('[凭证已隐藏]');
    message = message.replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]').slice(0, 600);
    const error = new Error(`${stage}返回码 ${code ?? '缺失'}：${message}`);
    error.stop = [110, 117, 118, 401, 403].includes(code);
    return error;
}
function taskIdOf(data) {
    const value = data?.taskId ?? data?.task_id;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    return '';
}
function confirmedFile(data, file, parentId) {
    const info = data?.fileInfo ?? data;
    const hasId =
        typeof info?.fileId === 'string'
            ? !!info.fileId.trim() && info.fileId.trim() !== '0'
            : Number.isSafeInteger(info?.fileId) && info.fileId > 0;
    if (!hasId || info.fileName !== file.name || nonNegativeInteger(info.fileSize) !== file.size) return null;
    if (info.parentId != null) {
        if (typeof info.parentId === 'number' && !Number.isSafeInteger(info.parentId)) return null;
        const actualParent = String(info.parentId);
        if ((actualParent === '0' ? '' : actualParent) !== parentId) return null;
    }
    if (
        typeof info.md5 === 'string' &&
        /^[a-f0-9]{32}$/i.test(info.md5) &&
        info.md5.toLowerCase() !== file.md5
    )
        return null;
    return info;
}
async function importFile(file, targetId, post, wait = sleep) {
    const parentId = targetId === '0' ? '' : targetId;
    const res = { md5: file.md5, fileSize: file.size };
    if (file.gcid) res.gcid = file.gcid;
    if (file.cid) res.cid = file.cid;
    let first;
    try {
        first = await post(API.create, { capacity: 30, res, name: file.name, parentId });
    } catch (error) {
        return {
            status: 'pending',
            message: '创建请求异常，结果未确认：' + error.message + '；先刷新目录核对，避免重复提交',
            stop: error.stop,
        };
    }
    const code = guangyaCode(first);
    if (code !== 0 && code !== 156) throw apiError('创建任务', first);
    const inline = confirmedFile(first.data, file, parentId);
    if (inline)
        return { status: 'saved', message: `已确认生成文件：${inline.fileName}；文件 ID：${inline.fileId}` };
    let taskId = taskIdOf(first.data);
    if (!taskId)
        return { status: 'pending', message: '创建接口没有返回有效 taskId，结果无法确认；请先刷新目录核对' };
    if (code === 0) {
        if (!file.gcid)
            return {
                status: 'miss',
                message: `MD5 未直接命中，清单缺少 GCID。可从本地原文件生成清单再试。任务 ID：${taskId}`,
            };
        let second;
        try {
            const hashes = { taskId, gcid: file.gcid };
            if (file.cid) hashes.cid = file.cid;
            second = await post(API.check, hashes);
        } catch (error) {
            return {
                status: 'pending',
                message: '秒传检查请求异常，结果未确认：' + error.message,
                stop: error.stop,
            };
        }
        if (guangyaCode(second) !== 0) throw apiError('秒传检查', second);
        if (second.data?.canFlashUpload === false)
            return { status: 'miss', message: 'GCID 秒传未命中，需要上传原文件' };
        if (second.data?.canFlashUpload !== true)
            return { status: 'pending', message: '秒传接口未返回明确结果，请先核对目录' };
        taskId = taskIdOf(second.data) || taskId;
    }
    for (let attempt = 0; attempt < 8; attempt++) {
        if (attempt) await wait(1000);
        let result;
        try {
            result = await post(API.info, { taskId });
        } catch (error) {
            return {
                status: 'pending',
                message: `接口已报告秒传命中，但查询文件失败：${error.message}；任务 ID：${taskId}`,
                stop: error.stop,
            };
        }
        const resultCode = guangyaCode(result);
        if (resultCode === 0) {
            const info = confirmedFile(result.data, file, parentId);
            return info
                ? { status: 'saved', message: `已确认生成文件：${info.fileName}；文件 ID：${info.fileId}` }
                : {
                      status: 'pending',
                      message: `任务返回的文件信息不完整或与输入不符，待人工核对；任务 ID：${taskId}`,
                  };
        }
        if (resultCode !== 147) {
            const error = apiError('查询任务文件', result);
            return { status: 'pending', message: error.message + `；任务 ID：${taskId}`, stop: error.stop };
        }
    }
    return {
        status: 'pending',
        message: `接口已报告秒传命中，8 次查询仍在处理；请稍后刷新目录核对。任务 ID：${taskId}`,
    };
}
function checkJsonTask() {
    if (jsonTaskStopped)
        throw Object.assign(new Error('已停止后续请求；已提交的操作请刷新目录核对'), {
            stop: true,
            cancelled: true,
        });
}
async function requestJson(url, options = {}) {
    checkJsonTask();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await nativeFetch(url, { ...options, signal: controller.signal });
        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            error.stop = response.status === 401 || response.status === 403;
            throw error;
        }
        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('请求超时（30 秒）');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
