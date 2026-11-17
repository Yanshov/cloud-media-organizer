const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const script=fs.readFileSync('cloud-media-organizer-v3.user.js','utf8');
const part=(a,b)=>{const i=script.indexOf(a),j=script.indexOf(b,i);assert.ok(i>=0&&j>i);return script.slice(i,j)};
const language='zh-cn,zh-tw,zh';
function load(extra={}) {
    const ctx=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Date,atob,
        sleep:async()=>{},paced:(_ms,fn)=>fn,GM_getValue:(_k,d)=>d,GM_setValue(){},apiCode:r=>r.code||0,apiError:()=>Error('API error'),...extra});
    vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    function subtitleRemoteJson(', '    function subtitleInventory('),ctx);return ctx;
}
const row=()=>({node:{id:'v',parentId:'p',name:'电影.2020.mkv',size:50000,md5:'a'.repeat(32)},parsed:{query:'电影',year:2020,tv:false},candidates:[],sources:[]});
(async()=>{
    const data=Uint8Array.from({length:50000},(_,i)=>(i*7+Math.floor(i/53))%256),ranges=[],logs=[];
    let urls=0,badRange=false;
    const ctx=load({requestJson:async()=>{urls++;return {data:{DownloadUrl:'https://drive.example/video'}}},GM_xmlhttpRequest:r=>{
        assert.equal(r.timeout,8000,'Range requests have a short timeout');assert.equal(r.anonymous,true);
        const m=r.headers.Range.match(/bytes=(\d+)-(\d+)/);const start=+m[1],end=+m[2];ranges.push([start,end]);
        r.onload({status:badRange?200:206,response:data.slice(start,end+1).buffer,responseHeaders:`Content-Range: bytes ${start}-${end}/50000`});return {abort(){}};
    }});
    const drive=ctx.subtitleDrive({session:{provider:'123',base:'https://www.123pan.com',headers:{}},source:{}}),r=row();
    const hash=await drive.sample(r,()=>{},m=>logs.push(m));
    const offsets=[4096,33332,16666,41808];
    assert.deepEqual(ranges,offsets.map(n=>[n,n+4095]));
    assert.equal(hash,offsets.map(n=>crypto.createHash('md5').update(data.slice(n,n+4096)).digest('hex')).join(';'),'Real range bytes use the four-block algorithm, not whole-file MD5');
    assert.notEqual(hash,r.node.md5);
    assert.equal(await drive.sample(r,()=>{},m=>logs.push(m)),hash);assert.equal(ranges.length,4);assert.equal(urls,1);assert.ok(logs.some(m=>m.includes('复用')));
    r.node.md5='b'.repeat(32);await drive.sample(r);assert.equal(ranges.length,8,'Changed file hash invalidates cached fingerprint');
    await assert.rejects(drive.sample(r,()=>{throw Error('已停止')}),/已停止/);assert.equal(ranges.length,8);
    r.node.id='changed';badRange=true;await assert.rejects(drive.sample(r),/分段|范围/);assert.equal(ranges.length,9,'Ignored Range fails on first block');
    badRange=false;await drive.sample(r);assert.equal(ranges.length,13,'Failed samples are not cached');
    const calls=[];let mode='hit';
    const net=load({GM_xmlhttpRequest:request=>{
        if(request.url.includes('shooter.cn')) {
            calls.push('shooter');assert.equal(request.timeout,8000);assert.equal(new URLSearchParams(request.data).get('filehash'),hash);
            if(mode==='timeout'){request.ontimeout();return;}
            request.onload({status:200,responseText:JSON.stringify(mode==='hit'?[{Desc:'同片源字幕',Files:[{Ext:'srt',Link:'https://sub.example/sub.srt'}]}]:[])});
        } else {calls.push('thunder');request.onload({status:200,responseText:JSON.stringify({code:0,data:[]})});}
    }});
    const service=net.createSubtitleService(),config={shooter:true,thunder:true,language};let samples=0;
    const cloud={sample:async()=>{samples++;return hash}};
    let target=row();await net.searchSubtitleSources(target,config,service,cloud);
    assert.deepEqual(calls,['shooter']);assert.equal(samples,1);assert.equal(target.selectedCandidate.hashMatched,true);assert.equal(target.sources.find(s=>s.name==='迅雷').deferred,true);
    target.selectedCandidate.downloadFailed=true;await net.searchSubtitleSources(target,config,service,cloud,()=>{},()=>{},true);
    assert.deepEqual(calls,['shooter','thunder']);assert.equal(samples,1,'Bad subtitle body can resume title search without resampling');
    mode='timeout';service.logout();service.resetSearchBatch();calls.length=0;
    target=row();await net.searchSubtitleSources(target,config,service,cloud);assert.deepEqual(calls,['shooter','thunder']);assert.ok(service.searchUnavailable('射手'));
    const previousSamples=samples;target=row();target.parsed.query='另一部电影';await net.searchSubtitleSources(target,config,service,cloud);
    assert.equal(samples,previousSamples,'Batch suspension skips both sampling and hash API');assert.deepEqual(calls,['shooter','thunder','thunder']);
    mode='miss';service.resetSearchBatch();target=row();target.parsed.query='第三部电影';await net.searchSubtitleSources(target,config,service,cloud);
    assert.equal(samples,previousSamples+1);assert.deepEqual(calls.slice(-2),['shooter','thunder'],'Next batch retries hash service; empty result falls back normally');
    const bytes=new TextEncoder().encode('1\n00:00:01,000 --> 00:00:03,000\n中文字幕\n');
    assert.match(net.subtitlePayload(bytes,'srt',language),/中文字幕/);
    assert.throws(()=>net.subtitlePayload(new TextEncoder().encode('<html>bad</html>'),'srt',language),/不是可识别/,'Hash hits still require subtitle body validation');
    console.log('PASS hash-first flow: real byte-range fingerprint/cache/invalidation, timeout budget, hit/miss, download fallback, suspension/reset and body validation');
})().catch(e=>{console.error(e);process.exitCode=1});
