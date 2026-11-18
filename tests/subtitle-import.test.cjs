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
function fixture() {
    const memory = new Map(), state = {writes:0,lists:0,entries:[],response:'ok'};
    const ctx = vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,Blob,DecompressionStream,
        location:{hostname:'www.123pan.com'},window:{fetch:()=>assert.fail('Unexpected network')},
        GM_getValue:(key,fallback)=>memory.get(key) ?? fallback,GM_setValue:(key,value)=>memory.set(key,value),
        fixtureRequest:async (url,options) => {
            assert.match(url,/\/file\/upload_request$/);
            const input = JSON.parse(options.body);
            assert.equal(input.duplicate,0);
            state.writes++;
            state.entries.push({id:'uploaded',name:input.fileName,size:input.size,md5:input.etag});
            if (state.response === 'lost') throw Error('连接断开');
            return {code:0,data:{Reuse:true}};
        }});
    vm.runInContext(source.slice(0,bootstrap) + '\nrequestJson = fixtureRequest; globalThis.api = {subtitleInventory, subtitleImportGroups, planSubtitleImport, checkSubtitleImportDirectory, subtitleDrive, subtitleMd5}; })();',ctx);
    const collect = (videos,linked=new Map()) => ctx.api.subtitleInventory({videos,linked},'影视');
    return {api:ctx.api,memory,state,collect};
}
const entry = (name,text=srt) => ({name,label:name,ext:name.split('.').pop(),bytes:typeof text === 'string' ? encoded(text) : text});

function matching() {
    const {api,collect} = fixture();
    const plan = (entries,rows,confirmed=new Set()) => api.planSubtitleImport(entries,rows,lang,confirmed,()=>{});
    const movies = collect([video('film','电影.2000.mkv')]);
    const ass = '[Events]\nFormat: Start, End, Text\nDialogue: 0:00:01.00,0:20:03.00,合成中文字幕';
    const vtt = 'WEBVTT\n\n00:01.000 --> 20:03.000\n合成中文字幕';
    for (const [ext,text] of [['srt',srt],['ass',ass],['ssa',ass],['vtt',vtt]]) {
        const [checked] = plan([entry('电影.2000.'+ext,text)],movies);
        assert.equal(checked.state,'ready',checked.reason);
        assert.equal(checked.name,'电影.2000.zh.'+ext);
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

async function upload() {
    for (const scenario of ['new-subtitle','moved','ambiguous','ok','lost']) {
        const {api,state,memory,collect} = fixture();
        const node = video('v','电影.2000.mkv');
        const row = collect([node])[0];
        const session = {provider:'123',token:'test',base:'https://api.123pan.com',headers:{}};
        const drive = () => api.subtitleDrive({session,source:{children:async request=>{
            assert.equal(request.id,node.parentId);
            state.lists++;
            return state.entries.slice();
        }}},async()=>{});
        const name = '电影.2000.zh.srt', bytes = encoded(srt);
        state.entries = [node];
        if (scenario === 'new-subtitle') state.entries.push({id:'s',name:'电影.2000.zh-cn.ass',size:20});
        if (scenario === 'moved') state.entries = [];
        if (scenario === 'ambiguous') state.entries.push({...node,id:'second',name:'电影.2000.mp4'});
        if (scenario === 'lost') state.response = 'lost';
        const save = current => current.save(row,name,bytes,()=>{},()=>{},{
            beforeWrite:nodes=>api.checkSubtitleImportDirectory(row,name,nodes)
        });
        if (scenario === 'ok') {
            assert.equal((await save(drive())).id,'uploaded');
            assert.equal(state.lists,2,'Import reuses the uploader listing and readback');
            await assert.rejects(save(drive()),/关联字幕已变化/);
            assert.equal(state.writes,1);
        } else if (scenario === 'lost') {
            await assert.rejects(save(drive()),error=>error.pendingUpload);
            const receiptKey = [...memory.keys()].find(key=>key.startsWith('cross-drive-subtitle-uploads-v1:'));
            assert.equal(memory.get(receiptKey).length,1);
            assert.equal((await drive().reconcile(row))[0].id,'uploaded');
            assert.equal(memory.get(receiptKey).length,0);
            await assert.rejects(save(drive()),/关联字幕已变化/);
            assert.equal(state.writes,1);
        } else {
            await assert.rejects(save(drive()),/已移动|无法唯一关联|关联字幕已变化/);
            assert.equal(state.writes,0);
        }
    }
    console.log('PASS import upload: production recheck, no overwrite, content readback and receipt recovery');
}

(async()=>{matching(); await upload();})().catch(error=>{console.error(error);process.exitCode=1;});
