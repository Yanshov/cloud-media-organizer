const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (a,b) => { const start=source.indexOf(a), end=source.indexOf(b,start); assert.ok(start>=0 && end>start,a); return source.slice(start,end); };
const load = (code, extras={}) => { const ctx=vm.createContext({TextEncoder,TextDecoder,URL,atob,Uint8Array,Date,GM_getValue:(_key,def)=>def,GM_setValue:()=>{},...extras}); vm.runInContext(code,ctx); return ctx; };
const md5 = bytes => crypto.createHash('md5').update(bytes).digest('hex');
const language='zh-cn,zh-tw,zh';
const valid=Buffer.from('1\n00:00:01,000 --> 00:00:03,000\n中文字幕 Test\n');

function types() {
    const ctx=load(part('    function mediaCandidatePreference(', '    function mediaWorkCounts('));
    const cases=[
        [{workVideoCount:1,season:1,episode:3},'tv'],
        [{workVideoCount:1,aiType:'tv'},'tv'],
        [{workVideoCount:1},''],
        [{workVideoCount:12},''],
        [{type:'movie',match:'movie:1',season:1,episode:3,aiType:'tv'},'movie'],
        [{aiType:'movie'},'movie'],
        [{aiType:'movie',explicitSeason:0},''],
        [{aiType:'movie',explicitEpisode:3},'']
    ];
    for(const [row,type] of cases) {ctx.row=row; const result=vm.runInContext('mediaCandidatePreference(row)',ctx); assert.equal(result.type,type); if(row.aiType==='movie' && (row.explicitSeason!=null || row.explicitEpisode!=null)) assert.equal(result.conflict,true);}
    console.log('PASS media types: single episode and AI TV retained; count alone never decides; confirmed choice wins; conflicting hints require confirmation');
}

async function subtitles() {
    const ctx=load(part('    function subtitleDownloadUrl(', '    function subtitleDrive('),{Blob});
    const video={id:'v',parentId:'p',name:'电影.2000.mkv',size:10000};
    const mono={source:'Assrt',name:'电影.2000.简体.srt',language:'zh-cn',titleMatched:true};
    const bilingual={source:'射手',name:'电影.2000.简体&英文.ass',language:'zh-cn',bilingual:true,hashMatched:true};
    let calls=[],stop=false;
    const row=()=>({node:video,parsed:{query:'电影',year:2000},candidates:[],sources:[]});
    const service={assrtSearch:async()=>{calls.push('assrt');return [mono]},search:async()=>{calls.push('open');return []},shooterHash:async(hash,path)=>{calls.push('shooter');assert.equal(hash,'sample');assert.equal(path,video.name);return [bilingual]}};
    const drive={sample:async()=>{calls.push('sample');return 'sample'}};
    let r=row();
    await ctx.searchSubtitleSources(r,{assrt:true,assrtToken:'k',open:false,shooter:true,language},service,drive);
    assert.deepEqual(calls,['assrt','sample','shooter']);assert.equal(r.selectedCandidate,bilingual);
    calls=[];service.assrtSearch=async()=>{calls.push('assrt');throw Error('HTTP 509')};
    r=row();await ctx.searchSubtitleSources(r,{assrt:true,assrtToken:'k',shooter:true,language},service,drive);
    assert.equal(r.sources[0].error,'HTTP 509');assert.equal(r.selectedCandidate,bilingual);assert.equal(calls.at(-1),'shooter');
    calls=[];service.assrtSearch=async()=>{calls.push('assrt');stop=true;return []};
    await assert.rejects(ctx.searchSubtitleSources(row(),{assrt:true,assrtToken:'k',shooter:true,language},service,drive,()=>{},()=>{if(stop)throw Error('已停止')}),/已停止/);
    assert.deepEqual(calls,['assrt']);
    r=row();await ctx.searchSubtitleSources(r,{language},service,drive);assert.equal(ctx.subtitleSearchState(r),'unsearched');assert.match(ctx.subtitleSearchMessage(r),/尚未查询/);
    r=row();await ctx.searchSubtitleSources(r,{assrt:true,language},service,drive);assert.equal(ctx.subtitleSearchState(r),'failed');assert.match(ctx.subtitleSearchMessage(r),/未配置密钥/);

    vm.runInContext(part('    function subtitleInventory(', '    function initSubtitles('),ctx);
    Object.assign(ctx,{parseMediaName:()=>({query:'电影',year:2000}),mediaBonusName:()=>false,mediaRecords:{get:()=>null}});
    const sub={id:'s',name:'电影.2000.zh-cn.srt'};
    const collected={videos:[{...video,folders:[],path:video.name}],linked:new Map([['v',[sub]]])};
    r=ctx.subtitleInventory(collected)[0];assert.equal(r.complete,false,'Language filename is not proof of content');
    await ctx.inspectExistingSubtitles(r,{read:async()=>valid},language);assert.equal(r.complete,true);
    for(const bytes of [Buffer.alloc(0),Buffer.from('<html>错误页面</html>'),Buffer.from('random 中文')]) {
        r={subtitles:[sub],node:video};await ctx.inspectExistingSubtitles(r,{read:async()=>bytes},language);assert.equal(r.complete,false);assert.equal(r.pendingVerification,false);
    }
    r={subtitles:[sub],node:video};await ctx.inspectExistingSubtitles(r,{read:async()=>{throw Error('连接失败')}},language);assert.equal(r.complete,false);assert.equal(r.pendingVerification,true);assert.equal(ctx.subtitleSearchState(r),'pending');
    r={subtitles:[sub,{...sub,name:'another.srt'}],node:video};let read=0;
    await ctx.inspectExistingSubtitles(r,{read:async()=>++read===1?Promise.reject(Error('连接失败')):valid},language);assert.equal(r.complete,true);assert.equal(r.pendingVerification,false);
    r={subtitles:[{name:'untagged.srt'}],node:video};await ctx.inspectExistingSubtitles(r,{read:async()=>valid},'zh-cn');assert.equal(r.complete,false);
    await assert.rejects(ctx.inspectExistingSubtitles({subtitles:[sub],node:video},{read:async()=>valid},language,()=>{},()=>{throw Error('已停止')}),/已停止/);
    console.log('PASS subtitles: all enabled sources queried and bilingual wins; failed source fallback; stop propagation; skipped/missing-key states; existing tagged subtitles require valid body; unreadable files pause filling');
}

async function receipts() {
    const video={id:'v',parentId:'p',name:'电影.2000.mkv',size:10000};
    const sub={id:'s',name:'电影.2000.zh-cn.srt',size:valid.length};
    for(const scenario of ['read-failure','network-submission','rejected-api','rejected-http','mismatch','listing-failure','other-account','cancel']) {
        const storage=new Map();let uploads=0,exists=false,broken=true,cancel=false,first=true;
        const ctx=load(part('    function subtitleDrive(', '    function subtitleInventory('),{
            sleep:async()=>{},paced:(_ms,fn)=>fn,selectedTreeCache:null,SUBTITLE_LIMIT:16*1024*1024,subtitleDownloadUrl:u=>u,subtitleMd5:md5,
            apiCode:r=>r.code??0,apiError:(_stage,r)=>Object.assign(Error('API '+r.code),{stop:r.code===403}),
            GM_getValue:(key,def)=>storage.has(key)?structuredClone(storage.get(key)):def,GM_setValue:(key,val)=>storage.set(key,structuredClone(val)),
            subtitleBinary:async()=>{if(scenario==='cancel' && broken){cancel=true;throw Error('连接失败')} if(broken && scenario==='read-failure')throw Error('连接失败'); return scenario==='mismatch' && broken ? Buffer.from('wrong'):valid;},
            requestJson:async(url)=>{
                if(url.endsWith('/file/upload_request')) {
                    uploads++;
                    if(first){first=false;
                        if(scenario==='rejected-api')return {code:403};
                        if(scenario==='rejected-http')throw Object.assign(Error('HTTP 403'),{status:403,stop:true});
                        if(scenario==='network-submission')throw Error('连接失败');
                    }
                    exists=true;return {code:0,data:{Reuse:true}};
                }
                if(url.endsWith('/file/download_info'))return {data:{DownloadUrl:'https://drive.example/file'}};
                throw Error('Unexpected '+url);
            }
        });
        const context={session:{provider:'123',token:'account-one',base:'https://www.123pan.com',headers:{}},source:{children:async()=>{if(exists && broken && scenario==='listing-failure')throw Error('连接失败');return exists?[video,sub]:[video]}}};
        ctx.context=context;
        const make=()=>vm.runInContext('subtitleDrive(context)',ctx);
        let drive=make();
        const check=()=>{if(cancel)throw Error('已停止')};
        if(scenario==='other-account') {
            // Leave an unresolved receipt in account one, then prove account two does not consume it.
            ctx.subtitleBinary=async()=>{throw Error('连接失败')};
        }
        await assert.rejects(drive.save({node:video},sub.name,valid,()=>{},check),error=>{
            if(scenario==='cancel')return /已停止/.test(error.message) && error.pendingUpload===true;
            if(scenario.startsWith('rejected'))return !error.pendingUpload;
            return error.pendingUpload===true;
        });
        assert.equal(uploads,1);
        assert.equal([...storage.values()][0].length,scenario.startsWith('rejected')?0:1);
        assert.ok([...storage.keys()].every(key=>!key.includes('account-one')),'No token in persisted key');
        drive=make();cancel=false;
        if(scenario.startsWith('rejected')) {
            broken=false;await drive.save({node:video},sub.name,valid);assert.equal(uploads,2,'Explicit rejection allows corrected retry');
        } else if(scenario==='other-account') {
            ctx.context={...context,session:{...context.session,token:'account-two'}};const other=make();assert.equal((await other.reconcile({node:video})).length,0);assert.equal([...storage.values()][0].length,1);continue;
        } else {
            await assert.rejects(drive.save({node:video},sub.name,valid),error=>error.pendingUpload===true || scenario==='cancel');
            assert.equal(uploads,1,'Persisted receipt prevents repeated mutation');
            broken=false;exists=true;ctx.subtitleBinary=async()=>valid;
            const recovered=await drive.reconcile({node:video});assert.equal(recovered[0].id,'s');assert.equal([...storage.values()][0].length,0);
            await drive.save({node:video},sub.name,valid);assert.equal(uploads,1);
        }
    }
    let writes=0,uploads=0;
    const ctx=load(part('    function subtitleDrive(', '    function subtitleInventory('),{
        sleep:async()=>{},paced:(_ms,fn)=>fn,selectedTreeCache:null,SUBTITLE_LIMIT:16*1024*1024,subtitleDownloadUrl:u=>u,subtitleMd5:md5,
        apiCode:()=>0,GM_getValue:()=>[],GM_setValue:()=>{if(++writes===1)throw Error('存储空间不足')},
        subtitleBinary:async()=>valid,requestJson:async url=>{if(url.endsWith('/file/upload_request')){uploads++;return {data:{Reuse:true}}}return {data:{DownloadUrl:'https://drive.example/sub'}}}
    });
    ctx.context={session:{provider:'123',token:'test',base:'https://example.com',headers:{}},source:{children:async()=>uploads?[video,sub]:[video]}};
    const drive=vm.runInContext('subtitleDrive(context)',ctx);
    await assert.rejects(drive.save({node:video},sub.name,valid),/本次未上传/);assert.equal(uploads,0);
    await drive.save({node:video},sub.name,valid);assert.equal(uploads,1,'Failed pre-submission persistence must not leave an in-memory lock');
    console.log('PASS upload receipts: persists across controller reload; no repeated upload after uncertain submission/readback/cancel; mismatch and failed listing remain pending; successful recheck clears receipt; definite API/HTTP rejection allows retry; account isolation');
}

function treeFixture(numeric=false,nested=false) {
    const id=v=>numeric?Number(v):v;
    const folder={id:id('10'),parentId:id('0'),name:'旧片名',directory:true,path:'旧片名'};
    const season={id:id('11'),parentId:folder.id,name:'Season 1',directory:true,path:'旧片名/Season 1'};
    const parent=nested?season:folder;
    const video={id:id('20'),parentId:parent.id,name:'video.mkv',directory:false,size:100,md5:'a'.repeat(32),ancestors:nested?[folder,season]:[folder]};
    const attachment={id:id('21'),parentId:parent.id,name:'poster.jpg',directory:false,size:10,md5:'b'.repeat(32)};
    const nodes=[folder,...(nested?[season]:[]),video,attachment];const mutations=[];
    const children=async({id:parentId})=>nodes.filter(n=>n.parentId===parentId).map(n=>({...n}));
    const ctx=load(part('    function mediaOrganizerWriter(', '    const mediaStandardFolder'),{
        MEDIA_VIDEO:/\.(mkv|mp4)$/i,mediaExistingCategory:parts=>parts[0]==='电影',relativeParts:p=>p.split('/').filter(Boolean),
        hasFileMetadata:n=>!!n.md5,mediaFileMetadata:async n=>n,sleep:async()=>{},paced:(_ms,fn)=>fn,apiCode:()=>0,
        requestJson:async(url,opts)=>{const body=JSON.parse(opts.body);mutations.push([url,body]);
            if(url.endsWith('/file/rename')) nodes.find(n=>n.id===body.fileId).name=body.fileName;
            else if(url.endsWith('/file/mod_pid'))for(const n of body.fileIdList)nodes.find(node=>node.id===n.FileId).parentId=body.parentFileId;
            else if(url.endsWith('/file/upload_request')) nodes.push({id:id(String(100+mutations.length)),parentId:body.parentFileId,name:body.fileName,directory:true});
            else throw Error('Unexpected '+url);
            return {};
        }
    });
    ctx.context={session:{provider:'123',base:'https://test',parent:id('0'),headers:{}},source:{children}};
    const writer=vm.runInContext('mediaOrganizerWriter(context.session,context.source)',ctx);
    const item={node:{...video},videoId:video.id,destination:nested?'电影/新片名.2000/Season 01/new.mkv':'电影/新片名.2000/new.mkv'};
    return {writer,item,nodes,mutations,folder,attachment,video,season};
}

async function folders() {
    for(const numeric of [false,true])for(const nested of [false,true]) {
        const f=treeFixture(numeric,nested);const plans=await f.writer.prepare([f.item]);
        assert.ok(plans.length);assert.ok(plans.some(p=>p.contents.some(n=>n.name==='poster.jpg')),'Preview includes unlinked attachment');
        await f.writer.validate();await f.writer.execute(f.item);
        assert.equal(f.nodes.find(n=>n.id===f.video.id).name,'new.mkv');assert.equal(f.nodes.find(n=>n.id===f.attachment.id).parentId,f.attachment.parentId);
        assert.ok(f.mutations.some(([url,b])=>url.endsWith('/file/mod_pid') && b.fileIdList.some(n=>n.FileId===f.folder.id)),JSON.stringify({numeric,nested,mutations:f.mutations}));
    }
    for(const change of ['added','renamed','changed-size','removed']) {
        const f=treeFixture();await f.writer.prepare([f.item]);
        if(change==='added')f.nodes.push({id:'99',parentId:f.folder.id,name:'late.srt',size:1});
        if(change==='renamed')f.nodes.find(n=>n.id===f.attachment.id).name='changed.jpg';
        if(change==='changed-size')f.nodes.find(n=>n.id===f.attachment.id).size++;
        if(change==='removed')f.nodes.splice(f.nodes.findIndex(n=>n.id===f.attachment.id),1);
        await assert.rejects(f.writer.validate(),/预览后发生变化/);assert.equal(f.mutations.length,0);
    }
    const f=treeFixture();f.nodes.push({...f.video,id:'other',name:'unselected.mkv'});assert.equal((await f.writer.prepare([f.item])).length,0,'Unselected video prevents folder move');
    // Removing that other video after preview must not invent a new whole-folder operation.
    f.nodes.splice(f.nodes.findIndex(n=>n.id==='other'),1);await f.writer.validate();await f.writer.execute(f.item);
    assert.equal(f.nodes.find(n=>n.id===f.folder.id).name,'旧片名');
    const merge=treeFixture();merge.nodes.push({id:'cat',parentId:'0',name:'电影',directory:true},{id:'target',parentId:'cat',name:'新片名.2000',directory:true});
    assert.equal((await merge.writer.prepare([merge.item])).length,0,'Existing target uses file merge, so no whole-folder preview');
    await merge.writer.validate();await merge.writer.execute(merge.item);assert.equal(merge.nodes.find(n=>n.id===merge.video.id).parentId,'target');assert.equal(merge.nodes.find(n=>n.id===merge.attachment.id).parentId,merge.folder.id);
    const late=treeFixture();await late.writer.prepare([late.item]);late.nodes.push({id:'cat',parentId:'0',name:'电影',directory:true},{id:'target',parentId:'cat',name:'新片名.2000',directory:true});
    await assert.rejects(late.writer.execute(late.item),/预览后出现同名项目/);assert.equal(late.mutations.length,0);
    const stopped=treeFixture();let cancel=false;await stopped.writer.prepare([stopped.item],()=>{if(cancel)throw Error('已停止')});cancel=true;
    await assert.rejects(stopped.writer.validate(),/已停止/);assert.equal(stopped.mutations.length,0);
    console.log('PASS folder plans: complete attachment preview; numeric/string IDs; work plus season folder moves; added/renamed/changed/removed descendants block before mutation; unselected video prevents folder binding; cancellation');
}

async function cleanup() {
    const nodes=[{id:'v',name:'movie.mkv'},{id:'s',name:'movie.zh-cn.srt'},{id:'f',name:'font.otf'},{id:'a',name:'字体包.zip'},{id:'i',name:'poster.jpg'},{id:'b',name:'花絮.mkv'}];
    const ctx=load(part('    const mediaPlaybackAttachment', '    async function planMediaNonstandard('),{MEDIA_VIDEO:/\.mkv$/,MEDIA_SUB:/\.(srt|ass|ssa|sub|idx|vtt)$/i,mediaBonusName:n=>n.startsWith('花絮'),matchSelected:nodes=>nodes});
    const source={parentId:'p',children:async()=>nodes};
    const protectedPlan=await ctx.planMediaExtras([{}],source);assert.deepEqual(Array.from(protectedPlan,n=>n.id),['i','b']);
    const all=await ctx.planMediaExtras([{}],source,()=>{},true);assert.deepEqual(Array.from(all,n=>n.id),['s','f','a','i','b']);
    const button={},messages=[];let deletes=0;
    const start=sourceText=>sourceText.indexOf("        ui.get('runEmpty').onclick = async () => {");
    const script=fs.readFileSync(require('node:path').join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
    const handler=script.slice(start(script),script.indexOf("        ui.get('mediaAIProvider').onchange",start(script)));
    const run=load(handler,{ui:{get:()=>button},emptyPlan:[{path:'a'},{path:'b'}],emptySession:{},emptySource:{},selectedTreeCache:null,cancelled:false,
        invalidate(){},lock(){},meter(){},log:m=>messages.push(m),progress:m=>messages.push(m),
        removeMediaNonstandard:async()=>{deletes++;throw Object.assign(Error('HTTP 403'),{stop:true})}
    });
    await button.onclick();assert.equal(deletes,1);assert.ok(messages.some(m=>m.includes('未处理 1')));
    console.log('PASS cleanup: subtitles, font files and named font packs preserved by default; explicit include restores full attachment cleaning');
}

async function subtitleUI() {
    const elements=new Map();
    const element=()=>({value:'',checked:false,disabled:false,hidden:false,dataset:{},style:{},children:[],textContent:'',append(...children){this.children.push(...children)},appendChild(child){this.children.push(child)},replaceChildren(...children){this.children=children},querySelectorAll(){return []}});
    const get=id=>{assert.ok(elements.has(id),'Missing UI element '+id);return elements.get(id)};
    const video={id:'v',name:'电影.2000.mkv',size:10000,folders:[],path:'电影.2000.mkv'};
    const sub={id:'s',name:'电影.2000.zh-cn.srt'};
    let broken=true,hasSubtitle=true,queries=0,saves=0,reads=0,aliasCalls=0;
    const downloads=[];
    const ctx=load(part('    function subtitleDownloadUrl(', '    function subtitleDrive('));
    Object.assign(ctx,{document:{createElement:element},makePanel:(_title,html)=>{
        for(const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=element();el.checked=/\bchecked\b/.test(tag[0]);el.disabled=/\bdisabled\b/.test(tag[0]);elements.set(tag[1],el)}
        return {get,moveSettings(){},openSettings(){},busy(){}};
    },mediaContext:async()=>({selected:[video],source:{},path:'电影'}),selectedTreeCache:{stale:true},
    collectMediaSelection:async()=>({videos:[video],linked:new Map([['v',hasSubtitle?[sub]:[]]])}),
    parseMediaName:()=>({query:'电影',year:2000}),mediaBonusName:()=>false,mediaRecords:{get:()=>({query:'电影',year:2000,type:'movie',match:'movie:7'})},mediaStem:name=>name.replace(/\.[^.]+$/,''),
    GM_getValue:(key,def)=>key==='cross-drive-tmdb-key'?'fixture-key':def,
    tmdbClient:()=>({get:async(path,params)=>{aliasCalls++;assert.equal(path,'/movie/7');assert.equal(params.append_to_response,'alternative_titles');return {id:7,title:'电影完整名',original_title:'Film',release_date:'2000-01-01',alternative_titles:{titles:[{iso_3166_1:'TW',title:'电影别名'},{iso_3166_1:'FR',title:'Un film'}]}}}}),
    createSubtitleService:()=>({assrtSearch:async row=>{queries++;assert.equal(row.parsed.query,'电影');assert.ok(row.parsed.aliases.includes('Film'));assert.ok(row.parsed.aliases.includes('电影别名'));assert.ok(!row.parsed.aliases.includes('Un film'));return ['A1','A2','B'].map(name=>({source:'Assrt',assrtId:name[0],name,language:'zh-cn',titleMatched:true}))},shooterHash:async()=>{queries++;return []},fetchFile:async candidate=>{downloads.push(candidate.name);if(candidate.name==='A1')throw Object.assign(Error('HTTP 493'),{status:493});return {result:{url:'https://example.com/subtitle',ext:'srt'},bytes:valid}}}),
    subtitleBinary:async()=>valid,
    subtitleDrive:()=>({sample:async()=>'',read:async()=>{reads++;if(broken)throw Error('连接失败');return valid},reconcile:async()=>[],save:async()=>{saves++;hasSubtitle=true;throw Object.assign(Error('上传已提交，核验连接失败'),{pendingUpload:true})}})
    });
    vm.runInContext(part('    function subtitleInventory(', '    if (location.hostname'),ctx);
    ctx.initSubtitles();get('assrtToken').value='test';
    await get('readSubtitles').onclick();
    assert.match(get('subtitleSummary').textContent,/待核验 1/);assert.equal(queries,0);assert.equal(get('fillSubtitles').disabled,true);assert.equal(get('searchSubtitles').disabled,true);assert.equal(get('recheckSubtitles').disabled,false);
    broken=false;await get('recheckSubtitles').onclick();assert.match(get('subtitleSummary').textContent,/已有\/已补齐 1/);assert.equal(queries,0);assert.equal(reads,2);
    hasSubtitle=false;await get('readSubtitles').onclick();assert.equal(queries,2);assert.equal(get('fillSubtitles').disabled,false);
    await get('fillSubtitles').onclick();assert.equal(saves,1);assert.match(get('subtitleProgress').textContent,/待核验 1，失败 0/);assert.equal(get('fillSubtitles').disabled,true);
    assert.deepEqual(downloads,['A1','B'],'493 prioritizes another package before siblings of broken package');assert.equal(aliasCalls,1,'Old confirmed records lazily resolve trusted aliases');
    await get('searchSubtitles').onclick();assert.equal(queries,2,'Pending upload cannot be searched/refilled');
    await get('recheckSubtitles').onclick();assert.match(get('subtitleSummary').textContent,/已有\/已补齐 1/);assert.equal(saves,1);assert.equal(queries,2,'Recheck only reads drive inventory');
    console.log('PASS subtitle UI flow: existing-read failure disables search/fill; old records resolve trusted TMDB aliases without changing search title; 493 moves to another package; pending upload recheck recovers without repeated upload');
}

async function guangyaReceipts() {
    const video={id:'v',parentId:'p',name:'电影.mkv',size:10000}, sub={id:'s',name:'电影.zh-cn.srt',size:valid.length};
    for(const scenario of ['reuse-success','oss-success','read-failure','rejected','post-task-failure','missing-task']) {
        const storage=new Map();let creates=0,puts=0,exists=false,broken=true;
        const ctx=load(part('    function subtitleDrive(', '    function subtitleInventory('),{
            crypto:crypto.webcrypto,btoa,sleep:async()=>{},paced:(_ms,fn)=>fn,API:{create:'/create',info:'/info'},taskIdOf:data=>data?.taskId,
            guangyaCode:r=>r.code??0,apiCode:r=>r.code??0,apiError:(_s,r)=>Object.assign(Error('API '+r.code),{stop:r.code===403}),
            selectedTreeCache:null,SUBTITLE_LIMIT:16*1024*1024,subtitleDownloadUrl:u=>u,subtitleMd5:md5,
            GM_getValue:(k,d)=>storage.get(k)||d,GM_setValue:(k,v)=>storage.set(k,structuredClone(v)),
            requestJson:async(url)=>{
                if(url.endsWith('/create')){creates++;if(scenario==='rejected')return {code:403};exists=true;
                    return {code:scenario==='oss-success'?0:156,data:scenario==='missing-task'?{}:{taskId:'t',provider:1,bucketName:'bucket',objectPath:'sub.srt',endPoint:'oss.example.com',creds:{accessKeyID:'fake',secretAccessKey:'fake',sessionToken:'fake'}}};}
                if(url.endsWith('/info')){if(scenario==='post-task-failure' && broken)throw Object.assign(Error('HTTP 403'),{stop:true});return {data:{fileId:'s'}};}
                if(url.endsWith('/get_res_download_url'))return {data:{signedURL:'https://download.example/file'}};
                throw Error('Unexpected '+url);
            },
            subtitleBinary:async(_url,opts)=>{if(opts?.method==='PUT'){puts++;return Buffer.alloc(0)}if(scenario==='read-failure' && broken)throw Error('连接失败');return valid;}
        });
        ctx.context={session:{provider:'光鸭',token:'guangya-account'},source:{children:async()=>exists?[video,sub]:[video]}};
        const drive=vm.runInContext('subtitleDrive(context)',ctx);
        if(scenario.endsWith('success')) {assert.equal((await drive.save({node:video},sub.name,valid)).id,'s');assert.equal(puts,scenario==='oss-success'?1:0);}
        else {
            await assert.rejects(drive.save({node:video},sub.name,valid),e=>scenario==='rejected'?!e.pendingUpload:e.pendingUpload && (scenario!=='post-task-failure'||e.stop));
            assert.equal([...storage.values()][0].length,scenario==='rejected'?0:1);
            if(scenario!=='rejected'){broken=false;const recovered=await vm.runInContext('subtitleDrive(context)',ctx).reconcile({node:video});assert.equal(recovered[0].id,'s');}
        }
        assert.equal(creates,1);assert.equal([...storage.values()][0].length,0);
    }
    console.log('PASS Guangya: rapid upload and signed OSS byte upload; readback failure, missing task and accepted-task auth failure retain receipt; explicit rejection clears receipt; recheck recovers with one create only');
}

(async()=>{types();await subtitles();await receipts();await folders();await cleanup();await subtitleUI();await guangyaReceipts();})().catch(e=>{console.error(e);process.exitCode=1;});
