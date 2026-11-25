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

function guangyaSource(token) {
    const post = paced(180, requestGuangya.bind(null, token));
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
