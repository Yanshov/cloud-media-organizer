const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a,b) => { const start = source.indexOf(a), end = source.indexOf(b,start); assert.ok(start >= 0 && end > start,a); return source.slice(start,end); };
function element(tag = '') {
    return {tag, value:'', checked:false, disabled:false, hidden:false, dataset:{}, style:{}, children:[], ownText:'',
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
const elements = new Map(), copies = [], queried = [], deleted = []; let reads = 0, saves = 0, empty = false, collectionError = false, pauseRead = null;
const get = id => { assert.ok(elements.has(id),id); return elements.get(id); };
const ctx = vm.createContext({URL, TextEncoder, TextDecoder, Uint8Array, Date,
    navigator:{clipboard:{writeText:async text => copies.push(text)}}, document:{createElement:element},
    GM_getValue:(key,fallback) => key === 'cross-drive-subtitle-settings' ? {assrt:false,thunder:true} : fallback,
    GM_setValue(){}, makePanel:(_title,html) => {
        for (const tag of html.matchAll(/<([^\s>]+)[^>]*\bid="([^"]+)"[^>]*>/g)) {
            const el = element(tag[1]); el.checked = /\bchecked\b/.test(tag[0]); el.disabled = /\bdisabled\b/.test(tag[0]); elements.set(tag[2],el);
        }
        return {get,moveSettings(){},busy(){}};
    },
    mediaContext:async () => ({selected:[{id:'chosen',name:'本次所选文件夹'}],source:{},path:'影视库'}),
    collectMediaSelection:async () => { if (collectionError) throw Error('目录读取失败'); return {videos:empty ? [] : videos,linked}; },
    MEDIA_VIDEO:/\.(?:mkv|mp4)$/i, MEDIA_SUB:/\.(?:srt|ass|ssa|vtt)$/i,
    mediaSubtitleSuffix:(video,subtitle)=>{const stem=video.replace(/\.[^.]+$/,''),candidate=subtitle.replace(/\.[^.]+$/,'');return candidate.startsWith(stem)?candidate.slice(stem.length):null;},
    recycleMedia:async item=>{deleted.push(item.id);siblings.set(item.parentId,siblings.get(item.parentId).filter(node=>node.id!==item.id));},
    mediaContext:async()=>({selected:[{id:'chosen',name:'本次所选文件夹'}],session:{provider:'123',token:'test',base:'https://drive.example',headers:{}},source:{children:async({id})=>siblings.get(id)||[]},path:'影视库'}),
    parseMediaName:() => ({query:'同名影片',year:2020,tv:false}), mediaBonusName:() => false, mediaRecords:{get:() => null}, mediaStem:name => name.replace(/\.[^.]+$/,''),
    createSubtitleService:() => ({thunderSearch:async row => {
        queried.push(row.node.id);
        if (row.node.id === 'failure') throw Error('来源连接失败');
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
vm.runInContext(part('    function evict(', '    function nonNegativeInteger(') + part('    function subtitleDownloadUrl(', '    function subtitleDrive(') + part('    function subtitleInventory(', '    if (location.hostname'),ctx);
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
    assert.equal(reads,3,'Directory UI overlaps up to three subtitle reads: ' + get('subtitleProgress').textContent + ' / ' + get('subtitleCoverage').textContent + ' / ' + shown() + ' / ' + get('subtitleLog').value);
    assert.match(get('subtitleCoverage').textContent,/缺字幕 2 · 待核验 0 · 尚未检查 3/);
    assert.match(shown(),/尚未检查/);
    pauseRead = null; releaseRead(); await checking;
    assert.equal(reads,3); assert.equal(queried.length,0); assert.equal(saves,0);
    assert.equal(get('subtitleSummary').hidden,true,'Inventory alone shows coverage rather than empty provider statistics');
    assert.match(get('subtitleCoverage').textContent,/影视库.*本次所选文件夹/);
    assert.match(get('subtitleCoverage').textContent,/视频 5 · 已有可用字幕 1 · 缺字幕 3 · 待核验 1/);
    assert.doesNotMatch(get('subtitleCoverage').textContent,/尚未检查/);
    assert.equal(get('subtitleView').value,'incomplete'); assert.equal(get('subtitleRows').children.length,4);
    assert.ok(get('subtitleRows').children.every(group => !group.open),'Default groups show compact summaries; details expand on demand');
    assert.doesNotMatch(shown(),/\/目录0\//); assert.match(shown(),/缺字幕 · 未查询/); assert.match(shown(),/待核验/);
    for (let i = 1; i < 5; i++) assert.ok(shown().includes('/影视库/目录' + i + '/同名影片.2020.mkv'),'Full paths distinguish duplicate filenames');
    const collapsed = get('subtitleRows').children[0]; collapsed.open = false;
    await get('searchSubtitles').onclick();
    assert.deepEqual(queried,['ready','failure','invalid'],'Neither complete nor pending files are searched');
    assert.equal(get('subtitleSummary').hidden,false);
    assert.equal(get('subtitleRows').children[0].open,false,'Rerender preserves an explicitly collapsed group');
    assert.match(get('subtitleCoverage').textContent,/缺字幕 3 · 待核验 1/,'Search failure and search success both remain missing until upload succeeds');
    assert.match(shown(),/缺字幕 · 可补齐/); assert.match(shown(),/缺字幕 · 失败/); assert.match(shown(),/缺字幕 · 未找到/);
    view('choice'); assert.equal(get('subtitleRows').children.length,0); assert.equal(get('subtitleEmpty').hidden,false); assert.match(get('subtitleEmpty').textContent,/切换到“未补齐”/);
    await get('copyMissingSubtitles').onclick();
    assert.equal(copies.at(-1).split('\n').length,4,'Copy covers every unresolved path independently of the selected display filter');
    assert.doesNotMatch(copies.at(-1),/\/目录0\//); assert.match(copies.at(-1),/\/目录4\//);
    await get('copySubtitleReport').onclick(); assert.match(copies.at(-1),/本次所选文件夹/); assert.match(copies.at(-1),/缺字幕 3 · 待核验 1/);
    view('pending'); assert.equal(get('subtitleRows').children.length,1); assert.match(shown(),/\/目录4\//);
    view('complete'); assert.equal(get('subtitleRows').children.length,1); assert.match(shown(),/\/目录0\//);
    view('all'); assert.equal(get('subtitleRows').children.length,5);
    view('incomplete'); await get('fillSubtitles').onclick();
    assert.equal(saves,1); assert.match(get('subtitleCoverage').textContent,/已有可用字幕 2 · 缺字幕 2 · 待核验 1/);
    assert.doesNotMatch(shown(),/\/目录1\//); assert.equal(get('subtitleRows').children.length,3);
    await get('copyMissingSubtitles').onclick(); assert.equal(copies.at(-1).split('\n').length,3); assert.doesNotMatch(copies.at(-1),/\/目录1\//);
    view('choice'); await get('recheckSubtitles').onclick(); assert.equal(get('subtitleView').value,'incomplete','A new directory check exposes unresolved files even after choosing the choice-only filter');
    empty = true; await get('recheckSubtitles').onclick();
    assert.equal(get('subtitleCoverage').hidden,true); assert.equal(get('copyMissingSubtitles').disabled,true); assert.doesNotMatch(get('subtitleEmpty').textContent,/均已有/);
    empty = false; collectionError = true; await get('recheckSubtitles').onclick();
    assert.equal(get('subtitleCoverage').hidden,true); assert.equal(get('subtitleRows').children.length,0); assert.match(get('subtitleProgress').textContent,/目录读取失败/);
    collectionError = false; await get('recheckSubtitles').onclick(); view('all');
    const checkboxes=()=>get('subtitleRows').querySelectorAll('input');
    assert.equal(checkboxes().length,3,'Only subtitle files linked to a unique video are offered for deletion');
    checkboxes()[0].checked=true;checkboxes()[0].onchange();assert.equal(get('reviewSubtitleDeletes').disabled,false);
    get('reviewSubtitleDeletes').onclick();assert.match(get('subtitleDeleteList').textContent,/目录0\/同名影片\.2020\.zh-cn\.srt/);assert.equal(get('subtitleDeletePreview').open,true);
    const original=siblings.get('folder-complete')[1];original.name='其他影片.zh-cn.srt';await get('confirmSubtitleDeletes').onclick();assert.equal(deleted.length,0,'Stale subtitle name blocks deletion');assert.match(get('subtitleProgress').textContent,/失败 1 个/);
    original.name='同名影片.2020.zh-cn.srt';siblings.get('folder-complete')[0].name='另一个作品.mkv';get('reviewSubtitleDeletes').onclick();await get('confirmSubtitleDeletes').onclick();assert.equal(deleted.length,0,'Changed associated video blocks deletion');
    siblings.get('folder-complete')[0].name='同名影片.2020.mkv';get('reviewSubtitleDeletes').onclick();await get('confirmSubtitleDeletes').onclick();assert.deepEqual(deleted,['s-complete']);assert.match(get('subtitleCoverage').textContent,/已有可用字幕 0/,'Deletion triggers a fresh subtitle status check');
    console.log('PASS subtitle directory inventory: scan makes no provider/write calls; incomplete vs pending vs unchecked states, full paths, filters/empty states, collapse preservation, copy scope, fill updates, stale-scan clearing and previewed safe batch deletion (mocked API/DOM)');
})().catch(error => {console.error(error); process.exitCode = 1;});
