const workspaceIcons = {
    settings:
        '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />',
    'scan-search':
        '<path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /><path d="m16 16-1.9-1.9" />',
    search: '<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />',
    plus: '<path d="M5 12h14" /><path d="M12 5v14" />',
    'trash-2':
        '<path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />',
    x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
    pin: '<path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />',
    'pin-off':
        '<path d="M12 17v5" /><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" /><path d="m2 2 20 20" /><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />',
    'key-round':
        '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" /><circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />',
    languages:
        '<path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" />',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />',
    'arrow-left': '<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />',
    cpu: '<path d="M12 20v2" /><path d="M12 2v2" /><path d="M17 20v2" /><path d="M17 2v2" /><path d="M2 12h2" /><path d="M2 17h2" /><path d="M2 7h2" /><path d="M20 12h2" /><path d="M20 17h2" /><path d="M20 7h2" /><path d="M7 20v2" /><path d="M7 2v2" /><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="8" y="8" width="8" height="8" rx="1" />',
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
    for (const [key, value] of Object.entries({
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.75',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
    }))
        icon.setAttribute(key, value);
    if (className) icon.setAttribute('class', className);
    icon.innerHTML = workspaceIcons[name];
    return icon;
}
// Keep existing media and subtitle controls while arranging their presentation.
function arrangeToolPane(pane) {
    const create = (tag, className, text) => {
        const node = document.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    const take = (parent, selector) => {
        const node = pane.querySelector(selector);
        if (node) parent.append(node);
    };
    const commands = create('div', 'tool-commandbar');
    const firstAction = pane.querySelector(':scope > .panel-actions');
    const merged = pane.querySelector('#previewMedia');
    if (firstAction) commands.append(firstAction);
    if (merged) {
        const actions = pane.querySelector('#stopSubtitles').parentElement;
        firstAction.append(...actions.children);
        actions.remove();
        pane.classList.add('merged-media');
    }
    const commandIcons = {
        scanMedia: 'scan-search',
        openMediaCleanup: 'trash-2',
        readSubtitles: 'search',
        fillSubtitles: 'plus',
        reviewSubtitleDeletes: 'trash-2',
        importSubtitles: 'upload',
    };
    for (const [name, glyph] of Object.entries(commandIcons))
        commands.querySelector('#' + name)?.prepend(workspaceIcon(glyph, 'command-icon'));
    const layout = create('div', 'tool-layout');
    const main = create('div', 'tool-main');
    const status = create('section', 'tool-status-text');
    const statusIds = ['subtitleTask', 'subtitleScope', 'subtitleProgress', 'subtitleMeter'];
    for (const name of statusIds) take(status, '#' + name);
    const heading = create('div', 'tool-list-heading');
    const headingTitle = create('h3', '', '字幕检查结果');
    heading.append(headingTitle);
    headingTitle.id = 'subtitleResultsTitle';
    if (merged) headingTitle.textContent = '作品与字幕';
    take(heading, '#subtitleFilters');
    main.append(heading);
    take(main, '#subtitleSummary');
    take(main, '#subtitleResults');
    take(main, '#subtitleDeletePreview');
    if (merged) {
        take(heading, '#allowWithoutSubtitles');
        const results = main.querySelector('#subtitleResults');
        const preview = create('details', 'sync-preview');
        preview.id = 'mediaPreviewPanel';
        preview.append(create('summary', '', '查看整理预览'));
        take(preview, '#mediaPreview');
        results.prepend(preview);
        results.prepend(pane.querySelector('#mediaCleanup'));
        take(results, '#mediaRows');
        results.querySelector('#mediaRows').hidden = true;
    }
    const utilities = create('div', 'tool-utilities');
    for (const node of [...pane.children]) {
        if (node.id.endsWith('Settings') || (node.tagName === 'INPUT' && node.hidden)) continue;
        node.classList.add('tool-card');
        utilities.append(node);
    }
    const footer = create('footer', 'tool-statusbar');
    footer.append(status, utilities);
    const surface = create('div', 'tool-surface');
    layout.append(main);
    surface.append(commands, layout, footer);
    pane.append(surface);
}
let toolWorkspace = null;
function makePanel(html) {
    if (!toolWorkspace) {
        const host = document.createElement('div');
        host.id = 'cloud-media-organizer-tools';
        host.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647';
        // 面板交互不冒泡给网盘，避免点击按钮时清掉网页的勾选。
        for (const event of ['pointerdown', 'mousedown', 'click'])
            host.addEventListener(event, (event) => event.stopPropagation());
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
.workspace-header,.workspace-body{--surface-pad:clamp(16px,2cqw,32px)}
.workspace-header{display:flex;align-items:center;justify-content:space-between;gap:12px;height:52px;flex-shrink:0;padding:0 var(--surface-pad);cursor:grab;touch-action:none;user-select:none;background:var(--surface);border-bottom:1px solid var(--border)}
.workspace-header h2{margin:0;font-size:20px;font-weight:650;white-space:nowrap}
.workspace-header.dragging{cursor:grabbing}.workspace-header.pinned{cursor:default}.workspace-window-actions{display:flex;align-items:center;gap:8px}
#settingsWorkspace{display:flex;align-items:center;gap:6px;padding:5px 10px;font-size:15px;white-space:nowrap}
#settingsWorkspace svg{width:16px;height:16px;flex:none}
#settingsWorkspace[aria-expanded=true]{background:var(--tint)}
#pinWorkspace,#closeWorkspace{display:grid;place-items:center;width:32px;height:32px;padding:0;background:transparent;border-color:transparent;color:var(--muted)}#pinWorkspace svg,#closeWorkspace svg{width:16px;height:16px}#pinWorkspace[aria-pressed=true]{color:var(--accent);background:var(--tint)}
.workspace-body{flex:1;min-width:0;min-height:0;display:flex}
.tool-pane{display:grid;grid-template-columns:minmax(0,1fr);width:100%;min-width:0;min-height:0}
.tool-surface{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto;scrollbar-width:none;overscroll-behavior:contain;padding:25px var(--surface-pad) 0;background:var(--surface)}
.tool-commandbar,.tool-statusbar{flex-shrink:0}
.panel-actions,.tool-commandbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.panel-actions{margin:12px 0}.tool-commandbar{margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border)}
.tool-commandbar>.panel-actions{margin:0}
.tool-commandbar button{min-height:38px;padding:7px 11px;font-size:15px}
.command-icon{display:inline-block;width:16px;height:16px;margin-right:6px;vertical-align:-3px;pointer-events:none}
:is(#scanMedia,#readSubtitles,#runMedia,#fillSubtitles){background:var(--button);border-color:var(--button);color:var(--button-text);font-weight:600}
:is(#scanMedia,#readSubtitles,#runMedia,#fillSubtitles):hover:not(:disabled){background:var(--button-hover);border-color:var(--button-hover)}
:is(#runMedia,#fillSubtitles):disabled{background:var(--surface);border-color:var(--border);color:var(--muted)}
:is(#reviewSubtitleDeletes,#confirmSubtitleDeletes){color:var(--danger)}
.panel-actions:empty{display:none}
.tool-layout{flex:1;min-width:0;min-height:auto}.tool-main{min-width:0}.tool-list-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:34px;margin-bottom:12px}
.tool-list-heading select{width:auto;max-width:210px;margin:0;font-size:15px;padding:7px 10px}
.tool-list-heading h3{margin:0;font-size:19px;font-weight:650}.editor-actions{display:flex;gap:8px}.editor-actions button{background:var(--surface);color:var(--text);border-color:var(--border);padding:4px 9px;font-size:13px;min-height:30px}

.sync-item{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin:12px 0;min-width:0}
:is(#subtitlePane,#mediaPane) :is(.tool-layout,.tool-main){display:flex;min-height:0}:is(#subtitlePane,#mediaPane) .tool-main{flex:1;flex-direction:column}:is(#subtitlePane,#mediaPane) .tool-list-heading{flex:none}#subtitleFilters :focus-visible{outline-offset:-2px}
#subtitleFilters{display:flex;align-items:center;gap:8px;flex:0 0 auto;max-width:100%}#subtitleFilters label{align-items:center;gap:5px;margin:0;font-size:15px;white-space:nowrap;flex:none}#subtitleFilters input[type=checkbox]{margin:0}
#subtitleResults{flex:none;min-height:auto;overflow:visible;overflow-anchor:none;container-type:size}#subtitleResults:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
#subtitleSummary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;flex:none;padding:10px 12px;font-size:15px;overflow-wrap:anywhere}
.subtitle-summary-group{display:grid;gap:4px;min-width:0;padding:9px 11px;border:1px solid var(--border);border-radius:6px;background:var(--surface)}.subtitle-summary-group strong{font-size:14px;color:var(--text)}.subtitle-summary-value{color:var(--muted);line-height:1.5}
:is(#subtitleRows,#mediaRows){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch;align-content:start}
.subtitle-card{margin:0;overflow-wrap:anywhere}
#mediaRows>.media-detail{grid-column:1/-1;margin:0;padding:clamp(14px,2.5cqw,28px);overflow-wrap:anywhere}
.media-correction-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1px solid var(--border)}
.media-correction-header h5{margin:0;font-size:22px;line-height:1.35}
.media-correction-header button,.media-correction-footer button{width:auto;margin:0}
.media-correction-context,.media-correction-options{display:grid;gap:10px;min-width:0}
.media-correction-context{padding:16px 0}
.media-detail p{margin:0;line-height:1.55}
.media-correction-file{font-size:17px;font-weight:650}
.media-note{color:var(--muted);font-size:15px}
.media-correction-status{padding:9px 12px;background:var(--hover);border-inline-start:2px solid var(--edge);border-radius:4px;font-size:16px}
.media-correction-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:10px 16px}
.media-correction-search{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px}
.media-detail label{display:grid;gap:5px;min-width:0;margin:0;font-size:15px;font-weight:600}
.media-detail :is(select,input[type=text],input:not([type])){width:100%;min-width:0;max-width:100%;min-height:42px;margin:0;font-size:16px;font-weight:400;text-overflow:ellipsis}
.media-correction-options>button{justify-self:start}
.media-correction-batch{padding:10px 12px;border:1px solid var(--border);border-radius:6px}
.media-detail details{margin-top:14px;border-top:1px solid var(--border);padding-top:10px}
.media-detail summary{font-size:15px;cursor:pointer}
.media-detail details>.media-correction-options{padding-top:10px}
.media-correction-footer{display:flex;justify-content:flex-end;margin-top:14px}
@container(max-width:490px){
    .media-correction-fields,.media-correction-search{grid-template-columns:minmax(0,1fr)}
    .media-correction-search button{justify-self:start}
}
#mediaPreviewPanel{margin-bottom:10px}
.subtitle-action-view{grid-column:1/-1;margin:0;overflow-wrap:anywhere}
#subtitleRows>.sync-item{padding:12px}
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
.subtitle-action-footer{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}.subtitle-action-footer button{margin-top:0}.subtitle-action-footer select{flex:1 1 260px;min-width:180px;max-width:100%;margin:0}.subtitle-action-summary{flex:1 1 100%;margin:0;color:var(--muted);font-size:14px;line-height:1.5}
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
#subtitleTask{color:var(--text);font-size:15px;font-weight:650;line-height:1.45}#subtitleScope,#subtitleProgress{overflow-wrap:anywhere}

#subtitleMeter{display:block;width:100%;border:0;appearance:none;background:var(--border)}
#subtitleMeter::-webkit-progress-bar{background:var(--border)}
#subtitleMeter::-webkit-progress-value{background:var(--text)}
#subtitleMeter::-moz-progress-bar{background:var(--text)}
#subtitleScope{overflow-wrap:anywhere}
#subtitleDeleteList{overflow-wrap:anywhere}
#log{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 Consolas,"Microsoft YaHei",monospace;max-height:180px;overflow:auto}#log:empty{display:none}#log>div+div{margin-top:6px}
#subtitlePane .tool-statusbar:has(#subtitleDiagnostics[open]){max-height:58%}#subtitleDiagnostics .panel-actions{margin:4px 0 8px}
#subtitleLog{display:block;width:100%;height:clamp(40px,calc(37cqh - 163px),150px);resize:none;overflow:auto;scrollbar-width:none;overscroll-behavior:contain}
@container(max-height:660px){
    #subtitlePane .tool-commandbar{margin-block:8px}
    #subtitlePane .tool-list-heading{margin-bottom:6px}
    #subtitlePane #subtitleSummary{grid-template-columns:minmax(0,1fr);padding:6px 10px;margin-bottom:8px}
    :is(#subtitleRows,#mediaRows)>.sync-item{padding:6px 8px}
    #subtitleRows .subtitle-group-count{margin-top:2px}
    #subtitleRows .subtitle-result{margin-top:4px}
    #subtitleRows .subtitle-result+.subtitle-result{padding-top:4px}
    #subtitleRows .subtitle-result select{padding-block:4px}
    #subtitleLog{height:38px}
}
.sync-preview{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px}.sync-preview h4{margin:0 0 8px}.sync-preview p{margin:6px 0}
.credential-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.credential-head a{font-size:15px;flex-shrink:0}
.source-result{margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:8px}.source-result button{margin:8px 8px 0 0;font-size:16px}
#workspaceSettings{grid-template-rows:minmax(0,1fr);overflow:hidden;overscroll-behavior:contain}
.settings-main{display:flex;flex-direction:column;min-width:0;min-height:0;padding:25px var(--surface-pad);background:var(--surface)}
.settings-heading{display:flex;flex:none;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--border)}.settings-heading h3{margin:0;font-size:clamp(32px,3.6cqw,52px);line-height:1.2;letter-spacing:-.04em}
.settings-title{display:flex;align-items:baseline;gap:10px}.settings-title small{color:var(--muted);font-size:13px}
.settings-appearance{display:flex;align-items:center;gap:12px;margin-left:auto}.settings-appearance label{display:flex;align-items:center;gap:6px;margin:0;font-size:15px;white-space:nowrap}.settings-appearance select{width:auto}#workspaceSettings .settings-appearance select{margin:0}
.settings-column{min-width:0}.settings-column:empty{display:none}
#settingsBasics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));flex:none;gap:16px;margin-bottom:8px}#settingsBasics:empty{display:none}
#settingsBasics>.sync-item{display:flex;flex-direction:column;min-width:0;min-height:0;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}
#settingsBasics .sync-item h3{display:flex;align-items:center;gap:8px;flex:none;margin:0 0 6px;font-size:18px}
#settingsBasics .sync-item h3{justify-content:flex-start;flex-wrap:wrap}
#workspaceSettings .settings-card-title{display:flex;align-items:center;gap:8px;flex:0 0 auto;white-space:nowrap}
#workspaceSettings .settings-card-title>svg{width:22px;height:22px;flex:none;color:var(--accent)}
#settingsModels .settings-card-title>svg{width:24px;height:24px}
#settingsBasics .sync-item h3>.panel-actions{flex:none;align-items:center;gap:6px;margin:0}
#settingsBasics .sync-item>section{display:flex;flex:1;flex-direction:column;justify-content:flex-end;min-width:0;gap:8px}
#settingsBasics #mediaSettings{align-items:stretch;gap:8px}
#settingsBasics #mediaSettings>label{flex:1;min-width:180px;margin:0}
#settingsBasics #mediaSettings>label{display:flex;align-items:center;gap:12px}
#settingsBasics .credential-head{flex:none}
#settingsBasics #tmdbKey{margin:0}
#settingsBasics #mediaSettings .panel-actions{margin-top:auto}
#settingsModels{display:grid;flex:1 1 0;min-height:0;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:16px}
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
#settingsModels .sync-item>section{display:flex;flex:1;flex-direction:column;gap:clamp(4px,1cqh,10px);min-width:0;min-height:0;overflow:visible}
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
    .tool-surface{padding-top:14px}.settings-main{padding-block:14px}
    .settings-heading{padding-bottom:10px;margin-bottom:10px}.settings-heading h3{font-size:28px}
    #settingsModels{gap:10px}#settingsModels .sync-item{padding:10px}#settingsModels .sync-item>section{gap:2px}
    .settings-appearance label{font-size:14px}
}
@container(max-height:660px){#workspaceSettings .sync-item label{margin:2px 0}#workspaceSettings .sync-item input:not([type=checkbox]),#workspaceSettings .sync-item select{min-height:34px;padding-block:4px}#settingsBasics{margin-bottom:10px}}
@container(max-width:790px){
    .workspace-header,.workspace-body{--surface-pad:12px}
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
@container(max-height:720px){
    #workspaceSettings .settings-main{padding-block:10px;overflow:hidden}
    #workspaceSettings .settings-heading{padding-bottom:8px;margin-bottom:8px}
    #workspaceSettings #settingsBasics{margin-bottom:8px}
    #workspaceSettings #settingsModels{gap:10px}
    #workspaceSettings #settingsBasics>.sync-item{min-height:0;padding:10px 12px}
    #workspaceSettings #settingsModels>.sync-item{padding:10px 12px 6px}
    #workspaceSettings #settingsModels .sync-item>section{gap:2px}
    #workspaceSettings .sync-item label{margin:2px 0}
    #workspaceSettings p{margin:3px 0}
    #workspaceSettings input,#workspaceSettings select{min-height:32px;padding-block:3px;margin-top:3px}
    #workspaceSettings .panel-actions{margin:3px 0}
}
        </style><button id="toggle" type="button" title="打开影视整理" aria-label="打开影视整理" aria-haspopup="dialog" aria-expanded="false" aria-controls="toolDialog"></button>
        <div class="workspace-overlay" hidden><div class="box" id="toolDialog" role="dialog" aria-modal="false" aria-labelledby="workspaceTitle" tabindex="-1">
        <header class="workspace-header">
            <h2 id="workspaceTitle">影视整理</h2>
            <div class="workspace-window-actions">
                <button id="settingsWorkspace" type="button" aria-controls="workspaceSettings" aria-expanded="false">设置</button>
                <button id="pinWorkspace" type="button" aria-pressed="false" title="锁定窗口位置">固定位置</button>
                <button id="closeWorkspace" type="button" aria-label="关闭面板" title="关闭"></button>
            </div>
        </header>
        <div class="workspace-body">
            <section id="subtitlePane" class="tool-pane" aria-labelledby="workspaceTitle" tabindex="0"></section>
            <section id="workspaceSettings" class="tool-pane" aria-labelledby="settingsTitle" hidden>
                <div class="settings-main">
                    <div class="settings-heading">
                        <div class="settings-title"><h3 id="settingsTitle" tabindex="-1">设置</h3><small>v${VERSION}</small></div>
                        <div class="settings-appearance">
                            <label>窗口尺寸<select id="workspaceSize"><option value="960x600">960 × 600</option><option value="1280x800" selected>1280 × 800（默认）</option><option value="1440x900">1440 × 900</option><option value="1600x1000">1600 × 1000</option></select></label>
                            <label>外观<select id="theme"><option value="auto">跟随页面</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
                        </div>
                        <button id="backToTools" type="button">返回影视整理</button>
                    </div>
                    <div class="settings-column" id="settingsBasics"></div>
                    <div class="settings-column" id="settingsModels"></div>
                </div>
            </section>
        </div></div></div>`;
        const overlay = root.querySelector('.workspace-overlay'),
            dialog = root.querySelector('.box'),
            toggle = root.querySelector('#toggle'),
            pane = root.querySelector('#subtitlePane'),
            settings = root.querySelector('#workspaceSettings'),
            settingsButton = root.querySelector('#settingsWorkspace'),
            backButton = root.querySelector('#backToTools');
        const icons = {
            settingsWorkspace: 'settings',
            closeWorkspace: 'x',
            backToTools: 'arrow-left',
        };
        for (const [name, glyph] of Object.entries(icons))
            root.querySelector('#' + name).prepend(
                workspaceIcon(glyph, name === 'backToTools' ? 'command-icon' : '')
            );
        toggle.append(workspaceIcon('cloud'));
        let returnFocus = null,
            onActivate = null;
        const layoutKey = 'media-workspace-layout';
        const saved = GM_getValue(layoutKey, GM_getValue('cross-drive-window-layout', {}));
        const sizes = new Map([
            ['960x600', [960, 600]],
            ['1280x800', [1280, 800]],
            ['1440x900', [1440, 900]],
            ['1600x1000', [1600, 1000]],
        ]);
        let windowSize = sizes.has(saved?.size) ? saved.size : '1280x800';
        let position =
            Number.isFinite(saved?.left) && Number.isFinite(saved?.top)
                ? { left: saved.left, top: saved.top }
                : null;
        let pinned = saved?.pinned === true,
            drag = null;
        const header = root.querySelector('.workspace-header'),
            pin = root.querySelector('#pinWorkspace');
        const place = (point) => {
            const width = page.innerWidth,
                height = page.innerHeight;
            // Size presets describe screenshot/device pixels, including OS scaling and browser zoom.
            const ratio =
                Number.isFinite(page.devicePixelRatio) && page.devicePixelRatio > 0
                    ? page.devicePixelRatio
                    : 1;
            const margin = 24 / ratio;
            const [baseWidth, baseHeight] = sizes.get(windowSize);
            const scale = Math.max(
                0,
                Math.min(
                    1,
                    ((width - margin * 2) * ratio) / baseWidth,
                    ((height - margin * 2) * ratio) / baseHeight
                )
            );
            dialog.style.transformOrigin = 'top left';
            dialog.style.transform = `scale(${1 / ratio})`;
            dialog.style.maxWidth = dialog.style.maxHeight = 'none';
            dialog.style.width = Math.max(1, Math.round(baseWidth * scale)) + 'px';
            dialog.style.height = Math.max(1, Math.round(baseHeight * scale)) + 'px';
            const rect = dialog.getBoundingClientRect();
            const left = Math.max(
                margin,
                Math.min(point?.left ?? Math.round((width - rect.width) / 2), width - rect.width - margin)
            );
            const top = Math.max(
                margin,
                Math.min(point?.top ?? Math.round((height - rect.height) / 2), height - rect.height - margin)
            );
            dialog.style.left = left + 'px';
            dialog.style.top = top + 'px';
            sizeSelect.title = `窗口外框：${Math.round(rect.width * ratio)} × ${Math.round(rect.height * ratio)} 像素（不含阴影）${scale < 1 ? '；可用空间不足，已缩小' : ''}`;
            return { left, top };
        };
        const saveLayout = () => {
            GM_setValue(layoutKey, { ...position, pinned, size: windowSize });
        };
        const sizeSelect = root.querySelector('#workspaceSize');
        sizeSelect.value = windowSize;
        sizeSelect.onchange = () => {
            if (!sizes.has(sizeSelect.value)) {
                sizeSelect.value = windowSize;
                return;
            }
            windowSize = sizeSelect.value;
            if (!pinned) position = null;
            place(position);
            saveLayout();
        };
        const renderPin = () => {
            pin.replaceChildren(workspaceIcon(pinned ? 'pin-off' : 'pin'));
            pin.setAttribute('aria-label', pinned ? '解除固定' : '固定位置');
            pin.setAttribute('aria-pressed', String(pinned));
            pin.title = pinned ? '解除后可以拖动窗口' : '锁定窗口位置';
            header.classList.toggle('pinned', pinned);
        };
        pin.onclick = () => {
            pinned = !pinned;
            position = place(position);
            saveLayout();
            renderPin();
        };
        header.onpointerdown = (event) => {
            if (pinned || event.button !== 0 || event.target.closest('button')) return;
            event.preventDefault();
            const rect = dialog.getBoundingClientRect();
            drag = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: rect.left,
                top: rect.top,
            };
            header.setPointerCapture(event.pointerId);
            header.classList.add('dragging');
        };
        header.onpointermove = (event) => {
            if (!drag || event.pointerId !== drag.id) return;
            position = place({
                left: drag.left + event.clientX - drag.x,
                top: drag.top + event.clientY - drag.y,
            });
        };
        const finishDrag = (event) => {
            if (!drag || event.pointerId !== drag.id) return;
            drag = null;
            header.classList.remove('dragging');
            saveLayout();
            if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
        };
        header.onpointerup = finishDrag;
        header.onpointercancel = finishDrag;
        header.onlostpointercapture = finishDrag;
        page.addEventListener('resize', () => {
            if (!overlay.hidden) place(position);
        });
        renderPin();
        const showTools = () => {
            settings.hidden = true;
            pane.hidden = false;
            settingsButton.setAttribute('aria-expanded', 'false');
            onActivate?.();
        };
        const close = () => {
            overlay.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            const target = returnFocus?.isConnected && returnFocus !== host ? returnFocus : toggle;
            target.focus();
        };
        toggle.onclick = () => {
            if (!overlay.hidden) {
                close();
                return;
            }
            returnFocus = document.activeElement;
            overlay.hidden = false;
            place(position);
            showTools();
            toggle.setAttribute('aria-expanded', 'true');
            dialog.focus();
        };
        root.querySelector('#closeWorkspace').onclick = close;
        root.addEventListener('keydown', (event) => {
            if (!overlay.hidden && event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
            }
        });
        document.body.appendChild(host);
        bindPanelTheme(host, root);
        const openSettings = (name) => {
            pane.hidden = true;
            settings.hidden = false;
            settingsButton.setAttribute('aria-expanded', 'true');
            root.querySelector('#settingsTitle').focus({ preventScroll: true });
            const detail = name && root.querySelector('#' + name);
            if (detail) {
                if (detail.tagName === 'DETAILS') detail.open = true;
                detail.scrollIntoView?.({ block: 'nearest' });
            }
        };
        settingsButton.onclick = () => {
            if (settings.hidden) openSettings();
            else showTools();
        };
        backButton.onclick = () => {
            showTools();
            settingsButton.focus();
        };
        pane.innerHTML = html;
        const log = pane.querySelector('#log');
        if (log) {
            const detail = document.createElement('details'),
                summary = document.createElement('summary');
            const copy = document.createElement('button');
            summary.textContent = '详细日志';
            copy.type = 'button';
            copy.textContent = '复制日志';
            copy.onclick = async () => {
                const output = [...log.children].map((line) => line.textContent).join('\n');
                try {
                    await navigator.clipboard.writeText(output);
                    copy.textContent = '已复制';
                } catch {
                    copy.textContent = '复制失败';
                }
            };
            log.before(detail);
            detail.append(summary, copy, log);
        }
        arrangeToolPane(pane);
        const elements = new Map();
        const settingsSections = [];
        const ui = {
            get: (name) => {
                if (!elements.has(name))
                    elements.set(
                        name,
                        pane.querySelector('#' + name) ||
                            settingsSections
                                .map((section) => section.querySelector('#' + name))
                                .find(Boolean) ||
                            (['toggle', 'theme'].includes(name) ? root.querySelector('#' + name) : null)
                    );
                return elements.get(name);
            },
            onActivate: (callback) => {
                onActivate = callback;
            },
            moveSettings: (ids, headingTitle, destination = '#settingsBasics') => {
                const section = document.createElement('fieldset');
                section.className = 'sync-item';
                section.style.minWidth = '0';
                const heading = document.createElement('h3');
                const headingLabel = document.createElement('span');
                headingLabel.className = 'settings-card-title';
                headingLabel.textContent = headingTitle;
                const glyph = {
                    mediaSettings: 'key-round',
                    mediaAISettings: 'cpu',
                    subtitleSettings: 'languages',
                }[ids[0]];
                if (glyph) headingLabel.prepend(workspaceIcon(glyph));
                heading.append(headingLabel);
                section.appendChild(heading);
                const content = ids.map((name) => ui.get(name));
                for (const element of content) section.appendChild(element);
                if (destination === '#settingsBasics') {
                    const actions = content
                        .map((element) => element.querySelector('.panel-actions'))
                        .find(Boolean);
                    if (actions) heading.append(actions);
                }
                settingsSections.push(section);
                root.querySelector(destination).appendChild(section);
            },
            openSettings,
            busy: (value) => {
                settingsButton.disabled = value;
                backButton.disabled = value;
            },
        };
        toolWorkspace = ui;
    }
    return toolWorkspace;
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
            try {
                updateControls(false);
            } finally {
                active = false;
                ui.busy(false);
            }
        }
    };
}
function appendLog(ui, message) {
    const line = document.createElement('div');
    line.textContent = message;
    const box = ui.get('log');
    box.appendChild(line);
    if (box.childElementCount > 600) {
        const oldest = [...box.children].find((entry) => !entry.textContent.includes(' · 上限 '));
        (oldest || box.firstElementChild).remove();
    }
    box.scrollTop = box.scrollHeight;
}
function bindPanelTheme(host, root) {
    const select = root.querySelector('#theme');
    select.value = GM_getValue('media-workspace-theme', GM_getValue('cross-drive-theme', 'auto'));
    const baseStyle = host.style.cssText;
    const media = page.matchMedia?.('(prefers-color-scheme: dark)');
    let queued = false;
    const schedule = () => {
        if (queued) return;
        queued = true;
        setTimeout(() => {
            queued = false;
            update();
        }, 0);
    };
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
    function update() {
        let dark = select.value === 'dark';
        observer?.disconnect();
        if (select.value === 'auto') {
            dark = media?.matches || false;
            let sample = document.elementFromPoint?.(
                Math.round(page.innerWidth / 2),
                Math.round(page.innerHeight / 2)
            );
            if (!sample || sample === host) sample = document.body;
            const ancestors = [];
            for (let element = sample; element; element = element.parentElement) ancestors.push(element);
            for (const element of ancestors)
                observer?.observe(element, {
                    attributes: true,
                    attributeFilter: ['class', 'style', 'data-theme', 'data-color-mode', 'color-scheme'],
                });
            if (typeof page.getComputedStyle === 'function') {
                for (const element of ancestors) {
                    const color = page.getComputedStyle(element).backgroundColor;
                    const rgb = color.match(
                        /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/
                    );
                    if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) < 0.9)) continue;
                    dark = 0.2126 * Number(rgb[1]) + 0.7152 * Number(rgb[2]) + 0.0722 * Number(rgb[3]) < 128;
                    break;
                }
            }
        }
        host.style.cssText =
            baseStyle +
            (dark
                ? ';--scheme:dark;--panel:#202020;--surface:#181818;--rail:#242424;--text:#f5f5f5;--muted:#b7b7b7;--field:#151515;--border:#3b3b3b;--edge:#646464;--accent:#e8e8e8;--tint:#343434;--hover:#2e2e2e;--button:#efefef;--button-text:#171717;--button-hover:#d4d4d4;--danger:#fff'
                : ';--scheme:light;--panel:#fafafa;--surface:#fff;--rail:#eee;--text:#171717;--muted:#515151;--field:#fff;--border:#dedede;--edge:#adadad;--accent:#161616;--tint:#ebebeb;--hover:#eee;--button:#171717;--button-text:#fff;--button-hover:#373737;--danger:#111');
    }
    select.onchange = () => {
        GM_setValue('media-workspace-theme', select.value);
        update();
    };
    media?.addEventListener('change', schedule);
    page.addEventListener('popstate', schedule);
    page.addEventListener('hashchange', schedule);
    update();
}
