const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../cloud-media-organizer-v3.user.js'), 'utf8');
const part = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const identityContext = vm.createContext({Date});
vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    const mediaStem =', '    // A special episode'), identityContext);
vm.runInContext(part('    function subtitleQueryTitle(', '    function createSubtitleService('), identityContext);
const parse = name => { identityContext.name = name; return vm.runInContext('parseMediaName(name)', identityContext); };
const match = (query, year, fields, filename) => {
    Object.assign(identityContext, {parsed:{query, year}, fields, filename});
    return vm.runInContext('subtitleWorkIdentity(parsed, fields, filename)', identityContext);
};

for (const [filename, query, year] of [
    ['肥胖症：尸检.2016.mkv','肥胖症:尸检','2016'],
    ['银翼杀手2049.2017.mkv','银翼杀手2049','2017'],
    ['银翼杀手 2049.2017.mkv','银翼杀手 2049','2017'],
    ['Blade.Runner.2049.2017.1080p.BluRay.mkv','Blade Runner 2049','2017'],
    ['2001.A.Space.Odyssey.1968.mkv','2001 A Space Odyssey','1968'],
    ['1917.2019.mkv','1917','2019'],
    ['假面骑士龙骑特别篇：13骑士.2002.mkv','假面骑士龙骑特别篇:13骑士','2002']
]) {
    const parsed = parse(filename);
    assert.equal(parsed.query, query, filename);
    assert.equal(parsed.year, year, filename);
    Object.assign(identityContext, {parsed});
    assert.equal(vm.runInContext('subtitleQueryTitle(parsed.query, parsed.year)', identityContext), query);
}
const wrong = [
    ['蝙蝠侠：黑暗骑士',2008,['蝙蝠侠：黑暗骑士崛起/The Dark Knight Rises'],'The.Dark.Knight.Rises.2012.简体&英文.ass'],
    ['疾速追杀',2014,['疾速追杀：芭蕾杀姬/Ballerina'],'Ballerina.2025.简体&英文.ass'],
    ['教父',1972,['教父/Lucky Luciano'],'Lucky.Luciano.1973.简体.srt'],
    ['教父',1972,['教父/About My Father'],'About.My.Father.2023.简体.srt'],
    ['金刚狼',2009,['金刚狼/The Wolverine'],'The.Wolverine.2013.简体&英文.ass'],
    ['小丑',2019,['小丑旅馆/Clown Motel - 3 Ways to Hell'],'Clown Motel - 3 Ways to Hell 2025.chs&eng.ass'],
    ['小丑2',2024,['小丑2/Jester 2'],'Jester 2 2025.chs&eng.ass'],
    // No year does not make a longer title or sequel an exact title match.
    ['蝙蝠侠：黑暗骑士',2008,['蝙蝠侠：黑暗骑士崛起/The Dark Knight Rises'],'The.Dark.Knight.Rises.chs.ass'],
    ['银翼杀手',1982,['银翼杀手2049/Blade Runner 2049'],'Blade.Runner.2049.chs.ass'],
    // A pack that includes the requested film must still verify every individual file.
    ['教父',1972,['教父/教父2/教父3'],'教父2.1974.chs.ass'],
    ['教父',1972,['教父/教父2/教父3'],'教父2.chs.ass'],
    ['教父',1972,['教父/教父2/教父3'],'The.Godfather.Part.II.chs.ass'],
    ['同名电影',1990,['同名电影 (2020)'],'台.srt']
];
for (const args of wrong) {
    const result = match(...args);
    assert.equal(result.titleMatched, false, JSON.stringify(args));
    assert.ok(result.matchReason);
}
for (const args of [
    ['肥胖症:尸检',2016,['肥胖症:尸检/Obesity: The Post Mortem'],'Obesity.The.Post.Mortem.720p.WEB.h264-spamTV.简体&英文.ass'],
    ['蝙蝠侠：黑暗骑士',2008,['蝙蝠侠：黑暗骑士/The Dark Knight'],'The.Dark.Knight.2008.1080p.简体&英文.ass'],
    ['蝙蝠侠：黑暗骑士',2008,['蝙蝠侠：黑暗骑士/The Dark Knight'],'The.Dark.Knight.简体&英文.ass'],
    ['蜘蛛侠：英雄归来',2017,['蜘蛛侠：英雄归来','Spider.Man.Homecoming.2017.720p.BluRay'],'Spider.Man.Homecoming.2017.BluRay.720p.x264.AC3-CMCT.简体&英文.ass'],
    ['蜘蛛侠：英雄归来',2017,['蜘蛛侠：英雄归来 Spider-Man: Homecoming (2017)'],'Spider-Man.Homecoming.2017.chs.ass'],
    ['蜘蛛侠：英雄归来',2017,['蜘蛛侠：英雄归来'],'台.srt'],
    ['指环王2：双塔奇兵',2002,['The Lord of the Rings: The Two Towers','2002：指环王2：双塔奇兵'],'2002：指环王2：双塔奇兵.ass'],
    ['银翼杀手2049',2017,['银翼杀手2049/Blade Runner 2049'],'简体双语.Blade.Runner.2049.2017.1080p.BluRay.x264-SPARKS.ass'],
    ['奥德赛',2026,['奥德赛/The Odyssey'],'奥德赛.The.Odyssey.2026.1080p.BluRay.chs&eng.srt'],
    ['1917',2019,['1917'],'1917.chs.ass'],
    ['2001 A Space Odyssey',1968,['2001 A Space Odyssey'],'2001.A.Space.Odyssey.chs.ass']
]) assert.equal(match(...args).titleMatched, true, JSON.stringify(args));
console.log('PASS identity: 7 numeric/year parsing cases; 13 wrong files rejected; 11 correct files accepted, including missing-year and numeric titles');

async function remoteErrors() {
    let reply;
    const ctx = vm.createContext({URL, ArrayBuffer, Uint8Array, TextDecoder, Date,
        GM_xmlhttpRequest:options => options.onload(reply)
    });
    vm.runInContext(part('    function subtitleRemoteJson(', '    function subtitleMd5('), ctx);
    const request = () => vm.runInContext('subtitleRemoteJson("https://api.subdl.com/api/v1/subtitles")', ctx);
    reply = {status:509,responseText:'<html>quota exceeded</html>',responseHeaders:'Retry-After: 80\r\n'};
    await assert.rejects(request(), error => error.status === 509 && error.retryAfterMs === 80000);
    reply = {status:200,responseText:'<html>error</html>'};
    await assert.rejects(request(), /未返回 JSON/);
    reply = {status:200,responseText:'{"status":0}'};
    assert.equal((await request()).status, 0);
    console.log('PASS HTTP error metadata: non-JSON 509 retains status and Retry-After; HTML success response rejected');
}

async function driveVerification() {
    const bytes = Buffer.from('1\n00:00:01,000 --> 00:00:03,000\n中文\n');
    const video = {id:'v',parentId:'p',name:'电影.2000.mkv',size:10000};
    const subtitle = {id:'s',name:'电影.2000.zh-cn.srt',size:bytes.length};
    for (const scenario of ['transient','permanent','mismatch','list-transient','existing','existing-mismatch','duplicate','cancel']) {
        let uploaded = scenario.startsWith('existing'), uploadCalls = 0, readCalls = 0, urlCalls = 0, listingCalls = 0, stopped = false;
        const logs = [];
        const ctx = vm.createContext({URL, atob, Uint8Array, Date,
            sleep:async () => {}, paced:(_delay,fn) => fn,
            apiCode:() => 0, apiError:() => Error('API error'), selectedTreeCache:null,
            subtitleDownloadUrl:url => url,
            subtitleMd5:value => crypto.createHash('md5').update(value).digest('hex'),
            subtitleBinary:async url => {
                readCalls++;
                assert.equal(new URL(url).searchParams.get('n'), String(urlCalls), 'Each read must use a newly acquired URL');
                if (scenario === 'cancel') { stopped = true; throw Error('文件传输连接失败'); }
                if (scenario === 'permanent' || scenario === 'transient' && readCalls <= 2) throw Error('文件传输连接失败');
                return scenario.includes('mismatch') ? Buffer.from('wrong') : bytes;
            },
            requestJson:async (url,options) => {
                if (url.endsWith('/file/upload_request')) { uploadCalls++; uploaded = true; return {data:{Reuse:true}}; }
                if (url.endsWith('/file/download_info')) { urlCalls++; return {data:{DownloadUrl:'https://drive.example/file?n='+urlCalls}}; }
                throw Error('Unexpected request '+url);
            },
            SUBTITLE_LIMIT:16*1024*1024
        });
        vm.runInContext(part('    function evict(', '    function nonNegativeInteger(')+part('    function subtitleDrive(', '    function subtitleInventory('), ctx);
        ctx.driveContext = {session:{provider:'123',base:'https://www.123pan.com',headers:{}}, source:{children:async () => {
            listingCalls++;
            if (uploaded && scenario === 'list-transient' && listingCalls <= 3) throw Error('网络连接失败');
            return uploaded ? [video, subtitle, ...(scenario === 'duplicate' ? [{...subtitle,id:'s2'}] : [])] : [video];
        }}};
        const drive = vm.runInContext('subtitleDrive(driveContext)', ctx);
        const result = drive.save({node:video}, subtitle.name, bytes, message => logs.push(message), () => { if (stopped) throw Error('已停止'); });
        if (['transient','list-transient','existing'].includes(scenario)) {
            assert.equal((await result).id, 's');
            if (scenario === 'transient') { assert.equal(urlCalls, 3); assert.equal(readCalls, 3); assert.ok(logs.some(line => line.includes('重试 2/2'))); }
        } else {
            await assert.rejects(result, scenario === 'cancel' ? /已停止/ : scenario === 'existing-mismatch' ? /同名字幕已存在/ : /上传请求已提交，但核验未通过/);
            if (scenario === 'permanent') { assert.equal(readCalls, 3); assert.equal(urlCalls, 3); }
            if (scenario === 'cancel') assert.equal(readCalls, 1);
        }
        assert.equal(uploadCalls, scenario.startsWith('existing') ? 0 : 1, scenario+': never repeat upload');
    }
    console.log('PASS drive: transient read/list recovery; fresh signed URLs; bounded permanent failure; mismatches and duplicate names rejected; existing file safe; cancellation; exactly one upload');
}

(async () => { await remoteErrors(); await driveVerification(); })().catch(error => { console.error(error); process.exitCode=1; });
