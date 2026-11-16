    if (location.hostname === 'www.guangyapan.com') {
        installHooks();
        ready(() => { initGuangya(); initMediaOrganizer('光鸭'); initSubtitles('光鸭'); });
    } else if (['pan.baidu.com', 'yun.baidu.com'].includes(location.hostname)) ready(() => initManifestImporter('百度', initExporter('百度')));
    else if (is123Host(location.hostname)) { installHooks(); ready(() => { initManifestImporter('123', initExporter('123')); initMediaOrganizer(); initSubtitles(); }); }
