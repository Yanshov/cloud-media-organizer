const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const source=fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const end=source.lastIndexOf("    if (location.hostname === 'www.guangyapan.com')");
assert.ok(end>0);
const storage=new Map(), files=[];
let submitted=0, loseReadback=false;
const context=vm.createContext({URL,URLSearchParams,TextDecoder,TextEncoder,Uint8Array,window:{fetch(){throw Error('Unexpected fetch')}},
    GM_getValue:(key,def)=>storage.get(key)??def,GM_setValue:(key,value)=>storage.set(key,value),setTimeout,clearTimeout,
    fixtureRequest:async(url,options)=>{
        assert.ok(url.endsWith('/file/upload_request'));
        const data=JSON.parse(options.body);
        submitted++;
        files.push({id:'copy-'+submitted,name:data.fileName,size:data.size,md5:data.etag});
        return {code:0,data:{Reuse:true}};
    }
});
vm.runInContext(source.slice(0,end)+
    '\nrequestJson=fixtureRequest;globalThis.api={readSyncSrt,formatSyncTime,renderSyncedSrt,subtitleSyncFromAnchors,suggestSubtitleSync,subtitleDrive,mediaFileHistory,mediaSubtitleLinks,subtitleMd5};})();',context);
const api=context.api;
const make=(cues,label)=>new TextEncoder().encode(cues.map(({start,end},i)=>
    [i+1,api.formatSyncTime(start)+' --> '+api.formatSyncTime(end),'<i>'+label+' '+(i+1)+'</i>','第二行'].join('\r\n')
).join('\r\n\r\n')+'\r\n');
function sparseCues(){
    let time=4000;
    return Array.from({length:100},(_,i)=>{
        time+=1300 + (i*7919+i*i*389)%5400;
        return {start:time,end:time+530+(i*113)%1900};
    });
}
async function timing(){
    const ref=sparseCues();
    const localized=api.readSyncSrt(make(ref,'Reference text'));
    for (const [scale,offset] of [[1,3500],[1,-1750],[1.018,2200],[1,0]]) {
        const target=api.readSyncSrt(make(ref.map(cue=>({start:(cue.start-offset)/scale,end:(cue.end-offset)/scale})),'Another language'));
        const fit=await api.suggestSubtitleSync(target.cues,localized.cues,()=>{},async()=>{});
        assert.equal(fit.reason,undefined,JSON.stringify(fit));
        assert.ok(Math.abs(fit.offset-offset)<80,JSON.stringify(fit));
        assert.ok(Math.abs(fit.scale-scale)<.0003,JSON.stringify(fit));
        const rendered=api.renderSyncedSrt(target,fit);
        assert.equal(rendered.cues.length,target.cues.length);
        assert.equal(rendered.cues[10].body,target.cues[10].body);
        assert.ok(Math.abs(rendered.cues[80].start-ref[80].start)<100);
    }
    const cut=ref.map((cue,i)=>({start:cue.start+(i<40?0:11000),end:cue.end+(i<40?0:11000)}));
    assert.ok((await api.suggestSubtitleSync(ref,cut,()=>{},async()=>{})).reason,'A splice cannot be treated as one transform');
    assert.ok((await api.suggestSubtitleSync(ref,[],()=>{},async()=>{})).reason);
    let stopped=false;
    await assert.rejects(api.suggestSubtitleSync(ref,ref,()=>{if(stopped)throw Error('已停止');},async()=>{stopped=true;}),/已停止/);
    assert.equal(api.subtitleSyncFromAnchors([1000,1800]).offset,800);
    assert.ok(Math.abs(api.subtitleSyncFromAnchors([1000,1500],[10000,10950]).scale-1.05)<1e-9);
    assert.throws(()=>api.subtitleSyncFromAnchors([1000,1000],[1001,2000]),/至少/);
    assert.throws(()=>api.readSyncSrt(new TextEncoder().encode('[Script Info]\n[Events]')),/无法保真/);
    const clipped=api.renderSyncedSrt(api.readSyncSrt(make([{start:1500,end:2300},{start:3000,end:4000}],'裁切')),{scale:1,offset:-2000});
    assert.equal(clipped.cues[0].start,0); assert.equal(clipped.trimmed,1);
}
async function save(){
    const bytes=make(sparseCues(),'保存');
    const movie={id:'film',parentId:'p',name:'movie.mkv',size:1000,md5:'a'.repeat(32)};
    const original={id:'original',name:'movie.zh.srt',size:bytes.length,md5:api.subtitleMd5(bytes)};
    files.push(movie,original);
    const session={provider:'123',token:'fictional-account',base:'https://drive.example',headers:{},parent:'p'};
    const storageContext={session,source:{children:async()=>loseReadback?files.filter(file=>file.id!=='copy-2'):files.slice()}};
    const beforeWrite=name=>nodes=>{
        if (nodes.some(node=>node.name.toLowerCase()===name.toLowerCase())) throw Error('同名校对副本');
    };
    const upload=(name)=>api.subtitleDrive(storageContext,async()=>{}).save({node:movie},name,bytes,undefined,undefined,{language:'zh',variant:'sync',beforeWrite:beforeWrite(name)});
    const copy=await upload('movie.zh.synced.srt');
    const history=api.mediaFileHistory(session);
    assert.equal(history.get(copy,'p').variant,'sync');
    assert.deepEqual(Array.from(api.mediaSubtitleLinks(files,'p',history).linked.get('film'),item=>[item.id,item.suffix]),[['original','.zh'],['copy-1','.zh.synced']]);
    await assert.rejects(upload('MOVIE.ZH.SYNCED.SRT'),/同名/);
    assert.equal(submitted,1);
    loseReadback=true;
    await assert.rejects(upload('another.synced.srt'),error=>error.pendingUpload);
    assert.equal(submitted,2);
    assert.equal(history.get(files.at(-1),'p'),null);
    loseReadback=false;
    const recovered=await api.subtitleDrive(storageContext,async()=>{}).reconcile({node:movie});
    assert.equal(recovered[0].variant,'sync');assert.equal(submitted,2);
    assert.equal(history.get(files.at(-1),'p').variant,'sync');
    assert.equal(files.find(file=>file.id==='original'),original);
}
async function benchmark(file) {
    const bytes=fs.readFileSync(file);
    const ref=api.readSyncSrt(bytes);
    const t0=performance.now(), before=process.memoryUsage().heapUsed;
    const changed=api.renderSyncedSrt(ref,{scale:1/1.018,offset:2500});
    const fit=await api.suggestSubtitleSync(changed.cues,ref.cues);
    if(fit.reason) throw Error(fit.reason);
    const timing=fit.steps.map(item=>Math.round(item.residual));
    console.log(JSON.stringify({cues:ref.cues.length,bytes:bytes.length+changed.bytes.length,offset:fit.offset,scale:fit.scale,medianResidualMs:timing,ms:Math.round(performance.now()-t0),heapChange:process.memoryUsage().heapUsed-before}));
    fs.writeFileSync(path.join(path.dirname(file),'drifted.srt'),changed.bytes);
}
(async()=>{
    await timing();
    await save();
    if (process.argv[2]) await benchmark(process.argv[2]);
    console.log('PASS subtitle sync: cross-language shift, drift, already aligned, split cut rejection, anchors, cancellation, SRT round trip and verified copy recovery');
})().catch(error=>{console.error(error);process.exitCode=1;});
