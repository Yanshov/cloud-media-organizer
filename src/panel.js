    function saveJsonFile(value, filename, report) {
        try { normalizeFiles(JSON.parse(value)); }
        catch (_) { report('保存失败：文本框不是有效的跨盘 JSON 清单，请先导出文件清单'); return; }
        const url = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
        report('正在保存 JSON 清单…');
        if (typeof GM_download === 'function') {
            try { GM_download({
                url, name: filename, saveAs: true,
                onload: () => { URL.revokeObjectURL(url); report(`已保存：${filename}`); },
                onerror: error => { URL.revokeObjectURL(url); report(`保存失败：${error?.error || error?.message || '浏览器拒绝下载'}`); },
                onabort: () => { URL.revokeObjectURL(url); report('已取消保存'); }
            }); } catch (error) { URL.revokeObjectURL(url); report('保存失败：' + error.message); }
            return;
        }
        const link = document.createElement('a');
        link.href = url; link.download = filename; link.style.display = 'none';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        report(`已触发下载：${filename}；请检查浏览器下载列表`);
    }
    // Keep existing controls and handlers; only arrange their presentation.
    function arrangeToolPane(pane, id) {
        const create = (tag, className, text) => {
            const node = document.createElement(tag); node.className = className;
            if (text) node.textContent = text;
            return node;
        };
        const take = (parent, selector) => { const node = pane.querySelector(selector); if (node) parent.append(node); };
        const intro = create('div', 'tool-intro');
        take(intro, 'h3');
        const description = pane.querySelector(':scope > p:not([id]), #scope');
        if (description) intro.append(description);
        const commands = create('div', 'tool-commandbar');
        const firstAction = pane.querySelector(':scope > .panel-actions');
        if (firstAction) commands.append(firstAction);
        if (id === 'json') take(commands, '#stopJson');
        const layout = create('div', 'tool-layout');
        const main = create('div', 'tool-main'), side = create('aside', 'tool-sidebar');
        const status = create('section', 'tool-card tool-status');
        status.append(create('h4', '', '当前状态'));
        const statusIds = id === 'subtitle' ? ['subtitleProgress','subtitleMeter','subtitleCoverage','subtitleSummary']
            : id === 'media' ? ['mediaTarget','mediaProgress','mediaMeter','mediaSummary','mediaRecordState'] : ['status','target','progress'];
        for (const name of statusIds) take(status, '#' + name);
        side.append(status);
        const heading = create('div', 'tool-list-heading');
        heading.append(create('h4', '', id === 'subtitle' ? '字幕检查结果' : id === 'media' ? '作品确认与整理预览' : 'JSON 文件清单'));
        if (id === 'subtitle') {
            const filter = pane.querySelector('#subtitleView')?.closest('label');
            if (filter) heading.append(filter);
        }
        main.append(heading);
        if (id === 'json') {
            take(main, '#syncPreview'); take(main, '#json');
            const editor = main.querySelector('#json');
            editor?.setAttribute('aria-label', 'JSON 文件清单');
        } else {
            main.append(create('p', 'tool-list-hint', '按作品查看，点击条目展开详情；操作会应用于全部符合条件的项目。'));
            if (id === 'subtitle') take(main, '#subtitleEmpty');
            take(main, id === 'subtitle' ? '#subtitleRows' : '#mediaRows');
            if (id === 'media') {
                const empty = create('p', 'media-empty', '先在网盘勾选视频或文件夹，点击“识别并预览”。识别后的待处理作品会显示在这里。');
                main.append(empty);
                const preview = create('details', 'tool-preview');
                preview.append(create('summary', '', '查看整理目标路径'));
                take(preview, '#mediaPreview'); main.append(preview);
            }
        }
        const utilities = create('div', 'tool-utilities');
        const auxiliary = id === 'json' ? side : utilities;
        const actions = create(id === 'json' ? 'section' : 'details', 'tool-card tool-secondary');
        actions.append(create(id === 'json' ? 'h4' : 'summary', '', id === 'json' ? '文件与导入选项' : '批量与辅助操作'));
        for (const node of [...pane.querySelectorAll(':scope > .panel-actions, :scope > .export-options')]) actions.append(node);
        auxiliary.append(actions);
        // Settings are moved to the shared settings page by each feature after setup.
        for (const node of [...pane.children]) {
            if (node.id.endsWith('Settings') || (node.tagName === 'INPUT' && node.hidden)) continue;
            if (node.tagName === 'P') {
                const help = create('details', 'tool-card'); help.append(create('summary', '', '检查范围说明'), node); auxiliary.append(help);
            } else { node.classList.add('tool-card'); auxiliary.append(node); }
        }
        if (id !== 'json') main.append(utilities);
        layout.append(main, side); pane.append(intro, commands, layout);
        const rows = main.querySelector('#subtitleRows, #mediaRows');
        if (rows) {
            rows.classList.add('tool-results');
            const pager = create('nav', 'tool-pagination'); pager.setAttribute('aria-label', '作品列表分页');
            const previous = create('button', '', '上一页'), next = create('button', '', '下一页'), label = create('span', '');
            previous.type = next.type = 'button'; label.setAttribute('aria-live', 'polite'); pager.append(previous, label, next); rows.after(pager);
            let current = 0;
            const render = () => {
                const items = [...rows.children], pages = Math.max(1, Math.ceil(items.length / 4));
                current = Math.min(current, pages - 1);
                items.forEach((node, index) => node.classList.toggle('outside-page', Math.floor(index / 4) !== current));
                pager.hidden = items.length <= 4;
                label.textContent = `${current + 1} / ${pages} 页 · 共 ${items.length} 项`;
                previous.disabled = current === 0; next.disabled = current === pages - 1;
            };
            previous.onclick = () => { current--; render(); };
            next.onclick = () => { current++; render(); };
            new MutationObserver(render).observe(rows, {childList:true});
            pane.querySelector('#subtitleView')?.addEventListener('change', () => { current = 0; render(); });
            render();
        }
    }
    let toolWorkspace = null;
    function makePanel(title, html, media = false) {
        if (!toolWorkspace) {
            const host = document.createElement('div');
            host.id = 'cloud-media-organizer-tools';
            host.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647';
            // 面板交互不冒泡给网盘，避免点击按钮时清掉网页的勾选。
            for (const event of ['pointerdown', 'mousedown', 'click']) host.addEventListener(event, event => event.stopPropagation());
            const root = host.attachShadow({ mode: 'closed' });
            root.innerHTML = `<style>
            *{box-sizing:border-box} :host{font:14px/1.65 sans-serif;color:var(--text);color-scheme:var(--scheme)}
            button{cursor:pointer;border:1px solid var(--border);border-radius:6px;padding:10px 14px;background:var(--button);color:var(--button-text);font:inherit}
            a{color:inherit;text-underline-offset:3px}.credential-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.credential-head a{font-size:12px;flex-shrink:0}.source-result{margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:8px}.source-result button{margin:8px 8px 0 0;padding:7px 10px;font-size:12px}
            button:hover:not(:disabled){filter:brightness(.85)} button:active:not(:disabled){filter:brightness(.7)}
            button:disabled{opacity:.55;cursor:wait} .box{display:flex;flex-direction:column;position:fixed;pointer-events:auto;width:1280px;max-width:calc(100vw - 24px);height:800px;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:hidden;border:1px solid var(--border);border-radius:18px;background:var(--panel);box-shadow:0 24px 80px #0005;outline:none}
            textarea,input,select{width:100%;padding:10px 12px;min-height:42px;font:inherit;border:1px solid var(--border);border-radius:6px;margin:8px 0 0;color:var(--text);background:var(--field)}
            textarea{height:82px;min-height:82px;max-height:82px;resize:none;font:12px/1.5 monospace} p{margin:12px 0;font-size:13px;line-height:1.7;overflow-wrap:anywhere}
            .panel-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0;padding-top:16px;border-top:1px solid var(--border)}
            .panel-actions:has(>#scanMedia){grid-template-columns:repeat(2,minmax(0,1fr))}.panel-actions button,.sync-actions button{min-width:0;min-height:42px;padding:10px 8px;font-size:13px;line-height:1.4}
            .sync-preview{margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--field)}
            .sync-preview h4{margin:0 0 8px;font-size:14px}.sync-preview p{margin:6px 0 10px}
            #syncDestination{font-weight:600} #syncList{max-height:260px;overflow:auto;overflow-wrap:anywhere;font-size:12px}
            .sync-item{display:grid;gap:12px;padding:16px;border:1px solid var(--border);border-radius:8px;margin:14px 0;background:var(--field)}
            details.sync-item{display:block} details.sync-item[open]>:not(summary){margin-top:14px} details.sync-item[open]>:last-child{margin-bottom:0}
            .sync-location{display:grid;grid-template-columns:6.5em minmax(0,1fr);gap:8px;align-items:start;line-height:1.6}
            .sync-location span:first-child{opacity:.8}.sync-location span:last-child{white-space:pre-wrap;overflow-wrap:anywhere}
            .sync-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)}
            #cancelSync{background:var(--panel);color:var(--text)}
            #log{white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto;font:12px/1.6 monospace;background:var(--field);margin-top:18px;padding:12px;border-radius:6px}
            h3{margin:0 0 16px;font-size:17px;line-height:1.5} [hidden]{display:none!important}
            .export-options{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:14px 0}.export-options input{width:auto;margin:0 8px 0 0}.export-options button{padding:8px 12px;min-height:38px;background:var(--field);color:var(--text)}
            .theme-row{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px;padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:16px}.theme-row select{appearance:none;width:auto;min-height:36px;padding:6px 34px 6px 12px;margin:0;background-image:linear-gradient(45deg,transparent 50%,var(--text) 50%),linear-gradient(135deg,var(--text) 50%,transparent 50%);background-position:right 17px center,right 12px center;background-size:5px 5px;background-repeat:no-repeat}
            label{display:block;margin:12px 0;line-height:1.6} label:has(>input[type=checkbox]){display:flex;align-items:flex-start;gap:8px}
            input[type=checkbox]{flex:0 0 auto;width:16px!important;height:16px;min-height:0;padding:0;margin:4px 0 0;accent-color:gray}
            summary{cursor:pointer;line-height:1.65;overflow-wrap:anywhere;padding:4px 0} details[open]>summary{margin-bottom:12px}
            .tool-pane>details{margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}
            .panel-actions:has(>button:nth-child(2):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
            #toggle{display:grid;place-items:center;width:56px;height:56px;min-width:56px;padding:0;border-radius:50%;box-shadow:0 4px 18px #0003}
            #toggle svg{width:25px;height:25px;pointer-events:none}
            .workspace-overlay{position:fixed;inset:0;pointer-events:none}
            .workspace-header{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px 14px;cursor:grab;touch-action:none;user-select:none}.workspace-header>div:first-child{min-width:0}
            .workspace-header h2{font-size:19px;line-height:1.4;margin:0}.workspace-header p{margin:3px 0 0;opacity:.65;font-size:12px}
            .workspace-header.dragging{cursor:grabbing}.workspace-header.pinned{cursor:default}.workspace-window-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
            #settingsWorkspace,#pinWorkspace{min-height:36px;padding:6px 10px;background:transparent;color:var(--text);font-size:12px}#pinWorkspace[aria-pressed=true]{background:var(--button);color:var(--button-text)}
            #closeWorkspace{width:36px;height:36px;min-height:36px;padding:0;background:transparent;color:var(--text);font-size:24px;line-height:1}
            .workspace-toolbar{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;padding:0 24px 18px;border-bottom:1px solid var(--border)}
            .workspace-tabs{display:flex;gap:6px;padding:4px;border:1px solid var(--border);border-radius:10px;background:var(--field)}
            .workspace-tabs button{padding:8px 18px;border:0;background:transparent;color:var(--text);border-radius:7px;min-height:38px}
            .workspace-tabs button[aria-selected=true]{background:var(--button);color:var(--button-text)}
            .workspace-tabs button:disabled{cursor:not-allowed}.workspace-toolbar .theme-row{margin:0;padding:0;border:0;gap:10px}
            .workspace-body{display:flex;flex:1;min-height:0;min-width:0}.tool-pane{width:100%;min-width:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:22px 24px 28px}
            button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible,textarea:focus-visible{outline:2px solid var(--text);outline-offset:3px}
            #mediaMeter{margin:18px 0} #mediaMeterLabel{margin:0;font-size:12px}
            #mediaSummary:not(:empty){padding:12px;border:1px solid var(--border);border-radius:6px;margin:16px 0}
            #mediaPreview:not(:empty),#emptyPreview:not(:empty){padding:12px;margin:16px 0;border:1px solid var(--border);border-radius:6px;line-height:1.8}
            #log:empty{display:none} #log>div+div{margin-top:8px}
            .box{container-type:inline-size}
            .workspace-header{padding:12px 20px 10px}.workspace-toolbar{padding:0 20px 12px;gap:10px}
            .tool-pane{padding:16px 20px;scrollbar-gutter:auto}
            .tool-intro h3{margin:0;font-size:16px}.tool-intro p{margin:4px 0 0;opacity:.75}
            .tool-commandbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0 16px}
            .tool-commandbar .panel-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;border:0}
            .tool-commandbar button{min-height:36px;padding:8px 16px}
            .tool-commandbar button:not(#scanMedia):not(#runMedia):not(#recheckSubtitles):not(#fillSubtitles):not(#generate):not(#exportManifest):not(#transfer):not(#start){background:var(--field);color:var(--text)}
            .tool-layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:18px;align-items:start}
            .tool-main,.tool-sidebar{min-width:0}.tool-sidebar{display:grid;gap:12px}
            .tool-utilities{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px;align-items:start}
            .tool-utilities>details[open]{grid-column:1/-1}
            .tool-card{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--field);margin:0}
            .tool-card h4,.tool-list-heading h4{margin:0;font-size:14px}
            .tool-card p{margin:8px 0;font-size:12px}.tool-card p:empty{display:none}
            .tool-card>:last-child{margin-bottom:0}.tool-card .export-options{margin:10px 0}.tool-card .export-options label{margin:0;font-size:12px}
            .tool-card .panel-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0;padding:0;border:0}
            .tool-card button{background:var(--panel);color:var(--text);min-height:34px;padding:7px 10px;font-size:12px}
            .tool-card summary{padding:0;font-size:13px;font-weight:600}
            .tool-card .sync-preview,#mediaSummary:not(:empty){padding:10px 0 0;margin:10px 0 0;border:0;border-top:1px solid var(--border);border-radius:0;font-size:12px;background:transparent}
            .tool-status #mediaMeter{margin:10px 0}.tool-status #mediaRecordState{opacity:.75}
            .tool-list-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px}
            .tool-list-heading label{display:flex;align-items:center;gap:8px;margin:0;font-size:12px;white-space:nowrap}
            .tool-list-heading select{width:auto;max-width:190px;margin:0;min-height:34px;padding:5px 8px;font-size:12px}
            .tool-list-hint{margin:4px 0 10px;font-size:12px;opacity:.7}
            .tool-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
            .tool-results>.sync-item{margin:0;padding:12px;font-size:12px;min-width:0}
            .tool-results>details[open]{grid-column:1/-1}
            .tool-results summary{font-size:13px;padding:0}
            .tool-results .panel-actions{display:flex;flex-wrap:wrap;margin:10px 0;padding-top:10px}
            .tool-results .outside-page{display:none!important}
            .tool-pagination{display:flex;align-items:center;justify-content:center;gap:12px;margin:12px 0;font-size:12px}
            .tool-pagination button{padding:5px 10px;min-height:32px;background:var(--field);color:var(--text)}
            .tool-pagination button:disabled{cursor:default}
            #subtitleEmpty,.media-empty{padding:40px 20px;text-align:center;border:1px dashed var(--border);border-radius:10px;opacity:.75}
            .tool-main:has(#mediaRows:not(:empty))>.media-empty,.tool-main:has(#mediaPreview:not(:empty))>.media-empty{display:none}
            .tool-preview{margin-top:12px}.tool-preview:not(:has(#mediaPreview:not(:empty))){display:none}
            #mediaPreview:not(:empty),#emptyPreview:not(:empty){max-height:none!important;overflow:visible!important;margin:10px 0}
            .tool-main>#json{height:330px;min-height:200px;max-height:none;resize:vertical;margin-top:10px}
            .tool-main:has(#syncPreview:not([hidden]))>#json{height:120px;min-height:100px}
            #syncList{max-height:none;overflow:visible}
            #log{max-height:none;overflow:visible;margin-top:10px;padding:0}
            #subtitleLog{height:200px;max-height:none;min-height:120px}
            #settingsSections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
            #settingsSections>.sync-item{margin:0}#backToTools{margin-top:16px}
            @container(min-width:1051px){
                .workspace-header{padding:18px 28px 14px}.workspace-header h2{font-size:21px}
                .workspace-toolbar{padding:0 28px 18px;gap:24px;justify-content:flex-start}
                .workspace-toolbar .theme-row:has(#workspaceSize){margin-left:auto}
                .workspace-tabs button{padding:10px 22px;font-size:14px}
                .tool-pane{padding:24px 28px 28px}
                .tool-pane[role=tabpanel]{display:flex;flex-direction:column}
                .tool-intro,.tool-commandbar{flex-shrink:0}
                .tool-intro h3{font-size:18px}.tool-intro p{margin-top:8px;font-size:14px}
                .tool-commandbar{margin:18px 0 24px;gap:12px}
                .tool-commandbar .panel-actions{gap:12px}
                .tool-commandbar button{min-height:42px;padding:10px 20px;font-size:14px}
                .tool-layout{flex:1;grid-template-columns:minmax(0,1fr) 340px;gap:24px}
                .tool-sidebar{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
                .tool-sidebar>*{grid-column:1/-1}.tool-sidebar>details:not([open]){grid-column:auto}
                .tool-card{padding:18px 20px;border-radius:12px}
                .tool-card h4,.tool-list-heading h4{font-size:15px}
                .tool-card p{font-size:14px;line-height:1.8;margin:12px 0}
                .tool-card summary{font-size:14px;line-height:1.8}
                .tool-card .panel-actions{gap:12px;margin-top:16px}
                .tool-card button{font-size:13px;min-height:38px;padding:9px 14px}
                .tool-card .export-options{margin:16px 0}.tool-card .export-options label{font-size:14px;line-height:1.8}
                .tool-card .sync-preview,#mediaSummary:not(:empty){font-size:14px;line-height:1.8;padding-top:14px;margin-top:14px}
                .tool-list-heading{min-height:40px}.tool-list-heading label,.tool-list-heading select{font-size:14px}
                .tool-list-hint{font-size:13px;margin:8px 0 16px}
                .tool-results{gap:16px}.tool-results>.sync-item{padding:18px;font-size:14px}
                .tool-results summary{font-size:14px;line-height:1.8}
                .tool-utilities{gap:12px;margin-top:20px}
                .tool-pagination{margin:18px 0;font-size:14px;gap:16px}
                #subtitleEmpty,.media-empty{padding:64px 24px;font-size:14px}
                #jsonPane .tool-layout{align-items:stretch}
                #jsonPane .tool-main{display:flex;flex-direction:column;min-height:360px}
                #jsonPane .tool-main>:not(#json){flex-shrink:0}
                #jsonPane .tool-sidebar{align-self:start}
                #jsonPane .tool-main>#json{flex:1;height:auto;min-height:260px;margin-top:16px;padding:18px;font-size:14px;line-height:1.8;resize:none}
                #jsonPane .tool-main:has(#syncPreview:not([hidden]))>#json{flex:0 0 140px;min-height:140px}
            }
            @container(max-width:1050px){
                .tool-layout{grid-template-columns:minmax(0,1fr) 250px;gap:12px}
                .tool-card{padding:10px}.tool-sidebar{gap:8px}
                .tool-pane{padding:12px 16px}.tool-intro p{font-size:12px}
                .tool-commandbar{margin:10px 0}.tool-commandbar button{padding:7px 10px;font-size:12px}
                .tool-main>#json{height:240px}
            }
            @container(max-width:760px){
                .tool-layout,#settingsSections{grid-template-columns:minmax(0,1fr)}
                .tool-results{grid-template-columns:minmax(0,1fr)}
                .tool-utilities{grid-template-columns:minmax(0,1fr)}
                .tool-main{order:1}.tool-sidebar{display:contents}.tool-status{order:0}
                .tool-sidebar>:not(.tool-status){order:2}
                .tool-commandbar .panel-actions{display:flex}.tool-commandbar button{flex:1 1 auto}
                .tool-intro p{margin-top:6px}.tool-list-heading{flex-wrap:wrap;gap:6px}
                .tool-pagination{gap:8px}.workspace-toolbar .theme-row{font-size:12px}
            }
            @media(max-width:760px){
                .box{border-radius:12px}.workspace-header{flex-wrap:wrap;gap:8px;padding:12px}
                .workspace-header h2{font-size:17px}.workspace-window-actions{margin-left:auto;gap:4px}
                .workspace-toolbar{padding:0 12px 12px;gap:8px}.workspace-tabs{width:100%;max-width:100%;flex-wrap:wrap}
                .workspace-tabs button{flex:1;padding:8px 6px;white-space:nowrap}.tool-pane{padding:16px 12px 20px}
                .panel-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
                .sync-location{grid-template-columns:minmax(0,1fr);gap:2px}
            }

        </style><button id="toggle" type="button" title="打开云盘工具" aria-label="打开云盘工具" aria-haspopup="dialog" aria-expanded="false" aria-controls="toolDialog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 12h4M8 16h3M16 12v6m-2-2 2 2 2-2"/></svg></button>
        <div class="workspace-overlay" hidden><div class="box" id="toolDialog" role="dialog" aria-modal="false" aria-labelledby="workspaceTitle" tabindex="-1">
        <header class="workspace-header"><div><h2 id="workspaceTitle">云盘工具</h2><p id="windowHint">拖动标题栏移动 · 可同时操作网页</p></div><div class="workspace-window-actions"><button id="settingsWorkspace" type="button">设置</button><button id="pinWorkspace" type="button" aria-pressed="false" title="锁定窗口位置">固定位置</button><button id="closeWorkspace" type="button" aria-label="关闭面板" title="关闭">×</button></div></header>
        <div class="workspace-toolbar"><div class="workspace-tabs" role="tablist" aria-label="功能分类"><button id="jsonTab" type="button" role="tab" aria-selected="false" aria-controls="jsonPane" tabindex="-1" disabled>跨盘 JSON</button><button id="mediaTab" type="button" role="tab" aria-selected="false" aria-controls="mediaPane" tabindex="-1" disabled title="当前网盘暂不支持影视整理">影视整理</button><button id="subtitleTab" type="button" role="tab" aria-selected="false" aria-controls="subtitlePane" tabindex="-1" disabled title="当前网盘暂不支持字幕检查">字幕</button></div>
        <label class="theme-row">窗口尺寸<select id="workspaceSize" aria-label="窗口尺寸"><option value="960x600">960 × 600</option><option value="1280x800" selected>1280 × 800（默认）</option><option value="1440x900">1440 × 900</option><option value="1600x1000">1600 × 1000</option></select></label>
        <label class="theme-row">外观<select id="theme"><option value="auto">跟随页面</option><option value="light">浅色</option><option value="dark">深色</option></select></label></div>
        <div class="workspace-body"><section id="workspaceSettings" class="tool-pane" hidden><h3>设置</h3><p>影视资料、大模型和字幕来源统一在这里配置；凭证只保存在本地脚本设置。</p><div id="settingsSections"></div><button id="backToTools">返回工具</button></section></div></div></div>`;
            const overlay = root.querySelector('.workspace-overlay'), dialog = root.querySelector('.box'), toggle = root.querySelector('#toggle');
            const tabs = new Map();
            let active = null, returnFocus = null;
            const layoutKey = 'cross-drive-window-layout';
            const saved = GM_getValue(layoutKey, {});
            const sizes = new Map([['960x600',[960,600]],['1280x800',[1280,800]],['1440x900',[1440,900]],['1600x1000',[1600,1000]]]);
            let windowSize = sizes.has(saved?.size) ? saved.size : '1280x800';
            let position = Number.isFinite(saved?.left) && Number.isFinite(saved?.top) ? { left: saved.left, top: saved.top } : null;
            let pinned = saved?.pinned === true, drag = null;
            const header = root.querySelector('.workspace-header'), pin = root.querySelector('#pinWorkspace');
            const place = point => {
                const width = page.innerWidth, height = page.innerHeight;
                // Size presets describe screenshot/device pixels, including OS scaling and browser zoom.
                const ratio = Number.isFinite(page.devicePixelRatio) && page.devicePixelRatio > 0 ? page.devicePixelRatio : 1;
                const narrow = width * ratio <= 760, margin = (narrow ? 12 : 24) / ratio;
                const [baseWidth,baseHeight] = sizes.get(windowSize);
                const scale = Math.max(0,Math.min(1,(width - margin * 2) * ratio / baseWidth,(height - margin * 2) * ratio / baseHeight));
                dialog.style.transformOrigin = 'top left'; dialog.style.transform = `scale(${1 / ratio})`;
                dialog.style.maxWidth = dialog.style.maxHeight = 'none';
                dialog.style.width = Math.max(1,narrow ? Math.min(baseWidth,(width - margin * 2) * ratio) : Math.round(baseWidth * scale)) + 'px';
                dialog.style.height = Math.max(1,narrow ? Math.min(baseHeight,(height - margin * 2) * ratio) : Math.round(baseHeight * scale)) + 'px';
                const rect = dialog.getBoundingClientRect();
                const left = Math.max(margin, Math.min(point?.left ?? Math.round((width - rect.width) / 2), width - rect.width - margin));
                const top = Math.max(margin, Math.min(point?.top ?? Math.round((height - rect.height) / 2), height - rect.height - margin));
                dialog.style.left = left + 'px'; dialog.style.top = top + 'px';
                sizeSelect.title = `窗口外框：${Math.round(rect.width * ratio)} × ${Math.round(rect.height * ratio)} 像素（不含阴影）${scale < 1 ? '；可用空间不足，已缩小' : ''}`;
                return { left, top };
            };
            const saveLayout = () => {
                GM_setValue(layoutKey, { ...position, pinned, size:windowSize });
            };
            const sizeSelect = root.querySelector('#workspaceSize');
            sizeSelect.value = windowSize;
            sizeSelect.onchange = () => {
                if (!sizes.has(sizeSelect.value)) { sizeSelect.value = windowSize; return; }
                windowSize = sizeSelect.value;
                if (!pinned) position = null;
                place(position); saveLayout();
            };
            const renderPin = () => {
                pin.textContent = pinned ? '解除固定' : '固定位置';
                pin.setAttribute('aria-pressed', String(pinned));
                pin.title = pinned ? '解除后可以拖动窗口' : '锁定窗口位置';
                header.classList.toggle('pinned', pinned);
                root.querySelector('#windowHint').textContent = pinned ? '位置已固定 · 可同时操作网页' : '拖动标题栏移动 · 可同时操作网页';
            };
            pin.onclick = () => { pinned = !pinned; position = place(position); saveLayout(); renderPin(); };
            header.onpointerdown = event => {
                if (pinned || event.button !== 0 || event.target.closest('button')) return;
                event.preventDefault();
                const rect = dialog.getBoundingClientRect();
                drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
                header.setPointerCapture(event.pointerId); header.classList.add('dragging');
            };
            header.onpointermove = event => {
                if (!drag || event.pointerId !== drag.id) return;
                position = place({ left: drag.left + event.clientX - drag.x, top: drag.top + event.clientY - drag.y });
            };
            const finishDrag = event => {
                if (!drag || event.pointerId !== drag.id) return;
                drag = null; header.classList.remove('dragging'); saveLayout();
                if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
            };
            header.onpointerup = finishDrag; header.onpointercancel = finishDrag; header.onlostpointercapture = finishDrag;
            page.addEventListener('resize', () => { if (!overlay.hidden) place(position); });
            renderPin();
            const activate = (id, focus = false) => {
                if (!tabs.has(id)) return;
                active = id;
                root.querySelector('#workspaceSettings').hidden = true;
                for (const [name, entry] of tabs) {
                    const selected = name === id;
                    entry.pane.hidden = !selected;
                    entry.button.setAttribute('aria-selected', String(selected));
                    entry.button.tabIndex = selected ? 0 : -1;
                }
                tabs.get(id).onActivate?.();
                if (focus) tabs.get(id).button.focus();
            };
            const close = () => {
                overlay.hidden = true; toggle.setAttribute('aria-expanded', 'false');
                const target = returnFocus?.isConnected && returnFocus !== host ? returnFocus : toggle;
                target.focus();
            };
            toggle.onclick = () => {
                if (!overlay.hidden) { close(); return; }
                returnFocus = document.activeElement;
                activate(active); overlay.hidden = false; place(position); toggle.setAttribute('aria-expanded', 'true');
                dialog.focus();
            };
            root.querySelector('#closeWorkspace').onclick = close;
            root.addEventListener('keydown', event => {
                if (!overlay.hidden && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            });
            for (const button of root.querySelectorAll('[role=tab]')) button.onkeydown = event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const available = [...tabs.keys()], index = available.indexOf(active);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
                activate(available[next], true);
            };
            document.body.appendChild(host);
            bindPanelTheme(host, root);
            const openSettings = name => {
                for (const entry of tabs.values()) entry.pane.hidden = true;
                root.querySelector('#workspaceSettings').hidden = false;
                const detail = name && root.querySelector('#' + name);
                if (detail) { detail.open = true; detail.scrollIntoView?.({block:'nearest'}); }
            };
            root.querySelector('#settingsWorkspace').onclick = () => openSettings();
            root.querySelector('#backToTools').onclick = () => activate(active);
            toolWorkspace = { root, tabs, activate, openSettings, owner:null };
        }
        const { root, tabs, activate } = toolWorkspace, id = typeof media === 'string' ? media : media ? 'media' : 'json';
        if (tabs.has(id)) return tabs.get(id).ui;
        const pane = document.createElement('section');
        pane.id = id + 'Pane'; pane.className = 'tool-pane'; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', id + 'Tab'); pane.tabIndex = 0; pane.hidden = true;
        pane.innerHTML = `<h3></h3>${media ? '' : `<details id="exportHistory"><summary title="复用导出记录，加快读取与续传">导出记录</summary><div class="export-options"><label><input id="incremental" type="checkbox" checked>复用旧记录，加快读取</label></div><p id="historySummary" style="padding:8px;border:1px solid var(--border);border-radius:4px"></p><div class="export-options"><button id="importHistory">导入旧清单</button><button id="resetHistory">重置导出记录</button><input id="historyFile" type="file" accept=".json,application/json" hidden></div></details>`}${html}`;
        pane.querySelector('h3').textContent = title;
        let stopJson;
        if (id === 'json') {
            stopJson = document.createElement('button'); stopJson.id = 'stopJson'; stopJson.textContent = '停止当前任务'; stopJson.hidden = true;
            stopJson.onclick = () => {
                jsonTaskStopped = true; stopJson.disabled = true;
                const cancel = pane.querySelector('#cancelSync');
                if (cancel && !pane.querySelector('#syncPreview').hidden) cancel.click();
                const progress = pane.querySelector('#progress');
                if (progress) progress.textContent = '等待当前请求结束，停止后续操作；已提交项目请刷新目录核对。';
            };
            pane.appendChild(stopJson);
        }
        const log = pane.querySelector('#log');
        if (log) { const detail = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '详细日志'; log.before(detail); detail.append(summary, log); }
        arrangeToolPane(pane, id);
        root.querySelector('.workspace-body').appendChild(pane);
        const button = root.querySelector('#' + id + 'Tab'), elements = new Map();
        button.disabled = false; button.removeAttribute('title'); button.onclick = () => activate(id);
        const entry = { pane, button, onActivate: null, settings:null };
        const ui = { get: name => {
            if (!elements.has(name)) elements.set(name, pane.querySelector('#' + name) || entry.settings?.querySelector('#' + name) || (['toggle', 'theme'].includes(name) ? root.querySelector('#' + name) : null));
            return elements.get(name);
        }, onActivate: callback => { entry.onActivate = callback; },
            moveSettings: ids => {
                const section = document.createElement('fieldset'); section.className = 'sync-item'; section.style.minWidth = '0';
                const heading = document.createElement('h3'); heading.textContent = title; section.appendChild(heading);
                for (const name of ids) section.appendChild(ui.get(name));
                entry.settings = section; root.querySelector('#settingsSections').appendChild(section);
            },
            openSettings: name => toolWorkspace.openSettings(name),
            busy: value => {
                if (value) {
                    if (toolWorkspace.owner && toolWorkspace.owner !== id) throw new Error('另一个任务正在运行，请等待完成或先停止');
                    toolWorkspace.owner = id;
                } else if (toolWorkspace.owner === id) toolWorkspace.owner = null;
                if (id === 'json') { jsonTaskStopped = false; stopJson.hidden = !value; stopJson.disabled = !value; }
                for (const [name, tab] of tabs) {
                    const blocked = !!toolWorkspace.owner && name !== toolWorkspace.owner;
                    tab.button.disabled = blocked;
                    if (tab.settings) tab.settings.disabled = blocked;
                }
                root.querySelector('#settingsWorkspace').disabled = !!toolWorkspace.owner;
                root.querySelector('#backToTools').disabled = !!toolWorkspace.owner;
            }
        };
        entry.ui = ui; tabs.set(id, entry);
        if (tabs.size === 1) activate(id);
        return ui;
    }
    function panelControls(ui) {
        return ['json', 'manifest', 'jsonFile', 'historyFile', 'generate', 'exportManifest', 'transfer', 'start', 'chooseManifest', 'chooseJsonFile', 'copyJson', 'save', 'saveJson', 'incremental', 'resetHistory', 'importHistory', 'syncExisting'].map(ui.get).filter(Boolean);
    }
    function appendLog(ui, message) {
        const line = document.createElement('div');
        line.textContent = message;
        const box = ui.get('log');
        box.appendChild(line);
        if (box.childElementCount > 200) box.firstElementChild.remove();
        box.scrollTop = box.scrollHeight;
    }
    async function copyManifest(ui) {
        const area = ui.get('json');
        if (!area.value) { ui.get('status').textContent = '没有 JSON 可复制，请先导出或载入清单'; return; }
        try {
            await navigator.clipboard.writeText(area.value);
            ui.get('status').textContent = 'JSON 已复制';
        } catch (_) {
            area.focus(); area.select();
            ui.get('status').textContent = document.execCommand('copy') ? 'JSON 已复制' : '自动复制失败，请按 Ctrl+C';
        }
    }
    function bindPanelTheme(host, root) {
        const select = root.querySelector('#theme');
        select.value = GM_getValue('cross-drive-theme', 'auto');
        const baseStyle = host.style.cssText;
        const media = page.matchMedia?.('(prefers-color-scheme: dark)');
        let queued = false;
        const schedule = () => {
            if (queued) return;
            queued = true;
            setTimeout(() => { queued = false; update(); }, 0);
        };
        const observer = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
        function update() {
            let dark = select.value === 'dark';
            observer?.disconnect();
            if (select.value === 'auto') {
                dark = media?.matches || false;
                let sample = document.elementFromPoint?.(Math.round(page.innerWidth / 2), Math.round(page.innerHeight / 2));
                if (!sample || sample === host) sample = document.body;
                const ancestors = [];
                for (let element = sample; element; element = element.parentElement) ancestors.push(element);
                for (const element of ancestors) observer?.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode', 'color-scheme'] });
                if (typeof page.getComputedStyle === 'function') {
                    for (const element of ancestors) {
                        const color = page.getComputedStyle(element).backgroundColor;
                        const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
                        if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) < .9)) continue;
                        dark = .2126 * Number(rgb[1]) + .7152 * Number(rgb[2]) + .0722 * Number(rgb[3]) < 128;
                        break;
                    }
                }
            }
            host.style.cssText = baseStyle + (dark
                ? ';--scheme:dark;--panel:#242424;--text:#f2f2f2;--field:#171717;--border:#777;--button:#e5e5e5;--button-text:#111'
                : ';--scheme:light;--panel:#ededed;--text:#181818;--field:#fff;--border:#888;--button:#292929;--button-text:#fff');
        }
        select.onchange = () => {
            GM_setValue('cross-drive-theme', select.value);
            update();
        };
        media?.addEventListener('change', schedule);
        page.addEventListener('popstate', schedule);
        page.addEventListener('hashchange', schedule);
        update();
    }
