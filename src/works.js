/** Collects display names and supported aliases from a TMDB work. */
function mediaWorkNames(detail) {
    return [
        ...new Set(
            [
                detail.title,
                detail.name,
                detail.original_title,
                detail.original_name,
                ...(detail.workAliases || []),
                ...(detail.alternative_titles?.titles || detail.alternative_titles?.results || [])
                    .filter((item) => ['CN', 'TW', 'HK', 'JP', 'US', 'GB'].includes(item.iso_3166_1))
                    .map((item) => item.title),
            ]
                .filter((value) => typeof value === 'string' && value.trim())
                .map((value) => value.trim())
        ),
    ].slice(0, 40);
}
/** Loads TMDB work metadata and verifies aliases against the requested work. */
async function mediaWorkDetail(client, type, id, check = () => {}) {
    check();
    const detail = await client.get(`/${type}/${id}`, { append_to_response: 'alternative_titles' });
    check();
    if (String(detail.id) !== String(id)) throw new Error('作品资料编号与目标不一致');
    const result = { ...detail, workAliases: mediaWorkNames(detail) };
    // Original titles already include Japanese. English is an optional extra, never a prerequisite.
    try {
        const english = await client.get(`/${type}/${id}`, { language: 'en-US' });
        check();
        if (
            String(english.id) !== String(id) ||
            (detail.release_date || detail.first_air_date || '').slice(0, 4) !==
                (english.release_date || english.first_air_date || '').slice(0, 4)
        )
            throw new Error('英文资料的编号或年份与作品不一致');
        result.workAliases = mediaWorkNames({
            ...result,
            workAliases: [...result.workAliases, english.title, english.name],
        });
    } catch (error) {
        check();
        if (error.stop || /编号或年份/.test(error.message)) throw error;
    }
    check();
    return result;
}
