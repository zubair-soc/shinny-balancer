        let openPlayerMenu = null;
        let playerMenuListenerInstalled = false;

        async function saveTeams() {
            if (balancerRatingMode !== 'v2') {
                setTeamSaveStatus('Original V1 is a preview. Saved V2 teams were not changed.');
                return false;
            }
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

        function ratingForMode(player, mode) {
            const value = mode === 'v1' ? player.originalRating : player.v2Rating;
            const number = value === null || value === undefined || value === '' ? null : Number(value);
            return Number.isFinite(number) ? number : null;
        }

        function playersForRatingMode(players, mode) {
            return players.map(player => ({ ...player, rating: ratingForMode(player, mode) }));
        }

        function cloneTeams(teams) {
            return teams.map(player => ({ ...player }));
        }

        function rememberV2Teams() {
            if (balancerRatingMode !== 'v2') return;
            v2TeamSnapshot = { dark: cloneTeams(darkTeam), light: cloneTeams(lightTeam) };
        }

        function calculateBalancedTeams(sourcePlayers, mode = balancerRatingMode) {
            const players = playersForRatingMode(sourcePlayers, mode);
            const totalPlayers = players.length;
            const targetDark = Math.ceil(totalPlayers / 2);
            const targetLight = Math.floor(totalPlayers / 2);
            const goalies = players.filter(player => player.isGoalie);
            const skaters = players.filter(player => !player.isGoalie);
            const grouped = {};
            const ungrouped = [];

            skaters.forEach(player => {
                if (player.friendGroup) {
                    if (!grouped[player.friendGroup]) grouped[player.friendGroup] = [];
                    grouped[player.friendGroup].push(player);
                } else {
                    ungrouped.push(player);
                }
            });

            const nextDark = [];
            const nextLight = [];
            let darkTotal = 0;
            let lightTotal = 0;

            if (goalies.length >= 2) {
                nextDark.push(goalies[0]);
                nextLight.push(goalies[1]);
                for (let index = 2; index < goalies.length; index++) {
                    ungrouped.push({ ...goalies[index], isGoalie: false });
                }
            } else if (goalies.length === 1) {
                nextDark.push(goalies[0]);
            }

            const groups = Object.entries(grouped).map(([letter, groupPlayers]) => {
                const ratedPlayers = groupPlayers.filter(player => player.rating !== null);
                const totalRating = ratedPlayers.reduce((sum, player) => sum + player.rating, 0);
                return {
                    letter,
                    players: groupPlayers,
                    size: groupPlayers.length,
                    totalRating,
                    avgRating: ratedPlayers.length ? totalRating / ratedPlayers.length : 0
                };
            }).sort((a, b) => b.avgRating - a.avgRating);

            ungrouped.sort((a, b) => {
                if (a.rating === null && b.rating === null) return 0;
                if (a.rating === null) return 1;
                if (b.rating === null) return -1;
                return b.rating - a.rating;
            });

            groups.forEach(group => {
                const darkWouldExceed = nextDark.length + group.size > targetDark;
                const lightWouldExceed = nextLight.length + group.size > targetLight;
                if (lightWouldExceed && !darkWouldExceed) {
                    nextDark.push(...group.players);
                    darkTotal += group.totalRating;
                } else if (darkWouldExceed && !lightWouldExceed) {
                    nextLight.push(...group.players);
                    lightTotal += group.totalRating;
                } else if (darkTotal <= lightTotal) {
                    nextDark.push(...group.players);
                    darkTotal += group.totalRating;
                } else {
                    nextLight.push(...group.players);
                    lightTotal += group.totalRating;
                }
            });

            ungrouped.forEach(player => {
                const rating = player.rating ?? 0;
                if (nextDark.length >= targetDark) {
                    nextLight.push(player);
                    if (player.rating !== null) lightTotal += rating;
                } else if (nextLight.length >= targetLight) {
                    nextDark.push(player);
                    if (player.rating !== null) darkTotal += rating;
                } else if (darkTotal <= lightTotal) {
                    nextDark.push(player);
                    if (player.rating !== null) darkTotal += rating;
                } else {
                    nextLight.push(player);
                    if (player.rating !== null) lightTotal += rating;
                }
            });

            const sortPlayers = (a, b) => {
                if (a.isGoalie !== b.isGoalie) return a.isGoalie ? -1 : 1;
                if (a.isGoalie && b.isGoalie) return 0;
                if (a.rating !== null && b.rating !== null) return b.rating - a.rating;
                if (a.rating !== null) return -1;
                if (b.rating !== null) return 1;
                return 0;
            };
            nextDark.sort(sortPlayers);
            nextLight.sort(sortPlayers);
            return { dark: nextDark, light: nextLight };
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
                rememberV2Teams();
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

            console.log('Starting to balance teams with', balancerRatingMode);
            const balanced = calculateBalancedTeams(matchedPlayers, balancerRatingMode);
            darkTeam = balanced.dark;
            lightTeam = balanced.light;
            if (balancerRatingMode === 'v2') rememberV2Teams();
            
            renderTeams();
            if (balancerRatingMode === 'v2') saveTeams();
            else setTeamSaveStatus('Original V1 preview · saved V2 teams unchanged');
        }

        function updateRatingModeControls() {
            document.querySelectorAll('[data-balancer-rating-mode]').forEach(button => {
                button.setAttribute('aria-pressed', String(button.dataset.balancerRatingMode === balancerRatingMode));
            });
        }

        function setBalancerRatingMode(mode) {
            if (!window.isSkateAdmin?.() || !['v1', 'v2'].includes(mode) || mode === balancerRatingMode) return;
            if (mode === 'v1') {
                rememberV2Teams();
                balancerRatingMode = 'v1';
                const preview = calculateBalancedTeams(matchedPlayers, 'v1');
                darkTeam = preview.dark;
                lightTeam = preview.light;
                setTeamSaveStatus('Original V1 preview · saved V2 teams unchanged');
            } else {
                balancerRatingMode = 'v2';
                if (v2TeamSnapshot) {
                    darkTeam = cloneTeams(v2TeamSnapshot.dark);
                    lightTeam = cloneTeams(v2TeamSnapshot.light);
                } else {
                    const balanced = calculateBalancedTeams(matchedPlayers, 'v2');
                    darkTeam = balanced.dark;
                    lightTeam = balanced.light;
                    rememberV2Teams();
                }
                setTeamSaveStatus('V2 active');
            }
            selectedPlayer = null;
            openPlayerMenu = null;
            updateRatingModeControls();
            renderTeams();
        }

        function comparisonPlayerRow(player, otherTeamNames) {
            const moved = otherTeamNames.has(normalizeBalancerPlayerName(player.name));
            return `<div class="comparison-player${moved ? ' comparison-player-moved' : ''}"><span>${escapeHTML(player.name)}${player.isGoalie ? ' 🥅' : ''}</span><strong>${player.isGoalie ? '—' : (player.rating ?? '?')}</strong></div>`;
        }

        function comparisonModelCard(label, mode, teams, otherTeams) {
            const darkStats = getTeamStats(teams.dark);
            const lightStats = getTeamStats(teams.light);
            const otherDarkNames = new Set(otherTeams.dark.map(player => normalizeBalancerPlayerName(player.name)));
            const otherLightNames = new Set(otherTeams.light.map(player => normalizeBalancerPlayerName(player.name)));
            const ratedCount = matchedPlayers.filter(player => !player.isGoalie && ratingForMode(player, mode) !== null).length;
            const skaterCount = matchedPlayers.filter(player => !player.isGoalie).length;
            return `<section class="comparison-model-card">
                <div class="comparison-model-header"><div><span>${escapeHTML(label)}</span><strong>${ratedCount}/${skaterCount} skaters rated</strong></div><span class="comparison-gap">Avg gap ${Math.abs(Number(darkStats.avg) - Number(lightStats.avg)).toFixed(1)}</span></div>
                <div class="comparison-team-grid">
                    <div><h4>Dark <span>${darkStats.avg} avg</span></h4>${teams.dark.map(player => comparisonPlayerRow(player, otherLightNames)).join('')}</div>
                    <div><h4>Light <span>${lightStats.avg} avg</span></h4>${teams.light.map(player => comparisonPlayerRow(player, otherDarkNames)).join('')}</div>
                </div>
            </section>`;
        }

        function compareRatingModels() {
            if (!window.isSkateAdmin?.()) return;
            if (!matchedPlayers.length) {
                alert('Please match players first');
                return;
            }
            const v2Teams = calculateBalancedTeams(matchedPlayers, 'v2');
            const v1Teams = calculateBalancedTeams(matchedPlayers, 'v1');
            const container = document.getElementById('ratingComparison');
            container.hidden = false;
            container.innerHTML = `<div class="comparison-heading"><div><span>Admin comparison</span><h2>V2 vs original V1</h2><p>Same roster, goalies and friend groups. Highlighted players change sides.</p></div><button type="button" aria-label="Close comparison" onclick="closeRatingComparison()">×</button></div><div class="rating-comparison-grid">${comparisonModelCard('V2 rating', 'v2', v2Teams, v1Teams)}${comparisonModelCard('Original V1', 'v1', v1Teams, v2Teams)}</div>`;
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function closeRatingComparison() {
            const container = document.getElementById('ratingComparison');
            container.hidden = true;
            container.innerHTML = '';
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
