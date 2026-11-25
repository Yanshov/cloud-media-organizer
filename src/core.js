if (
    typeof navigator !== 'undefined' &&
    (navigator.userAgentData?.mobile ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
)
    return;

const VERSION = '1.0.6';
const page = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
const nativeFetch = page.fetch.bind(page);
const capture = { token: '' };
const GUANGYA_API = {
    create: '/userres/v2/get_res_center_token',
    check: '/userres/v1/check_can_flash_upload',
    info: '/userres/v1/file/get_info_by_task_id',
    list: '/userres/v1/file/get_file_list',
    mkdir: '/userres/v1/file/create_dir',
    remove: '/userres/v1/file/delete_file',
    task: '/userres/v1/get_task_status',
};
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
function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
}
function relativeParts(value) {
    if (typeof value !== 'string') throw new Error('缺少相对路径');
    const parts = value.replace(/\\/g, '/').split('/');
    if (parts.some((part) => !part.trim() || part === '.' || part === '..' || /[\x00-\x1f]/.test(part)))
        throw new Error('路径包含空名称、控制字符或 . / ..');
    return parts;
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
    if (capture.token) message = message.split(capture.token).join('[凭证已隐藏]');
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
async function requestJson(url, options = {}) {
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
