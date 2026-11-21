const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const bootstrap = source.lastIndexOf("    if (location.hostname === 'www.guangyapan.com')");
assert.ok(bootstrap > 0);
const encoded = text => new TextEncoder().encode(text);
const lang = 'zh-cn,zh-tw,zh';
const srt = '1\n00:00:01,000 --> 00:20:03,000\n合成中文字幕\n';
const video = (id,name,folder='目录') => ({id,parentId:folder,name,size:1234,folders:[folder],path:folder+'/'+name});
function fixture(assrtApi) {
    const memory = new Map(), state = {writes:0,lists:0,entries:[],response:'ok'};
    const ctx = vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,Blob,DecompressionStream,
        location:{hostname:'www.123pan.com'},setTimeout:fn=>setTimeout(fn,0),window:{fetch:()=>assert.fail('Unexpected network')},
        sourceQueries:state.sourceQueries = [], fixtureSubtitleSearch:async () => ({code:0,data:[{name:'电影.2000.BluRay.简体.srt',url:'https://subtitle.example/file.srt'}]}),
        GM_getValue:(key,fallback)=>memory.get(key) ?? fallback,GM_setValue:(key,value)=>memory.set(key,value),
        assrtApi, fixtureRequest:async (url,options) => {
            const input = JSON.parse(options.body);
            if (state.organize && url.endsWith('/file/rename')) {
                state.mutations++;
                state.entries.find(file => file.id === input.fileId).name = input.fileName;
                return {code:0};
            }
            assert.match(url,/\/file\/upload_request$/,'Subtitle phase only calls upload, never rename or move');
            assert.equal(input.duplicate,0);
            state.writes++;
            state.entries.push({id:'uploaded',name:input.fileName,size:input.size,md5:input.etag});
            if (state.response === 'lost') throw Error('连接断开');
            return {code:0,data:{Reuse:true}};
        }});
    vm.runInContext(source.slice(0,bootstrap) + '\nrequestJson = fixtureRequest; subtitleRemoteJson = assrtApi || (url => { sourceQueries.push(new URL(url).searchParams.get("name")); return fixtureSubtitleSearch(); }); globalThis.api = {subtitleInventory, subtitleImportGroups, planSubtitleImport, checkSubtitleImportDirectory, savePanelSubtitle, subtitleDrive, subtitleMd5, mediaFileHistory, mediaSubtitleLinks, readSubtitleImport, mediaOrganizerWriter, searchSubtitleSources, createSubtitleService}; })();',ctx);
    const collect = (videos,linked=new Map()) => ctx.api.subtitleInventory({videos,linked},'影视');
    return {api:ctx.api,memory,state,collect};
}
const entry = (name,text=srt) => ({name,label:name,ext:name.split('.').pop(),bytes:typeof text === 'string' ? encoded(text) : text});

function matching() {
    const {api,collect} = fixture();
    const plan = (entries,rows,confirmed=new Set()) => api.planSubtitleImport(entries,rows,lang,confirmed,()=>{});
    const movies = collect([video('film','电影.2000.mkv')]);
    const ass = '[Events]\nFormat: Start, End, Text\nDialogue: 0:00:01.00,0:20:03.00,合成中文字幕';
    const episodeNumbers = Array.from({length:51},(_,index) => String(index + 1).padStart(2,'0'));
    const agito = collect(episodeNumbers.map(number => video(number,'[DBD-Raws][假面骑士Agito][' + number + '][1080P][BDRip].mkv')));
    for (const row of agito) {
        Object.assign(row.parsed,{tv:true,season:1,aliases:['假面骑士亚极陀']});
        row.media = {detail:{seasons:[{season_number:1,episode_count:51}]}};
    }
    const pack = [...episodeNumbers.map(number => '假面骑士亚极陀 - ' + number + '.ass'),'假面骑士亚极陀 剧场版 - G4计划（导演剪辑版）.ass']
        .map(name => ({...entry(name,ass),archiveName:'[假面骑士亚极陀][TV_01-51][BD][Sub].zip'}));
    const checkedPack = plan(pack,agito);
    assert.deepEqual(Array.from(checkedPack.filter(item => item.state === 'ready'),item => item.row.node.id),episodeNumbers);
    assert.equal(checkedPack.at(-1).state,'unmatched');
    const vtt = 'WEBVTT\n\n00:01.000 --> 20:03.000\n合成中文字幕';
    for (const [ext,text] of [['srt',srt],['ass',ass],['ssa',ass],['vtt',vtt]]) {
        const [checked] = plan([entry('电影.2000.'+ext,text)],movies);
        assert.equal(checked.state,'ready',checked.reason);
        assert.equal(checked.name,'电影.2000.'+ext);
        assert.equal(checked.verification.evidence,'unknown');
    }
    for (const text of ['', '<html>中文</html>', new Uint8Array([255,128,255]),
        srt.replace('00:20:03,000','00:60:03,000'),srt.replace('合成中文字幕','English only')]) {
        assert.equal(plan([entry('电影.2000.srt',text)],movies)[0].state,'invalid');
    }
    const generic = entry('字幕.srt');
    assert.equal(plan([generic],movies)[0].needsIdentity,true);
    assert.equal(plan([generic],movies,new Set([generic]))[0].state,'ready');
    for (const name of ['电影.2001.srt','电影.2000.导演剪辑.srt','其他电影.2000.srt']) {
        assert.equal(plan([entry(name)],movies)[0].state,'unmatched');
    }
    const episodes = collect([video('one','剧名.2020.S01E01.mkv'),video('two','剧名.2020.S01E02.mkv'),
        video('elsewhere','剧名.2020.S01E01.mkv','另一目录'),video('version','剧名.2020.S01E01.1080p.BluRay.mkv')]);
    const groups = api.subtitleImportGroups(episodes);
    assert.deepEqual(Array.from(groups,rows=>rows.length),[2,1,1]);
    const season = groups[0];
    const one = entry('剧名.S01E01.srt'), two = entry('剧名.S01E02.srt');
    for (const files of [[one,two],[two,one]]) {
        assert.deepEqual(Array.from(plan(files,season),item=>[item.state,item.row.node.id]).sort(),[['ready','one'],['ready','two']]);
    }
    for (const name of ['01.srt','剧名.S02E01.srt','剧名.S01E01-E02.srt','剧名.S01E01E02.srt','别的剧.S01E01.srt']) {
        assert.equal(plan([entry(name)],season)[0].state,'unmatched',name);
    }
    assert.equal(plan([one],[...season,season[0]])[0].state,'unmatched');
    assert.equal(plan([one],[{...season[0],parsed:{...season[0].parsed,endEpisode:2}}])[0].state,'unmatched');
    assert.match(plan([one,entry('剧名.S01E01.ass',ass)],season)[0].reason,/多份字幕/);
    const short = '1\n00:00:01,000 --> 00:00:59,200\n一条中文对白\n';
    const padded = short + ' '.repeat(637 - encoded(short).length);
    assert.match(plan([entry(one.name,padded)],season)[0].reason,/字幕可疑/);
    season[0].embedded = {chinese:true}; season[1].complete = true;
    assert.ok(plan([one,two],season).every(item=>item.state === 'skip'));
    console.log('PASS local subtitle plans: 4 formats, real body validation, identity, timing, duplicate and coverage protection');
}


async function organizeAfterUpload() {
    await onlineSeasonSearch();
    const {api,state,collect} = fixture();
    const node = {...video('v','电影.2000.BluRay-GROUP.mkv'),md5:'a'.repeat(32)};
    const session = {provider:'123',token:'test',parent:node.parentId,base:'https://api.123pan.com',headers:{}};
    const source = {children:async () => state.entries.map(file => ({...file}))};
    const openHistory = () => api.mediaFileHistory(session);
    const before = api.mediaOrganizerWriter(session,source);
    state.entries = [{...node}];
    const item = {node:{...node},destination:'电影.2000.mkv',videoId:'v'};
    await before.prepare([item]);
    const row = collect([node])[0];
    row.history = openHistory();
    const [file] = await api.readSubtitleImport([{name:'电影.2000.简体.srt',size:encoded(srt).length,arrayBuffer:async()=>encoded(srt).buffer}],()=>{});
    const [plan] = api.planSubtitleImport([file],[row],lang,new Set());
    assert.equal(plan.state,'ready',plan.reason);
    await api.subtitleDrive({session,source}).save(row,plan.name,plan.bytes,undefined,undefined,{language:plan.language,
        beforeWrite:nodes=>api.checkSubtitleImportDirectory(row,plan.name,nodes)});
    assert.equal(state.writes,1);
    await assert.rejects(before.validate(),/关联字幕在预览后变化/);
    const link = history => api.mediaSubtitleLinks(state.entries,node.parentId,history).linked.get(node.id) || [];
    const [sub] = link(openHistory());
    assert.equal(sub.name, file.name);
    assert.equal(sub.suffix,'.zh-cn');
    assert.equal(link(api.mediaFileHistory({...session,token:'other'})).length,0);
    assert.equal(api.mediaSubtitleLinks(state.entries,'other-folder',openHistory()).linked.size,0);
    const legacy = {...sub,id:'legacy',name:'电影.2000.BluRay-GROUP.en.srt'};
    assert.equal(api.mediaSubtitleLinks([node,legacy],node.parentId,openHistory()).linked.get(node.id)[0].id,'legacy');
    assert.equal(api.mediaSubtitleLinks([node,{...node,id:'dup',name:node.name.replace('mkv','mp4')},legacy],node.parentId,openHistory()).linked.size,0);
    const writer = api.mediaOrganizerWriter(session,source);
    const caption = {node:sub,destination:'电影.2000'+sub.suffix+'.srt',videoId:'v'};
    await writer.prepare([item,caption]);
    state.organize = true; state.mutations = 0;
    await writer.validate();
    await writer.execute(item);
    await writer.execute(caption);
    assert.equal(state.mutations,2);
    assert.equal(link(openHistory())[0].name,'电影.2000.zh-cn.srt');
    const original = openHistory().get(item.node,node.parentId).original;
    assert.equal(original,node.name);
    const compare = async current => {
        state.sourceQueries.length = 0;
        const result = await api.createSubtitleService().thunderSearch({node:current,parsed:{query:'电影',year:2000,tv:false}},{language:lang});
        return [state.sourceQueries[0],result[0].name];
    };
    assert.deepEqual(await compare(node),['电影.2000.BluRay-GROUP','电影.2000.BluRay.简体.srt']);
    assert.deepEqual(await compare({...item.node,originalName:original}),await compare(node));
    console.log('PASS original-name upload, stale preview rejection, account and directory recheck, legacy fallback, and retained original after confirmed organization');
}

async function onlineSeasonSearch() {
    const numbers = Array.from({length:51},(_,index) => String(index+1).padStart(2,'0'));
    const files = numbers.map(number => ({f:'假面骑士亚极陀 - '+number+'.ass',url:'https://file0.assrt.net/'+number}));
    files.push({f:'假面骑士亚极陀 剧场版 - G4计划.ass',url:'https://file0.assrt.net/g4'});
    const calls = [];
    const {api,collect} = fixture(async (url,options) => {
        assert.equal(new URLSearchParams(options.body).get('token'),'example');
        calls.push(url);
        return {status:0,sub:{subs:url.endsWith('/search') ? [{id:646618}] : [{id:646618,lang:{desc:'简'},filename:'[假面骑士亚极陀][TV_01-51][BD][Sub].zip',filelist:files}]}};
    });
    const rows = collect(numbers.map(number => video(number,'[DBD-Raws][假面骑士Agito]['+number+'][1080P].mkv')));
    for (const target of rows) {
        Object.assign(target.parsed,{tv:true,season:1,aliases:['假面骑士亚极陀']});
        target.media = {detail:{seasons:[{season_number:1,episode_count:51}]}};
    }
    const service = api.createSubtitleService(), config = {assrtKey:'example',language:lang};
    await service.prepareSeason(rows,config);
    for (const target of rows) {
        await api.searchSubtitleSources(target,config,service);
        assert.equal(target.selectedCandidate?.source,'射手网');
        assert.equal((await service.download(target.selectedCandidate,config)).url,'https://file0.assrt.net/'+target.node.id);
    }
    assert.equal(calls.length,2);
}

async function upload() {
    for (const scenario of ['new-subtitle','moved','collision','ok','lost']) {
        const {api,state,memory,collect} = fixture();
        const node = video('v','电影.2000.mkv');
        const row = collect([node])[0];
        const session = {provider:'123',token:'test',base:'https://api.123pan.com',headers:{}};
        const drive = () => api.subtitleDrive({session,source:{children:async request=>{
            assert.equal(request.id,node.parentId);
            state.lists++;
            return state.entries.slice();
        }}},async()=>{});
        const name = '来源.电影.简体.srt', bytes = encoded(srt);
        row.history = api.mediaFileHistory(session);
        state.entries = [node];
        if (scenario === 'new-subtitle') state.entries.push({id:'s',name:'电影.2000.zh-cn.ass',size:20});
        if (scenario === 'moved') state.entries = [];
        if (scenario === 'collision') state.entries.push({id:'unrelated',name:name.toUpperCase(),size:bytes.length});
        if (scenario === 'lost') state.response = 'lost';
        row.siblingNames = new Set();
        const verification = {evidence:'unknown'};
        const save = current => api.savePanelSubtitle(current,row,{name,bytes,verification,language:'zh-cn'},()=>{},()=>{});
        if (scenario === 'ok') {
            await save(drive());
            assert.equal(row.subtitles[0].id,'uploaded');
            assert.ok(row.siblingNames.has(name.toLowerCase()));
            assert.equal(row.complete,true);
            assert.equal(row.verification,verification);
            assert.equal(state.lists,2,'Import reuses the uploader listing and readback');
            await assert.rejects(save(drive()),/同名/);
            assert.equal(state.writes,1);
        } else if (scenario === 'lost') {
            await assert.rejects(save(drive()),error=>error.pendingUpload);
            const receiptKey = [...memory.keys()].find(key=>key.startsWith('cross-drive-subtitle-uploads-v1:'));
            assert.equal(memory.get(receiptKey).length,1);
            assert.equal((await drive().reconcile(row))[0].id,'uploaded');
            assert.equal(memory.get(receiptKey).length,0);
            await assert.rejects(save(drive()),/同名/);
            assert.equal(state.writes,1);
        } else {
            await assert.rejects(save(drive()),/已移动|同名|关联字幕已变化/);
            assert.equal(state.writes,0);
        }
        if (scenario !== 'ok') {
            assert.equal(row.subtitles.length,0);
            assert.equal(row.siblingNames.size,0);
            assert.equal(row.complete,false);
        }
    }
    console.log('PASS import upload: production recheck, no overwrite, content readback and receipt recovery');
}

(async()=>{matching(); await upload(); await organizeAfterUpload();})().catch(error=>{console.error(error);process.exitCode=1;});
