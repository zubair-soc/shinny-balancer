async function getOrCreatePlayerRecord(name) {
    const { data, error } = await supabaseClient.rpc('get_or_create_skate_manager_player', {
        p_name: name
    });
    if (error) throw error;

    const player = Array.isArray(data) ? data[0] : data;
    if (!player?.player_id) throw new Error('Supabase did not return the player record.');
    return player;
}
