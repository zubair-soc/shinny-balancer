        async function addPlayerToSkate() {
            const playerName = capitalizeName(document.getElementById('newPlayerName').value);
            
            if (!playerName) {
                alert('Please enter a player name');
                return;
            }

            // Duplicate check
            const isDup = await checkDuplicate(currentSkateId, playerName);
            if (isDup) {
                alert(`⚠️ ${playerName} is already on this skate!`);
                return;
            }

            try {
                // Reuse an existing player record where possible so goalie
                // history and future credits stay attached to the right person.
                const playerRecord = await getOrCreatePlayerRecord(playerName);
                if (!playerRecord) throw new Error('Supabase did not return the player record.');

                const usuallyGoalie = await isUsuallyGoalie(playerName);

                // Get current max position
                const { data: existing } = await supabaseClient
                    .from('skate_registrations')
                    .select('position')
                    .eq('skate_id', currentSkateId)
                    .order('position', { ascending: false })
                    .limit(1);

                const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 1;

                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .insert([{
                        skate_id: currentSkateId,
                        player_id: playerRecord.player_id,
                        player_name: playerName,
                        is_goalie: usuallyGoalie,
                        is_paid: true,
                        is_waitlist: false,
                        position: nextPosition
                    }]);

                if (error) throw error;

                if (!allPlayers.some(player => player.name?.toLowerCase() === playerName.toLowerCase())) {
                    allPlayers.push({ name: playerRecord.player_name, rating: null, id: playerRecord.player_id });
                }

                document.getElementById('newPlayerName').value = '';
                document.getElementById('newPlayerSuggestions').style.display = 'none';
                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
                loadSkates(); // Refresh card counts in background
            } catch (error) {
                console.error('Error adding player:', error);
                alert(`Could not add ${playerName}: ${error?.message || 'Unexpected database error'}`);
            }
        }

        async function isUsuallyGoalie(playerName) {
            const { data, error } = await supabaseClient
                .from('skate_registrations')
                .select('is_goalie')
                .ilike('player_name', playerName)
                .eq('is_waitlist', false)
                .order('created_at', { ascending: false })
                .limit(4);
            if (error) throw error;
            if (!data || data.length < 3) return false;

            // Auto-mark only when at least three of the player's four most
            // recent non-waitlist skates were played as goalie.
            const goalieCount = data.filter(registration => registration.is_goalie).length;
            return goalieCount >= 3;
        }

        async function addToWaitlist() {
            const playerName = capitalizeName(document.getElementById('newWaitlistName').value);
            
            if (!playerName) {
                alert('Please enter a player name');
                return;
            }

            try {
                const { data: existing } = await supabaseClient
                    .from('skate_registrations')
                    .select('position')
                    .eq('skate_id', currentSkateId)
                    .order('position', { ascending: false })
                    .limit(1);

                const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 1;

                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .insert([{
                        skate_id: currentSkateId,
                        player_name: playerName,
                        is_paid: false,
                        is_waitlist: true,
                        position: nextPosition
                    }]);

                if (error) throw error;

                document.getElementById('newWaitlistName').value = '';
                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
            } catch (error) {
                console.error('Error adding to waitlist:', error);
                alert('Failed to add to waitlist');
            }
        }

        async function toggleGoalie(registrationId, makeGoalie) {
            try {
                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .update({ is_goalie: makeGoalie })
                    .eq('id', registrationId);

                if (error) throw error;

                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
            } catch (error) {
                console.error('Error toggling goalie:', error);
            }
        }

        async function togglePaid(registrationId, isPaid) {
            try {
                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .update({ is_paid: isPaid })
                    .eq('id', registrationId);

                if (error) throw error;

                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
            } catch (error) {
                console.error('Error toggling paid:', error);
            }
        }

        let replacingRegistrationId = null;
        let replacingPlayerName = null;

        function showReplacePlayerModal(registrationId, playerName) {
            replacingRegistrationId = registrationId;
            replacingPlayerName = playerName;
            document.getElementById('replacePlayerName').textContent = playerName;
            document.getElementById('replacePlayerInput').value = '';
            document.getElementById('replaceSuggestions').style.display = 'none';
            document.getElementById('replacePlayerModal').classList.add('active');
            setTimeout(() => document.getElementById('replacePlayerInput').focus(), 100);
        }

        function closeReplacePlayerModal() {
            document.getElementById('replacePlayerModal').classList.remove('active');
            replacingRegistrationId = null;
            replacingPlayerName = null;
        }

        function filterReplaceSuggestions(query) {
            const box = document.getElementById('replaceSuggestions');
            if (!query || query.length < 2) { box.style.display = 'none'; return; }
            const lower = query.toLowerCase();
            const matches = allPlayers.filter(p => p.name.toLowerCase().includes(lower)).slice(0, 8);
            if (matches.length === 0) { box.style.display = 'none'; return; }
            box.innerHTML = matches.map(p => `
                <div style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--card-border);"
                    onmousedown="selectReplacePlayer(${inlineJSString(p.name)})"
                    onmouseover="this.style.background='rgba(var(--primary-rgb),0.1)'"
                    onmouseout="this.style.background=''">
                    ${escapeHTML(p.name)}
                </div>`).join('');
            box.style.display = 'block';
        }

        function selectReplacePlayer(name) {
            document.getElementById('replacePlayerInput').value = name;
            document.getElementById('replaceSuggestions').style.display = 'none';
        }

        async function confirmReplacePlayer() {
            const newName = capitalizeName(document.getElementById('replacePlayerInput').value.trim());
            if (!newName) { alert('Please enter a player name'); return; }
            if (!replacingRegistrationId) return;

            // Duplicate check
            const isDup = await checkDuplicate(currentSkateId, newName, replacingRegistrationId);
            if (isDup) {
                alert(`⚠️ ${newName} is already on this skate!`);
                return;
            }

            const skate = allSkates.find(s => s.id === currentSkateId);

            try {
                // Resolve the incoming player first so the roster's player_id stays
                // aligned with the replacement. Payment belongs to the sold spot.
                const playerRecord = await getOrCreatePlayerRecord(newName);
                if (!playerRecord?.player_id) throw new Error('Supabase did not return the player record.');

                // Replacing means the spot was sold; preserve its paid status and
                // do not issue credit to the outgoing player.
                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .update({ player_name: newName, player_id: playerRecord.player_id })
                    .eq('id', replacingRegistrationId);
                if (error) throw error;

                // Update saved teams if they exist
                const { data: savedTeams } = await supabaseClient
                    .from('skate_teams').select('id, dark_team, light_team').eq('skate_id', currentSkateId).maybeSingle();
                if (savedTeams) {
                    const updateTeam = (team) => team.map(p => p.name === replacingPlayerName ? { ...p, name: newName } : p);
                    await supabaseClient.from('skate_teams').update({
                        dark_team: updateTeam(savedTeams.dark_team || []),
                        light_team: updateTeam(savedTeams.light_team || [])
                    }).eq('id', savedTeams.id);
                }
                if (!allPlayers.some(player => player.name.toLowerCase() === newName.toLowerCase())) {
                    allPlayers.push({ name: playerRecord.player_name, rating: null, id: playerRecord.player_id });
                }
                closeReplacePlayerModal();
                await loadRoster(currentSkateId, skate?.capacity || 24);
            } catch (err) {
                console.error('Replace failed:', err);
                alert(`Failed to replace player: ${err.message || 'Please try again.'}`);
            }
        }

        async function checkDuplicate(skateId, playerName, excludeRegistrationId = null) {
            const { data } = await supabaseClient
                .from('skate_registrations')
                .select('id, player_name')
                .eq('skate_id', skateId);
            if (!data) return false;
            return data.some(r => 
                r.player_name.toLowerCase() === playerName.toLowerCase() &&
                r.id !== excludeRegistrationId
            );
        }

        async function moveToWaitlist(registrationId) {
            try {
                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .update({ is_waitlist: true })
                    .eq('id', registrationId);

                if (error) throw error;

                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
            } catch (error) {
                console.error('Error moving to waitlist:', error);
            }
        }

        async function moveToRoster(registrationId) {
            try {
                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .update({ is_waitlist: false, is_paid: true })
                    .eq('id', registrationId);

                if (error) throw error;

                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
            } catch (error) {
                console.error('Error moving to roster:', error);
            }
        }

        let pendingRosterRemoval = null;

        async function deletePlayer(registrationId) {
            try {
                const { data: registration, error } = await supabaseClient
                    .from('skate_registrations')
                    .select('id, player_id, player_name, is_paid, is_waitlist')
                    .eq('id', registrationId)
                    .single();
                if (error) throw error;

                const skate = allSkates.find(item => item.id === currentSkateId);
                const creditAmount = Number(String(skate?.cost ?? '').replace(/[^0-9.]/g, ''));
                const canOfferCredit = registration.is_paid && !registration.is_waitlist && Number.isFinite(creditAmount) && creditAmount > 0;
                const creditLabel = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(creditAmount || 0);
                pendingRosterRemoval = { registration, skate };
                document.getElementById('removePlayerPrompt').textContent = canOfferCredit
                    ? `Remove ${registration.player_name} from ${skate?.title || 'this skate'}? Choose whether to issue their skate fee as credit.`
                    : `Remove ${registration.player_name} from this skate? Credit is unavailable for unpaid or waitlisted spots, or skates without a positive fee.`;
                const creditButton = document.querySelector('#removePlayerModal button[onclick="confirmRemovePlayer(true)"]');
                creditButton.hidden = !canOfferCredit;
                creditButton.querySelector('.removal-choice-title').textContent = `Remove + issue ${creditLabel} credit`;
                creditButton.querySelector('.removal-choice-description').textContent = `${creditLabel} will be added to ${registration.player_name}’s available credit.`;
                document.getElementById('removePlayerModal').classList.add('active');
            } catch (error) {
                console.error('Error preparing player removal:', error);
                alert(`Could not remove player: ${error.message}`);
            }
        }

        function closeRemovePlayerModal() {
            document.getElementById('removePlayerModal').classList.remove('active');
            pendingRosterRemoval = null;
        }

        async function confirmRemovePlayer(issueCredit) {
            if (!pendingRosterRemoval) return;
            const { registration, skate } = pendingRosterRemoval;
            closeRemovePlayerModal();
            await finishRosterRemoval(registration, skate, issueCredit);
        }

        async function finishRosterRemoval(registration, skate, issueCredit) {
            try {
                const { error } = await supabaseClient.rpc('remove_skate_player', {
                    p_registration_id: registration.id,
                    p_issue_credit: issueCredit
                });
                if (error) {
                    const missingFunction = error.code === 'PGRST202' || error.code === '42883';
                    if (missingFunction && !issueCredit) {
                        const { error: deleteError } = await supabaseClient
                            .from('skate_registrations').delete().eq('id', registration.id);
                        if (deleteError) throw deleteError;
                    } else if (missingFunction) {
                        throw new Error('Credit removal is not enabled yet. The staging database needs the removal-credit migration. The player has not been removed.');
                    } else {
                        throw error;
                    }
                }

                if (navigator.vibrate) navigator.vibrate(50);
                await loadRoster(currentSkateId, skate?.capacity || 24);
                loadSkates();
            } catch (error) {
                console.error('Error removing player:', error);
                alert(`Could not remove player${issueCredit ? ' and issue credit' : ''}: ${error.message}`);
            }
        }

        // ========== MOVE TO ANOTHER SKATE FUNCTIONS ==========
        let playerToMove = null;

        async function showMoveToSkateModal(registrationId, playerName) {
            playerToMove = registrationId;
            document.getElementById('movePlayerName').textContent = playerName;
            
            // Get future skates (excluding current skate)
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            
            const futureSkates = allSkates.filter(skate => {
                const skateDate = new Date(skate.date + 'T00:00:00');
                return skateDate >= now && skate.id !== currentSkateId;
            }).sort((a, b) => new Date(a.date) - new Date(b.date));

            const skatesList = document.getElementById('moveToSkatesList');
            
            if (futureSkates.length === 0) {
                skatesList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">No other upcoming skates available</div>';
            } else {
                skatesList.innerHTML = futureSkates.map(skate => {
                    const date = new Date(skate.date + 'T00:00:00');
                    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    
                    return `
                        <div class="quick-add-skate-card" onclick="movePlayerToSkate(${skate.id})" style="cursor: pointer;">
                            <div class="quick-add-skate-info">
                                <div class="quick-add-skate-title">${escapeHTML(skate.title || `Skate ${skate.id}`)}</div>
                                <div class="quick-add-skate-date">${dateStr} · ${formatTime(skate.time_start)}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            document.getElementById('moveToSkateModal').classList.add('active');
        }

        async function movePlayerToSkate(targetSkateId) {
            if (!playerToMove) return;

            try {
                // Get player data from current registration
                const { data: playerData, error: fetchError } = await supabaseClient
                    .from('skate_registrations')
                    .select('*')
                    .eq('id', playerToMove)
                    .single();

                if (fetchError) throw fetchError;

                // Get next position in target skate
                const { data: targetRoster } = await supabaseClient
                    .from('skate_registrations')
                    .select('position')
                    .eq('skate_id', targetSkateId)
                    .order('position', { ascending: false })
                    .limit(1);

                const nextPosition = targetRoster && targetRoster.length > 0 ? targetRoster[0].position + 1 : 1;

                // Add to new skate
                const { error: insertError } = await supabaseClient
                    .from('skate_registrations')
                    .insert({
                        skate_id: targetSkateId,
                        player_name: playerData.player_name,
                        is_goalie: playerData.is_goalie,
                        is_paid: playerData.is_paid,
                        is_waitlist: false,
                        friend_group: playerData.friend_group,
                        position: nextPosition
                    });

                if (insertError) throw insertError;

                // Delete from old skate
                const { error: deleteError } = await supabaseClient
                    .from('skate_registrations')
                    .delete()
                    .eq('id', playerToMove);

                if (deleteError) throw deleteError;

                // Close modal and refresh
                closeMoveToSkateModal();
                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
                await loadSkates(); // Refresh skate counts
                
                // Visual feedback
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }

            } catch (error) {
                console.error('Error moving player:', error);
                alert('Failed to move player');
            }
        }

        function closeMoveToSkateModal() {
            document.getElementById('moveToSkateModal').classList.remove('active');
            playerToMove = null;
        }

        // ========== EDIT RATING FUNCTION ==========
        function editRating(registrationId, playerName, currentRating) {
            document.getElementById('ratingModalPlayerName').textContent = playerName;
            document.getElementById('ratingModalInput').value = currentRating || 0;
            document.getElementById('ratingModal').classList.add('active');
            setTimeout(() => {
                const input = document.getElementById('ratingModalInput');
                input.focus();
                input.select();
            }, 50);
            window._pendingRatingEdit = { registrationId, playerName };
        }

        async function saveRatingFromModal() {
            const { registrationId, playerName } = window._pendingRatingEdit || {};
            if (!registrationId) return;
            const rating = parseFloat(document.getElementById('ratingModalInput').value);
            if (isNaN(rating) || rating < 0) {
                alert('Please enter a valid rating (0 or higher)');
                return;
            }
            closeRatingModal();
            try {
                // Get player_id from registration
                const { data: registration } = await supabaseClient
                    .from('skate_registrations')
                    .select('player_id, player_name')
                    .eq('id', registrationId)
                    .single();
                
                if (!registration) throw new Error('Registration not found');
                
                // Check if player exists in players table (team balancer)
                const { data: existing } = await supabaseClient
                    .from('skate_manager_players')
                    .select('id')
                    .ilike('name', registration.player_name)
                    .single();
                
                if (existing) {
                    // Update existing rating
                    const { error } = await supabaseClient
                        .from('players')
                        .update({ 
                            rating: rating,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);
                    
                    if (error) throw error;
                } else {
                    // Create new player with rating
                    const { error } = await supabaseClient
                        .from('players')
                        .insert({ 
                            name: registration.player_name,
                            rating: rating
                        });
                    
                    if (error) throw error;
                }
                
                // Reload roster to show updated rating
                // Also update allPlayers cache so subsequent opens are correct
                const cachedPlayer = allPlayers.find(p => p.name.toLowerCase() === registration.player_name.toLowerCase());
                if (cachedPlayer) cachedPlayer.rating = rating;
                
                await loadRoster(currentSkateId, allSkates.find(s => s.id === currentSkateId)?.capacity || 24);
                
            } catch (error) {
                console.error('Error updating rating:', error);
                alert('Failed to update rating: ' + error.message);
            }
        }

        function closeRatingModal() {
            document.getElementById('ratingModal').classList.remove('active');
            window._pendingRatingEdit = null;
        }

        async function confirmDeleteSkate() {
            if (!window.isSkateAdmin?.()) return;
            if (!confirm('Delete this entire skate? This cannot be undone.')) return;

            try {
                const { error } = await supabaseClient
                    .from('skates')
                    .delete()
                    .eq('id', currentSkateId);

                if (error) throw error;

                closeRosterModal();
                await loadSkates();
                alert('✓ Skate deleted');
            } catch (error) {
                console.error('Error deleting skate:', error);
                alert('Failed to delete skate');
            }
        }

        function closeRosterModal() {
            document.getElementById('rosterModal').classList.remove('active');
            // Don't clear currentSkateId here - we need it for editing!
            // It will be cleared when appropriate (after save, or opening different skate)
        }

        function selectManualCopyText() {
            const ta = document.getElementById('manualCopyText');
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
        }

        function showManualCopyModal(message) {
            document.getElementById('manualCopyText').value = message;
            document.getElementById('manualCopyModal').classList.add('active');
            // Auto-select after modal renders
            setTimeout(() => selectManualCopyText(), 150);
        }

        async function copyForWhatsApp(event) {
            if (!currentSkateId) return;
            
            try {
                const skate = allSkates.find(s => s.id === currentSkateId);
                if (!skate) return;

                let naitParkingCode = '';
                if (String(skate.location || '').trim().toLowerCase().startsWith('nait')) {
                    try {
                        naitParkingCode = await window.getNaitParkingCode();
                    } catch (parkingError) {
                        console.error('Could not load the NAIT parking code:', parkingError);
                        alert('Could not load the NAIT parking code. Check the one-time Admin Settings setup, then try again.');
                        return;
                    }
                    if (!naitParkingCode) {
                        alert('Add the current NAIT parking code under Admin → Settings before copying this roster.');
                        return;
                    }
                }

                const { data, error } = await supabaseClient
                    .from('skate_registrations')
                    .select('*')
                    .eq('skate_id', currentSkateId)
                    .eq('is_waitlist', false)
                    .order('position');

                if (error) throw error;

                const sortedRoster = data.sort((a, b) => {
                    if (a.is_goalie && !b.is_goalie) return -1;
                    if (!a.is_goalie && b.is_goalie) return 1;
                    return a.position - b.position;
                });

                const date = new Date(skate.date + 'T00:00:00');
                const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

                let message = `🏒 ${skate.title}\n`;
                message += `Date & Time: ${dateStr} · ${formatTime(skate.time_start)}–${formatTime(skate.time_end)}\n`;
                message += `Cost: ${skate.cost} — payments@shinnyofchampions.com\n`;
                message += `Location: ${skate.location}\n`;
                if (naitParkingCode) message += `Parking code: ${naitParkingCode}\n`;

                sortedRoster.forEach((player, index) => {
                    const num = index + 1;
                    const emoji = player.is_goalie ? ' 🥅' : '';
                    message += `${num}. ${player.player_name}${emoji}\n`;
                });

                message += `\nAll players must sign the waiver before playing: shinnyofchampions.com/waiver\n`;

                let copied = false;

                // Method 1: Modern clipboard API
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    try {
                        await navigator.clipboard.writeText(message);
                        copied = true;
                    } catch (e) {
                        console.log('clipboard API failed:', e.message);
                    }
                }

                // Method 2: execCommand via hidden textarea
                if (!copied) {
                    try {
                        const ta = document.createElement('textarea');
                        ta.value = message;
                        ta.setAttribute('readonly', '');
                        ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;font-size:12pt;';
                        document.body.appendChild(ta);
                        ta.focus();
                        ta.select();
                        ta.setSelectionRange(0, message.length);
                        copied = document.execCommand('copy');
                        document.body.removeChild(ta);
                    } catch (e) {
                        console.log('execCommand failed:', e.message);
                    }
                }

                if (copied) {
                    const btn = event?.target || event?.currentTarget;
                    if (btn) {
                        const originalText = btn.innerHTML;
                        btn.innerHTML = '✓ Copied!';
                        btn.style.background = '#059669';
                        setTimeout(() => {
                            btn.innerHTML = originalText;
                            btn.style.background = '#25D366';
                        }, 2000);
                    }
                } else {
                    // Manual fallback — show large modal with text pre-selected
                    showManualCopyModal(message);
                }

            } catch (error) {
                console.error('Error copying for WhatsApp:', error);
                alert('Failed to copy. Please try again.');
            }
        }

        // CSV/ICS Import Functions
