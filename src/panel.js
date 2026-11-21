    const workspaceIcons = {
        'film': '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 3v18" /><path d="M3 7.5h4" /><path d="M3 12h18" /><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path d="M17 16.5h4" />',
        'settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />',
        'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />',
        'download': '<path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" />',
        'scan-search': '<path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /><path d="m16 16-1.9-1.9" />',
        'search': '<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />',
        'plus': '<path d="M5 12h14" /><path d="M12 5v14" />',
        'trash-2': '<path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />',
        'x': '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
        'pin': '<path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />',
        'pin-off': '<path d="M12 17v5" /><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" /><path d="m2 2 20 20" /><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />',
        'key-round': '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" /><circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />',
        'languages': '<path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" />',
        'cloud': '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />',
        'files': '<path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" /><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z" /><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1" />',
        'arrow-left': '<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />',
        'cpu': '<path d="M12 20v2" /><path d="M12 2v2" /><path d="M17 20v2" /><path d="M17 2v2" /><path d="M2 12h2" /><path d="M2 17h2" /><path d="M2 7h2" /><path d="M20 12h2" /><path d="M20 17h2" /><path d="M20 7h2" /><path d="M7 20v2" /><path d="M7 2v2" /><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="8" y="8" width="8" height="8" rx="1" />',
        'folder-open': '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />'
    };
    /*
    ISC License

    Copyright (c) 2026 Lucide Icons and Contributors

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted, provided that the above
    copyright notice and this permission notice appear in all copies.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

    ---

    The download, upload, search, plus, trash-2, arrow-left and x icons are derived from Feather.

    The MIT License (MIT) (for the icons listed above)

    Copyright (c) 2013-present Cole Bemis

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    function workspaceIcon(name, className = '') {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        for (const [key, value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.75','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) icon.setAttribute(key, value);
        if (className) icon.setAttribute('class', className);
        icon.innerHTML = workspaceIcons[name];
        return icon;
    }
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
        if (description) { description.id ||= id + 'Instructions'; pane.setAttribute('aria-describedby', description.id); intro.append(description); }
        if (id === 'json') {
            const source = intro.querySelector('h3').textContent.replace(/\s*跨盘\s*JSON.*$/, '').trim();
            intro.querySelector('h3').textContent = '跨盘文件清单';
            if (!description) intro.append(create('p', '', '导出当前网盘的文件清单，或导入清单恢复文件。'));
            const context = create('span', 'tool-context', source); intro.querySelector('h3').append(context);
        } else {
            const title = intro.querySelector('h3'), source = title.textContent.replace(/\s+(?:字幕|影视整理).*$/, '').trim();
            title.textContent = '影视整理'; title.append(create('span', 'tool-context', source));
        }
        const commands = create('div', 'tool-commandbar');
        const firstAction = pane.querySelector(':scope > .panel-actions');
        const merged = id === 'subtitle' && pane.querySelector('#previewMedia');
        if (firstAction) commands.append(firstAction);
        if (merged) {
            const actions = pane.querySelector('#stopSubtitles').parentElement;
            firstAction.append(...actions.children);
            actions.remove();
            pane.classList.add('merged-media');
        }
        if (id === 'json') take(commands, '#stopJson');
        const commandIcons = {generate:'download',exportManifest:'download',scanMedia:'scan-search',openMediaCleanup:'trash-2',readSubtitles:'search',fillSubtitles:'plus',reviewSubtitleDeletes:'trash-2',importSubtitles:'upload'};
        for (const [name, glyph] of Object.entries(commandIcons)) commands.querySelector('#' + name)?.prepend(workspaceIcon(glyph, 'command-icon'));
        commands.querySelector('.manifest-import > summary')?.prepend(workspaceIcon('upload', 'command-icon'));
        const layout = create('div', 'tool-layout');
        const main = create('div', 'tool-main');
        const status = create('section', 'tool-status-text');
        const statusIds = id === 'subtitle' ? ['subtitleScope','subtitleProgress','subtitleMeter']
            : ['status','target','progress'];
        for (const name of statusIds) take(status, '#' + name);
        const heading = create('div', 'tool-list-heading');
        const headingTitle = create('h4', '', id === 'subtitle' ? '字幕检查结果' : 'JSON 文件清单');
        heading.append(headingTitle);
        if (id === 'subtitle') {
            headingTitle.id = 'subtitleResultsTitle';
            if (merged) headingTitle.textContent = '作品与字幕';
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
                empty.append(workspaceIcon('folder-open'));
                empty.append(create('strong', '', '从一份文件清单开始'), create('p', '', '点击上方导出，或在这里粘贴 JSON 清单'), create('span', '', '清单仅包含文件信息，不包含视频内容'));
                surface.append(empty);
            }
            const fileActions = create('div', 'editor-actions');
            for (const selector of ['#save','#saveJson','#copyJson']) take(fileActions, selector);
            for (const button of fileActions.children) button.prepend(workspaceIcon(button.id === 'copyJson' ? 'files' : 'download', 'command-icon'));
            if (fileActions.children.length) heading.append(fileActions);
        } else if (id === 'subtitle') {
            take(main, '#subtitleSummary');
            take(main, '#subtitleResults');
            if (merged) {
                take(heading,'#allowWithoutSubtitles');
                const results = main.querySelector('#subtitleResults');
                const preview = create('details','sync-preview');
                preview.id = 'mediaPreviewPanel';
                preview.append(create('summary','','查看整理预览'));
                take(preview,'#mediaPreview');
                results.prepend(preview);
                results.prepend(pane.querySelector('#mediaCleanup'));
                take(results,'#mediaRows');
                results.querySelector('#mediaRows').hidden = true;
            }
        }
        const utilities = create('div', 'tool-utilities');
        const auxiliary = id === 'json' ? create('section', 'tool-import-options') : utilities;
        if (id !== 'subtitle') {
            for (const node of [...pane.querySelectorAll(':scope > .panel-actions, :scope > .export-options')]) auxiliary.append(node);
            if (id === 'json') commands.append(auxiliary);
        }
        for (const node of [...pane.children]) {
            if (node.id.endsWith('Settings') || (node.tagName === 'INPUT' && node.hidden)) continue;
            node.classList.add('tool-card'); utilities.append(node);
        }
        const footer = create('footer', 'tool-statusbar'); footer.append(status, utilities);
        const surface = create('div', 'tool-surface');
        layout.append(main);
        surface.append(intro, commands, layout, footer);
        pane.append(surface);
    }
    let toolWorkspace = null;
    function makePanel(title, html, id = 'json') {
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
.workspace-header h2{display:flex;align-items:center;gap:9px;margin:0;font-size:14px;font-weight:650;white-space:nowrap}.workspace-brand,.workspace-location{display:flex;align-items:center;gap:12px;min-width:0}.workspace-location{border-left:1px solid var(--border);padding-left:12px;font-size:13px;color:var(--muted)}.workspace-location:empty{display:none}.workspace-brand-mark{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;background:var(--button);color:var(--button-text)}.workspace-brand-mark svg{width:16px;height:16px}
.workspace-header p{display:none}.workspace-header.dragging{cursor:grabbing}.workspace-header.pinned{cursor:default}.workspace-window-actions{display:flex;align-items:center;gap:12px}
#pinWorkspace,#closeWorkspace{display:grid;place-items:center;width:32px;height:32px;padding:0;background:transparent;border-color:transparent;color:var(--muted)}#pinWorkspace svg,#closeWorkspace svg{width:16px;height:16px}#pinWorkspace[aria-pressed=true]{color:var(--accent);background:var(--tint)}
.workspace-frame{display:flex;flex:1;min-height:0;min-width:0}
.workspace-navigation{width:clamp(150px,16cqw,232px);flex:none;display:flex;flex-direction:column;gap:20px;padding:18px 12px;background:var(--panel);border-right:1px solid var(--border)}
.nav-brand{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:650;padding:4px 8px}
.workspace-tabs{display:grid;gap:3px}
.workspace-tabs button,#settingsWorkspace{display:flex;align-items:center;gap:10px;width:100%;min-height:38px;padding:7px 10px;border:0;background:transparent;color:var(--text);text-align:left;font-size:16px;border-radius:6px}
.workspace-tabs svg,#settingsWorkspace svg{width:18px;height:18px;flex:none}
.workspace-tabs button[aria-selected=true],#settingsWorkspace[aria-pressed=true]{background:var(--tint);font-weight:650}
.nav-footer{margin-top:auto;border-top:1px solid var(--border);padding-top:10px}
.nav-footer small{display:block;margin:8px 10px 0;color:var(--muted);font-size:13px}
.workspace-body{flex:1;min-width:0;min-height:0;display:flex;--surface-pad:clamp(16px,2cqw,32px)}
.tool-pane{width:100%;min-width:0;min-height:0}
.tool-pane[role=tabpanel],#workspaceSettings{display:grid;grid-template-columns:minmax(0,1fr)}
.tool-surface{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto;scrollbar-width:none;overscroll-behavior:contain;padding:25px var(--surface-pad) 0;background:var(--surface)}
.tool-intro,.tool-commandbar,.tool-statusbar{flex-shrink:0}
.tool-intro{margin:0 0 16px}.tool-intro h3{display:flex;align-items:baseline;gap:12px;font-size:28px;font-weight:650;margin:0;line-height:1.25}.tool-intro p{display:none}
.tool-context{font-size:15px;color:var(--muted);font-weight:400}
.panel-actions,.tool-commandbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.panel-actions{margin:12px 0}.tool-commandbar{margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border)}
.tool-commandbar>.panel-actions{margin:0}
.tool-commandbar button,.tool-commandbar .manifest-import>summary{min-height:38px;padding:7px 11px;font-size:15px}
.command-icon{display:inline-block;width:16px;height:16px;margin-right:6px;vertical-align:-3px;pointer-events:none}
.manifest-import{position:relative}.manifest-import>summary{margin:0;border:1px solid var(--border);border-radius:7px;padding:8px 12px;background:var(--surface);line-height:1.5}
.manifest-import-actions{position:absolute;top:100%;left:0;z-index:2;width:max-content;margin-top:6px;display:grid;gap:8px;padding:10px;background:var(--panel);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 14px #0002}.manifest-import-actions label{margin:0;align-items:center}.manifest-import-actions input[type=checkbox]{margin:0}
:is(#generate,#exportManifest,#scanMedia,#readSubtitles,#runMedia,#fillSubtitles,#confirmSync){background:var(--button);border-color:var(--button);color:var(--button-text);font-weight:600}
:is(#generate,#exportManifest,#scanMedia,#readSubtitles,#runMedia,#fillSubtitles,#confirmSync):hover:not(:disabled){background:var(--button-hover);border-color:var(--button-hover)}
:is(#runMedia,#fillSubtitles):disabled{background:var(--surface);border-color:var(--border);color:var(--muted)}
:is(#reviewSubtitleDeletes,#confirmSubtitleDeletes){color:var(--danger)}
.tool-import-options{color:var(--muted);font-size:15px}.tool-import-options .export-options,.tool-import-options label{margin:0}.panel-actions:empty,.tool-import-options:not(:has(input,select,button)){display:none}
.tool-layout{flex:1;min-width:0;min-height:auto}.tool-main{min-width:0}.tool-list-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:34px;margin-bottom:12px}
.tool-list-heading select{width:auto;max-width:210px;margin:0;font-size:15px;padding:7px 10px}
.tool-list-heading h4{font-size:19px;font-weight:650}.editor-actions{display:flex;gap:8px}.editor-actions button{background:var(--surface);color:var(--text);border-color:var(--border);padding:4px 9px;font-size:13px;min-height:30px}
#jsonPane .tool-main{height:100%;display:flex;flex-direction:column;min-height:280px}#jsonPane .tool-main>:not(.json-editor){flex-shrink:0}
.json-editor{position:relative;display:flex;flex:1;min-height:220px;border:1px solid var(--border);border-radius:8px;background:var(--surface);overflow:hidden;isolation:isolate}
.json-editor:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--tint)}.json-editor>#json{width:100%;height:100%;flex:1;min-height:0;max-height:none;margin:0;border:0;border-radius:0;background:transparent;resize:none;outline:none;padding:20px;font:16px/1.8 Consolas,"Microsoft YaHei",monospace}
.json-editor>#json::placeholder{color:transparent}.json-editor-empty{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;padding:24px;text-align:center;color:var(--muted)}
.json-editor:has(#json:placeholder-shown:not(:focus))>.json-editor-empty{display:flex}.json-editor-empty svg{width:44px;height:44px;padding:8px;border-radius:8px;background:var(--tint);color:var(--muted);margin-bottom:12px}.json-editor-empty strong{color:var(--text);font-size:15px;font-weight:600}.json-editor-empty p{font-size:13px;margin:4px 0 6px}.json-editor-empty span{font-size:12px}
#jsonPane .tool-main:has(#syncPreview:not([hidden]))>.json-editor{flex:0 0 140px;min-height:140px}#jsonPane:has(#syncPreview:not([hidden])) .tool-layout{flex:none}#jsonPane .tool-main:has(#syncPreview:not([hidden])){height:auto}

.sync-item{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin:12px 0;min-width:0}
:is(#subtitlePane,#mediaPane) :is(.tool-layout,.tool-main){display:flex;min-height:0}:is(#subtitlePane,#mediaPane) .tool-main{flex:1;flex-direction:column}:is(#subtitlePane,#mediaPane) .tool-list-heading{flex:none}#subtitleFilters :focus-visible{outline-offset:-2px}
#subtitleFilters{display:flex;align-items:center;gap:8px;flex:0 0 auto;max-width:100%}#subtitleFilters label{align-items:center;gap:5px;margin:0;font-size:15px;white-space:nowrap;flex:none}#subtitleFilters input[type=checkbox]{margin:0}
#subtitleResults{flex:1 1 0;min-height:0;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-gutter:stable;container-type:size}#subtitleResults:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
#subtitleSummary{flex:none;padding:10px 12px;font-size:15px;overflow-wrap:anywhere}
:is(#subtitlePane,#mediaPane) .tool-surface{overflow:hidden}
:is(#subtitleRows,#mediaRows){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;align-content:start}
.subtitle-card{margin:0;overflow-wrap:anywhere}
#mediaRows>.sync-item{padding:12px}
.media-detail h5{margin:0;font-size:16px;line-height:1.5}
.media-detail{grid-column:1/-1;margin:0;overflow-wrap:anywhere}
.media-detail h5{margin-block:8px}
.media-detail details{padding:8px 0;border-top:1px solid var(--border)}
.media-detail select{max-width:100%;text-overflow:ellipsis}
.media-file-path{overflow-wrap:anywhere}
#mediaPreviewPanel{margin-bottom:10px}
.subtitle-action-view{grid-column:1/-1;margin:0;overflow-wrap:anywhere}
#subtitleRows>.sync-item{padding:12px}
.merged-media #mediaRows .media-detail{display:block}
.merged-media .tool-list-heading{flex-wrap:wrap;gap:6px}.merged-media #allowWithoutSubtitles{margin:0;display:flex;align-items:center;gap:5px;white-space:nowrap}.merged-media #allowWithoutSubtitles input{width:auto;margin:0}
.merged-media #subtitleRows .panel-actions{margin:6px 0 0}.merged-media #mediaPreviewPanel{overflow:visible}
#subtitleRows h5,#subtitleRows p{margin-block:0 4px}
#subtitleRows button{margin-top:4px}
#subtitleRows select{width:100%;min-width:0;text-overflow:ellipsis}
 #subtitleRows .subtitle-result>p{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 6px}
 #subtitleRows .subtitle-result strong{flex:none}
#subtitleRows .subtitle-badge{white-space:normal}
#subtitleRows .subtitle-detail{flex:1 1 100%;font-size:.9em}
 #subtitleRows .subtitle-result select, #subtitleRows .subtitle-result label span{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
:is(#subtitleRows,#mediaRows):empty{display:none}
#subtitleFilters{flex-wrap:wrap}#subtitleDeleteSelectionCount,.subtitle-group-count{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}.subtitle-group-count{margin:4px 0 0;overflow-wrap:anywhere}
#subtitleRows h5{margin:0;font-size:17px;line-height:1.5;overflow-wrap:anywhere}.subtitle-result{margin-top:8px}.subtitle-result+.subtitle-result{padding-top:8px;border-top:1px solid var(--border)}
.subtitle-result p{margin:0;line-height:1.55;white-space:pre-wrap;color:var(--muted);font-size:15px}.subtitle-result p>strong{font-weight:650;color:var(--text)}.subtitle-badge{display:inline-block;white-space:nowrap;padding:1px 6px;margin-right:6px;border-radius:4px;background:var(--hover);color:var(--text);font-size:13px;font-weight:600}.subtitle-result[data-state=complete] .subtitle-badge{color:var(--button-text);background:var(--button)}.subtitle-result[data-state=choice] .subtitle-badge{outline:1px solid var(--edge);outline-offset:-1px;background:transparent}.subtitle-detail{display:block}.subtitle-result label{margin:6px 0;font-size:15px;overflow-wrap:anywhere}.subtitle-result select{font-size:15px;padding:7px 8px}
.sync-location{display:grid;grid-template-columns:6.5em minmax(0,1fr);gap:8px;line-height:1.7}.sync-location span:last-child{white-space:pre-wrap;overflow-wrap:anywhere}.sync-location span:first-child{color:var(--muted)}
.sync-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}

#subtitleEmpty{padding:28px 24px;margin:0;text-align:center;border:1px dashed var(--border);border-radius:8px;color:var(--muted);font-size:13px;background:var(--surface)}
#mediaPreviewPanel:not(:has(#mediaPreview:not(:empty))){display:none}
#mediaPreview{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;margin-top:8px}
#emptyPreview:not(:empty){max-height:none!important;overflow:visible!important;padding:12px 0;margin:12px 0;font-size:14px}
.tool-statusbar{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-top:14px;padding:8px 0 10px;border-top:1px solid var(--border);font-size:14px;color:var(--muted)}
.tool-status-text{flex:1;min-width:180px}.tool-status-text p{margin:0;line-height:1.5;font-size:14px}.tool-status-text p:empty{display:none}.tool-status-text progress{accent-color:var(--accent);height:6px!important;margin:6px 0!important}.tool-status-text label{margin:0;font-size:12px}
.tool-utilities{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-left:auto}.tool-utilities>.tool-card{padding:0;border:0;background:transparent;margin:0}.tool-utilities summary{padding:2px 0;font-size:14px;font-weight:500;color:var(--muted)}
.tool-statusbar:has(.tool-utilities>details[open]){display:block}.tool-utilities:has(>details[open]){display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px}.tool-utilities>details[open]{grid-column:1/-1;color:var(--text);min-width:0}
:is(#subtitlePane,#mediaPane) .tool-statusbar{align-items:flex-end;margin-top:10px}
:is(#subtitlePane,#mediaPane) .tool-status-text{min-width:0}
#subtitleProgress{max-height:3.8em;overflow:auto;scrollbar-width:none;overflow-wrap:anywhere}

#subtitleMeter{display:block;width:100%;border:0;appearance:none;background:var(--border)}
#subtitleMeter::-webkit-progress-bar{background:var(--border)}
#subtitleMeter::-webkit-progress-value{background:var(--text)}
#subtitleMeter::-moz-progress-bar{background:var(--text)}
#subtitleScope{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#subtitlePane .tool-statusbar:has(.tool-utilities>details[open]){max-height:40%;overflow:auto;scrollbar-width:none}#subtitleDeleteList{overflow-wrap:anywhere}
#log{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 Consolas,"Microsoft YaHei",monospace;max-height:180px;overflow:auto}#log:empty{display:none}#log>div+div{margin-top:6px}
#subtitlePane .tool-statusbar:has(#subtitleDiagnostics[open]){max-height:58%}#subtitleDiagnostics .panel-actions{margin:4px 0 8px}
#subtitleLog{display:block;width:100%;height:clamp(40px,calc(37cqh - 163px),150px);resize:none;overflow:auto;scrollbar-width:none;overscroll-behavior:contain}
@container(max-height:660px){
    #subtitlePane .tool-intro p{display:none}
    #subtitlePane .tool-intro h3{font-size:20px}
    #subtitlePane .tool-commandbar{margin-block:8px}
    #subtitlePane .tool-list-heading{margin-bottom:6px}
    #subtitlePane #subtitleSummary{padding:6px 10px;margin-bottom:8px}
    :is(#subtitleRows,#mediaRows)>.sync-item{padding:6px 8px}
    #subtitleRows .subtitle-group-count{margin-top:2px}
    #subtitleRows .subtitle-result{margin-top:4px}
    #subtitleRows .subtitle-result+.subtitle-result{padding-top:4px}
    #subtitleRows .subtitle-result select{padding-block:4px}
    #subtitleLog{height:38px}
}
.sync-preview{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px}.sync-preview h4{margin:0 0 8px}.sync-preview p{margin:6px 0}#syncList{overflow-wrap:anywhere;font-size:15px}#syncDestination{font-weight:600}
.export-options{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}.export-options input{width:auto}.export-options button{font-size:14px;padding:7px 12px}.credential-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.credential-head a{font-size:15px;flex-shrink:0}
.source-result{margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:8px}.source-result button{margin:8px 8px 0 0;font-size:16px}
#workspaceSettings{grid-template-rows:minmax(0,1fr);overflow:auto;scrollbar-width:none;overscroll-behavior:contain}
.settings-main{display:flex;flex-direction:column;min-width:0;min-height:0;padding:25px var(--surface-pad);background:var(--surface)}
.settings-heading{display:flex;flex:none;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--border)}.settings-heading h3{margin:0;font-size:clamp(32px,3.6cqw,52px);line-height:1.2;letter-spacing:-.04em}
.settings-appearance{display:flex;align-items:center;gap:12px;margin-left:auto}.settings-appearance label{display:flex;align-items:center;gap:6px;margin:0;font-size:15px;white-space:nowrap}.settings-appearance select{width:auto}#workspaceSettings .settings-appearance select{margin:0}
.settings-column{min-width:0}.settings-column:empty{display:none}
#settingsBasics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));flex:none;gap:16px;margin-bottom:16px}#settingsBasics:empty{display:none}
#settingsBasics>.sync-item{display:flex;flex-direction:column;min-width:0;min-height:116px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}
#settingsBasics .sync-item h3{display:flex;align-items:center;gap:8px;flex:none;margin:0 0 10px;font-size:18px}
#settingsBasics .sync-item>section{display:flex;flex:1;flex-direction:column;min-width:0;gap:8px}
#settingsBasics #mediaSettings{align-items:stretch;gap:8px}
#settingsBasics #mediaSettings>label{flex:1;min-width:180px;margin:0}
#settingsBasics #mediaSettings>label{display:flex;align-items:center;gap:12px}
#settingsBasics .credential-head{flex:none}
#settingsBasics #tmdbKey{margin:0}
#settingsBasics #mediaSettings .panel-actions{margin-top:auto}
#settingsModels{display:grid;flex:1 0 245px;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:16px}
#settingsModels:has(>:only-child){grid-template-columns:minmax(0,1fr)}#settingsModels:empty{display:none}
#workspaceSettings .sync-item{margin:0;padding:0;border:0;background:transparent;min-inline-size:0}#workspaceSettings h3>svg{width:18px;height:18px;flex:none;color:var(--accent)}
#workspaceSettings .sync-item h3{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:18px}
#settingsBasics .sync-item:has(#cacheSettings) h3{margin-bottom:8px}
#settingsBasics #cacheSettings{justify-content:space-between;gap:10px;flex-wrap:wrap}
#settingsBasics #cacheSettings>p{flex:1;min-width:180px;margin:0}
#settingsBasics #cacheSettings .panel-actions{align-items:center;margin-top:auto}
#settingsModels>.sync-item{display:flex;flex-direction:column;min-height:0;padding:18px 20px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}
#settingsModels .sync-item:has(#mediaAISettings){background:var(--panel)}
#settingsModels .sync-item h3{flex:none;margin-bottom:12px;font-size:20px}
#settingsModels .sync-item>section{display:flex;flex:1;flex-direction:column;gap:clamp(4px,1cqh,10px);min-width:0;min-height:0;overflow:auto;scrollbar-width:thin}
#settingsModels .sync-item>section>*{flex-shrink:0}
#settingsModels .sync-item>section>.panel-actions{margin-top:auto;padding-top:8px;border-top:1px solid var(--border)}
#openSubtitlesSettings{padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--rail)}
#subtitleAccountSettings>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
#workspaceSettings label,#workspaceSettings p{overflow-wrap:anywhere}#workspaceSettings .sync-item label,#workspaceSettings p{margin:4px 0}#workspaceSettings p{line-height:1.45;color:var(--muted);font-size:14px}#workspaceSettings input,#workspaceSettings select{min-height:38px;padding:6px 9px;margin-top:4px;line-height:1.45}#workspaceSettings input[type=checkbox]{min-height:0;margin:3px 0 0}
#workspaceSettings .panel-actions{gap:6px;margin:6px 0 0}#workspaceSettings button{padding:6px 9px;font-size:15px;line-height:1.4;min-height:35px}#workspaceSettings details[open]>summary{margin-bottom:7px}#workspaceSettings .credential-head{flex-wrap:wrap;gap:0 8px}#workspaceSettings .credential-head a{font-size:14px}
#workspaceSettings :is(#saveMediaKey,#saveMediaAI,#saveSubtitleSettings){background:var(--button);border-color:var(--button);color:var(--button-text);font-weight:600}#workspaceSettings :is(#saveMediaKey,#saveMediaAI,#saveSubtitleSettings):hover:not(:disabled){background:var(--button-hover)}
#settingsModels .sync-item:has(#mediaAISettings)>section{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);grid-auto-rows:max-content;column-gap:10px;align-content:start}#mediaAISettings>*{grid-column:1/-1}#mediaAISettings>label:has(#mediaAIProvider,#mediaAIModelSelect){grid-column:auto;min-width:0}#mediaAIState:empty{display:none}
#toggle{display:grid;place-items:center;width:50px;height:50px;padding:0;border-radius:12px;background:var(--button);color:var(--button-text);box-shadow:0 5px 20px #0003}#toggle:hover:not(:disabled){background:var(--button-hover)}#toggle svg{width:24px;height:24px;pointer-events:none}#toggle[aria-expanded=true]{visibility:hidden}
@container(max-width:1050px){
    .workspace-navigation{padding:12px 8px}
    .tool-surface{padding-top:14px}.settings-main{padding-block:14px}
    .settings-heading{padding-bottom:10px;margin-bottom:10px}.settings-heading h3{font-size:28px}
    #settingsModels{gap:10px}#settingsModels .sync-item{padding:10px}#settingsModels .sync-item>section{gap:2px}
    .settings-appearance label{font-size:14px}
}
@container(max-height:660px){#workspaceSettings .sync-item label{margin:2px 0}#workspaceSettings .sync-item input:not([type=checkbox]),#workspaceSettings .sync-item select{min-height:34px;padding-block:4px}#settingsBasics{margin-bottom:10px}}
@container(max-width:790px){
    .workspace-body{--surface-pad:12px}.workspace-navigation{width:134px}
    .settings-heading,.settings-appearance{flex-wrap:wrap}
    #settingsBasics{grid-template-columns:minmax(0,1fr);gap:10px;margin-bottom:10px}
    #settingsModels{grid-template-columns:minmax(0,1fr);grid-template-rows:auto;align-content:start;flex-basis:auto;flex-grow:0}
    #settingsModels .sync-item>section{overflow:visible}
    .tool-list-heading{flex-wrap:wrap;gap:5px}#subtitleFilters{margin-left:auto}
}
@container(max-height:660px){
    #workspaceSettings .settings-appearance{padding:0;gap:6px}
    #settingsModels .sync-item h3{margin-bottom:6px;font-size:18px}
    #subtitleSettings>label:has(#subtitleLanguage){
        display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px
    }
    #subtitleSettings #subtitleLanguage{margin:0}
    #mediaAISettings>label:has(#mediaAIBase,#mediaAIKey){
        display:grid;grid-template-columns:5em minmax(0,1fr);align-items:center;gap:6px
    }
}
        </style><button id="toggle" type="button" title="打开云盘工具" aria-label="打开云盘工具" aria-haspopup="dialog" aria-expanded="false" aria-controls="toolDialog"></button>
        <div class="workspace-overlay" hidden><div class="box" id="toolDialog" role="dialog" aria-modal="false" aria-labelledby="workspaceTitle" tabindex="-1">
        <header class="workspace-header"><div class="workspace-brand"><h2 id="workspaceTitle"><span class="workspace-brand-mark" aria-hidden="true"></span>云盘工具</h2><span class="workspace-location" id="workspaceLocation"></span><p id="windowHint">拖动标题栏移动 · 可同时操作网页</p></div><div class="workspace-window-actions"><button id="settingsWorkspace" type="button">设置</button><button id="pinWorkspace" type="button" aria-pressed="false" title="锁定窗口位置">固定位置</button><button id="closeWorkspace" type="button" aria-label="关闭面板" title="关闭"></button></div></header>
        <div class="workspace-toolbar"><div class="workspace-tabs" role="tablist" aria-label="功能分类"><button id="jsonTab" type="button" role="tab" aria-selected="false" aria-controls="jsonPane" tabindex="-1" disabled>跨盘清单</button><button id="subtitleTab" type="button" role="tab" aria-selected="false" aria-controls="subtitlePane" tabindex="-1" disabled title="当前网盘暂不支持字幕检查">影视整理</button></div>
        <label class="theme-row">窗口尺寸<select id="workspaceSize" aria-label="窗口尺寸"><option value="960x600">960 × 600</option><option value="1280x800" selected>1280 × 800（默认）</option><option value="1440x900">1440 × 900</option><option value="1600x1000">1600 × 1000</option></select></label>
        <label class="theme-row">外观<select id="theme"><option value="auto">跟随页面</option><option value="light">浅色</option><option value="dark">深色</option></select></label></div>
        <div class="workspace-body"><section id="workspaceSettings" class="tool-pane" hidden><div class="settings-main"><div class="settings-heading"><h3>设置</h3><div id="settingsAppearance" class="settings-appearance"></div><button id="backToTools">返回工具</button></div><div class="settings-column" id="settingsBasics"></div><div class="settings-column" id="settingsModels"></div></div></section></div></div></div>`;
            const overlay = root.querySelector('.workspace-overlay'), dialog = root.querySelector('.box'), toggle = root.querySelector('#toggle');
            const frame = document.createElement('div'); frame.className = 'workspace-frame';
            const navigation = root.querySelector('.workspace-toolbar'); navigation.className = 'workspace-navigation';
            const appearance = root.querySelector('#settingsAppearance');
            const navBrand = document.createElement('div');
            navBrand.className = 'nav-brand';
            navBrand.append(root.querySelector('.workspace-brand-mark'), document.createTextNode('云盘工具'));
            root.querySelector('#workspaceTitle').textContent = '工作区';
            navigation.prepend(navBrand);
            for (const label of [...navigation.querySelectorAll('.theme-row')]) appearance.append(label);
            const navFooter = document.createElement('div'); navFooter.className = 'nav-footer'; navFooter.append(root.querySelector('#settingsWorkspace'));
            const version = document.createElement('small'); version.textContent = typeof VERSION === 'string' ? 'v' + VERSION : ''; navFooter.append(version); navigation.append(navFooter);
            const icons = {jsonTab:'files',subtitleTab:'film',settingsWorkspace:'settings',closeWorkspace:'x',backToTools:'arrow-left'};
            for (const [name, glyph] of Object.entries(icons)) root.querySelector('#' + name).prepend(workspaceIcon(glyph, name === 'backToTools' ? 'command-icon' : ''));
            root.querySelector('.workspace-brand-mark').append(workspaceIcon('cloud'));
            toggle.append(workspaceIcon('cloud'));
            const location = root.querySelector('#workspaceLocation');
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
                pin.replaceChildren(workspaceIcon(pinned ? 'pin-off' : 'pin'));
                pin.setAttribute('aria-label', pinned ? '解除固定' : '固定位置');
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
                location.textContent = tabs.get(id).button.textContent;
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
                const available = [...root.querySelectorAll('[role=tab]')].map(button => button.id.slice(0,-3)).filter(id => tabs.has(id)), index = available.indexOf(active);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + available.length) % available.length;
                activate(available[next], true);
            };
            document.body.appendChild(host);
            bindPanelTheme(host, root);
            const openSettings = name => {
                location.textContent = '设置';
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
        const { root, tabs, activate } = toolWorkspace;
        if (tabs.has(id)) return tabs.get(id).ui;
        const pane = document.createElement('section');
        pane.id = id + 'Pane'; pane.className = 'tool-pane'; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', id + 'Tab'); pane.tabIndex = 0; pane.hidden = true;
        pane.innerHTML = `<h3></h3>${id !== 'json' ? '' : `<details id="exportHistory"><summary title="复用导出记录，加快读取与续传">导出记录</summary><div class="export-options"><label><input id="incremental" type="checkbox" checked>复用旧记录，加快读取</label></div><p id="historySummary" style="padding:8px;border:1px solid var(--border);border-radius:4px"></p><div class="export-options"><button id="importHistory">导入旧清单</button><button id="resetHistory">重置导出记录</button><input id="historyFile" type="file" accept=".json,application/json" hidden></div></details>`}${html}`;
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
        if (log) {
            const detail = document.createElement('details'), summary = document.createElement('summary');
            const copy = document.createElement('button');
            summary.textContent = '详细日志';
            copy.type = 'button';
            copy.textContent = '复制日志';
            copy.onclick = async () => {
                const output = [...log.children].map(line => line.textContent).join('\n');
                try { await navigator.clipboard.writeText(output); copy.textContent = '已复制'; }
                catch { copy.textContent = '复制失败'; }
            };
            log.before(detail);
            detail.append(summary,copy,log);
        }
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
                const heading = document.createElement('h3'); heading.textContent = headingTitle; const glyph = {mediaSettings:'key-round',mediaAISettings:'cpu',subtitleSettings:'languages'}[ids[0]];
                if (glyph) heading.prepend(workspaceIcon(glyph));
                section.appendChild(heading);
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
        tabs.set(id, entry);
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
    function scheduleLogDisplay(box, lines) {
        let pending = false;
        const paint = () => {
            pending = false;
            box.value = lines.join('\n');
            box.scrollTop = box.scrollHeight;
        };
        return () => {
            if (pending) return;
            pending = true;
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(paint);
            else paint();
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
        if (box.childElementCount > 600) {
            const oldest = [...box.children].find(entry => !entry.textContent.includes(' · 上限 '));
            (oldest || box.firstElementChild).remove();
        }
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
                ? ';--scheme:dark;--panel:#202020;--surface:#181818;--rail:#242424;--text:#f5f5f5;--muted:#b7b7b7;--field:#151515;--border:#3b3b3b;--edge:#646464;--accent:#e8e8e8;--tint:#343434;--hover:#2e2e2e;--button:#efefef;--button-text:#171717;--button-hover:#d4d4d4;--danger:#fff'
                : ';--scheme:light;--panel:#fafafa;--surface:#fff;--rail:#eee;--text:#171717;--muted:#515151;--field:#fff;--border:#dedede;--edge:#adadad;--accent:#161616;--tint:#ebebeb;--hover:#eee;--button:#171717;--button-text:#fff;--button-hover:#373737;--danger:#111');
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
