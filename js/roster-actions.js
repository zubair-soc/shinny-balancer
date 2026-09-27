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
                        player_name: playerName,
                        is_paid: true,
                        is_waitlist: false,
                        position: nextPosition
                    }]);

                if (error) throw error;

                // Ensure player exists in players table
                const { data: existingPlayer } = await supabaseClient
                    .from('skate_manager_players').select('id').ilike('name', playerName).maybeSingle();
                if (!existingPlayer) {
                    await supabaseClient.from('players').insert({ name: playerName });
                    allPlayers.push({ name: playerName, rating: null });
                }
                document.getElementById('newPlayerName').value = '';
                document.getElementById('newPlayerSuggestions').style.display = 'none';
                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
                loadSkates(); // Refresh card counts in background
            } catch (error) {
                console.error('Error adding player:', error);
                alert('Failed to add player');
            }
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
            document.getElementById('replaceCreditNo').checked = true;

            // Show skate cost in the credit option
            const skate = allSkates.find(s => s.id === currentSkateId);
            const cost = window.isSkateAdmin?.() ? (skate ? skate.cost : '$25') : '';
            document.getElementById('replaceCreditAmount').textContent = cost;

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

            const giveCredit = window.isSkateAdmin?.() && document.getElementById('replaceCreditYes').checked;
            const skate = allSkates.find(s => s.id === currentSkateId);

            try {
                // Replace the player
                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .update({ player_name: newName })
                    .eq('id', replacingRegistrationId);
                if (error) throw error;

                // Issue credit if requested
                if (giveCredit && skate) {
                    const costNum = parseFloat((skate.cost || '$25').replace('$', '')) || 25;

                    // Look up player ID
                    const { data: playerData } = await supabaseClient
                        .from('skate_manager_players')
                        .select('id')
                        .ilike('name', replacingPlayerName)
                        .limit(1);

                    if (playerData && playerData.length > 0) {
                        const now = new Date().toISOString();
                        await supabaseClient.from('player_credits').insert({
                            player_id: playerData[0].id,
                            amount: costNum,
                            reason: `Replaced from ${skate.title}`,
                            status: 'active',
                            created_by: 'Manual',
                            created_at: now,
                            last_activity_at: now
                        });
                    } else {
                        alert(`⚠️ Player replaced but couldn't find "${replacingPlayerName}" in the players database to issue credit. Add manually in Credits Manager.`);
                    }
                }

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
                // Ensure new player in DB
                const { data: existingNewPlayer } = await supabaseClient
                    .from('skate_manager_players').select('id').ilike('name', newName).maybeSingle();
                if (!existingNewPlayer) {
                    await supabaseClient.from('players').insert({ name: newName });
                    allPlayers.push({ name: newName, rating: null });
                }
                closeReplacePlayerModal();
                await loadRoster(currentSkateId, skate?.capacity || 24);
            } catch (err) {
                console.error('Replace failed:', err);
                alert('Failed to replace player');
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

        async function deletePlayer(registrationId) {
            if (!confirm('Remove this player?')) return;

            try {
                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .delete()
                    .eq('id', registrationId);

                if (error) throw error;

                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
                loadSkates(); // Refresh card counts in background
            } catch (error) {
                console.error('Error deleting player:', error);
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

        // ========== GIVE CREDIT FUNCTION ==========
        async function giveCredit(registrationId, playerName) {
            if (!window.isSkateAdmin?.()) return;
            if (!currentSkateId) return;

            // Get the skate cost
            const skate = allSkates.find(s => s.id === currentSkateId);
            if (!skate) return;

            const creditAmount = parseFloat(skate.cost.replace('$', ''));
            
            if (!confirm(`Give ${playerName} a $${creditAmount} credit and remove them from ${skate.title}?`)) {
                return;
            }

            try {
                // Get registration details to find player_id
                const { data: registration, error: regError } = await supabaseClient
                    .from('skate_registrations')
                    .select('player_id, player_name')
                    .eq('id', registrationId)
                    .single();

                if (regError) throw regError;

                // Find or create player in players table
                let playerId = registration.player_id;
                
                if (!playerId) {
                    // Try to find player by name
                    const { data: existingPlayer } = await supabaseClient
                        .from('players')
                        .select('id')
                        .ilike('name', registration.player_name)
                        .single();

                    if (existingPlayer) {
                        playerId = existingPlayer.id;
                    } else {
                        // Create new player
                        const { data: newPlayer, error: createError } = await supabaseClient
                            .from('players')
                            .insert({ name: registration.player_name })
                            .select('id')
                            .single();

                        if (createError) throw createError;
                        playerId = newPlayer.id;
                    }
                }

                // Create credit
                const { error: creditError } = await supabaseClient
                    .from('player_credits')
                    .insert({
                        player_id: playerId,
                        amount: creditAmount,
                        reason: `Dropped from ${skate.title}`,
                        source_skate_id: currentSkateId,
                        status: 'active',
                        created_by: 'System',
                        created_at: new Date().toISOString()
                    });

                if (creditError) throw creditError;

                // Delete player from skate
                const { error: deleteError } = await supabaseClient
                    .from('skate_registrations')
                    .delete()
                    .eq('id', registrationId);

                if (deleteError) throw deleteError;

                // Haptic feedback
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }

                // Refresh roster and skate counts
                await loadRoster(currentSkateId, skate.capacity);
                await loadSkates();

            } catch (error) {
                console.error('Error giving credit:', error);
                alert('Failed to give credit: ' + error.message);
            }
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
