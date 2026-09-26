        // Supabase configuration
        let supabaseClient;
        
        // Wait for page to load before initializing
        window.addEventListener('DOMContentLoaded', () => {
            console.log('Checking for Supabase library...');
            console.log('window.supabase:', typeof window.supabase);
            console.log('window.supabase keys:', Object.keys(window.supabase || {}));
            
            if (window.SKATE_MANAGER_CLIENT) {
                supabaseClient = window.SKATE_MANAGER_CLIENT;
                console.log('Supabase client created');
                console.log('Client has .from?', typeof supabaseClient.from);
                loadPlayersFromSupabase();
            } else {
                console.error('Supabase library failed to load or createClient not found');
                console.log('Available methods:', Object.keys(window.supabase || {}));
                alert('Database connection failed. Please refresh the page.');
            }
            
            loadCustomLocations();
            
            // Add event listener for edit locations button
            const editBtn = document.getElementById('editLocationsBtn');
            if (editBtn) {
                editBtn.addEventListener('click', toggleLocationManager);
                console.log('Edit locations button listener added');
            } else {
                console.error('Edit locations button not found!');
            }

            // Auto-load from skates page if flag is set
            const shouldAutoLoad = localStorage.getItem('autoLoadRoster');
            if (shouldAutoLoad === 'true') {
                localStorage.removeItem('autoLoadRoster'); // Clear flag
                autoLoadFromSkates();
            }
        });

        // Global state
        let playerDatabase = [];
        let matchedPlayers = [];
        let darkTeam = [];
        let lightTeam = [];
        let selectedPlayer = null; // For swapping
        let currentBalancerSkateId = null;

        const FRIEND_GROUP_COLORS = {
            'A': '#ef4444', 'B': 'var(--primary-dark)', 'C': '#10b981', 'D': '#f59e0b',
            'E': '#8b5cf6', 'F': '#ec4899', 'G': '#14b8a6', 'H': '#f97316'
        };

        // Load player database from Supabase
        async function loadPlayersFromSupabase() {
            try {
                const { data, error } = await supabaseClient
                    .from('players')
                    .select('name, rating')
                    .order('name');

                if (error) {
                    console.error('Supabase error details:', error);
                    console.error('Error message:', error.message);
                    console.error('Error code:', error.code);
                    throw error;
                }

                playerDatabase = data.map(p => ({ name: p.name, rating: p.rating }));
                document.getElementById('playerCountPaste').textContent = playerDatabase.length;
                document.getElementById('playerCount').textContent = playerDatabase.length;
                console.log(`Loaded ${playerDatabase.length} players from Supabase`);
            } catch (error) {
                console.error('Error loading players:', error);
                console.error('Full error:', JSON.stringify(error, null, 2));
                alert('Failed to load player database. Check console for details.');
            }
        }

        // Save new player to Supabase
        async function savePlayerToSupabase(name, rating) {
            try {
                const { data, error } = await supabaseClient
                    .from('players')
                    .insert([{ name, rating }])
                    .select();

                if (error) throw error;

                // Add to local database
                playerDatabase.push({ name, rating });
                playerDatabase.sort((a, b) => a.name.localeCompare(b.name));
                document.getElementById('playerCount').textContent = playerDatabase.length;
                console.log(`Saved new player: ${name} (${rating})`);
                return true;
            } catch (error) {
                console.error('Error saving player:', error);
                return false;
            }
        }

        // Update existing player rating in Supabase
        async function updatePlayerInSupabase(name, rating) {
            try {
                const { error } = await supabaseClient
                    .from('players')
                    .update({ rating, updated_at: new Date().toISOString() })
                    .eq('name', name);

                if (error) throw error;

                // Update local database
                const player = playerDatabase.find(p => p.name === name);
                if (player) {
                    player.rating = rating;
                }
                console.log(`Updated player: ${name} (${rating})`);
                return true;
            } catch (error) {
                console.error('Error updating player:', error);
                return false;
            }
        }

        // Load players on page load

        // Import existing skate from WhatsApp format
        function importSkate() {
            const importData = document.getElementById('importSkateData').value;
            
            if (!importData.trim()) {
                alert('Please paste your WhatsApp message first');
                return;
            }

            try {
                const lines = importData.split('\n').map(l => l.trim()).filter(l => l);
                
                // Extract skate details
                let skateTitle = '';
                let dateTime = '';
                let cost = '';
                let email = '';
                let location = '';
                
                const darkTeam = [];
                const lightTeam = [];
                let currentTeam = null;
                
                for (let line of lines) {
                    // Skip emoji-only lines
                    if (line.match(/^[🏒🎯⚫⚪🥅]+$/)) continue;
                    
                    // Extract skate title
                    if (line.includes('Skate') && !skateTitle) {
                        skateTitle = line.replace(/🏒|:ice_hockey_stick_and_puck:/g, '').trim();
                        continue;
                    }
                    
                    // Extract date/time
                    if (line.startsWith('Date & Time:')) {
                        dateTime = line.replace('Date & Time:', '').replace(/·/g, '').trim();
                        continue;
                    }
                    
                    // Extract cost and email
                    if (line.startsWith('Cost:')) {
                        const parts = line.split('—');
                        cost = parts[0].replace('Cost:', '').trim();
                        if (parts[1]) email = parts[1].trim();
                        continue;
                    }
                    
                    // Extract location
                    if (line.startsWith('Location:')) {
                        location = line.replace('Location:', '').trim();
                        continue;
                    }
                    
                    // Detect team headers
                    if (line.match(/Dark|:black_circle:/i)) {
                        currentTeam = 'dark';
                        continue;
                    }
                    if (line.match(/Light|:white_circle:/i)) {
                        currentTeam = 'light';
                        continue;
                    }
                    
                    // Parse player lines (format: "1. Player Name" or "1. Player Name :goal_net:")
                    const playerMatch = line.match(/^\d+\.\s*(.+?)(?:\s*:goal_net:|🥅)?$/);
                    if (playerMatch && currentTeam) {
                        const name = playerMatch[1].trim();
                        const isGoalie = line.includes(':goal_net:') || line.includes('🥅');
                        
                        if (currentTeam === 'dark') {
                            darkTeam.push({ name, isGoalie });
                        } else {
                            lightTeam.push({ name, isGoalie });
                        }
                    }
                }
                
                console.log('Parsed skate:', { skateTitle, dateTime, cost, email, location, darkTeam, lightTeam });
                
                // Populate form fields
                if (skateTitle) document.getElementById('skateTitle').value = skateTitle;
                if (dateTime) document.getElementById('dateTime').value = dateTime;
                if (cost) document.getElementById('cost').value = cost;
                if (email) document.getElementById('email').value = email;
                if (location) {
                    document.getElementById('location').value = location;
                    // Try to select in dropdown
                    const select = document.getElementById('locationSelect');
                    for (let i = 0; i < select.options.length; i++) {
                        if (select.options[i].value === location) {
                            select.selectedIndex = i;
                            break;
                        }
                    }
                }
                
                // Match players from database and load to teams
                const allPlayerNames = [...darkTeam, ...lightTeam].map(p => p.name);
                const matchedPlayers = [];
                
                allPlayerNames.forEach(name => {
                    const dbPlayer = playerDatabase.find(p => 
                        p.name.toLowerCase() === name.toLowerCase()
                    );
                    
                    if (dbPlayer) {
                        matchedPlayers.push({
                            name: dbPlayer.name,
                            rating: dbPlayer.rating,
                            isGoalie: darkTeam.find(p => p.name === name)?.isGoalie || 
                                     lightTeam.find(p => p.name === name)?.isGoalie || false
                        });
                    } else {
                        // Player not in database, add with null rating
                        matchedPlayers.push({
                            name: name,
                            rating: null,
                            isGoalie: darkTeam.find(p => p.name === name)?.isGoalie || 
                                     lightTeam.find(p => p.name === name)?.isGoalie || false
                        });
                    }
                });
                
                // Assign to dark/light teams
                window.darkTeam = [];
                window.lightTeam = [];
                
                darkTeam.forEach(p => {
                    const player = matchedPlayers.find(mp => mp.name.toLowerCase() === p.name.toLowerCase());
                    if (player) {
                        window.darkTeam.push(player);
                    }
                });
                
                lightTeam.forEach(p => {
                    const player = matchedPlayers.find(mp => mp.name.toLowerCase() === p.name.toLowerCase());
                    if (player) {
                        window.lightTeam.push(player);
                    }
                });
                
                console.log('Loaded teams:', window.darkTeam, window.lightTeam);
                
                renderTeams();
                
                // Scroll to teams section
                document.getElementById('teamsSection').scrollIntoView({ behavior: 'smooth' });
                
                alert(`✓ Imported skate!\n\nDark: ${window.darkTeam.length} players\nLight: ${window.lightTeam.length} players\n\nYou can now swap players and export.`);
                
            } catch (error) {
                console.error('Import error:', error);
                alert('Failed to parse WhatsApp message. Please check the format.');
            }
        }

        // Auto-load roster from skates page
        async function autoLoadFromSkates() {
            console.log('autoLoadFromSkates called');
            const rosterData = localStorage.getItem('importedRoster');
            const skateDetails = localStorage.getItem('importedSkateDetails');
            
            console.log('rosterData:', rosterData);
            console.log('skateDetails:', skateDetails);

            if (!rosterData) {
                console.log('No roster data found in localStorage');
                return;
            }

            // Load skate details if available
            if (skateDetails) {
                try {
                    const details = JSON.parse(skateDetails);
                    console.log('Parsed details:', details);
                    document.getElementById('skateTitle').value = details.title || '';
                    document.getElementById('dateTime').value = `${details.date} · ${details.time}` || '';
                    document.getElementById('cost').value = details.cost || '';
                    document.getElementById('location').value = details.location || '';
                    
                    // Try to select in dropdown
                    const select = document.getElementById('locationSelect');
                    for (let i = 0; i < select.options.length; i++) {
                        if (select.options[i].value === details.location) {
                            select.selectedIndex = i;
                            break;
                        }
                    }
                } catch (e) {
                    console.error('Error parsing skate details:', e);
                }
            }

            // Paste roster data into section 3 textarea
            const playerInputBox = document.getElementById('playerInput');
            console.log('playerInputBox element:', playerInputBox);
            playerInputBox.value = rosterData;
            console.log('Set playerInputBox value to:', playerInputBox.value);

            // Grab skate ID for team persistence
            const skateId = localStorage.getItem('currentSkateId');
            if (skateId) {
                currentBalancerSkateId = parseInt(skateId);
                localStorage.removeItem('currentSkateId');
            }

            // Clean up localStorage
            localStorage.removeItem('importedRoster');
            localStorage.removeItem('importedSkateDetails');

            // Try to load saved teams for this skate
            if (currentBalancerSkateId) {
                const loaded = await loadSavedTeams(currentBalancerSkateId);
                if (loaded) return; // Skip the alert if we loaded saved teams
            }

            // Scroll to section 3
            playerInputBox.scrollIntoView({ behavior: 'smooth' });

            alert(`✓ Loaded ${rosterData.split('\n').length} players into paste box!\n\nNow click "Match Players" then "Balance Teams".`);
        }

        // Load from pasted data
        function loadFromPaste() {
            const pastedData = document.getElementById('pasteData').value;
            
            if (!pastedData.trim()) {
                alert('Please paste your player data first');
                return;
            }
            
            try {
                const lines = pastedData.split('\n').filter(line => line.trim());
                playerDatabase = [];
                
                // Start from index 1 to skip header row
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    // Split by tab or comma
                    let parts = line.split('\t');
                    if (parts.length < 2) {
                        parts = line.split(',');
                    }
                    
                    // Clean up the parts
                    const name = parts[0]?.trim().replace(/^"|"$/g, '');
                    const rating = parseFloat(parts[1]?.trim().replace(/^"|"$/g, ''));
                    
                    if (name && !isNaN(rating)) {
                        playerDatabase.push({
                            name: name,
                            rating: rating
                        });
                    }
                }
                
                document.getElementById('playerCountPaste').textContent = playerDatabase.length;
                document.getElementById('playerCount').textContent = playerDatabase.length;
                alert(`✓ Successfully loaded ${playerDatabase.length} players from pasted data!`);
            } catch (error) {
                console.error('Error parsing pasted data:', error);
                alert('Error parsing data: ' + error.message);
            }
        }

        // Load Google Sheet
        async function loadGoogleSheet() {
            const url = document.getElementById('sheetUrl').value;
            console.log('Attempting to load sheet:', url);
            
            if (!url) {
                alert('Please enter a URL (Google Sheets or Apps Script Web App)');
                return;
            }

            try {
                alert('Loading players... this may take a moment');
                
                let response;
                
                // Check if it's an Apps Script URL
                if (url.includes('script.google.com')) {
                    console.log('Detected Apps Script URL, fetching directly...');
                    response = await fetch(url);
                } else {
                    // Try to extract sheet ID and use export URL
                    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
                    if (!match) {
                        alert('Invalid URL format. Use either:\n1. Google Sheets URL\n2. Apps Script Web App URL');
                        return;
                    }

                    const sheetId = match[1];
                    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
                    
                    console.log('Fetching CSV from:', csvUrl);
                    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvUrl)}`;
                    console.log('Using proxy:', proxyUrl);

                    response = await fetch(proxyUrl);
                }
                
                console.log('Response status:', response.status);
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch data. Status: ${response.status}.`);
                }

                const contentType = response.headers.get('content-type');
                playerDatabase = [];
                
                // Handle JSON response (from Apps Script)
                if (contentType && contentType.includes('application/json')) {
                    console.log('Parsing JSON response...');
                    const jsonData = await response.json();
                    console.log('JSON data:', jsonData);
                    
                    if (jsonData.players && Array.isArray(jsonData.players)) {
                        playerDatabase = jsonData.players;
                    } else {
                        throw new Error('Invalid JSON format from Apps Script');
                    }
                } 
                // Handle CSV response
                else {
                    console.log('Parsing CSV response...');
                    const csvText = await response.text();
                    console.log('CSV length:', csvText.length);
                    console.log('First 200 chars:', csvText.substring(0, 200));

                    const lines = csvText.split('\n').filter(line => line.trim());
                    console.log('Total lines:', lines.length);

                    for (let i = 1; i < lines.length; i++) {
                        const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
                        if (parts.length >= 2 && parts[0] && parts[1]) {
                            playerDatabase.push({
                                name: parts[0],
                                rating: parseFloat(parts[1]) || 0
                            });
                        }
                    }
                }

                console.log('Players loaded:', playerDatabase.length);
                document.getElementById('playerCount').textContent = playerDatabase.length;
                alert(`✓ Successfully loaded ${playerDatabase.length} players!`);
            } catch (error) {
                console.error('Error details:', error);
                alert('Error loading data: ' + error.message + '\n\nTry using a Google Apps Script Web App URL instead. See instructions.');
            }
        }

        // Match players
        function matchPlayers() {
            const input = document.getElementById('playerInput').value;
            const lines = input.split('\n').filter(line => line.trim());
            
            matchedPlayers = [];
            const missing = [];

            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;

                // Check for goalie designation (lowercase 'g' at end)
                const goalieMatch = trimmed.match(/\s+g$/i) || trimmed.match(/\s+g\s+[a-fh-zA-FH-Z]$/i);
                const isGoalie = goalieMatch ? true : false;
                
                // Check for friend group (A-F, H in any case at end - skip g/G for goalies)
                // Handle "Name g A" format — goalie + friend group
                const goalieAndGroupMatch = trimmed.match(/\s+g\s+([a-fh-zA-FH-Z])$/i);
                let friendGroup = null;
                let nameToMatch = trimmed;

                if (goalieAndGroupMatch) {
                    // Both goalie and friend group
                    friendGroup = goalieAndGroupMatch[1].toUpperCase();
                    nameToMatch = trimmed.replace(/\s+g\s+[a-fh-zA-FH-Z]$/i, '').trim();
                } else if (isGoalie) {
                    // Just goalie
                    nameToMatch = trimmed.replace(/\s+g$/i, '').trim();
                } else {
                    // Check for friend group only
                    const groupMatch = trimmed.match(/\s+([a-fh-zA-FH-Z])$/i);
                    if (groupMatch) {
                        friendGroup = groupMatch[1].toUpperCase();
                        nameToMatch = trimmed.replace(/\s+[a-fh-zA-FH-Z]$/i, '').trim();
                    }
                }

                // Find player in database, stripping position tags like (F), (D), (F/D) for matching
                const player = playerDatabase.find(p => {
                    const cleanDbName = p.name.replace(/\s*\([FD/]+\)\s*🏒?/gi, '').trim();
                    return cleanDbName.toLowerCase() === nameToMatch.toLowerCase();
                });

                if (player) {
                    matchedPlayers.push({
                        ...player,
                        friendGroup,
                        isGoalie: isGoalie
                    });
                } else {
                    matchedPlayers.push({
                        name: nameToMatch,
                        rating: null,
                        friendGroup,
                        isGoalie: isGoalie
                    });
                    missing.push(nameToMatch);
                }
            });

            if (missing.length > 0) {
                document.getElementById('warningDiv').innerHTML = 
                    `<div class="warning">⚠️ Missing ratings for: ${missing.join(', ')}</div>`;
            } else {
                document.getElementById('warningDiv').innerHTML = '';
            }

            alert(`Matched ${matchedPlayers.length} players`);
        }

        // Balance teams
        async function saveTeams() {
            if (!currentBalancerSkateId || !supabaseClient) return;
            try {
                await supabaseClient
                    .from('skate_teams')
                    .upsert({
                        skate_id: currentBalancerSkateId,
                        dark_team: darkTeam,
                        light_team: lightTeam,
                        saved_at: new Date().toISOString()
                    }, { onConflict: 'skate_id' });
            } catch (err) {
                console.error('Failed to save teams:', err);
            }
        }

        async function loadSavedTeams(skateId) {
            if (!skateId || !supabaseClient) return false;
            try {
                const { data, error } = await supabaseClient
                    .from('skate_teams')
                    .select('dark_team, light_team, saved_at')
                    .eq('skate_id', skateId)
                    .single();

                if (error || !data) return false;

                const savedAt = new Date(data.saved_at).toLocaleString();
                const load = confirm(`Saved teams found for this skate (last saved ${savedAt}).\n\nLoad saved teams?`);
                if (!load) return false;

                darkTeam = data.dark_team || [];
                lightTeam = data.light_team || [];
                renderTeams();
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
            const darkStats = getTeamStats(darkTeam);
            const lightStats = getTeamStats(lightTeam);

            let html = '<div class="teams-container">';
            
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
            
            let html = `<div class="player-item${isSelected ? ' selected' : ''}" onclick="selectPlayer('${team}', ${index})" style="cursor: pointer; ${isSelected ? 'background: rgba(var(--primary-rgb), 0.3); border-color: var(--primary);' : ''}">`;
            html += '<div class="player-info">';
            html += `<span class="player-number">${index + 1}.</span>`;
            html += `<span class="player-name">${escapeHTML(player.name)}</span>`;
            
            if (player.friendGroup) {
                html += `<span class="player-group-badge" style="background-color: ${FRIEND_GROUP_COLORS[player.friendGroup]}">${escapeHTML(player.friendGroup)}</span>`;
            }
            
            html += '</div>';
            html += '<div style="display: flex; align-items: center; gap: 4px;">';
            
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
                    
                    // Edit rating button (show for all players now)
                    html += `<button class="icon-button" onclick="startEditRating(event, '${team}', ${index})" title="Edit rating">✏️</button>`;
                }
            }
            
            html += `<button class="icon-button" onclick="event.stopPropagation(); toggleGoalie('${team}', ${index})">${player.isGoalie ? '🥅' : '👤'}</button>`;
            html += '</div>';
            html += '</div>';
            
            return html;
        }

        function startEditRating(event, team, index) {
            event.stopPropagation();
            selectedPlayer = { team, index, editing: true };
            renderTeams();
            
            // Focus the input after render
            setTimeout(() => {
                const input = document.getElementById(`rating-input-${team}-${index}`);
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 0);
        }

        async function handleRatingKeypress(event, team, index) {
            if (event.key === 'Enter') {
                event.preventDefault();
                const input = document.getElementById(`rating-input-${team}-${index}`);
                const newRating = parseFloat(input.value);
                
                if (!isNaN(newRating) && newRating >= 0 && newRating <= 20) {
                    const player = team === 'dark' ? darkTeam[index] : lightTeam[index];
                    const oldRating = player.rating;
                    player.rating = newRating;
                    selectedPlayer = null;
                    
                    // Save to Supabase
                    const playerInDb = playerDatabase.find(p => p.name === player.name);
                    if (playerInDb) {
                        // Player exists, update rating
                        await updatePlayerInSupabase(player.name, newRating);
                    } else {
                        // New player, insert
                        await savePlayerToSupabase(player.name, newRating);
                    }
                    
                    // Re-sort teams after rating change
                    sortTeams();
                    renderTeams();
                } else {
                    alert('Please enter a valid rating between 0 and 20');
                }
            } else if (event.key === 'Escape') {
                cancelRatingEdit();
            }
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
            console.log('editRating called', team, index);
            const player = team === 'dark' ? darkTeam[index] : lightTeam[index];
            console.log('Editing player:', player);
            const currentRating = player.rating || '';
            const newRating = prompt(`Enter rating for ${player.name}:`, currentRating);
            
            if (newRating !== null && newRating.trim() !== '') {
                const rating = parseFloat(newRating);
                if (!isNaN(rating) && rating >= 0 && rating <= 20) {
                    player.rating = rating;
                    console.log('Rating updated to:', rating);
                    renderTeams();
                    saveTeams();
                } else {
                    alert('Please enter a valid rating between 0 and 20');
                }
            }
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
            const player = team === 'dark' ? darkTeam[index] : lightTeam[index];
            
            // If no player selected yet, select this one
            if (!selectedPlayer) {
                selectedPlayer = { team, index, player };
                renderTeams();
                showMoveBanner();
                return;
            }
            
            // If clicking the same player, deselect
            if (selectedPlayer.team === team && selectedPlayer.index === index) {
                selectedPlayer = null;
                renderTeams();
                showMoveBanner();
                return;
            }
            
            // If clicking a player on the SAME team, select that one instead
            if (selectedPlayer.team === team) {
                selectedPlayer = { team, index, player };
                renderTeams();
                showMoveBanner();
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

        function showMoveBanner() {
            const banner = document.getElementById('moveBanner');
            if (!banner) return;
            if (!selectedPlayer) { banner.style.display = 'none'; return; }
            const destTeam = selectedPlayer.team === 'dark' ? 'Light ⚪️' : 'Dark ⚫️';
            document.getElementById('moveBannerText').textContent = `${selectedPlayer.player.name} selected`;
            document.getElementById('moveBannerBtn').textContent = `→ Move to ${destTeam}`;
            banner.style.display = 'flex';
        }

        function moveSelectedPlayer() {
            if (!selectedPlayer) return;
            const { team, index, player } = selectedPlayer;
            if (team === 'dark') {
                darkTeam.splice(index, 1);
                lightTeam.push(player);
            } else {
                lightTeam.splice(index, 1);
                darkTeam.push(player);
            }
            selectedPlayer = null;
            sortTeams();
            renderTeams();
            saveTeams();
            showMoveBanner();
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

        function handleLocationChange() {
            const select = document.getElementById('locationSelect');
            const input = document.getElementById('location');
            const customInput = document.getElementById('customLocationInput');
            
            if (select.value === 'custom') {
                // Show the custom input box
                select.style.display = 'none';
                customInput.style.display = 'block';
                document.getElementById('customLocationText').focus();
            } else {
                input.value = select.value;
            }
        }

        function saveNewLocation() {
            const customText = document.getElementById('customLocationText').value.trim();
            
            if (customText) {
                const select = document.getElementById('locationSelect');
                const input = document.getElementById('location');
                
                // Add new option before the "+ Add Custom Location" option
                const newOption = document.createElement('option');
                newOption.value = customText;
                newOption.textContent = customText;
                select.insertBefore(newOption, select.lastElementChild);
                
                // Select the new option
                select.value = customText;
                input.value = customText;
                
                // Save to localStorage
                saveCustomLocations();
                
                // Hide custom input, show dropdown
                document.getElementById('customLocationInput').style.display = 'none';
                select.style.display = 'block';
                document.getElementById('customLocationText').value = '';
            } else {
                alert('Please enter a location name');
            }
        }

        function cancelNewLocation() {
            const select = document.getElementById('locationSelect');
            const input = document.getElementById('location');
            
            // Reset to first option
            select.selectedIndex = 0;
            input.value = select.value;
            
            // Hide custom input, show dropdown
            document.getElementById('customLocationInput').style.display = 'none';
            select.style.display = 'block';
            document.getElementById('customLocationText').value = '';
        }

        function saveCustomLocations() {
            const select = document.getElementById('locationSelect');
            const locations = [];
            
            // Get all options except the last one (+ Add Custom Location)
            for (let i = 0; i < select.options.length - 1; i++) {
                locations.push(select.options[i].value);
            }
            
            localStorage.setItem('customLocations', JSON.stringify(locations));
        }

        function loadCustomLocations() {
            const saved = localStorage.getItem('customLocations');
            if (saved) {
                const locations = JSON.parse(saved);
                const select = document.getElementById('locationSelect');
                
                // Clear existing options except custom
                while (select.options.length > 1) {
                    select.remove(0);
                }
                
                // Add saved locations
                locations.forEach(loc => {
                    const option = document.createElement('option');
                    option.value = loc;
                    option.textContent = loc;
                    select.insertBefore(option, select.lastElementChild);
                });
                
                // Set first option as selected
                if (select.options.length > 1) {
                    select.selectedIndex = 0;
                    document.getElementById('location').value = select.value;
                }
            }
        }

        function toggleLocationManager() {
            console.log('toggleLocationManager called');
            const manager = document.getElementById('locationManager');
            console.log('manager element:', manager);
            const isVisible = manager.style.display !== 'none';
            
            if (isVisible) {
                manager.style.display = 'none';
            } else {
                renderLocationList();
                manager.style.display = 'block';
            }
        }

        function renderLocationList() {
            console.log('renderLocationList called');
            const select = document.getElementById('locationSelect');
            const listContainer = document.getElementById('locationList');
            console.log('listContainer:', listContainer);
            
            const allLocations = [];
            for (let i = 0; i < select.options.length - 1; i++) {
                allLocations.push({ value: select.options[i].value, index: i });
            }
            console.log('allLocations:', allLocations);
            
            if (allLocations.length === 0) {
                listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 8px;">No locations available. Click "+ Add Custom Location" to add one.</div>';
                return;
            }
            
            listContainer.innerHTML = allLocations.map((loc, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--card-bg); border-radius: 6px; margin-bottom: 6px;">
                    <span style="color: var(--text); font-size: 14px;">${escapeHTML(loc.value)}</span>
                    <button class="delete-location-btn" data-location="${escapeHTML(loc.value)}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Delete</button>
                </div>
            `).join('');
            
            // Add event listeners to all delete buttons
            const deleteButtons = listContainer.querySelectorAll('.delete-location-btn');
            deleteButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    const locationName = this.getAttribute('data-location');
                    deleteLocationByName(locationName);
                });
            });
        }

        function deleteLocationByName(locationName) {
            console.log('=== deleteLocationByName called ===');
            console.log('locationName:', locationName);
            const select = document.getElementById('locationSelect');
            console.log('select element:', select);
            console.log('select.options.length:', select.options.length);
            
            // Log all current options
            for (let i = 0; i < select.options.length; i++) {
                console.log(`Option ${i}: "${select.options[i].value}"`);
            }
            
            if (!confirm(`Delete "${locationName}"?`)) {
                console.log('User cancelled');
                return;
            }
            
            console.log('User confirmed, finding location...');
            // Find and remove the option by value
            let found = false;
            for (let i = 0; i < select.options.length; i++) {
                console.log(`Checking option ${i}: "${select.options[i].value}" === "${locationName}"?`, select.options[i].value === locationName);
                if (select.options[i].value === locationName) {
                    console.log(`FOUND at index ${i}, removing...`);
                    select.remove(i);
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                console.error('Location not found!');
                alert('Error: Location not found');
                return;
            }
            
            console.log('Calling saveCustomLocations...');
            // Save updated list
            saveCustomLocations();
            
            console.log('Resetting selection...');
            // Reset selection to first option
            select.selectedIndex = 0;
            document.getElementById('location').value = select.value;
            
            console.log('Refreshing list...');
            // Refresh the list
            renderLocationList();
            console.log('=== deleteLocationByName complete ===');
        }

        function deleteLocation(index) {
            const select = document.getElementById('locationSelect');
            const locationName = select.options[index].value;
            deleteLocationByName(locationName);
        }

        function manageLocations() {
            const select = document.getElementById('locationSelect');
            const locations = [];
            const defaultLocations = ['Terwillegar Recreation Centre', 'Donnan', 'NAIT', 'ZerOne W.E.M.', 'Meadows Recreation Centre'];
            
            // Get all locations except "+ Add Custom Location"
            for (let i = 0; i < select.options.length - 1; i++) {
                const locValue = select.options[i].value;
                const isDefault = defaultLocations.includes(locValue);
                locations.push({
                    value: locValue,
                    isDefault: isDefault,
                    index: i
                });
            }

            if (locations.length === 0) {
                alert('No locations to manage');
                return;
            }

            let message = 'Current Locations:\n\n';
            locations.forEach((loc, i) => {
                const label = loc.isDefault ? ' (default)' : '';
                message += `${i + 1}. ${loc.value}${label}\n`;
            });
            message += '\nEnter the number of a CUSTOM location to DELETE\n(default locations cannot be deleted)\n\nPress Cancel to close:';

            const toDelete = prompt(message);
            
            if (toDelete === null) return;

            const userIndex = parseInt(toDelete) - 1;
            if (isNaN(userIndex) || userIndex < 0 || userIndex >= locations.length) {
                alert('Invalid selection');
                return;
            }

            const selectedLocation = locations[userIndex];
            
            if (selectedLocation.isDefault) {
                alert('Cannot delete default locations. Only custom locations can be removed.');
                return;
            }

            if (confirm(`Delete "${selectedLocation.value}"?`)) {
                // Remove from dropdown
                select.remove(selectedLocation.index);
                
                // Save updated list
                saveCustomLocations();
                
                // Reset selection
                select.selectedIndex = 0;
                document.getElementById('location').value = select.value;
                
                alert(`✓ Deleted "${selectedLocation.value}"`);
            }
        }

        // Load custom locations on page load

        function generateExport() {
            const skateTitle = document.getElementById('skateTitle').value;
            const dateTime = document.getElementById('dateTime').value;
            const cost = document.getElementById('cost').value;
            const email = document.getElementById('email').value;
            const location = document.getElementById('location').value;

            let output = `🏒 ${skateTitle}\n`;
            if (dateTime) output += `Date & Time: ${dateTime}\n`;
            if (cost) output += `Cost: ${cost} — ${email}\n`;
            if (location) output += `Location: ${location}\n`;

            output += `\nDark ⚫️\n`;
            darkTeam.forEach((player, i) => {
                output += `${i + 1}. ${player.name}${player.isGoalie ? ' 🥅' : ''}\n`;
            });

            output += `\nLight ⚪️\n`;
            lightTeam.forEach((player, i) => {
                output += `${i + 1}. ${player.name}${player.isGoalie ? ' 🥅' : ''}\n`;
            });

            return output;
        }

        function renderExport() {
            const html = `
                <div class="export-section">
                    <h2>4. Export to WhatsApp</h2>
                    <div class="export-preview">${generateExport()}</div>
                    <button class="button" onclick="copyToClipboard()">📋 Copy to Clipboard</button>
                </div>
            `;
            document.getElementById('exportSection').innerHTML = html;
        }

        async function copyToClipboard() {
            try {
                const text = generateExport();
                await navigator.clipboard.writeText(text);
                alert('✓ Copied to clipboard! Ready to paste into WhatsApp.');
            } catch (error) {
                console.error('Copy failed:', error);
                // Fallback method
                const textArea = document.createElement('textarea');
                textArea.value = generateExport();
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    alert('✓ Copied to clipboard! Ready to paste into WhatsApp.');
                } catch (err) {
                    alert('Failed to copy. Please manually select and copy the text above.');
                }
                document.body.removeChild(textArea);
            }
        }

        // ========== THEME TOGGLE ==========
        function toggleTheme() {
            const body = document.body;
            const icon = document.getElementById('themeIcon');
            
            body.classList.toggle('dark-mode');
            const isDark = body.classList.contains('dark-mode');
            
            icon.textContent = isDark ? '☀️' : '🌙';
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        }

        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            const icon = document.getElementById('themeIcon');
            
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                icon.textContent = '☀️';
            }
        }

        // Initialize theme on page load
        initTheme();
