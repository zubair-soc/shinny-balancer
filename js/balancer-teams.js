        let openPlayerMenu = null;
        let playerMenuListenerInstalled = false;

        async function saveTeams() {
            if (!currentBalancerSkateId || !supabaseClient) {
                setTeamSaveStatus('Teams are not linked to a skate yet.', false);
                return false;
            }
            setTeamSaveStatus('Saving teams…');
            try {
                const { error } = await supabaseClient
                    .from('skate_teams')
                    .upsert({
                        skate_id: currentBalancerSkateId,
                        dark_team: darkTeam,
                        light_team: lightTeam,
                        saved_at: new Date().toISOString()
                    }, { onConflict: 'skate_id' });
                if (error) throw error;
                setTeamSaveStatus('Teams saved');
                return true;
            } catch (err) {
                console.error('Failed to save teams:', err);
                setTeamSaveStatus('Teams could not be saved. Apply the staging database update, then try again.', false);
                return false;
            }
        }

        function setTeamSaveStatus(message, success = true) {
            const status = document.getElementById('teamSaveStatus');
            if (!status) return;
            status.textContent = message;
            status.dataset.state = success ? 'success' : 'error';
            status.style.color = success ? 'var(--text-muted)' : '#dc2626';
        }

        function normalizeBalancerPlayerName(name) {
            return String(name || '').trim().toLocaleLowerCase();
        }

        function teamRatingTotal(team) {
            return team.reduce((total, player) => total + (!player.isGoalie && Number.isFinite(Number(player.rating)) ? Number(player.rating) : 0), 0);
        }

        function teamWithRoomFor(player) {
            const darkGoalies = darkTeam.filter(item => item.isGoalie).length;
            const lightGoalies = lightTeam.filter(item => item.isGoalie).length;
            if (player.isGoalie && darkGoalies !== lightGoalies) return darkGoalies < lightGoalies ? 'dark' : 'light';
            if (darkTeam.length !== lightTeam.length) return darkTeam.length < lightTeam.length ? 'dark' : 'light';
            const darkRating = teamRatingTotal(darkTeam);
            const lightRating = teamRatingTotal(lightTeam);
            return darkRating <= lightRating ? 'dark' : 'light';
        }

        async function loadSavedTeams(skateId) {
            if (!skateId || !supabaseClient) return false;
            try {
                const { data, error } = await supabaseClient
                    .from('skate_teams')
                    .select('dark_team, light_team, saved_at')
                    .eq('skate_id', skateId)
                    .maybeSingle();

                if (error || !data) return false;

                const rosterByName = new Map(matchedPlayers.map(player => [normalizeBalancerPlayerName(player.name), player]));
                const assignedNames = new Set();
                const keepCurrentRoster = team => (team || []).flatMap(savedPlayer => {
                    const key = normalizeBalancerPlayerName(savedPlayer.name);
                    const currentPlayer = rosterByName.get(key);
                    if (!currentPlayer) return [];
                    assignedNames.add(key);
                    // Keep saved player edits and team placement, while syncing
                    // goalie and friend-group details from the current roster.
                    return [{ ...currentPlayer, ...savedPlayer, name: currentPlayer.name,
                        rating: currentPlayer.rating,
                        isGoalie: currentPlayer.isGoalie,
                        friendGroup: currentPlayer.friendGroup || savedPlayer.friendGroup || null }];
                });

                darkTeam = keepCurrentRoster(data.dark_team);
                lightTeam = keepCurrentRoster(data.light_team);
                const droppedCount = (data.dark_team || []).concat(data.light_team || [])
                    .filter(player => !rosterByName.has(normalizeBalancerPlayerName(player.name))).length;
                const newPlayers = matchedPlayers.filter(player => !assignedNames.has(normalizeBalancerPlayerName(player.name)));
                const additions = { dark: 0, light: 0 };
                newPlayers.forEach(player => {
                    const target = teamWithRoomFor(player);
                    (target === 'dark' ? darkTeam : lightTeam).push(player);
                    additions[target]++;
                });

                renderTeams();
                if (newPlayers.length || droppedCount) {
                    const addSummary = [
                        additions.dark ? `+${additions.dark} to Dark` : '',
                        additions.light ? `+${additions.light} to Light` : '',
                        droppedCount ? `−${droppedCount} removed` : ''
                    ].filter(Boolean).join(' · ');
                    const saved = await saveTeams();
                    if (saved) setTeamSaveStatus(`Roster updated: ${addSummary}. Existing team placements kept.`);
                } else {
                    setTeamSaveStatus('Saved teams loaded. Roster unchanged.');
                }
                return true;
            } catch (err) {
                console.error('Failed to load saved teams:', err);
                return false;
            }
        }

        function balanceTeams() {
            console.log('balanceTeams called');
            console.log('matchedPlayers:', matchedPlayers);
            console.log('matchedPlayers.length:', matchedPlayers.length);
            
            if (matchedPlayers.length === 0) {
                alert('Please match players first');
                return;
            }

            console.log('Starting to balance teams...');
            
            const totalPlayers = matchedPlayers.length;
            const targetDark = Math.ceil(totalPlayers / 2);
            const targetLight = Math.floor(totalPlayers / 2);
            
            // Separate goalies from skaters
            const goalies = matchedPlayers.filter(p => p.isGoalie);
            const skaters = matchedPlayers.filter(p => !p.isGoalie);
            
            // Separate grouped and ungrouped skaters
            const grouped = {};
            const ungrouped = [];

            skaters.forEach(player => {
                if (player.friendGroup) {
                    if (!grouped[player.friendGroup]) {
                        grouped[player.friendGroup] = [];
                    }
                    grouped[player.friendGroup].push(player);
                } else {
                    ungrouped.push(player);
                }
            });

            console.log('Goalies:', goalies);
            console.log('Grouped skaters:', grouped);
            console.log('Ungrouped skaters:', ungrouped);
            console.log(`Target team sizes: Dark ${targetDark}, Light ${targetLight}`);

            // Assign goalies - one per team (don't count their ratings in team totals)
            darkTeam = [];
            lightTeam = [];
            let darkTotal = 0;
            let lightTotal = 0;
            
            if (goalies.length >= 2) {
                // Put first goalie on dark, second on light (ratings don't count)
                darkTeam.push(goalies[0]);
                lightTeam.push(goalies[1]);
                
                // If there are extra goalies (3+), add them as skaters
                for (let i = 2; i < goalies.length; i++) {
                    ungrouped.push({...goalies[i], isGoalie: false});
                }
            } else if (goalies.length === 1) {
                // Only one goalie, put on dark team (rating doesn't count)
                darkTeam.push(goalies[0]);
            }

            // Sort groups by average rating (descending) for better distribution
            const groups = Object.entries(grouped).map(([letter, players]) => ({
                letter,
                players,
                size: players.length,
                // Only count players with actual ratings
                totalRating: players.reduce((sum, p) => sum + (p.rating !== null ? p.rating : 0), 0),
                avgRating: players.filter(p => p.rating !== null).length > 0 
                    ? players.reduce((sum, p) => sum + (p.rating !== null ? p.rating : 0), 0) / players.filter(p => p.rating !== null).length
                    : 0
            }));

            groups.sort((a, b) => b.avgRating - a.avgRating);
            // Sort ungrouped by rating, but put unrated players at the end
            ungrouped.sort((a, b) => {
                if (a.rating === null && b.rating === null) return 0;
                if (a.rating === null) return 1;
                if (b.rating === null) return -1;
                return b.rating - a.rating;
            });

            // Distribute friend groups - alternate between teams, prioritizing team size balance
            groups.forEach(group => {
                const darkSize = darkTeam.length;
                const lightSize = lightTeam.length;
                
                // Check if adding this group would exceed target size
                const darkWouldExceed = (darkSize + group.size) > targetDark;
                const lightWouldExceed = (lightSize + group.size) > targetLight;
                
                if (lightWouldExceed && !darkWouldExceed) {
                    darkTeam.push(...group.players);
                    darkTotal += group.totalRating;
                } else if (darkWouldExceed && !lightWouldExceed) {
                    lightTeam.push(...group.players);
                    lightTotal += group.totalRating;
                } else {
                    if (darkTotal <= lightTotal) {
                        darkTeam.push(...group.players);
                        darkTotal += group.totalRating;
                    } else {
                        lightTeam.push(...group.players);
                        lightTotal += group.totalRating;
                    }
                }
            });

            // Distribute ungrouped players
            ungrouped.forEach(player => {
                const rating = player.rating !== null ? player.rating : 0; // Don't count null ratings in balance
                const darkSize = darkTeam.length;
                const lightSize = lightTeam.length;
                
                if (darkSize >= targetDark) {
                    lightTeam.push(player);
                    if (player.rating !== null) lightTotal += rating;
                } else if (lightSize >= targetLight) {
                    darkTeam.push(player);
                    if (player.rating !== null) darkTotal += rating;
                } else {
                    if (darkTotal <= lightTotal) {
                        darkTeam.push(player);
                        if (player.rating !== null) darkTotal += rating;
                    } else {
                        lightTeam.push(player);
                        if (player.rating !== null) lightTotal += rating;
                    }
                }
            });

            // Sort teams so goalies appear first
            darkTeam.sort((a, b) => (b.isGoalie ? 1 : 0) - (a.isGoalie ? 1 : 0));
            lightTeam.sort((a, b) => (b.isGoalie ? 1 : 0) - (a.isGoalie ? 1 : 0));

            console.log('Dark team:', darkTeam);
            console.log('Light team:', lightTeam);
            console.log(`Final sizes: Dark ${darkTeam.length}, Light ${lightTeam.length}`);
            console.log(`Final totals: Dark ${darkTotal}, Light ${lightTotal}`);

            // Sort teams after balancing
            sortTeams();
            
            renderTeams();
            saveTeams();
        }

        // Render teams
        function renderTeams() {
            if (!playerMenuListenerInstalled) {
                document.addEventListener('click', event => {
                    if (openPlayerMenu && !event.target.closest('.player-item-actions')) {
                        openPlayerMenu = null;
                        renderTeams();
                    }
                });
                playerMenuListenerInstalled = true;
            }
            const darkStats = getTeamStats(darkTeam);
            const lightStats = getTeamStats(lightTeam);

            let html = '<p class="team-interaction-hint">Select two players to swap them. Use ⋮ for one-player moves and other actions.</p><div class="teams-container">';
            
            // Dark team
            html += '<div class="team">';
            html += '<div class="team-header">';
            html += '<div class="team-title">Dark ⚫️</div>';
            html += `<div class="team-stats">${darkStats.count} players • Avg: ${darkStats.avg}</div>`;
            html += '</div>';
            
            darkTeam.forEach((player, i) => {
                html += renderPlayer(player, i, 'dark');
            });
            
            html += '</div>';

            // Light team
            html += '<div class="team">';
            html += '<div class="team-header">';
            html += '<div class="team-title">Light ⚪️</div>';
            html += `<div class="team-stats">${lightStats.count} players • Avg: ${lightStats.avg}</div>`;
            html += '</div>';
            
            lightTeam.forEach((player, i) => {
                html += renderPlayer(player, i, 'light');
            });
            
            html += '</div>';
            html += '</div>';

            document.getElementById('teamsDisplay').innerHTML = html;
            renderExport();
        }

        function renderPlayer(player, index, team) {
            const isSelected = selectedPlayer && selectedPlayer.team === team && selectedPlayer.index === index;
            const isEditing = selectedPlayer && selectedPlayer.team === team && selectedPlayer.index === index && selectedPlayer.editing;
            const isMenuOpen = openPlayerMenu && openPlayerMenu.team === team && openPlayerMenu.index === index;
            const destination = team === 'dark' ? 'light' : 'dark';
            const destinationLabel = destination === 'dark' ? 'Dark' : 'Light';
            
            let html = `<div class="player-item${isSelected ? ' selected' : ''}${isMenuOpen ? ' has-open-menu' : ''}" onclick="selectPlayer('${team}', ${index})" style="cursor: pointer; ${isSelected ? 'background: rgba(var(--primary-rgb), 0.12); border-color: var(--primary);' : ''}">`;
            html += '<div class="player-info">';
            html += `<span class="player-number">${index + 1}.</span>`;
            html += `<span class="player-name">${escapeHTML(player.name)}</span>`;

            if (player.isGoalie) {
                html += '<span class="player-goalie-badge" title="Goalie">🥅 Goalie</span>';
            }
            
            if (player.friendGroup) {
                html += `<span class="player-group-badge" style="background-color: ${FRIEND_GROUP_COLORS[player.friendGroup]}">${escapeHTML(player.friendGroup)}</span>`;
            }
            
            html += '</div>';
            html += '<div class="player-item-actions" onclick="event.stopPropagation()">';
            
            // Don't show rating for goalies
            if (!player.isGoalie) {
                // Show editable input if in edit mode, otherwise show rating
                if (isEditing) {
                    html += `<input type="number" id="rating-input-${team}-${index}" class="rating-input" value="${player.rating || ''}" 
                             onkeypress="handleRatingKeypress(event, '${team}', ${index})" 
                             onblur="cancelRatingEdit()" 
                             style="width: 50px; padding: 4px; background: rgba(0,0,0,0.4); border: 1px solid var(--primary); border-radius: 4px; color: var(--text); font-size: 14px;"
                             onclick="event.stopPropagation()">`;
                } else {
                    if (player.rating !== null) {
                        html += `<span class="player-rating">${player.rating}</span>`;
                    } else {
                        html += `<span class="player-rating" style="color: #fbbf24;">???</span>`;
                    }
                    
                }
            }

            html += `<button class="player-menu-trigger" type="button" aria-label="More actions for ${escapeHTML(player.name)}" aria-haspopup="menu" aria-expanded="${Boolean(isMenuOpen)}" onclick="togglePlayerActions(event, '${team}', ${index})">⋮</button>`;
            if (isMenuOpen) {
                html += '<div class="player-actions-menu" role="menu">';
                if (!player.isGoalie && !isEditing) {
                    html += `<button type="button" role="menuitem" onclick="startEditRating(event, '${team}', ${index})">✏️ <span>Rate Player</span></button>`;
                }
                html += `<button type="button" role="menuitem" onclick="toggleGoalieFromMenu(event, '${team}', ${index})">${player.isGoalie ? '👤' : '🥅'} <span>${player.isGoalie ? 'Mark as skater' : 'Mark as goalie'}</span></button>`;
                html += `<button type="button" role="menuitem" onclick="movePlayerToTeam(event, '${team}', ${index}, '${destination}')">→ <span>Move to ${destinationLabel}</span></button>`;
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';
            
            return html;
        }

        function togglePlayerActions(event, team, index) {
            event.stopPropagation();
            const isSameMenu = openPlayerMenu && openPlayerMenu.team === team && openPlayerMenu.index === index;
            openPlayerMenu = isSameMenu ? null : { team, index };
            renderTeams();
        }

        function toggleGoalieFromMenu(event, team, index) {
            event.stopPropagation();
            openPlayerMenu = null;
            toggleGoalie(team, index);
        }

        function movePlayerToTeam(event, team, index, destination) {
            event.stopPropagation();
            const sourceTeam = team === 'dark' ? darkTeam : lightTeam;
            const targetTeam = destination === 'dark' ? darkTeam : lightTeam;
            const [player] = sourceTeam.splice(index, 1);
            if (!player) return;
            targetTeam.push(player);
            selectedPlayer = null;
            openPlayerMenu = null;
            sortTeams();
            renderTeams();
            saveTeams();
        }

        function startEditRating(event, team, index) {
            event.stopPropagation();
            openPlayerMenu = null;
            const player = team === 'dark' ? darkTeam[index] : lightTeam[index];
            window.open('database.html?player=' + encodeURIComponent(player.name), '_blank');

        }

        async function handleRatingKeypress(event, team, index) {
            if (event.key === 'Enter') startEditRating(event, team, index);
            else if (event.key === 'Escape') cancelRatingEdit();
        }

        function sortTeams() {
            // Sort each team: goalies first, then by rating (high to low), then unrated
            const sortPlayers = (a, b) => {
                // Goalies always first
                if (a.isGoalie && !b.isGoalie) return -1;
                if (!a.isGoalie && b.isGoalie) return 1;
                if (a.isGoalie && b.isGoalie) return 0;
                
                // Players with ratings sorted high to low
                if (a.rating !== null && b.rating !== null) {
                    return b.rating - a.rating;
                }
                
                // Rated players before unrated
                if (a.rating !== null && b.rating === null) return -1;
                if (a.rating === null && b.rating !== null) return 1;
                
                // Both unrated, keep original order
                return 0;
            };
            
            darkTeam.sort(sortPlayers);
            lightTeam.sort(sortPlayers);
        }

        function cancelRatingEdit() {
            selectedPlayer = null;
            renderTeams();
        }

        function handleEditRating(event, team, index) {
            event.stopPropagation();
            console.log('handleEditRating called', team, index);
            editRating(team, index);
        }

        function editRating(team, index) {
            const player = team === 'dark' ? darkTeam[index] : lightTeam[index];
            window.open('database.html?player=' + encodeURIComponent(player.name), '_blank');
        }

        function toggleGoalie(team, index) {
            if (team === 'dark') {
                darkTeam[index].isGoalie = !darkTeam[index].isGoalie;
            } else {
                lightTeam[index].isGoalie = !lightTeam[index].isGoalie;
            }
            renderTeams();
            saveTeams();
        }

        function selectPlayer(team, index) {
            openPlayerMenu = null;
            const player = team === 'dark' ? darkTeam[index] : lightTeam[index];
            
            // If no player selected yet, select this one
            if (!selectedPlayer) {
                selectedPlayer = { team, index, player };
                renderTeams();
                return;
            }
            
            // If clicking the same player, deselect
            if (selectedPlayer.team === team && selectedPlayer.index === index) {
                selectedPlayer = null;
                renderTeams();
                return;
            }
            
            // If clicking a player on the SAME team, select that one instead
            if (selectedPlayer.team === team) {
                selectedPlayer = { team, index, player };
                renderTeams();
                return;
            }
            
            // If clicking a player on the OPPOSITE team, swap them
            if (selectedPlayer.team !== team) {
                if (selectedPlayer.team === 'dark') {
                    const darkPlayer = darkTeam[selectedPlayer.index];
                    const lightPlayer = lightTeam[index];
                    darkTeam[selectedPlayer.index] = lightPlayer;
                    lightTeam[index] = darkPlayer;
                } else {
                    const lightPlayer = lightTeam[selectedPlayer.index];
                    const darkPlayer = darkTeam[index];
                    lightTeam[selectedPlayer.index] = darkPlayer;
                    darkTeam[index] = lightPlayer;
                }
                selectedPlayer = null;
                renderTeams();
                saveTeams();
            }
        }

        function getTeamStats(team) {
            if (team.length === 0) return { avg: 0, total: 0, count: 0, skaters: 0 };
            
            // Exclude goalies from rating calculations
            const skaters = team.filter(p => !p.isGoalie);
            const goalies = team.filter(p => p.isGoalie);
            
            // Also exclude players with no rating from calculations
            const skatersWithRatings = skaters.filter(p => p.rating !== null);
            
            if (skatersWithRatings.length === 0) {
                return { avg: 0, total: 0, count: team.length, skaters: skaters.length };
            }
            
            const total = skatersWithRatings.reduce((sum, p) => sum + p.rating, 0);
            return {
                avg: (total / skatersWithRatings.length).toFixed(1),
                total,
                count: team.length,
                skaters: skaters.length
            };
        }
