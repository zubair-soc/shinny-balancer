        // Supabase configuration
        let supabaseClient;
        let playerDatabaseReady = Promise.resolve();
        
        // Wait for page to load before initializing
        window.addEventListener('DOMContentLoaded', () => {
            console.log('Checking for Supabase library...');
            console.log('window.supabase:', typeof window.supabase);
            console.log('window.supabase keys:', Object.keys(window.supabase || {}));
            
            if (window.SKATE_MANAGER_CLIENT) {
                supabaseClient = window.SKATE_MANAGER_CLIENT;
                console.log('Supabase client created');
                console.log('Client has .from?', typeof supabaseClient.from);
                playerDatabaseReady = loadPlayersFromSupabase();
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
                    .from('skate_manager_players')
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
                const databaseStatus = document.getElementById('playerDatabaseStatus');
                if (databaseStatus) databaseStatus.textContent = 'Ready · ' + playerDatabase.length + ' players loaded';
                console.log(`Loaded ${playerDatabase.length} players from Supabase`);
            } catch (error) {
                console.error('Error loading players:', error);
                console.error('Full error:', JSON.stringify(error, null, 2));
                const databaseStatus = document.getElementById('playerDatabaseStatus');
                if (databaseStatus) databaseStatus.textContent = 'Could not load the player database';
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
            await playerDatabaseReady;
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

            // Keep saved teams if the user chooses to load them; otherwise build fresh teams.
            if (currentBalancerSkateId) {
                const loaded = await loadSavedTeams(currentBalancerSkateId);
                if (loaded) return;
            }

            matchPlayers({ silent: true });
            if (matchedPlayers.length > 0) {
                balanceTeams();
                document.getElementById('teamsDisplay').scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                playerInputBox.scrollIntoView({ behavior: 'smooth' });
            }
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
        function matchPlayers({ silent = false } = {}) {
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

            if (!silent) alert(`Matched ${matchedPlayers.length} players`);
        }

        // Balance teams
