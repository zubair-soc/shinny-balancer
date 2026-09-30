async function openRosterRating(registrationId, playerName) {
    if (window.rosterRatingLoading) return;
    window.rosterRatingLoading = true;
    try {
        const { data: registration, error: registrationError } = await supabaseClient
            .from('skate_registrations').select('player_id').eq('id', registrationId).single();
        if (registrationError) throw registrationError;
        const playerId = registration.player_id || (await getOrCreatePlayerRecord(playerName)).player_id;
        const { data: player, error } = await supabaseClient.from('skate_manager_players')
            .select('*').eq('id', playerId).single();
        if (error) throw error;
        const cached = allPlayers.find(item => item.id === player.id);
        if (cached) Object.assign(cached, player);
        else allPlayers.push(player);
        await openPlayerProfile(player.id);
        document.getElementById('playerProfileModal').querySelector('div').scrollTop = 0;
    } catch (error) {
        console.error('Unable to open player rating:', error);
        alert('Unable to open player rating: ' + (error.message || error));
    } finally {
        window.rosterRatingLoading = false;
    }
}
