if (location.hostname === 'www.guangyapan.com') {
    installHooks();
    ready(() => initMergedMedia('光鸭'));
} else if (is123Host(location.hostname)) {
    installHooks();
    ready(() => initMergedMedia('123'));
}
