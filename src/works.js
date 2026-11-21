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
