// Runs inside a dedicated worker with the bundled node-unrar-js decoder.
let extractor, entries;

function rarEntries(list, inputSize, strict) {
    if (list.arcHeader.flags.volume) throw new Error('RAR 分卷包请先合并成单个压缩包');
    if (list.arcHeader.flags.headerEncrypted) throw new Error('RAR 已加密，请先在本地解密');
    const files = [], paths = new Map();
    let count = 0, expanded = 0;
    for (const header of list.fileHeaders) {
        if (++count > (strict ? 200 : 2000)) throw new Error('RAR 条目数量超过上限');
        const path = header.name.replace(/\\/g,'/'), directory = header.flags.directory;
        const parts = path.normalize('NFKC').replace(/\/$/,'').split('/');
        if (parts.some(part => !part || part === '.' || part === '..' || /[:\x00-\x1f]/.test(part) || /[ .]$/.test(part)))
            throw new Error('RAR 包含绝对路径或不安全路径');
        const key = parts.join('/').toLowerCase();
        if (paths.has(key)) throw new Error('RAR 包含重复或冲突路径');
        paths.set(key,directory);
        if (header.flags.encrypted) throw new Error('RAR 已加密，请先在本地解密');
        if (!Number.isSafeInteger(header.unpSize) || header.unpSize < 0 || !Number.isSafeInteger(header.packSize) || header.packSize < 0)
            throw new Error('RAR 条目大小无效');
        const limit = (strict ? 4 : 16) * 1024 * 1024;
        if (header.unpSize > limit) throw new Error('RAR 单个条目超过 ' + (strict ? 4 : 16) + ' MiB');
        expanded += header.unpSize;
        if (expanded > 32 * 1024 * 1024) throw new Error('RAR 累计解压大小超过 32 MiB');
        if (expanded > inputSize * 200) throw new Error('RAR 压缩比超过 200:1');
        const name = path.split('/').pop(), ext = name.split('.').pop().toLowerCase();
        if (strict && /\.(?:zip|rar|7z|tar|gz|bz2|xz|cab)$/i.test(name)) throw new Error('不支持嵌套压缩包');
        if (directory || !['srt','ass','ssa','vtt'].includes(ext) || path.startsWith('__MACOSX/') || name.startsWith('._')) continue;
        files.push({name,path,ext,length:header.unpSize,originalPath:header.name});
    }
    for (const key of paths.keys()) {
        for (let slash = key.lastIndexOf('/'); slash >= 0; slash = key.lastIndexOf('/',slash-1))
            if (paths.get(key.slice(0,slash)) === false) throw new Error('RAR 包含文件与目录路径冲突');
    }
    return files;
}

self.onmessage = async event => {
    try {
        if (event.data.type === 'open') {
            const data = event.data.bytes;
            const wasmBinary = Uint8Array.from(atob(SUBTITLE_RAR_WASM), character => character.charCodeAt(0));
            extractor = await SubtitleUnrar.createExtractorFromData({data,wasmBinary});
            entries = rarEntries(extractor.getFileList(),data.byteLength,event.data.strict);
            self.postMessage({type:'headers',index:{format:'rar',files:entries}});
        } else if (event.data.type === 'extract' && extractor && entries) {
            const wanted = new Map(entries.map(entry => [entry.originalPath,entry]));
            const files = [];
            // Consume the full generator so the decoder closes its native archive.
            for (const file of extractor.extract({files:header => wanted.has(header.name)}).files) {
                const entry = wanted.get(file.fileHeader.name), bytes = file.extraction;
                if (!entry || !(bytes instanceof Uint8Array) || bytes.length !== entry.length)
                    throw new Error('RAR 解压结果与条目大小不符');
                files.push({...entry,bytes});
            }
            if (files.length !== entries.length) throw new Error('RAR 字幕条目未完整解压');
            self.postMessage({type:'complete',index:{format:'rar',files}},files.map(file => file.bytes.buffer));
        }
    } catch (error) {
        const reasons = new Map([
            ['ERAR_MISSING_PASSWORD','RAR 已加密，请先在本地解密'],
            ['ERAR_BAD_PASSWORD','RAR 密码无效，请先在本地解密'],
            ['ERAR_BAD_DATA','RAR 校验失败或数据已损坏'],
            ['ERAR_BAD_ARCHIVE','文件不是有效的 RAR 压缩包'],
            ['ERAR_UNKNOWN_FORMAT','RAR 格式无法识别'],
            ['ERAR_NO_MEMORY','RAR 解压所需内存超出浏览器限制']
        ]);
        self.postMessage({type:'error',error:reasons.get(error.reason) || 'RAR 解压失败：' + String(error.message || error).slice(0,180)});
    }
};
