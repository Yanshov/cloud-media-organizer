    if (typeof navigator !== 'undefined' && (navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return;

    const VERSION = '3.3.11';
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
        task: '/userres/v1/get_task_status'
    };
    let refreshStatus = () => {};
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    function paced(interval, request) {
        let last = 0, queue = Promise.resolve();
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
    async function forEachConcurrent(items, limit, run, check = () => {}) {
        let next = 0, failure = null;
        const verify = () => { if (failure) throw failure; check(); };
        const worker = async () => {
            try {
                while (next < items.length) {
                    verify();
                    await run(items[next++], verify);
                }
            } catch (error) { failure ||= error; }
        };
        // Drain active work before allowing another UI task to start.
        await Promise.all(Array.from({length:Math.min(limit, items.length)}, worker));
        verify();
    }
    async function walkTree(roots, keyOf, visit, check) {
        const stack = roots.slice().reverse(), seen = new Set();
        let visited = 0;
        while (stack.length) {
            check();
            const node = stack.pop(), key = keyOf(node);
            if (seen.has(key)) continue;
            seen.add(key);
            const children = await visit(node);
            for (let i = (children?.length ?? 0) - 1; i >= 0; i--) stack.push(children[i]);
            if (++visited % 128 === 0) await sleep(0);
        }
        check();
    }
    function cachedDriveChildren(source, cache = new Map(), check) {
        return async id => {
            check?.();
            if (!cache.has(id)) {
                const nodes = await source.children({id});
                check?.();
                cache.set(id, nodes);
            }
            return cache.get(id);
        };
    }
    function titleKey(value) {
        // Strip Latin accents without removing Japanese dakuten/handakuten.
        return String(value || '').normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFKC').toLowerCase()
            .replace(/(\p{Script=Latin})[. _-]*&[. _-]*(?=\p{Script=Latin})/gu, '$1 and ')
            .replace(/[\p{P}\p{Z}\s]/gu, '');
    }
    function guangyaAuthHeaders(token) {
        return { 'Content-Type': 'application/json;charset=utf-8', Authorization: 'Bearer ' + token, dt: '4' };
    }
    function requestGuangya(token, endpoint, body) {
        return requestJson('https://api.guangyapan.com' + endpoint, {
            method: 'POST', headers: guangyaAuthHeaders(token), body: JSON.stringify(body)
        });
    }
    function nonNegativeInteger(value) {
        if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
        const number = Number(value);
        return Number.isSafeInteger(number) && number >= 0 ? number : null;
    }
    function hasFileMetadata(file) {
        return file && typeof file.md5 === 'string' && /^[a-f0-9]{32}$/i.test(file.md5) && Number.isSafeInteger(file.size) && file.size >= 0;
    }
    function existingFileMessage(existing, file) {
        if (existing.directory) throw new Error('同名文件夹占用了文件位置：' + file.path);
        if (existing.size != null && existing.size !== file.size) throw new Error('同名文件大小不同，未覆盖：' + file.path);
        if (/^[a-f0-9]{32}$/i.test(existing.md5 || '') && existing.md5.toLowerCase() !== file.md5) throw new Error('同名文件 MD5 不同，未覆盖：' + file.path);
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
        if (parts.some(part => !part.trim() || part === '.' || part === '..' || /[\x00-\x1f]/.test(part))) throw new Error('路径包含空名称、控制字符或 . / ..');
        return parts;
    }
    function normalizeFiles(parsed) {
        const items = Array.isArray(parsed) ? parsed : parsed && parsed.files;
        if (!Array.isArray(items) || !items.length) throw new Error('JSON 必须是非空文件数组，或包含 files 数组的对象');
        const paths = new Map(), unique = [];
        for (let i = 0; i < items.length; i++) {
            const f = items[i];
            const prefix = `第 ${i + 1} 项：`;
            if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(prefix + '不是文件对象');
            const rawName = f.path ?? f.name;
            if (typeof rawName !== 'string') throw new Error(prefix + '缺少文件名');
            let parts;
            try { parts = relativeParts(rawName); } catch (error) { throw new Error(prefix + error.message); }
            const name = parts.at(-1), path = parts.join('/');
            let item = { name, path, type: 'directory' };
            if (f.type !== 'directory') {
                if (f.type != null && f.type !== 'file') throw new Error(prefix + '未知项目类型');
                const rawMd5 = f.md5 ?? f.etag;
                if (typeof rawMd5 !== 'string' || !/^[0-9a-f]{32}$/i.test(rawMd5.trim())) throw new Error(prefix + 'MD5 必须是 32 位十六进制字符串');
                const size = nonNegativeInteger(f.size);
                if (size == null) throw new Error(prefix + '文件大小必须是非负安全整数');
                item = { name, path, type: 'file', md5: rawMd5.trim().toLowerCase(), size };
                if (f.gcid != null || f.cid != null) {
                    for (const key of ['gcid', 'cid']) {
                        if (typeof f[key] !== 'string' || !/^[0-9a-f]{40}$/i.test(f[key].trim())) throw new Error(prefix + 'GCID 和 CID 必须同时提供，且均为 40 位十六进制字符串');
                        item[key] = f[key].trim().toUpperCase();
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
        return (typeof value === 'number' || typeof value === 'string' && /^-?\d+$/.test(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
    }
    function guangyaCode(data) {
        // 光鸭成功响应允许省略默认值 code: 0；123 仍使用严格的 apiCode。
        return data && typeof data === 'object' && !Array.isArray(data) && data.code === undefined ? 0 : apiCode(data);
    }
    function apiError(stage, data) {
        const code = apiCode(data);
        const raw = [data?.msg, data?.message, data?.errorMsg, data?.error_description].find(value => typeof value === 'string' && value.trim());
        let message = raw ? raw.trim() : '接口未提供错误说明';
        for (const token of [capture.token, capture.token123]) if (token) message = message.split(token).join('[凭证已隐藏]');
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
        const hasId = typeof info?.fileId === 'string' ? !!info.fileId.trim() && info.fileId.trim() !== '0' : Number.isSafeInteger(info?.fileId) && info.fileId > 0;
        if (!hasId || info.fileName !== file.name || nonNegativeInteger(info.fileSize) !== file.size) return null;
        if (info.parentId != null) {
            if (typeof info.parentId === 'number' && !Number.isSafeInteger(info.parentId)) return null;
            const actualParent = String(info.parentId);
            if ((actualParent === '0' ? '' : actualParent) !== parentId) return null;
        }
        if (typeof info.md5 === 'string' && /^[a-f0-9]{32}$/i.test(info.md5) && info.md5.toLowerCase() !== file.md5) return null;
        return info;
    }
    async function importFile(file, targetId, post, wait = sleep) {
        const parentId = targetId === '0' ? '' : targetId;
        const res = { md5: file.md5, fileSize: file.size };
        if (file.gcid && file.cid) Object.assign(res, { gcid: file.gcid, cid: file.cid });
        let first;
        try { first = await post(API.create, { capacity: 30, res, name: file.name, parentId }); }
        catch (error) {
            return { status: 'pending', message: '创建请求异常，结果未确认：' + error.message + '；先刷新目录核对，避免重复提交', stop: error.stop };
        }
        const code = guangyaCode(first);
        if (code !== 0 && code !== 156) throw apiError('创建任务', first);
        const inline = confirmedFile(first.data, file, parentId);
        if (inline) return { status: 'saved', message: `已确认生成文件：${inline.fileName}；文件 ID：${inline.fileId}` };
        let taskId = taskIdOf(first.data);
        if (!taskId) return { status: 'pending', message: '创建接口没有返回有效 taskId，结果无法确认；请先刷新目录核对' };
        if (code === 0) {
            if (!file.gcid || !file.cid) return { status: 'miss', message: `MD5 未直接命中秒传；缺少 GCID/CID，需真实文件内容继续上传。任务 ID：${taskId}` };
            let second;
            try { second = await post(API.check, { taskId, gcid: file.gcid, cid: file.cid }); }
            catch (error) { return { status: 'pending', message: '秒传检查请求异常，结果未确认：' + error.message, stop: error.stop }; }
            if (guangyaCode(second) !== 0) throw apiError('秒传检查', second);
            if (second.data?.canFlashUpload === false) return { status: 'miss', message: 'GCID/CID 秒传未命中，需要真实文件上传' };
            if (second.data?.canFlashUpload !== true) return { status: 'pending', message: '秒传接口未返回明确结果，请先核对目录' };
            taskId = taskIdOf(second.data) || taskId;
        }
        for (let attempt = 0; attempt < 8; attempt++) {
            if (attempt) await wait(1000);
            let result;
            try { result = await post(API.info, { taskId }); }
            catch (error) { return { status: 'pending', message: `接口已报告秒传命中，但查询文件失败：${error.message}；任务 ID：${taskId}`, stop: error.stop }; }
            const resultCode = guangyaCode(result);
            if (resultCode === 0) {
                const info = confirmedFile(result.data, file, parentId);
                return info ? { status: 'saved', message: `已确认生成文件：${info.fileName}；文件 ID：${info.fileId}` } : { status: 'pending', message: `任务返回的文件信息不完整或与输入不符，待人工核对；任务 ID：${taskId}` };
            }
            if (resultCode !== 147) {
                const error = apiError('查询任务文件', result);
                return { status: 'pending', message: error.message + `；任务 ID：${taskId}`, stop: error.stop };
            }
        }
        return { status: 'pending', message: `接口已报告秒传命中，8 次查询仍在处理；请稍后刷新目录核对。任务 ID：${taskId}` };
    }
    function checkJsonTask() {
        if (jsonTaskStopped) throw Object.assign(new Error('已停止后续请求；已提交的操作请刷新目录核对'), {stop:true, cancelled:true});
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
        } finally { clearTimeout(timer); }
    }
