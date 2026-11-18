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
const valid = new TextEncoder().encode('1\n00:00:01,000 --> 00:20:03,000\n合成中文字幕 Test\n');
const linked = new Map(['complete','invalid','pending'].map(id => [id,[{id:'s-' + id, parentId:'folder-' + id, name:'同名影片.2020.zh-cn.srt',size:30}]]));
const siblings = new Map(videos.map(video => [video.parentId,[video,...(linked.get(video.id)||[])]]));
const elements = new Map(), queried = [], deleted = [];
let reads = 0, saves = 0, empty = false, collectionError = false, pauseRead = null, recycleResult = null, panelBusy = false;
let season = [], missingEpisodes = new Set(), protectedEpisodes = new Set();
let trackResult, restoreResult, listResult, reconcileResult, candidateResult;
const uploaded = [];
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
    collectMediaSelection:async () => { if (listResult) await listResult; if (collectionError) throw Error('目录读取失败'); return {videos:empty ? [] : season.length ? season : videos,linked}; },
    MEDIA_VIDEO:/\.(?:mkv|mp4)$/i, MEDIA_SUB:/\.(?:srt|ass|ssa|vtt)$/i,
    mediaSubtitleSuffix:(video,subtitle)=>{const stem=video.replace(/\.[^.]+$/,''),candidate=subtitle.replace(/\.[^.]+$/,'');return candidate.startsWith(stem)?candidate.slice(stem.length):null;},
    recycleMedia:async item=>{
        if (recycleResult) await recycleResult();
        deleted.push(item.id);
        siblings.set(item.parentId,siblings.get(item.parentId).filter(node=>node.id!==item.id));
    },
    mediaContext:async()=>({selected:[{id:'chosen',name:'本次所选文件夹'}],session:{provider:'123',token:'test',base:'https://drive.example',headers:{}},source:{children:async({id})=>siblings.get(id)||[]},path:'影视库'}),
    parseMediaName:name => {
        const episode = name.match(/S01E(\d+)/)?.[1];
        return episode ? {query:name.startsWith('第二部') ? '第二部' : '假面骑士双骑',year:2009,tv:true,season:1,episode:Number(episode)} : {query:'同名影片',year:2020,tv:false};
    }, mediaBonusName:() => false, mediaRecords:{get:() => null,restore:(...args)=>restoreResult?.(...args)}, mediaStem:name => name.replace(/\.[^.]+$/,''),
    createSubtitleService:() => ({thunderSearch:async row => {
        queried.push(row.node.id);
        if (candidateResult) return candidateResult(row);
        if (row.node.id === 'failure' || row.node.id === 'ep-48') throw Object.assign(Error('来源连接失败'),{phase:'subtitle-source'});
        if (row.node.id === 'ep-47') return [{source:'迅雷',name:'假面骑士双骑.S01E47.简体.srt',language:'zh-cn'}];
        if (row.node.id === 'invalid') return [{source:'迅雷',name:'未确认字幕.srt',language:'zh-cn'}];
        return row.node.id === 'ready' ? [{source:'迅雷',name:'同名影片.2020.简体.srt',language:'zh-cn',titleMatched:true}] : [];
    },fetchFile:async () => ({result:{ext:'srt'},bytes:valid})}),
    subtitleDrive:() => ({verified:{get(){},forget(){}},reconcile:async row => { await reconcileResult?.(row); return []; },
        inspectEmbedded:async node => {
            if (trackResult) return trackResult(node);
            if (!node.id.startsWith('ep-')) return;
            if (node.id === 'ep-49' && missingEpisodes.has(node.id)) return {unconfirmed:true,message:'内嵌字幕检查失败'};
            return {chinese:!missingEpisodes.has(node.id),message:'内嵌字幕检查完成'};
        },
        read:async sub => {
            reads++; if (pauseRead) await pauseRead;
            if (sub.id === 's-pending') throw Error('读取连接失败');
            return sub.id === 's-invalid' || protectedEpisodes.has(sub.id) ? new TextEncoder().encode('<html>错误页</html>') : valid;
        },save:async row => {saves++; uploaded.push(row.node.id); return {id:'uploaded',name:'同名影片.2020.zh-cn.srt'};}})
});
const serviceFactory = ctx.createSubtitleService;
vm.runInContext(part('    function evict(', '    function nonNegativeInteger(') + part('    function subtitleDownloadUrl(', '    function subtitleDrive(') + part('    function createPanelTask(', '    function panelControls(') + part('    function subtitleInventory(', '    if (location.hostname'),ctx);
ctx.createSubtitleService = serviceFactory;
const cards = () => get('subtitleRows').children;
const shown = () => get('subtitleRows').querySelectorAll('p').map(row => row.textContent).join('\n');
const action = (label, root=get('subtitleRows')) => {
    const button = root.querySelectorAll('button').find(node => node.textContent === label);
    assert.ok(button,label); button.onclick();
};
const view = value => {get('subtitleView').value = value; get('subtitleView').onchange();};

(async () => {
    ctx.initSubtitles();
    assert.equal(get('subtitleView').value,'incomplete');
    assert.equal(get('recheckSubtitles').disabled,false,'Directory inventory is available without first searching providers');
    let releaseRead;
    pauseRead = new Promise(resolve => {releaseRead = resolve;});
    const checking = get('recheckSubtitles').onclick();
    // Three existing-subtitle reads may overlap; rows without files finish first.
    for (let i = 0; i < 100 && reads < 3; i++) await Promise.resolve();
    assert.equal(reads,3,'Directory UI overlaps up to three subtitle reads: ' + get('subtitleProgress').textContent + ' / ' + shown() + ' / ' + get('subtitleLog').value);
    assert.equal(elements.has('subtitleCoverage'),false,'The redundant coverage card is removed from the UI');
    assert.match(shown(),/检查中/);
    assert.match(get('subtitleSummary').textContent,/已检查 2 · 待检查 3/);
    assert.equal(get('fillSubtitles').disabled,true);
    pauseRead = null; releaseRead(); await checking;
    assert.equal(reads,3); assert.equal(queried.length,0); assert.equal(saves,0);
    assert.equal(get('subtitleSummary').hidden,false);
    assert.match(get('subtitleSummary').textContent,/已检查 5 · 待检查 0/);
    assert.equal(get('subtitleView').value,'incomplete'); assert.equal(cards().length,4);
    assert.ok(!cards()[0].textContent.includes('有字幕'));
    view('all'); assert.equal(cards().length,5);
    assert.equal(get('subtitleRows').querySelectorAll('details').length,0,'Results show details without disclosure controls');
    assert.match(shown(),/有字幕\n/); assert.match(shown(),/没字幕/); assert.match(shown(),/读取连接失败/);
    assert.equal(elements.has('subtitleViewPending'),false);
    for (const [index] of videos.entries()) assert.ok(get('subtitleLog').value.includes('/影视库/目录' + index + '/同名影片.2020.mkv'),'Full paths remain in the copyable log');
    assert.match(get('subtitleScope').textContent,/影视库.*本次所选文件夹.*视频 5/);
    await get('readSubtitles').onclick();
    assert.equal(reads,3,'Searching reuses the checked inventory without reading subtitle bodies again');
    assert.deepEqual(queried,['ready','failure','invalid','pending'],'Only files with usable subtitles are skipped');
    assert.equal(get('subtitleSummary').hidden,false);
    assert.equal(cards().length,5,'All results remain visible after searching');
    assert.match(shown(),/缺可用字幕/); assert.match(shown(),/手动选择/); assert.match(shown(),/来源连接失败/);
    view('choice'); assert.equal(cards().length,1); assert.match(shown(),/手动选择/);
    view('complete'); assert.equal(cards().length,1); assert.match(shown(),/有字幕/);
    view('all'); assert.equal(cards().length,5);
    view('incomplete'); await get('fillSubtitles').onclick();
    assert.equal(saves,1);
    assert.doesNotMatch(shown(),/\/目录1\//); assert.equal(cards().length,3);
    view('choice'); await get('recheckSubtitles').onclick(); assert.equal(get('subtitleView').value,'incomplete','A new directory check resets the previous filter');
    empty = true; await get('recheckSubtitles').onclick();
    assert.equal(cards().length,0); assert.equal(get('fillSubtitles').disabled,true); assert.doesNotMatch(get('subtitleEmpty').textContent,/均已有/);
    empty = false; collectionError = true; await get('recheckSubtitles').onclick();
    assert.equal(elements.has('subtitleCoverage'),false); assert.equal(cards().length,0); assert.match(get('subtitleProgress').textContent,/目录读取失败/);
    collectionError = false; await get('recheckSubtitles').onclick();
    view('all');
    const checkboxes=()=>get('subtitleRows').querySelectorAll('input');
    assert.equal(checkboxes().length,0,'Cards do not show individual deletion checkboxes');
    const selectAll = get('selectAllSubtitleDeletes');
    const toggleAll = checked => {selectAll.checked = checked; selectAll.onchange();};
    assert.equal(selectAll.disabled,false); assert.equal(selectAll.checked,false);
    toggleAll(true); assert.equal(get('subtitleDeleteSelectionCount').textContent,'已选 3 项');
    get('reviewSubtitleDeletes').onclick(); assert.equal(get('subtitleDeletePreview').open,true);
    view('incomplete'); assert.equal(selectAll.checked,true);
    toggleAll(false); assert.equal(get('subtitleDeletePreview').hidden,true,'Changing selection invalidates the previous confirmation');
    view('all'); assert.equal(selectAll.indeterminate,true);
    assert.equal(get('subtitleDeleteSelectionCount').textContent,'已选 1 项');
    view('choice'); assert.equal(selectAll.disabled,true);
    view('all'); toggleAll(false); assert.equal(get('subtitleDeleteSelectionCount').hidden,true);
    action('选择外置字幕',cards()[0]);
    assert.equal(checkboxes().length,1);
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
    assert.equal(cards()[0].querySelectorAll('button').length,0,'An unconfirmed recycle result cannot be selected again');
    assert.equal(get('reviewSubtitleDeletes').disabled,true);
    await get('recheckSubtitles').onclick();
    view('complete');
    action('选择外置字幕');
    checkboxes()[0].checked=true;checkboxes()[0].onchange();
    get('reviewSubtitleDeletes').onclick();await get('confirmSubtitleDeletes').onclick();
    assert.deepEqual(deleted,['s-complete']);assert.match(get('subtitleProgress').textContent,/已移入回收站 1 个/,'A fresh check lets the user confirm a new deletion plan');
    await seasonSummary();
    await incrementalChecks();
    await seasonPlans();
    await stageProgress();
    console.log('PASS subtitle directory inventory: scan makes no provider/write calls; expanded results, full paths, filters/empty states, fill updates, stale-scan clearing and previewed safe batch deletion (mocked API/DOM)');
})().catch(error => {console.error(error); process.exitCode = 1;});

async function seasonSummary() {
    season = Array.from({length:49}, (_, index) => {
        const name = '假面骑士双骑.S01E' + String(index + 1).padStart(2,'0') + '.mkv';
        return {id:'ep-' + (index + 1),parentId:'season-1',name,size:10000,folders:['双骑'],path:'双骑/' + name};
    });
    const results = get('subtitleRows');
    const summary = () => cards()[0].children.find(node => node.className === 'subtitle-group-count').textContent;
    const controls = () => results.querySelectorAll('select');
    const queriesBefore = queried.length;
    await get('recheckSubtitles').onclick();
    view('all');
    assert.equal(cards().length,1);
    assert.match(summary(),/共 49 集/);
    assert.match(shown(),/有字幕（内嵌中文） 49 集 · 01—49 集/);
    assert.equal(controls().length,0);
    assert.equal(results.querySelectorAll('details').length,0,'Completed episodes use a summary without disclosure');
    assert.match(get('subtitleLog').value,/\/影视库\/双骑\/.*S01E49\.mkv/);
    await get('readSubtitles').onclick();
    assert.equal(queried.length,queriesBefore);

    missingEpisodes = new Set(['ep-47','ep-48','ep-49']);
    const sub = {id:'season-sub',name:season[0].name.replace('.mkv','.zh-cn.srt'),parentId:'season-1',size:30};
    linked.set('ep-1',[sub]);
    siblings.set('season-1',[...season,sub]);
    await get('recheckSubtitles').onclick();
    view('all');
    assert.match(summary(),/共 49 集/);
    assert.match(shown(),/有字幕 46 集 · 01—46 集/);
    assert.match(shown(),/没字幕 2 集 · 47—48 集/);
    assert.match(shown(),/检查未确认 1 集 · 49 集/);
    assert.equal(controls().length,0);
    assert.equal(results.querySelectorAll('details').length,0);
    const protectedSub = {id:'protected-sub',name:season[1].name.replace('.mkv','.zh-cn.srt'),parentId:'season-1',size:30};
    protectedEpisodes.add(protectedSub.id);
    linked.set('ep-2',[protectedSub]);
    siblings.set('season-1',[...season,sub,protectedSub]);
    await get('recheckSubtitles').onclick();
    view('all');
    assert.equal(results.querySelectorAll('input').length,0);
    action('选择本季外置字幕');
    assert.equal(results.querySelectorAll('input').length,1,'Protected embedded items stay out of the deletion view');
    action('返回结果');
    let checkedRow;
    reconcileResult = row => { if (row.node.id === 'ep-1') checkedRow = row; };
    await get('recheckSubtitles').onclick();
    view('all');
    reconcileResult = null;
    const selectAll = get('selectAllSubtitleDeletes');
    selectAll.checked = true; selectAll.onchange();
    get('reviewSubtitleDeletes').onclick();
    assert.equal(get('subtitleDeletePreview').open,true);
    checkedRow.embedded = {chinese:true,message:'后来确认内嵌中文'};
    await get('confirmSubtitleDeletes').onclick();
    assert.ok(!deleted.includes(sub.id),'Confirmation rechecks eligibility even with an existing preview');
    assert.equal(get('subtitleDeleteSelectionCount').hidden,true);
    await get('recheckSubtitles').onclick();
    view('all');
    selectAll.checked = true; selectAll.onchange();
    assert.equal(get('subtitleDeleteSelectionCount').textContent,'已选 1 项');
    view('incomplete');
    assert.match(summary(),/共 49 集.*当前筛选 3 集/);
    assert.equal(get('subtitleDeleteSelectionCount').textContent,'已选 1 项 · 当前筛选 0 项');
    get('reviewSubtitleDeletes').onclick();
    assert.equal(get('subtitleDeleteHeading').textContent,'确认删除清单（1 项）');
    assert.match(get('subtitleDeleteList').textContent,/S01E01\.zh-cn\.srt/);
    assert.doesNotMatch(get('subtitleDeleteList').textContent,/S01E02/);
    assert.ok(!deleted.includes(sub.id),'Opening the preview never recycles files');
    await get('confirmSubtitleDeletes').onclick();
    assert.equal(deleted.at(-1),sub.id,'A filtered selection follows the normal confirmation flow');
    assert.ok(!deleted.includes(protectedSub.id));
    linked.delete('ep-1');

    view('complete');
    assert.match(summary(),/共 49 集.*当前筛选 46 集/);
    view('incomplete'); view('all');
    get('subtitleResults').scrollTop = 100;
    await get('readSubtitles').onclick();
    assert.deepEqual(queried.slice(queriesBefore).sort(),['ep-47','ep-48','ep-49']);
    assert.match(shown(),/需手选 1 集 · 47 集/);
    assert.match(shown(),/查询失败 1 集，请查看日志/);
    assert.equal(controls().length,1);
    action('处理待确认项');
    const candidate = controls()[0];
    get('subtitleResults').scrollTop = 100;
    candidate.value = '0'; candidate.onchange();
    assert.equal(get('subtitleResults').scrollTop,100,'Candidate changes retain scroll position');
    await get('fillSubtitles').onclick();
    assert.equal(saves,2);
    assert.equal(get('subtitleResults').scrollTop,100);
    action('返回结果');
    assert.match(shown(),/有字幕 47 集 · 01—47 集/);
    await get('recheckSubtitles').onclick();
    assert.equal(get('subtitleResults').scrollTop,0,'A new check resets the list');

    season = [season[0], {...season[1],parentId:'another-directory'},
        {...season[2],name:season[2].name.replace('.mkv','.1080p.mkv')},
        {...season[3],name:season[3].name.replace('.mkv','.导演剪辑.mkv')}];
    await get('recheckSubtitles').onclick();
    view('all');
    assert.equal(cards().length,4,'Same-title directories and different releases remain separate');
    assert.equal(results.querySelectorAll('details').length,0,'Single results show their details directly');
    console.log('PASS season summaries: 49 episodes, mixed states, direct details, filtered selection and confirmed deletion');
}

async function seasonPlans() {
    trackResult = node => ({chinese:node.id === 'plan-4'});
    candidateResult = row => {
        const {episode} = row.parsed;
        return [{source:'SubDL',name:'假面骑士双骑.S01.zip',url:'https://example.com/season.zip',language:'zh-cn',
            titleMatched:episode < 4,seasonPackVerified:episode < 4,parsed:{...row.parsed,episode:episode === 3 ? 2 : episode}}];
    };
    season = Array.from({length:49}, (_,index) => {
        const name = '假面骑士双骑.S01E' + String(index+1).padStart(2,'0') + '.mkv';
        return {id:'plan-'+(index+1),parentId:'plan-season',name,size:10000,folders:['方案'],path:'方案/'+name};
    });
    const controls = () => get('subtitleRows').querySelectorAll('select');
    await get('recheckSubtitles').onclick();
    assert.equal(cards().length,1);
    assert.equal(controls().length,0);
    assert.match(shown(),/没字幕 48 集 · 01—03、05—49 集/);
    await get('readSubtitles').onclick();
    assert.equal(cards().length,1);
    assert.equal(controls().length,1);
    assert.match(controls()[0].children[1].textContent,/覆盖待补 2\/48 集/);
    controls()[0].value = '0'; controls()[0].onchange();
    const before = uploaded.length;
    await get('fillSubtitles').onclick();
    assert.deepEqual(uploaded.slice(before),['plan-1','plan-2'],'An explicit pack only fills verified episodes');
    await get('recheckSubtitles').onclick();
    assert.equal(controls().length,0,'A new inventory removes all plan controls');
    assert.equal(get('fillSubtitles').disabled,true);
}

async function stageProgress() {
    const bar = get('subtitleMeter');
    trackResult = () => ({chinese:false});
    season = Array.from({length:319}, (_,index) => {
        const episode = index < 160 ? index+1 : index-159;
        const name = (index < 160 ? '第一部' : '第二部') + '.S01E' + String(episode).padStart(2,'0') + '.mkv';
        const folder = index < 160 ? '进度甲' : '进度乙';
        return {id:'progress-'+index,parentId:folder,name,size:10000,folders:[folder],path:folder+'/'+name};
    });
    await get('recheckSubtitles').onclick();
    assert.deepEqual([bar.value,bar.max,bar.hidden],[319,319,false]);
    const wait = gate(), started = [];
    candidateResult = async row => {
        started.push(row.node.id);
        if (row.node.id === 'progress-0' || row.node.id === 'progress-160') await wait.promise;
        if (row.node.id === 'progress-3') throw Object.assign(Error('来源网络中断'),{phase:'subtitle-source'});
        return row.node.id === 'progress-2' ? [{source:'迅雷',name:'合成简体.srt',language:'zh-cn',titleMatched:true}] : [];
    };
    const searching = get('readSubtitles').onclick();
    await until(() => started.length === 2);
    assert.deepEqual([bar.value,bar.max,bar.hidden],[0,319,false]);
    wait.resolve();
    await searching;
    assert.deepEqual([bar.value,bar.max,bar.hidden],[319,319,false]);
    assert.match(get('subtitleProgress').textContent,/已处理 319\/319.*1 项遇到来源错误/);
    await get('fillSubtitles').onclick();
    assert.deepEqual([bar.value,bar.max,bar.hidden],[1,1,false]);
    await get('fillSubtitles').onclick();
    assert.deepEqual([bar.value,bar.max,bar.hidden],[0,1,true]);

    for (const authFailure of [false,true]) {
        const a = gate(), b = gate(), visited = [];
        candidateResult = async row => {
            const id = row.node.id;
            visited.push(id);
            if (id === 'progress-160') await b.promise;
            if (id === 'progress-1') await a.promise;
            return [];
        };
        const interrupted = get('readSubtitles').onclick();
        await until(() => bar.value === 1 && visited.includes('progress-1') && visited.includes('progress-160'));
        if (authFailure) a.reject(Object.assign(Error('网盘登录失效'),{phase:'drive-auth',status:401,stop:true}));
        else { get('stopSubtitles').onclick(); a.resolve(); }
        for (let i=0;i<30;i++) await Promise.resolve();
        assert.equal(panelBusy,true);
        b.resolve();
        await interrupted;
        assert.deepEqual([bar.value,bar.max,bar.hidden],[1,318,false]);
        assert.match(get('subtitleProgress').textContent,/已处理 1\/318/);
        assert.deepEqual(visited.sort(),['progress-0','progress-1','progress-160']);
    }
    console.log('PASS stage progress: 319 completed items, two concurrent works, resets, partial stop and authorization drain');
}

function gate() {
    let resolve, reject;
    const promise = new Promise((yes,no) => {resolve=yes; reject=no;});
    return {promise,resolve,reject};
}

async function until(condition) {
    for (let i=0; i<250 && !condition(); i++) await Promise.resolve();
    assert.ok(condition(),'Expected state was never shown: ' + get('subtitleProgress').textContent);
}

async function incrementalChecks() {
    season = Array.from({length:49}, (_,index) => {
        const name = '假面骑士双骑.S01E' + String(index+1).padStart(2,'0') + '.mkv';
        return {id:'row-'+index,parentId:'progress-season',name,size:10000,folders:['双骑'],path:'双骑/'+name};
    });
    const traversal = gate(), metadata = gate(), track = gate(), auth = gate();
    const started = [], reconciled = [], beforeQueries = queried.length, beforeDeletes = deleted.length, beforeSaves = saves;
    listResult = traversal.promise;
    restoreResult = (node) => {
        started.push(node.id);
        if (node.id === 'row-1') return metadata.promise;
    };
    reconcileResult = row => {
        reconciled.push(row.node.id);
        if (row.node.id === 'row-2') return auth.promise;
    };
    trackResult = node => node.id === 'row-3' ? track.promise : {chinese:true,message:'有内嵌中文字幕'};
    const scan = get('recheckSubtitles').onclick();
    assert.match(get('subtitleProgress').textContent,/读取目录/);
    assert.equal(get('subtitleSummary').hidden,true);
    traversal.resolve(); listResult = null;
    await until(() => /已检查 1 · 待检查 48/.test(get('subtitleSummary').textContent) && started.includes('row-3'));
    assert.deepEqual(started,['row-0','row-1','row-2','row-3']);
    assert.ok(!reconciled.includes('row-1'),'Identity restoration must finish before the subtitle check');
    assert.match(shown(),/检查中/);
    assert.match(shown(),/待检查/);
    view('all');
    assert.equal(cards().length,1);
    assert.match(shown(),/有字幕（内嵌中文） 1 集 · 01 集/);
    assert.match(shown(),/待检查／检查中 48 集 · 02—49 集/);
    get('subtitleResults').scrollTop = 73;
    assert.equal(get('selectAllSubtitleDeletes').disabled,true);
    assert.equal(get('fillSubtitles').disabled,true);
    assert.equal(get('confirmSubtitleDeletes').disabled,true);
    for (const id of ['readSubtitles','fillSubtitles','confirmSubtitleDeletes']) await get(id).onclick();
    assert.equal(saves,beforeSaves);
    assert.equal(deleted.length,beforeDeletes);
    assert.equal(queried.length,beforeQueries);
    auth.reject(Object.assign(Error('HTTP 403'),{status:403,phase:'drive-auth'}));
    for (let i=0; i<30; i++) await Promise.resolve();
    assert.equal(panelBusy,true,'Authorization failure drains the already-active rows');
    metadata.resolve(); track.resolve({chinese:true,message:'旧检查不得追加'});
    await scan;
    assert.equal(panelBusy,false);
    assert.deepEqual(started,['row-0','row-1','row-2','row-3'],'Authorization failure stops new rows');
    assert.match(get('subtitleSummary').textContent,/已检查 1 · 未检查完成 48/);
    assert.match(shown(),/未检查完成 48 集 · 02—49 集/);
    assert.equal(get('subtitleResults').scrollTop,73);
    assert.doesNotMatch(shown(),/旧检查不得追加/);
    assert.equal(get('fillSubtitles').disabled,true);
    await get('fillSubtitles').onclick();
    assert.equal(saves,beforeSaves);
    assert.equal(get('reviewSubtitleDeletes').disabled,true);

    const stopGate = gate();
    restoreResult = node => node.id === 'row-1' || node.id === 'row-2' || node.id === 'row-3' ? stopGate.promise : undefined;
    reconcileResult = null;
    const stopped = get('readSubtitles').onclick();
    await until(() => /已检查 1 · 待检查 48/.test(get('subtitleSummary').textContent));
    assert.equal(get('subtitleResults').scrollTop,0,'Searching after a partial check starts a new inventory');
    get('stopSubtitles').onclick();
    assert.equal(panelBusy,true);
    stopGate.resolve();
    await stopped;
    assert.match(get('subtitleSummary').textContent,/已检查 1 · 未检查完成 48/);
    assert.equal(queried.length,beforeQueries);
    restoreResult = null;
    trackResult = () => ({chinese:true,message:'新一轮检查完成'});
    await get('recheckSubtitles').onclick();
    assert.match(get('subtitleSummary').textContent,/已检查 49 · 待检查 0/);
    assert.equal(cards().length,0);
    view('all');
    assert.equal(cards().length,1);
    assert.match(shown(),/有字幕（内嵌中文） 49 集 · 01—49 集/);
    assert.equal(get('subtitleRows').querySelectorAll('details').length,0);
    assert.equal(get('selectAllSubtitleDeletes').disabled,true);
    console.log('PASS incremental inventory: placeholders, row streaming, authorization drain, stop, and clean restart');
}
