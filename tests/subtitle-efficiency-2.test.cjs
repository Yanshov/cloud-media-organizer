const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../cloud-media-organizer-v3.user.js'),'utf8');
const part=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start,a);return source.slice(start,end)};
const language='zh-cn,zh-tw,zh',storage=new Map(),logs=[];
const ctx=vm.createContext({URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,Date,
    sleep:async()=>{},paced:(_ms,fn)=>fn,GM_getValue:(k,d)=>storage.get(k)||d,GM_setValue:(k,v)=>storage.set(k,v)});
vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    function subtitleMd5(', '    function subtitleDownloadUrl(')+part('    function subtitleDownloadUrl(', '    function subtitleInventory('),ctx);
const row=()=>({node:{id:'v',parentId:'p',name:'小丑2.2024.mkv'},parsed:{query:'小丑2',year:2024,tv:false},subtitles:[]});
async function records(){
    const bytes=new TextEncoder().encode('1\n00:00:01,000 --> 00:02:00,000\n合成中文字幕 Test\n');
    const sub={id:'s',size:bytes.length,md5:ctx.subtitleMd5(bytes),name:'小丑2.zh-cn.srt'};
    const drive=ctx.subtitleDrive({session:{provider:'123',token:'secret'},source:{}});
    let reads=0;drive.read=async()=>{reads++;return bytes};
    const r=row();r.subtitles=[sub];
    await ctx.inspectExistingSubtitles(r,drive,language,(a,b)=>logs.push(a+' '+b));assert.equal(reads,1);assert.equal(r.complete,true);
    await ctx.inspectExistingSubtitles(r,drive,language,(a,b)=>logs.push(a+' '+b));assert.equal(reads,1);assert.equal(r.complete,true);
    assert.ok(logs.some(x=>/已核验记录复用/.test(x)));
    sub.md5='a'.repeat(32);await ctx.inspectExistingSubtitles(r,drive,language);assert.equal(reads,2);
    delete sub.md5;await ctx.inspectExistingSubtitles(r,drive,language);assert.equal(reads,3);
    assert.ok([...storage.keys()].every(k=>!k.includes('secret')));
    drive.verified.clear();sub.md5=ctx.subtitleMd5(bytes);await ctx.inspectExistingSubtitles(r,drive,language);assert.equal(reads,4);
    const other=ctx.subtitleDrive({session:{provider:'123',token:'another'},source:{}});assert.equal(other.verified.get(sub,language),undefined);
}
(async()=>{await records();console.log('PASS efficiency 2: verified body reuse/MD5/account/clear guards')})().catch(error=>{console.error(error);process.exitCode=1});
