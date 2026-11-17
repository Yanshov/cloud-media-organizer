const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('cloud-media-organizer-v3.user.js','utf8');
const part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const storage=new Map(),requests=[];
const detail={id:7,title:'测试电影',original_title:'テスト映画',release_date:'2020-01-01',runtime:90,
    alternative_titles:{titles:[{iso_3166_1:'JP',title:'映画の別名'},{iso_3166_1:'TW',title:'測試電影'}]}};
const client={get:async(path,params)=>{requests.push([path,params]);return params.language==='en-US'?{...detail,title:'Test Film'}:detail;},search:async()=>{throw Error('Must use the saved work identity');}};
function load() {
    const ctx=vm.createContext({Date,URL,location:{hostname:'drive.example'},client,checkStopped(){},mediaCategory:()=> '电影',
        GM_getValue:(key,fallback)=>structuredClone(storage.get(key)??fallback),GM_setValue:(key,value)=>storage.set(key,structuredClone(value)),tmdbClient:()=>client});
    vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    const mediaRecords =', '    function mediaCandidatePreference(')+
        part('    function mediaWorkNames(', '    function initMediaOrganizer(')+part('        async function choose(', '        async function validateEpisode(')+'\nthis.records=mediaRecords;',ctx);
    return ctx;
}
(async()=>{
    const ctx=load(),node={id:'1',parentId:'2',name:'测试电影.2020.mkv',size:100};
    const media={node,subtitles:[]};await ctx.choose(media,'movie:7');ctx.records.remember(media);ctx.records.save();
    assert.ok(ctx.records.get(node).aliases.includes('テスト映画'));assert.ok(ctx.records.get(node).aliases.includes('映画の別名'));assert.ok(ctx.records.get(node).aliases.includes('Test Film'));
    assert.equal(requests.length,2);
    const reloaded=load();
    const parsed={query:'测试电影',year:2020,tv:false};
    assert.equal(await reloaded.resolveMediaWork(parsed,''),true,'Subtitle lookup restores persisted work data without an API key');
    assert.equal(parsed.tmdbId,'7');assert.equal(parsed.runtimeSeconds,5400);assert.ok(parsed.aliases.includes('テスト映画'));assert.equal(requests.length,2);
    assert.equal(reloaded.records.get({...node,name:'changed.mkv'}),undefined,'Work library must not weaken file fingerprint checks');
    const moved={query:'測試電影',year:2020,tv:false};assert.equal(await reloaded.resolveMediaWork(moved,''),true,'Unique trusted title/year can reuse a work across different files');
    assert.equal(await reloaded.resolveMediaWork({query:'测试电影',year:2021,tv:false},''),false);
    assert.equal(await reloaded.resolveMediaWork({query:'测试电影',year:2020,tv:true},''),false);
    await assert.rejects(reloaded.resolveMediaWork({query:'测试电影',tmdbId:7,year:2021,tv:false},''),/年份/);
    reloaded.mediaWorkLibrary().remember('movie',{...detail,id:8});
    assert.equal(await reloaded.resolveMediaWork({query:'测试电影',year:2020,tv:false},''),false,'Same-title same-year remakes/duplicate identities stay ambiguous');
    const cancelled={query:'测试电影',year:2020,tv:false};
    await assert.rejects(reloaded.resolveMediaWork(cancelled,'',()=>{throw Error('已停止')}),/已停止/);assert.equal(cancelled.tmdbId,undefined);
    storage.delete('cross-drive-work-library-v1');
    const migrated=load(),legacy={query:'测试电影',year:2020,tv:false};
    assert.equal(await migrated.resolveMediaWork(legacy,''),true,'Existing v2 media records seed the work library');assert.ok(legacy.aliases.includes('テスト映画'));
    const before=storage.get('cross-drive-work-library-v1');
    await assert.rejects(migrated.mediaWorkDetail({get:async()=>({...detail,id:999})},'movie',7),/编号/);
    assert.deepEqual(storage.get('cross-drive-work-library-v1'),before,'Conflicting IDs must not persist');
    console.log('PASS shared works: real media choose/save → fresh subtitle context reuse, Japanese/English/alternative names, runtime, migration, file fingerprint boundaries, ambiguous identity/type/year rejection and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1});
