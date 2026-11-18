const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a,b) => { const start = source.indexOf(a), end = source.indexOf(b,start); assert.ok(start >= 0 && end > start,a); return source.slice(start,end); };
function element(tag = '') {
    return {tag, value:'', checked:false, disabled:false, hidden:false, scrollTop:0, dataset:{}, style:{}, children:[], ownText:'',
        set textContent(value) { this.ownText = value; this.children = []; },
        get textContent() { return this.ownText + this.children.map(child => child.textContent).join('\n'); },
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = children; this.ownText = ''; },
        querySelectorAll(selector) { return this.children.flatMap(child => [...(child.tag === selector ? [child] : []), ...child.querySelectorAll(selector)]); }};
}
const videos = ['complete','ready','failure','invalid','pending'].map((id,index) => ({id, parentId:'folder-' + id, name:'同名影片.2020.mkv', size:10000,
    folders:['目录' + index], path:'目录' + index + '/同名影片.2020.mkv'}));
const valid = new TextEncoder().encode('1\n00:00:01,000 --> 00:00:03,000\n合成中文字幕 Test\n');
const linked = new Map(['complete','invalid','pending'].map(id => [id,[{id:'s-' + id, parentId:'folder-' + id, name:'同名影片.2020.zh-cn.srt',size:30}]]));
const siblings = new Map(videos.map(video => [video.parentId,[video,...(linked.get(video.id)||[])]]));
const elements = new Map(), queried = [], deleted = [];
let reads = 0, saves = 0, empty = false, collectionError = false, pauseRead = null, recycleResult = null, panelBusy = false;
const get = id => { assert.ok(elements.has(id),id); return elements.get(id); };
const ctx = vm.createContext({URL, TextEncoder, TextDecoder, Uint8Array, Date,
    document:{createElement:element},
    GM_getValue:(key,fallback) => key === 'cross-drive-subtitle-settings' ? {thunder:true} : fallback,
    GM_setValue(){}, makePanel:(_title,html) => {
        for (const tag of html.matchAll(/<([^\s>]+)[^>]*\bid="([^"]+)"[^>]*>/g)) {
            const el = element(tag[1]); el.checked = /\bchecked\b/.test(tag[0]); el.disabled = /\bdisabled\b/.test(tag[0]); elements.set(tag[2],el);
        }
        return {get,moveSettings(){},busy(value){panelBusy = value;}};
    },
    mediaContext:async () => ({selected:[{id:'chosen',name:'本次所选文件夹'}],source:{},path:'影视库'}),
    collectMediaSelection:async () => { if (collectionError) throw Error('目录读取失败'); return {videos:empty ? [] : videos,linked}; },
    MEDIA_VIDEO:/\.(?:mkv|mp4)$/i, MEDIA_SUB:/\.(?:srt|ass|ssa|vtt)$/i,
    mediaSubtitleSuffix:(video,subtitle)=>{const stem=video.replace(/\.[^.]+$/,''),candidate=subtitle.replace(/\.[^.]+$/,'');return candidate.startsWith(stem)?candidate.slice(stem.length):null;},
    recycleMedia:async item=>{
        if (recycleResult) await recycleResult();
        deleted.push(item.id);
        siblings.set(item.parentId,siblings.get(item.parentId).filter(node=>node.id!==item.id));
    },
    mediaContext:async()=>({selected:[{id:'chosen',name:'本次所选文件夹'}],session:{provider:'123',token:'test',base:'https://drive.example',headers:{}},source:{children:async({id})=>siblings.get(id)||[]},path:'影视库'}),
    parseMediaName:() => ({query:'同名影片',year:2020,tv:false}), mediaBonusName:() => false, mediaRecords:{get:() => null}, mediaStem:name => name.replace(/\.[^.]+$/,''),
    createSubtitleService:() => ({thunderSearch:async row => {
        queried.push(row.node.id);
        if (row.node.id === 'failure') throw Error('来源连接失败');
        if (row.node.id === 'invalid') return [{source:'迅雷',name:'未确认字幕.srt',language:'zh-cn'}];
        return row.node.id === 'ready' ? [{source:'迅雷',name:'同名影片.2020.简体.srt',language:'zh-cn',titleMatched:true}] : [];
    },fetchFile:async () => ({result:{ext:'srt'},bytes:valid})}),
    subtitleDrive:() => ({verified:{get(){},forget(){}},reconcile:async () => [],
        read:async sub => {
            reads++; if (pauseRead) await pauseRead;
            if (sub.id === 's-pending') throw Error('读取连接失败');
            return sub.id === 's-invalid' ? new TextEncoder().encode('<html>错误页</html>') : valid;
        },save:async () => {saves++; return {id:'uploaded',name:'同名影片.2020.zh-cn.srt'};}})
});
const serviceFactory = ctx.createSubtitleService;
vm.runInContext(part('    function evict(', '    function nonNegativeInteger(') + part('    function subtitleDownloadUrl(', '    function subtitleDrive(') + part('    function createPanelTask(', '    function panelControls(') + part('    function subtitleInventory(', '    if (location.hostname'),ctx);
ctx.createSubtitleService = serviceFactory;
const shown = () => get('subtitleRows').querySelectorAll('p').map(row => row.textContent).join('\n');
const view = value => {get('subtitleView').value = value; get('subtitleView').onchange();};

(async () => {
    ctx.initSubtitles();
    assert.equal(get('recheckSubtitles').disabled,false,'Directory inventory is available without first searching providers');
    let releaseRead;
    pauseRead = new Promise(resolve => {releaseRead = resolve;});
    const checking = get('recheckSubtitles').onclick();
    // Three existing-subtitle reads may overlap; rows without files finish first.
    for (let i = 0; i < 100 && reads < 3; i++) await Promise.resolve();
    assert.equal(reads,3,'Directory UI overlaps up to three subtitle reads: ' + get('subtitleProgress').textContent + ' / ' + shown() + ' / ' + get('subtitleLog').value);
    assert.equal(elements.has('subtitleCoverage'),false,'The redundant coverage card is removed from the UI');
    assert.equal(shown(),'','Results are not published until the directory check finishes');
    pauseRead = null; releaseRead(); await checking;
    assert.equal(reads,3); assert.equal(queried.length,0); assert.equal(saves,0);
    assert.equal(get('subtitleSummary').hidden,true,'Inventory alone shows coverage rather than empty provider statistics');
    assert.equal(get('subtitleView').value,'all'); assert.equal(get('subtitleRows').children.length,5);
    assert.equal(get('subtitleRows').querySelectorAll('details').length,0,'Results show details without disclosure controls');
    assert.match(shown(),/有字幕：/); assert.match(shown(),/缺可用字幕：/); assert.match(shown(),/读取连接失败/);
    assert.equal(elements.has('subtitleViewPending'),false);
    for (const [index] of videos.entries()) assert.ok(shown().includes('/影视库/目录' + index + '/同名影片.2020.mkv'),'Full paths distinguish duplicate filenames');
    assert.match(get('subtitleScope').textContent,/影视库.*本次所选文件夹.*视频 5/);
    await get('readSubtitles').onclick();
    assert.equal(reads,3,'Searching reuses the checked inventory without reading subtitle bodies again');
    assert.deepEqual(queried,['ready','failure','invalid','pending'],'Only files with usable subtitles are skipped');
    assert.equal(get('subtitleSummary').hidden,false);
    assert.equal(get('subtitleRows').children.length,5,'All results remain visible after searching');
    assert.match(shown(),/缺可用字幕：/); assert.match(shown(),/手动选择\n/); assert.match(shown(),/来源连接失败/);
    view('choice'); assert.equal(get('subtitleRows').children.length,1); assert.match(shown(),/\/目录3\//);
    view('complete'); assert.equal(get('subtitleRows').children.length,1); assert.match(shown(),/\/目录0\//);
    view('all'); assert.equal(get('subtitleRows').children.length,5);
    view('incomplete'); await get('fillSubtitles').onclick();
    assert.equal(saves,1);
    assert.doesNotMatch(shown(),/\/目录1\//); assert.equal(get('subtitleRows').children.length,3);
    view('choice'); await get('recheckSubtitles').onclick(); assert.equal(get('subtitleView').value,'all','A new directory check resets the previous filter');
    empty = true; await get('recheckSubtitles').onclick();
    assert.equal(get('subtitleRows').children.length,0); assert.equal(get('fillSubtitles').disabled,true); assert.doesNotMatch(get('subtitleEmpty').textContent,/均已有/);
    empty = false; collectionError = true; await get('recheckSubtitles').onclick();
    assert.equal(elements.has('subtitleCoverage'),false); assert.equal(get('subtitleRows').children.length,0); assert.match(get('subtitleProgress').textContent,/目录读取失败/);
    collectionError = false; await get('recheckSubtitles').onclick();
    const checkboxes=()=>get('subtitleRows').querySelectorAll('input');
    assert.equal(checkboxes().length,3,'Only subtitle files linked to a unique video are offered for deletion');
    const selectAll = get('selectAllSubtitleDeletes');
    const toggleAll = checked => {selectAll.checked = checked; selectAll.onchange();};
    assert.equal(selectAll.disabled,false); assert.equal(selectAll.checked,false);
    toggleAll(true); assert.ok(checkboxes().every(box => box.checked));
    get('reviewSubtitleDeletes').onclick(); assert.equal(get('subtitleDeletePreview').open,true);
    view('incomplete'); assert.equal(selectAll.checked,true);
    toggleAll(false); assert.equal(get('subtitleDeletePreview').hidden,true,'Changing selection invalidates the previous confirmation');
    view('all'); assert.equal(selectAll.indeterminate,true);
    assert.deepEqual(checkboxes().map(box => box.checked),[true,false,false],'Cancelling the visible selection keeps selections under other filters');
    view('choice'); assert.equal(selectAll.disabled,true);
    view('all'); toggleAll(false); assert.ok(checkboxes().every(box => !box.checked));
    get('subtitleResults').scrollTop = 80;
    checkboxes()[0].checked=true;checkboxes()[0].onchange();assert.equal(get('reviewSubtitleDeletes').disabled,false);
    assert.equal(get('subtitleResults').scrollTop,80,'Subtitle selection preserves the list scroll position');
    view('complete'); assert.equal(get('subtitleResults').scrollTop,0,'Filtering resets the list scroll position');
    get('reviewSubtitleDeletes').onclick();assert.match(get('subtitleDeleteList').textContent,/目录0\/同名影片\.2020\.zh-cn\.srt/);assert.equal(get('subtitleDeletePreview').open,true);
    const original=siblings.get('folder-complete')[1];original.name='其他影片.zh-cn.srt';await get('confirmSubtitleDeletes').onclick();assert.equal(deleted.length,0,'Stale subtitle name blocks deletion');assert.match(get('subtitleProgress').textContent,/失败 1 个/);
    original.name='同名影片.2020.zh-cn.srt';siblings.get('folder-complete')[0].name='另一个作品.mkv';get('reviewSubtitleDeletes').onclick();await get('confirmSubtitleDeletes').onclick();assert.equal(deleted.length,0,'Changed associated video blocks deletion');
    siblings.get('folder-complete')[0].name='同名影片.2020.mkv';
    let finishRecycle, recycleStarted;
    const started = new Promise(resolve => {recycleStarted = resolve;});
    const outcome = new Promise(resolve => {finishRecycle = resolve;});
    recycleResult = async () => {recycleStarted(); await outcome; throw Object.assign(Error('回收站结果待确认'), {pending:true});};
    get('reviewSubtitleDeletes').onclick();
    const deleting = get('confirmSubtitleDeletes').onclick();
    await started;
    get('stopSubtitles').onclick();
    const readsBeforeStop = reads;
    await get('recheckSubtitles').onclick();
    assert.equal(reads,readsBeforeStop,'Stopping waits for the recycle result before starting a new scan');
    assert.equal(panelBusy,true);
    finishRecycle(); await deleting; recycleResult = null;
    assert.equal(panelBusy,false);
    view('all');
    assert.match(shown(),/字幕删除结果不明/);
    assert.equal(checkboxes()[0].disabled,true,'An unconfirmed recycle result cannot be selected again');
    checkboxes()[0].checked=true;checkboxes()[0].onchange();
    assert.equal(get('reviewSubtitleDeletes').disabled,true);
    await get('recheckSubtitles').onclick();
    view('complete');
    checkboxes()[0].checked=true;checkboxes()[0].onchange();
    get('reviewSubtitleDeletes').onclick();await get('confirmSubtitleDeletes').onclick();
    assert.deepEqual(deleted,['s-complete']);assert.match(get('subtitleProgress').textContent,/已移入回收站 1 个/,'A fresh check lets the user confirm a new deletion plan');
    console.log('PASS subtitle directory inventory: scan makes no provider/write calls; expanded results, full paths, filters/empty states, fill updates, stale-scan clearing and previewed safe batch deletion (mocked API/DOM)');
})().catch(error => {console.error(error); process.exitCode = 1;});
