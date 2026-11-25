if (['www.guangyapan.com', 'guangyapan.com'].includes(location.hostname)) {
    installHooks();
    ready(() => initMergedMedia());
}
