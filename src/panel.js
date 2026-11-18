    function saveJsonFile(value, filename, report) {
        try { normalizeFiles(JSONtparse(value)); }
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
        if (id === 'json') {
            const source = intro.querySelector('h3').textContent.replace(/\s*跨盘\s*JSON.*$/, '').trim();
            intro.querySelector('h3').textContent = '跨盘文件清单';
            if (!description) intro.append(create('p', '', '导出当前网盘的文件清单，或导入清单恢复文件。'));
            const context = create('span', 'tool-context', source); intro.querySelector('h3').append(context);
        } else {
            const title = intro.querySelector('h3'), source = title.textContent.replace(/\s+(?:字幕|重命名与自动分类).*$/, '').trim();
            title.textContent = id === 'media' ? '影视整理' : '字幕检查与补齐'; title.append(create('span', 'tool-context', source));
        }
        const commands = create('div', 'tool-commandbar');
        const firstAction = pane.querySelector(':scope > .panel-actions');
        if (firstAction) commands.append(firstAction);
        if (id === 'json') take(commands, '#stopJson');
        const layout = create('div', 'tool-layout');
        const main = create('div', 'tool-main'), side = create('aside', 'tool-sidebar');
        const status = create('section', 'tool-card tool-status');
        status.append(create('h4', '', '当前状态'));
        const statusIds = id === 'subtitle' ? ['subtitleScope','subtitleProgress','subtitleMeter']
            : id === 'media' ? ['mediaTarget','mediaProgress','mediaMeter','mediaSummary','mediaRecordState'] : ['status','target','progress'];
        for (const name of statusIds) take(status, '#' + name);
        side.append(status);
        const heading = create('div', 'tool-list-heading');
        const headingTitle = create('h4', '', id === 'subtitle' ? '字幕检查结果' : id === 'media' ? '作品确认与整理预览' : 'JSON 文件清单');
        heading.append(headingTitle);
        if (id === 'subtitle') {
            headingTitle.id = 'subtitleResultsTitle';
            take(heading, '#subtitleFilters');
        }
        main.append(heading);
        if (id === 'json') {
            take(main, '#syncPreview'); take(main, '#json');
            const editor = main.querySelector('#json');
            editor?.setAttribute('aria-label', 'JSON 文件清单');
            if (editor) {
                const surface = create('div', 'json-editor'); editor.before(surface); surface.append(editor);
                const empty = create('div', 'json-editor-empty'); empty.setAttribute('aria-hidden', 'true');
                empty.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M28 7H13a3 3 0 0 0-3 3v28a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3V17L28 7Z"/><path d="M28 7v10h10M18 24l-4 4 4 4m12-8 4 4-4 4m-4-9-4 14"/></svg>';
                empty.append(create('strong', '', '从一份文件清单开始'), create('p', '', '点击上方导出，或在这里粘贴 JSON 清单'), create('span', '', '清单仅包含文件信息，不包含视频内容'));
                surface.append(empty);
            }
            const fileActions = create('div', 'editor-actions');
            for (const selector of ['#save','#saveJson','#copyJson']) take(fileActions, selector);
            if (fileActions.children.length) heading.append(fileActions);
        } else if (id === 'subtitle') {
            take(main, '#subtitleResults');
        } else {
            main.append(create('p', 'tool-list-hint', '按作品查看，点击条目展开详情；操作会应用于全部符合条件的项目。'));
            take(main, '#mediaRows');
            const empty = create('p', 'media-empty', '先在网盘勾选视频或文件夹，点击“识别并预览”。识别后的待处理作品会显示在这里。');
            main.append(empty);
            const preview = create('details', 'tool-preview');
            preview.append(create('summary', '', '查看整理目标路径'));
            take(preview, '#mediaPreview'); main.append(preview);
        }
        const utilities = create('div', 'tool-utilities');
        const auxiliary = id === 'json' ? side : utilities;
        if (id !== 'subtitle') {
            const actions = id === 'json' ? create('section', 'tool-import-options') : create('details', 'tool-card tool-secondary');
            if (id === 'media') actions.append(create('summary', '', '批量与辅助操作'));
            for (const node of [...pane.querySelectorAll(':scope > .panel-actions, :scope > .export-options')]) actions.append(node);
            (id === 'json' ? commands : auxiliary).append(actions);
        }
        // Settings are moved to the shared settings page by each feature after setup.
        for (const node of [...pane.children]) {
            if (node.id.endsWith('Settings') || (node.tagName === 'INPUT' && node.hidden)) continue;
            node.classList.add('tool-card'); auxiliary.append(node);
        }
        // A single work surface with a persistent status area, rather than a second sidebar.
        const summary = status.querySelector('#mediaSummary');
        if (summary) {
            const overview = create('div', 'tool-overview');
            overview.append(summary); main.prepend(overview);
        }
        status.querySelector('h4').remove(); status.className = 'tool-status-text';
        if (id === 'json') {
            for (const node of [...side.children]) if (node !== status) utilities.append(node);
        }
        const footer = create('footer', 'tool-statusbar'); footer.append(status, utilities);
        layout.append(main); pane.append(intro, commands, layout, footer);
        const rows = main.querySelector('#mediaRows');
        if (id === 'media' && rows) {
            rows.classList.add('tool-results');
            const pager = create('nav', 'tool-pagination'); pager.setAttribute('aria-label', '作品列表分页');
            const previous = create('button', '', '上一页'), next = create('button', '', '下一页'), label = create('span', '');
            previous.type = next.type = 'button'; label.setAttribute('aria-live', 'polite'); pager.append(previous, label, next); rows.after(pager);
            const pageSize = 4;
            let current = 0;
            const render = () => {
                const items = [...rows.children], pages = Math.max(1, Math.ceil(items.length / pageSize));
                current = Math.min(current, pages - 1);
                items.forEach((node, index) => node.classList.toggle('outside-page', Math.floor(index / pageSize) !== current));
                pager.hidden = items.length <= pageSize;
                label.textContent = `${current + 1} / ${pages} 页 · 共 ${items.length} 项`;
                previous.disabled = current === 0; next.disabled = current === pages - 1;
            };
            previous.onclick = () => { current--; render(); };
            next.onclick = () => { current++; render(); };
            new MutationObserver(render).observe(rows, {childList:true});
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
*{box-sizing:border-box}
:host{font:16px/1.65 "Microsoft YaHei UI","Microsoft YaHei","Segoe UI",sans-serif;color:var(--text);color-scheme:var(--scheme)}
::selection{background:var(--accent);color:var(--button-text)}
[hidden]{display:none!important}button,input,select,textarea{font:inherit;color:var(--text)}
button{cursor:pointer;border:1px solid var(--border);border-radius:7px;padding:8px 14px;background:var(--surface);line-height:1.5;transition:background .15s,border-color .15s}
button:hover:not(:disabled){background:var(--tint);border-color:var(--accent)}button:disabled{opacity:.55;cursor:not-allowed}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
a{color:var(--accent);text-underline-offset:3px}h3,h4,p{overflow-wrap:anywhere}h3{margin:0 0 16px;font-size:20px;line-height:1.4}h4{margin:0;font-size:16px;font-weight:600}p{margin:10px 0;line-height:1.8}
input,select,textarea{width:100%;border:1px solid var(--border);border-radius:7px;background:var(--field);padding:9px 12px;margin-top:6px;min-width:0}
textarea{height:180px;resize:vertical;font:14px/1.7 Consolas,"Microsoft YaHei",monospace}label{display:block;margin:12px 0}
label:has(>input[type=checkbox]){display:flex;align-items:flex-start;gap:8px}input[type=checkbox]{width:18px!important;height:18px;flex:0 0 auto;min-height:0;padding:0;margin:4px 0 0;accent-color:var(--accent)}
summary{cursor:pointer;overflow-wrap:anywhere}details[open]>summary{margin-bottom:12px}
.workspace-overlay{position:fixed;inset:0;pointer-events:none}.box{position:fixed;display:flex;flex-direction:column;pointer-events:auto;width:1280px;height:800px;overflow:hidden;border:1px solid var(--border);border-radius:12px;background:var(--panel);box-shadow:0 24px 80px #0004;container-type:size;outline:none}
.workspace-header{display:flex;align-items:center;justify-content:space-between;gap:12px;height:52px;flex-shrink:0;padding:0 18px;cursor:grab;touch-action:none;user-select:none;background:var(--surface);border-bottom:1px solid var(--border)}
.workspace-header h2{font-size:16px;font-weight:600;margin:0;display:flex;align-items:center;gap:9px}.workspace-header h2::before{content:'⇄';display:grid;place-items:center;width:23px;height:23px;border-radius:6px;background:var(--accent);color:var(--button-text);font-size:17px;font-weight:400}
.workspace-header p{display:none}.workspace-header.dragging{cursor:grabbing}.workspace-header.pinned{cursor:default}.workspace-window-actions{display:flex;align-items:center;gap:12px}
#pinWorkspace,#closeWorkspace{background:transparent;border-color:transparent;color:var(--muted);padding:5px 10px;font-size:14px}#pinWorkspace[aria-pressed=true]{color:var(--accent);background:var(--tint)}#closeWorkspace{width:30px;height:30px;padding:0;font-size:24px;line-height:1}
.workspace-frame{display:flex;flex:1;min-height:0;min-width:0}.workspace-navigation{width:192px;flex-shrink:0;display:flex;flex-direction:column;background:var(--surface);padding:22px 12px 16px;border-right:1px solid var(--border)}
.nav-caption{margin:0 12px 14px;font-size:15px;color:var(--muted);letter-spacing:1px}.workspace-tabs{display:flex;flex-direction:column;gap:6px}
.workspace-tabs button,#settingsWorkspace{position:relative;display:flex;align-items:center;gap:12px;width:100%;padding:12px;text-align:left;border:0;background:transparent;color:var(--muted);font-size:16px;border-radius:7px}
.workspace-tabs svg,#settingsWorkspace svg{width:19px;height:19px;flex-shrink:0;stroke-linecap:round;stroke-linejoin:round}
.workspace-tabs button[aria-selected=true],#settingsWorkspace[aria-pressed=true]{background:var(--tint);color:var(--accent);font-weight:600}
.workspace-tabs button[aria-selected=true]::before{content:'';position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:3px;background:var(--accent)}
.nav-footer{margin-top:auto}.nav-footer small{display:block;margin:16px 12px 0;font-size:14px;color:var(--muted)}
.workspace-body{flex:1;min-width:0;min-height:0;display:flex}.tool-pane{width:100%;min-width:0;overflow:auto;overscroll-behavior:contain;padding:30px 32px 18px}
.tool-pane[role=tabpanel]{display:flex;flex-direction:column}.tool-intro,.tool-commandbar,.tool-statusbar{flex-shrink:0}.tool-intro h3{display:flex;align-items:center;gap:12px;font-size:21px;margin:0;line-height:1.4;letter-spacing:0}.tool-intro p{font-size:16px;color:var(--muted);margin:8px 0 0}
.tool-context{font-size:15px;line-height:28px;padding:0 8px;border-radius:5px;background:var(--tint);color:var(--accent);font-weight:400;letter-spacing:0}
.tool-commandbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin:22px 0 24px}.panel-actions{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}
.tool-commandbar .panel-actions{margin:0;gap:10px}.tool-commandbar button{padding:9px 17px;min-height:38px}
.manifest-import{position:relative}.manifest-import>summary{margin:0;border:1px solid var(--border);border-radius:7px;padding:8px 12px;background:var(--surface);line-height:1.5}
.manifest-import-actions{position:absolute;top:calc(100% + 6px);left:0;z-index:2;width:max-content;display:grid;gap:8px;padding:10px;background:var(--panel);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 14px #0002}.manifest-import-actions label{margin:0;align-items:center}.manifest-import-actions input[type=checkbox]{margin:0}
#generate,#exportManifest,#scanMedia,#recheckSubtitles,#fillSubtitles,#runMedia,#transfer,#start,#chooseManifest,#chooseJsonFile{background:var(--surface);border:1px solid var(--border);color:var(--text);font-weight:500}
.tool-import-options{margin-left:auto;max-width:320px;color:var(--muted);font-size:14px}.tool-import-options .export-options,.tool-import-options label{margin:0}.panel-actions:empty,.tool-import-options:not(:has(input,select,button)){display:none}
.tool-layout{flex:1;min-width:0;min-height:auto}.tool-main{min-width:0}.tool-list-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:34px;margin-bottom:12px}
.tool-list-heading select{width:auto;max-width:210px;margin:0;font-size:14px;padding:6px 10px}
.tool-list-heading h4{font-size:18px}.editor-actions{display:flex;gap:8px}.editor-actions button{background:var(--surface);color:var(--text);border-color:var(--border);padding:4px 9px;font-size:15px;min-height:30px}
#jsonPane .tool-main{height:100%;display:flex;flex-direction:column;min-height:280px}#jsonPane .tool-main>:not(.json-editor){flex-shrink:0}
.json-editor{position:relative;display:flex;flex:1;min-height:220px;border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:hidden;isolation:isolate}
.json-editor:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--tint)}.json-editor>#json{width:100%;height:100%;flex:1;min-height:0;max-height:none;margin:0;border:0;border-radius:0;background:transparent;resize:none;outline:none;padding:20px;font:16px/1.8 Consolas,"Microsoft YaHei",monospace}
.json-editor>#json::placeholder{color:transparent}.json-editor-empty{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;padding:24px;text-align:center;color:var(--muted)}
.json-editor:has(#json:placeholder-shown:not(:focus))>.json-editor-empty{display:flex}.json-editor-empty svg{width:44px;height:44px;padding:8px;border-radius:12px;background:var(--tint);color:var(--muted);margin-bottom:12px}.json-editor-empty strong{color:var(--text);font-size:17px;font-weight:600}.json-editor-empty p{font-size:16px;margin:6px 0 12px}.json-editor-empty span{font-size:14px}
#jsonPane .tool-main:has(#syncPreview:not([hidden]))>.json-editor{flex:0 0 140px;min-height:140px}#jsonPane:has(#syncPreview:not([hidden])) .tool-layout{flex:none}#jsonPane .tool-main:has(#syncPreview:not([hidden])){height:auto}
.tool-overview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tool-overview>:not([hidden]):not(:empty){background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin:0 0 16px;line-height:1.8;font-size:15px}.tool-overview:has(>:only-child)>:not(:empty){grid-column:1/-1}
.tool-list-hint{color:var(--muted);font-size:15px;margin:0 0 14px}.tool-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
.sync-item{background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:16px;margin:12px 0;min-width:0}.tool-results>.sync-item{margin:0;font-size:16px}.tool-results>details[open]{grid-column:1/-1}.tool-results>.sync-item:hover{border-color:var(--accent)}.tool-results summary{font-size:16px;line-height:1.8}.outside-page{display:none!important}
#subtitlePane .tool-layout,#subtitlePane .tool-main{display:flex;min-height:0}#subtitlePane .tool-main{flex:1;flex-direction:column}#subtitlePane .tool-list-heading{flex:none}#subtitleFilters :focus-visible{outline-offset:-2px}
#subtitleFilters{display:flex;align-items:center;gap:8px;flex:0 0 auto;max-width:100%}#subtitleFilters label{align-items:center;gap:5px;margin:0;font-size:14px;white-space:nowrap;flex:none}#subtitleFilters input[type=checkbox]{margin:0}
#subtitleResults{display:flex;flex:1 1 0;flex-direction:column;min-height:0;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-width:none}#subtitleResults:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
#subtitleSummary{padding:10px 12px;font-size:15px;overflow-wrap:anywhere}
#subtitleRows{flex:1 0 auto;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:auto;align-items:stretch}#subtitleRows:empty{display:none}#subtitleRows>.sync-item{overflow-wrap:anywhere}
#subtitleRows h5{margin:0;font-size:16px;line-height:1.5;overflow-wrap:anywhere}.subtitle-result{margin-top:8px}.subtitle-result+.subtitle-result{padding-top:8px;border-top:1px solid var(--border)}
.subtitle-result p{margin:0;line-height:1.55;white-space:pre-wrap}.subtitle-result label{margin:6px 0;font-size:14px;overflow-wrap:anywhere}.subtitle-result select{font-size:14px;padding:6px 10px}
.sync-location{display:grid;grid-template-columns:6.5em minmax(0,1fr);gap:8px;line-height:1.7}.sync-location span:last-child{white-space:pre-wrap;overflow-wrap:anywhere}.sync-location span:first-child{color:var(--muted)}
.sync-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
.tool-pagination{display:flex;align-items:center;justify-content:center;gap:16px;margin:18px 0 0;font-size:14px;color:var(--muted)}.tool-pagination button{padding:5px 10px;font-size:14px}
#subtitleEmpty,.media-empty{padding:36px 24px;margin:0;text-align:center;border:1px dashed var(--border);border-radius:10px;color:var(--muted);background:var(--surface)}
.tool-main:has(#mediaRows:not(:empty))>.media-empty,.tool-main:has(#mediaPreview:not(:empty))>.media-empty{display:none}.tool-preview{margin-top:14px}.tool-preview:not(:has(#mediaPreview:not(:empty))){display:none}
#mediaPreview:not(:empty),#emptyPreview:not(:empty){max-height:none!important;overflow:visible!important;padding:12px 0;margin:12px 0;font-size:14px}
.tool-statusbar{display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;margin-top:20px;padding-top:12px;border-top:1px solid var(--border);font-size:15px;color:var(--muted)}
.tool-status-text{flex:1;min-width:180px}.tool-status-text p{margin:0;line-height:1.9;font-size:15px}.tool-status-text p:empty{display:none}.tool-status-text progress{accent-color:var(--accent);height:6px!important;margin:6px 0!important}.tool-status-text label{margin:0;font-size:15px}.tool-status-text #mediaMeter{margin:0}
.tool-utilities{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-left:auto}.tool-utilities>.tool-card{padding:0;border:0;background:transparent;margin:0}.tool-utilities summary{padding:2px 0;font-size:15px;font-weight:500;color:var(--muted)}
.tool-statusbar:has(.tool-utilities>details[open]){display:block}.tool-utilities:has(>details[open]){display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px}.tool-utilities>details[open]{grid-column:1/-1;color:var(--text);min-width:0}
#subtitlePane .tool-statusbar{align-items:flex-end;margin-top:10px}#subtitlePane .tool-status-text{min-width:0}#subtitleProgress{max-height:3.8em;overflow:auto;scrollbar-width:none}
#subtitleScope{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#subtitlePane .tool-statusbar:has(.tool-utilities>details[open]){max-height:40%;overflow:auto}#subtitleDeleteList{overflow-wrap:anywhere}
#log{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 Consolas,"Microsoft YaHei",monospace;max-height:180px;overflow:auto}#log:empty{display:none}#log>div+div{margin-top:6px}
#subtitlePane .tool-statusbar:has(#subtitleDiagnostics[open]){max-height:none;overflow:visible}#subtitleDiagnostics .panel-actions{margin:4px 0 8px}#subtitlePane:has(#subtitleDiagnostics[open]) .tool-intro p{display:none}
#subtitleLog{display:block;width:100%;height:clamp(56px,calc(36cqh - 128px),180px);resize:none;overflow:auto;scrollbar-width:none;overscroll-behavior:contain}
.sync-preview{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px}.sync-preview h4{margin:0 0 8px}.sync-preview p{margin:6px 0}#syncList{overflow-wrap:anywhere;font-size:15px}#syncDestination{font-weight:600}
.export-options{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}.export-options input{width:auto}.export-options button{font-size:14px;padding:7px 12px}.credential-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.credential-head a{font-size:15px;flex-shrink:0}
.source-result{margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:8px}.source-result button{margin:8px 8px 0 0;font-size:16px}
#workspaceSettings{display:flex;flex-direction:column;padding:20px 24px;font-size:14px;scrollbar-width:none}
.settings-heading{display:flex;flex:none;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border)}.settings-heading h3{margin:0;font-size:20px}
.settings-appearance{display:flex;align-items:center;justify-content:flex-end;gap:16px;margin-left:auto}.settings-appearance label{display:flex;align-items:center;gap:6px;margin:0;white-space:nowrap;color:var(--muted)}.settings-appearance select{width:auto;max-width:180px;padding:5px 8px;margin:0}
#settingsSections{display:grid;flex:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}#settingsSections:has(>.settings-column:empty){grid-template-columns:minmax(0,1fr)}
.settings-column{display:grid;align-content:start;gap:14px;min-width:0}.settings-column:empty{display:none}
@container(max-height:740px){#settingsSections:has(#openSubtitlesSettings[open]){--compact-settings:1}}
@container(max-height:650px){#settingsSections:has(>#settingsModels:not(:empty)+#settingsBasics:not(:empty)){--compact-settings:1}}
#settingsSections{container-name:settings-grid}
@container settings-grid style(--compact-settings:1){#settingsModels,#settingsBasics{display:contents}#settingsSections .sync-item:has(#mediaAISettings){grid-area:1/1/span 2/2}#settingsSections .sync-item:has(#subtitleSettings){grid-area:1/2/span 2/3}#settingsSections .sync-item:has(#mediaSettings){grid-area:1/3}#settingsSections .sync-item:has(#openSubtitlesSettings){grid-area:2/3}}
@container(max-height:740px){#settingsSections:has(#openSubtitlesSettings[open]):has(>#settingsModels:not(:empty)+#settingsBasics:not(:empty)){grid-template-columns:minmax(0,1.15fr) minmax(0,1fr) minmax(178px,.73fr);grid-template-rows:min-content auto}}
@container(max-height:650px){#settingsSections:has(>#settingsModels:not(:empty)+#settingsBasics:not(:empty)){grid-template-columns:minmax(0,1.15fr) minmax(0,1fr) minmax(178px,.73fr);grid-template-rows:min-content auto}}
#settingsSections .sync-item{margin:0;padding:14px;border-radius:8px}#settingsSections h3{margin:0 0 8px;font-size:16px}
#mediaAISettings{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);column-gap:8px}#mediaAISettings>*{grid-column:1/-1}#mediaAISettings>label:has(#mediaAIProvider,#mediaAIModelSelect){grid-column:auto;min-width:0}
#settingsSections label,#settingsSections p{margin:6px 0;overflow-wrap:anywhere}#settingsSections p{line-height:1.45;color:var(--muted)}#settingsSections input,#settingsSections select{padding:6px 8px;margin-top:4px;line-height:1.4}#settingsSections input[type=checkbox]{margin:1px 0 0}
#settingsSections .panel-actions{gap:6px;margin:8px 0 0}#settingsSections button,#backToTools{padding:5px 8px;line-height:1.4}#settingsSections details[open]>summary{margin-bottom:5px}#settingsSections .credential-head a{font-size:13px}
#settingsSections :is(#saveMediaKey,#saveMediaAI,#saveSubtitleSettings){background:var(--tint);font-weight:600}
#subtitleAccountSettings>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}#subtitleAccountSettings>div>label{min-width:0}
#subtitleSettings .credential-head{flex-wrap:wrap;gap:2px 6px}
@container(max-height:650px){#workspaceSettings{padding:8px 12px}.settings-heading{margin-bottom:8px;padding-bottom:6px}.settings-heading h3{font-size:18px}#settingsSections{gap:9px}.settings-column{gap:9px}#settingsSections .sync-item{padding:8px}#settingsSections h3{margin-bottom:5px}#settingsSections label,#settingsSections p{margin:3px 0}#settingsSections input,#settingsSections select{padding:4px 6px;margin-top:3px}#settingsSections .panel-actions{gap:4px;margin-top:4px}#settingsSections button,#backToTools{padding:4px 7px}}
#toggle{display:grid;place-items:center;width:50px;height:50px;padding:0;border-radius:15px;background:var(--surface);box-shadow:0 5px 20px #0003}#toggle svg{width:24px;height:24px;pointer-events:none}
@container(max-width:1050px){.workspace-navigation{width:152px;padding:16px 9px}.tool-pane{padding:20px 20px 14px}.tool-intro h3{font-size:20px}.tool-intro p{font-size:14px}.tool-commandbar{margin:16px 0 18px;gap:8px}.tool-commandbar button{padding:8px 12px;font-size:14px}.tool-commandbar .panel-actions{gap:6px}.tool-import-options{max-width:240px;font-size:14px}.tool-statusbar{gap:12px;margin-top:14px}.tool-utilities{gap:10px}.tool-overview>:not([hidden]):not(:empty){margin-bottom:10px;padding:10px}.json-editor{min-height:160px}#jsonPane .tool-main{min-height:220px}.json-editor-empty svg{width:44px;height:44px;margin-bottom:10px}.json-editor-empty p{margin:6px 0 12px}.tool-results{gap:10px}.tool-results>.sync-item{padding:12px}}
        </style><button id="toggle" type="button" title="打开云盘工具" aria-label="打开云盘工具" aria-haspopup="dialog" aria-expanded="false" aria-controls="toolDialog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 12h4M8 16h3M16 12v6m-2-2 2 2 2-2"/></svg></button>
        <div class="workspace-overlay" hidden><div class="box" id="toolDialog" role="dialog" aria-modal="false" aria-labelledby="workspaceTitle" tabindex="-1">
        <header class="workspace-header"><div><h2 id="workspaceTitle">云盘工具</h2><p id="windowHint">拖动标题栏移动 · 可同时操作网页</p></div><div class="workspace-window-actions"><button id="settingsWorkspace" type="button">设置</button><button id="pinWorkspace" type="button" aria-pressed="false" title="锁定窗口位置">固定位置</button><button id="closeWorkspace" type="button" aria-label="关闭面板" title="关闭">×</button></div></header>
        <div class="workspace-toolbar"><div class="workspace-tabs" role="tablist" aria-label="功能分类"><button id="jsonTab" type="button" role="tab" aria-selected="false" aria-controls="jsonPane" tabindex="-1" disabled>跨盘 JSON</button><button id="mediaTab" type="button" role="tab" aria-selected="false" aria-controls="mediaPane" tabindex="-1" disabled title="当前网盘暂不支持影视整理">影视整理</button><button id="subtitleTab" type="button" role="tab" aria-selected="false" aria-controls="subtitlePane" tabindex="-1" disabled title="当前网盘暂不支持字幕检查">字幕</button></div>
        <label class="theme-row">窗口尺寸<select id="workspaceSize" aria-label="窗口尺寸"><option value="960x600">960 × 600</option><option value="1280x800" selected>1280 × 800（默认）</option><option value="1440x900">1440 × 900</option><option value="1600x1000">1600 × 1000</option></select></label>
        <label class="theme-row">外观<select id="theme"><option value="auto">跟随页面</option><option value="light">浅色</option><option value="dark">深色</option></select></label></div>
        <div class="workspace-body"><section id="workspaceSettings" class="tool-pane" hidden><div class="settings-heading"><h3>设置</h3><button id="backToTools">返回工具</button></div><div id="settingsSections"><div class="settings-column" id="settingsModels"></div><div class="settings-column" id="settingsBasics"></div></div></section></div></div></div>`;
            const overlay = root.querySelector('.workspace-overlay'), dialog = root.querySelector('.box'), toggle = root.querySelector('#toggle');
            const frame = document.createElement('div'); frame.className = 'workspace-frame';
            const navigation = root.querySelector('.workspace-toolbar'); navigation.className = 'workspace-navigation';
            const appearance = document.createElement('div'); appearance.className = 'settings-appearance';
            for (const label of [...navigation.querySelectorAll('.theme-row')]) appearance.append(label);
            root.querySelector('#backToTools').before(appearance);
            const navTitle = document.createElement('p'); navTitle.className = 'nav-caption'; navTitle.textContent = '工作空间'; navigation.prepend(navTitle);
            const navFooter = document.createElement('div'); navFooter.className = 'nav-footer'; navFooter.append(root.querySelector('#settingsWorkspace'));
            const version = document.createElement('small'); version.textContent = '云盘工具' + (typeof VERSION === 'string' ? ' · v' + VERSION : ''); navFooter.append(version); navigation.append(navFooter);
            const icons = {jsonTab:'M7 4h7l4 4v12H7zM14 4v5h5M10 13h5m-5 3h5',mediaTab:'M4 5h16v14H4zM4 9h16M8 5v4m8-4v4m-6 4 5 3-5 3z',subtitleTab:'M4 5h16v13H8l-4 3zM7 10h10M7 14h6',settingsWorkspace:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4'};
            for (const [name, path] of Object.entries(icons)) {
                const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '1.6'); icon.setAttribute('aria-hidden', 'true');
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'path'); line.setAttribute('d', path); icon.append(line); root.querySelector('#' + name).prepend(icon);
            }
            root.querySelector('.workspace-tabs').setAttribute('aria-orientation', 'vertical');
            frame.append(navigation, root.querySelector('.workspace-body')); dialog.append(frame);
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
                const margin = 24 / ratio;
                const [baseWidth,baseHeight] = sizes.get(windowSize);
                const scale = Math.max(0,Math.min(1,(width - margin * 2) * ratio / baseWidth,(height - margin * 2) * ratio / baseHeight));
                dialog.style.transformOrigin = 'top left'; dialog.style.transform = `scale(${1 / ratio})`;
                dialog.style.maxWidth = dialog.style.maxHeight = 'none';
                dialog.style.width = Math.max(1,Math.round(baseWidth * scale)) + 'px';
                dialog.style.height = Math.max(1,Math.round(baseHeight * scale)) + 'px';
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
                root.querySelector('#settingsWorkspace').setAttribute('aria-pressed', 'false');
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
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const available = [...tabs.keys()], index = available.indexOf(active);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + available.length) % available.length;
                activate(available[next], true);
            };
            document.body.appendChild(host);
            bindPanelTheme(host, root);
            const openSettings = name => {
                for (const entry of tabs.values()) { entry.pane.hidden = true; entry.button.setAttribute('aria-selected', 'false'); }
                root.querySelector('#workspaceSettings').hidden = false;
                root.querySelector('#settingsWorkspace').setAttribute('aria-pressed', 'true');
                const detail = name && root.querySelector('#' + name);
                if (detail) { if (detail.tagName === 'DETAILS') detail.open = true; detail.scrollIntoView?.({block:'nearest'}); }
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
        const entry = { pane, button, onActivate: null, settings:[] };
        const ui = { get: name => {
            if (!elements.has(name)) elements.set(name, pane.querySelector('#' + name) || entry.settings.map(section => section.querySelector('#' + name)).find(Boolean) || (['toggle', 'theme'].includes(name) ? root.querySelector('#' + name) : null));
            return elements.get(name);
        }, onActivate: callback => { entry.onActivate = callback; },
            moveSettings: (ids, headingTitle = title, destination = '#settingsBasics') => {
                const section = document.createElement('fieldset'); section.className = 'sync-item'; section.style.minWidth = '0';
                const heading = document.createElement('h3'); heading.textContent = headingTitle; section.appendChild(heading);
                for (const name of ids) section.appendChild(ui.get(name));
                entry.settings.push(section);
                root.querySelector(destination).appendChild(section);
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
                    for (const section of tab.settings) section.disabled = blocked;
                }
                root.querySelector('#settingsWorkspace').disabled = !!toolWorkspace.owner;
                root.querySelector('#backToTools').disabled = !!toolWorkspace.owner;
            }
        };
        entry.ui = ui; tabs.set(id, entry);
        if (tabs.size === 1) activate(id);
        return ui;
    }
    function createPanelTask(ui, updateControls) {
        let active = false;
        return async (work, stoppable = false) => {
            if (active) return;
            ui.busy(true);
            active = true;
            try {
                updateControls(true, stoppable);
                return await work();
            } finally {
                try { updateControls(false); }
                finally { active = false; ui.busy(false); }
            }
        };
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
                ? ';--scheme:dark;--panel:#181818;--surface:#222;--text:#ededed;--muted:#bdbdbd;--field:#222;--border:#383838;--accent:#e2e2e2;--tint:#303030;--button:#e2e2e2;--button-text:#181818'
                : ';--scheme:light;--panel:#f6f6f6;--surface:#fff;--text:#242424;--muted:#555;--field:#fff;--border:#e1e1e1;--accent:#292929;--tint:#eaeaea;--button:#292929;--button-text:#fff');
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
