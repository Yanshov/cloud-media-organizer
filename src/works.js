    // Shared, persistent work metadata. File associations remain separately fingerprinted.
    function mediaWorkNames(detail) {
        return [...new Set([detail.title, detail.name, detail.original_title, detail.original_name,
            ...(detail.workAliases || []),
            ...(detail.alternative_titles?.titles || detail.alternative_titles?.results || [])
                .filter(item => ['CN','TW','HK','JP','US','GB'].includes(item.iso_3166_1)).map(item => item.title)]
            .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].slice(0,40);
    }
    function mediaWorkLibrary() {
        if (mediaWorkLibrary.instance) return mediaWorkLibrary.instance;
        const key = 'cross-drive-work-library-v1', entries = new Map(GM_getValue(key, []));
        // Migrate trusted identification records without reusing their file association.
        for (const [,saved] of GM_getValue('cross-drive-media-records-v2', [])) {
            const match = String(saved?.match || '').match(/^(movie|tv):(\d+)$/);
            if (!match || !saved.query || !saved.year || entries.has(saved.match)) continue;
            entries.set(saved.match,{type:match[1],id:match[2],title:saved.query,year:saved.year,
                aliases:[...new Set([saved.query,...(saved.aliases || [])])],
                runtimeSeconds:match[1] === 'movie' ? saved.runtimeSeconds : undefined,updatedAt:Date.now(),partial:true});
        }
        evict(entries,1000);
        const valid = work => work && ['movie','tv'].includes(work.type) && /^\d+$/.test(String(work.id))
            && Array.isArray(work.aliases) && Date.now() - work.updatedAt < 30 * 86400000;
        const get = (type,id) => {
            const work = entries.get(type + ':' + id);
            return valid(work) ? {...work,aliases:[...work.aliases],seasons:work.seasons?.map(season => ({...season}))} : null;
        };
        return mediaWorkLibrary.instance = {
            get,
            find(parsed) {
                if (!parsed.year || !parsed.query) return null;
                const matches = [...entries.values()].filter(work => valid(work) && work.type === (parsed.tv ? 'tv' : 'movie')
                    && String(work.year) === String(parsed.year) && work.aliases.some(name => titleKey(name) === titleKey(parsed.query)));
                return matches.length === 1 ? get(matches[0].type,matches[0].id) : null;
            },
            remember(type,detail) {
                if (!['movie','tv'].includes(type) || !/^\d+$/.test(String(detail.id))) return;
                const identity = type + ':' + detail.id;
                entries.delete(identity);
                entries.set(identity,{type,id:String(detail.id),title:detail.title || detail.name,
                    year:(detail.release_date || detail.first_air_date || '').slice(0,4), aliases:mediaWorkNames(detail),
                    runtimeSeconds:type === 'movie' && Number(detail.runtime) > 0 ? Number(detail.runtime) * 60 : undefined,
                    seasons:type === 'tv' ? detail.seasons?.map(({season_number,episode_count}) => ({season_number,episode_count})) : undefined,
                    updatedAt:Date.now()});
                evict(entries,1000); GM_setValue(key,[...entries]);
            }
        };
    }
    async function mediaWorkDetail(client,type,id,check = () => {}) {
        check();
        const detail = await client.get(`/${type}/${id}`,{append_to_response:'alternative_titles'}); check();
        if (String(detail.id) !== String(id)) throw new Error('作品资料编号与目标不一致');
        const result = {...detail,workAliases:mediaWorkNames(detail)};
        // Original titles already include Japanese. English is an optional extra, never a prerequisite.
        try {
            const english = await client.get(`/${type}/${id}`,{language:'en-US'}); check();
            if (String(english.id) !== String(id) || (detail.release_date || detail.first_air_date || '').slice(0,4)
                !== (english.release_date || english.first_air_date || '').slice(0,4)) throw new Error('英文资料的编号或年份与作品不一致');
            result.workAliases = mediaWorkNames({...result,workAliases:[...result.workAliases,english.title,english.name]});
        } catch (error) { check(); if (error.stop || /编号或年份/.test(error.message)) throw error; }
        check(); mediaWorkLibrary().remember(type,result);
        return result;
    }
    async function resolveMediaWork(parsed,credential,check = () => {},log = () => {}) {
        const type = parsed.tv ? 'tv' : 'movie', library = mediaWorkLibrary();
        const apply = work => {
            if (!parsed.tv && parsed.year && work.year && String(parsed.year) !== String(work.year)) throw new Error('作品资料年份与目标不一致');
            parsed.tmdbId = String(work.id);
            parsed.aliases = [...new Set([...(parsed.aliases || []),...work.aliases])].slice(0,40);
            parsed.year ||= work.year;
            if (work.runtimeSeconds) parsed.runtimeSeconds = work.runtimeSeconds;
            parsed.seasons = parsed.tv ? work.seasons?.map(season => ({...season})) : undefined;
            parsed.workResolved = true;
            return true;
        };
        check();
        const cached = parsed.tmdbId ? library.get(type,parsed.tmdbId) : library.find(parsed);
        if (cached && (!cached.partial && (!parsed.tv || cached.seasons?.length) || !credential)) { log('作品资料复用', `${parsed.query} · ${type}:${cached.id} · ${cached.aliases.length} 个名称`); return apply(cached); }
        if (!credential) return false;
        const client = tmdbClient(credential);
        let id = parsed.tmdbId || cached?.id;
        if (!id) {
            if (!parsed.year || !parsed.query) return false;
            const results = await client.search(parsed.query); check();
            const matches = [];
            for (const item of results.filter(item => item.media_type === type
                && (item.release_date || item.first_air_date || '').slice(0,4) === String(parsed.year))) {
                let names = mediaWorkNames(item);
                if (!names.some(name => titleKey(name) === titleKey(parsed.query))) {
                    for (const language of ['zh-CN','zh-TW']) {
                        const local = await client.get(`/${type}/${item.id}`,{language}); check();
                        if (String(local.id) === String(item.id) && (local.release_date || local.first_air_date || '').slice(0,4) === String(parsed.year)) names.push(...mediaWorkNames(local));
                    }
                }
                if (names.some(name => titleKey(name) === titleKey(parsed.query))) matches.push(item);
            }
            if (matches.length !== 1) return false;
            id = matches[0].id;
        }
        const detail = await mediaWorkDetail(client,type,id,check);
        return apply({id:detail.id,aliases:mediaWorkNames(detail),year:(detail.release_date || detail.first_air_date || '').slice(0,4),
            seasons:detail.seasons,
            runtimeSeconds:type === 'movie' && Number(detail.runtime) > 0 ? Number(detail.runtime) * 60 : undefined});
    }
