        let parsedCSVData = [];
        let selectedSwapPlayer = null;

        function showImportModal() {
            document.getElementById('csvFileInput').click();
        }

        function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const fileName = file.name.toLowerCase();
            
            if (fileName.endsWith('.csv')) {
                handleCSVUpload(file);
            } else if (fileName.endsWith('.ics')) {
                handleICSUpload(file);
            } else {
                alert('Please upload a .csv or .ics file');
            }

            // Reset file input
            event.target.value = '';
        }

        function handleICSUpload(file) {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const icsContent = e.target.result;
                parsedCSVData = [];

                // Simple ICS parser
                const events = icsContent.split('BEGIN:VEVENT');
                
                events.forEach(event => {
                    if (!event.includes('DTSTART')) return;

                    // Extract SUMMARY (title)
                    const summaryMatch = event.match(/SUMMARY:(.+)/);
                    if (!summaryMatch) return;
                    
                    const summary = summaryMatch[1].trim();
                    
                    // Parse "Scrimmage: Skate 195: Tier 3 Beginner" format
                    let skateNumber = '';
                    let tier = '';
                    
                    const skateMatch = summary.match(/Skate\s+(\d+):\s*(.+)/i);
                    if (skateMatch) {
                        skateNumber = skateMatch[1];
                        tier = skateMatch[2].trim();
                    } else {
                        // No skate number, just use summary after "Scrimmage:"
                        const parts = summary.split(':');
                        tier = parts.length > 1 ? parts.slice(1).join(':').trim() : summary;
                    }

                    // Extract DTSTART
                    const dtstartMatch = event.match(/DTSTART[^:]*:(\d{8})T(\d{6})/);
                    if (!dtstartMatch) return;

                    const dateStr = dtstartMatch[1]; // YYYYMMDD
                    const timeStr = dtstartMatch[2]; // HHMMSS

                    const year = dateStr.slice(0, 4);
                    const month = dateStr.slice(4, 6);
                    const day = dateStr.slice(6, 8);
                    const date = `${year}-${month}-${day}`;

                    const hours = timeStr.slice(0, 2);
                    const minutes = timeStr.slice(2, 4);
                    const startTime = `${hours}:${minutes}`;

                    // Extract DTEND
                    const dtendMatch = event.match(/DTEND[^:]*:(\d{8})T(\d{6})/);
                    let endTime = startTime;
                    if (dtendMatch) {
                        const endTimeStr = dtendMatch[2];
                        const endHours = endTimeStr.slice(0, 2);
                        const endMinutes = endTimeStr.slice(2, 4);
                        endTime = `${endHours}:${endMinutes}`;
                    }

                    // Extract LOCATION (first line only, before newline or address)
                    const locationMatch = event.match(/LOCATION:([^\n\\]+)/);
                    let location = '';
                    if (locationMatch) {
                        location = locationMatch[1].trim().split('\\n')[0].trim();
                    }

                    // Build title
                    const title = skateNumber && tier 
                        ? `Skate ${skateNumber} ${tier}` 
                        : tier || 'Untitled';

                    parsedCSVData.push({
                        title: title,
                        tier: tier,
                        date: date,
                        time_start: startTime,
                        time_end: endTime,
                        location: location || '',
                        cost: '$25',
                        capacity: 24
                    });
                });

                if (parsedCSVData.length === 0) {
                    alert('No valid skates found in ICS file');
                    return;
                }

                showCSVPreview();
            };

            reader.readAsText(file);
        }

        function handleCSVUpload(file) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    console.log('CSV parsed:', results);
                    parsedCSVData = [];

                    results.data.forEach((row, index) => {
                        // Skip rows with no date
                        if (!row.Date || !row.Time) return;

                        // Parse date (DD/MM/YYYY format)
                        const dateParts = row.Date.split('/');
                        if (dateParts.length !== 3) return;

                        const day = dateParts[0];
                        const month = dateParts[1];
                        const year = dateParts[2];
                        const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

                        // Parse time (e.g., "7:45 PM")
                        const timeMatch = row.Time.match(/(\d+):(\d+)\s*(AM|PM)/i);
                        if (!timeMatch) return;

                        let hours = parseInt(timeMatch[1]);
                        const minutes = timeMatch[2];
                        const ampm = timeMatch[3].toUpperCase();

                        // Convert to 24hr
                        if (ampm === 'PM' && hours !== 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;

                        const startTime = `${hours.toString().padStart(2, '0')}:${minutes}`;

                        // Calculate end time from duration (e.g., "1:30")
                        // Default: 90 min, or 120 min if title contains "breakfast"
                        let endTime = startTime;
                        const titleLower = (row['Title (Optional)'] || '').toLowerCase();
                        const defaultDurationMins = titleLower.includes('breakfast') ? 120 : 90;
                        const rawDuration = row.Duration;
                        let totalDurationMins = defaultDurationMins;
                        if (rawDuration) {
                            const durationParts = rawDuration.split(':');
                            const durationHours = parseInt(durationParts[0]) || 0;
                            const durationMins = parseInt(durationParts[1]) || 0;
                            totalDurationMins = durationHours * 60 + durationMins;
                            if (totalDurationMins === 0) totalDurationMins = defaultDurationMins;
                        }
                        const startDate = new Date(`2000-01-01T${startTime}`);
                        startDate.setMinutes(startDate.getMinutes() + totalDurationMins);
                        endTime = startDate.toTimeString().slice(0, 5);

                        // Parse title to extract skate number and tier
                        // Handles formats like "Scrimmage - 246 Tier 3", "Scrimmage - 249 Breakfast of Champions", "Shinny ALL STARS / SKILLS COMP"
                        const rawTitle = row['Title (Optional)'] || '';
                        let skateNumber = '';
                        let tier = '';

                        // Try to extract number and tier: look for a number followed by text
                        const numberTierMatch = rawTitle.match(/(\d+)\s+(.+)$/);
                        if (numberTierMatch) {
                            skateNumber = numberTierMatch[1];
                            tier = numberTierMatch[2].trim();
                        } else {
                            // No number found, treat whole thing as tier/title
                            tier = rawTitle;
                        }

                        const title = skateNumber ? `${skateNumber} ${tier}` : tier;

                        parsedCSVData.push({
                            title: title,
                            tier: tier,
                            skate_number: skateNumber,
                            date: date,
                            time_start: startTime,
                            time_end: endTime,
                            location: row['Location (Optional)'] || '',
                            cost: '$25',
                            capacity: 24
                        });
                    });

                    if (parsedCSVData.length === 0) {
                        alert('No valid skates found in CSV');
                        return;
                    }

                    showCSVPreview();
                },
                error: function(error) {
                    console.error('CSV parse error:', error);
                    alert('Failed to parse CSV file');
                }
            });
        }

        function showCSVPreview() {
            const content = document.getElementById('csvPreviewContent');
            
            content.innerHTML = `
                <p style="color: var(--primary); font-weight: 600; margin-bottom: 12px;">
                    Found ${parsedCSVData.length} skate(s) to import:
                </p>
                <div style="max-height: 400px; overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px;">
                    ${parsedCSVData.map((skate, i) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 8px; background: rgba(255,255,255,0.05); border-radius: 6px;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: var(--text);">${i + 1}. ${escapeHTML(skate.tier || skate.title || 'Untitled')}</div>
                                <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
                                    📅 ${(() => { const [y,m,d] = skate.date.split('-'); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${months[parseInt(m)-1]} ${parseInt(d)}, ${y}`; })()}
                                    • 🕐 ${formatTime(skate.time_start)} - ${formatTime(skate.time_end)}
                                    • 📍 ${escapeHTML(skate.location || 'No location')}
                                </div>
                            </div>
                            <button onclick="removeFromImport(${i})" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 12px;">Remove</button>
                        </div>
                    `).join('')}
                </div>
            `;

            document.getElementById('importCSVButton').style.display = 'block';
            document.getElementById('csvPreviewModal').classList.add('active');
        }

        function removeFromImport(index) {
            parsedCSVData.splice(index, 1);
            if (parsedCSVData.length === 0) {
                closeCSVPreviewModal();
                alert('No skates left to import');
            } else {
                showCSVPreview(); // Refresh preview
            }
        }

        function selectPlayerForSwap(playerId, element) {
            // element could be the div or the span - normalize to the roster-item div
            const rosterItem = element.classList.contains('roster-item') ? element : element.closest('.roster-item');
            const nameEl = rosterItem.querySelector('.roster-item-name');

            // If clicking the already-selected player, deselect
            if (selectedSwapPlayer && selectedSwapPlayer.id === playerId) {
                selectedSwapPlayer.rosterItem.classList.remove('swap-selected');
                selectedSwapPlayer = null;
                return;
            }
            // If a player is already selected, swap them
            if (selectedSwapPlayer) {
                swapPlayers(selectedSwapPlayer.id, playerId);
                selectedSwapPlayer.rosterItem.classList.remove('swap-selected');
                selectedSwapPlayer = null;
                return;
            }
            // First selection
            selectedSwapPlayer = { id: playerId, rosterItem };
            rosterItem.classList.add('swap-selected');
        }

        async function swapPlayers(idA, idB) {
            const allItems = Array.from(document.querySelectorAll('#rosterList .roster-item'));
            
            // Find DOM indices
            let idxA = -1, idxB = -1;
            allItems.forEach((item, index) => {
                const nameEl = item.querySelector('.roster-item-name');
                if (!nameEl) return;
                if (nameEl.dataset.playerId == idA) idxA = index;
                if (nameEl.dataset.playerId == idB) idxB = index;
            });

            console.log('Swap:', idA, '(idx', idxA, ') <->', idB, '(idx', idxB, ')');

            if (idxA === -1 || idxB === -1) {
                console.error('Could not find players in DOM', idA, idB);
                return;
            }

            // Assign all players new positions based on current DOM order, then swap A and B
            const posMap = {};
            allItems.forEach((item, index) => {
                const nameEl = item.querySelector('.roster-item-name');
                if (!nameEl) return;
                posMap[nameEl.dataset.playerId] = index + 1;
            });

            // Swap positions of A and B
            const posA = posMap[idA];
            const posB = posMap[idB];
            posMap[idA] = posB;
            posMap[idB] = posA;

            try {
                // Update all positions to avoid conflicts
                const updates = Object.entries(posMap).map(([pid, pos]) =>
                    supabaseClient.from('skate_registrations').update({ position: pos }).eq('id', parseInt(pid))
                );
                await Promise.all(updates);
                
                const skateId = document.getElementById('rosterModal').dataset.skateId;
                const skate = allSkates.find(s => s.id === parseInt(skateId));
                await loadRoster(parseInt(skateId), skate?.capacity || 24);
            } catch (err) {
                console.error('Swap failed:', err);
                alert('Swap failed: ' + err.message);
            }
        }

        async function importCSVSkates() {
            try {
                const { data, error } = await supabaseClient
                    .from('skates')
                    .insert(parsedCSVData)
                    .select();

                if (error) throw error;

                const importedCount = parsedCSVData.length;
                closeCSVPreviewModal();
                await loadSkates();
                alert(`✓ Imported ${importedCount} skate(s)!`);
                parsedCSVData = [];
            } catch (error) {
                console.error('Error importing skates:', error);
                alert('Failed to import skates');
            }
        }

        function closeCSVPreviewModal() {
            document.getElementById('csvPreviewModal').classList.remove('active');
            document.getElementById('importCSVButton').style.display = 'none';
            parsedCSVData = [];
        }

        async function balanceSkate() {
            // Get roster
            const { data, error } = await supabaseClient
                .from('skate_registrations')
                .select('*')
                .eq('skate_id', currentSkateId)
                .eq('is_waitlist', false)
                .order('position');

            if (error || !data) {
                alert('Failed to load roster');
                return;
            }

            // Sort: goalies first, then skaters
            const sortedData = data.sort((a, b) => {
                if (a.is_goalie && !b.is_goalie) return -1;
                if (!a.is_goalie && b.is_goalie) return 1;
                return a.position - b.position;
            });

            // Build player list string with goalies at top
            const playerList = sortedData.map(p => {
                let line = p.player_name;
                if (p.is_goalie) line += ' g';
                // Add friend group letter if exists
                if (p.friend_group && p.friend_group.trim()) {
                    line += ` ${p.friend_group}`;
                }
                return line;
            }).join('\n');
            
            console.log('Exporting to balancer:', playerList);
            console.log('Sample player:', sortedData[0]);

            // Store in localStorage to pass to balancer
            localStorage.setItem('importedRoster', playerList);
            localStorage.setItem('importedRosterDetails', JSON.stringify(sortedData.map(player => ({
                name: player.player_name,
                isGoalie: Boolean(player.is_goalie),
                friendGroup: player.friend_group || null
            }))));
            
            // Get skate details
            const skate = allSkates.find(s => s.id === currentSkateId);
            if (skate) {
                localStorage.setItem('importedSkateDetails', JSON.stringify({
                    title: skate.title,
                    date: formatDate(skate.date),
                    time: `${formatTime(skate.time_start)}–${formatTime(skate.time_end)}`,
                    cost: skate.cost,
                    location: skate.location
                }));
            }

            // Set flag for auto-load
            localStorage.setItem('autoLoadRoster', 'true');
            localStorage.setItem('currentSkateId', currentSkateId);

            // Redirect to balancer
            window.location.href = 'balancer.html';
        }

        // ========== QUICK ADD PLAYER FUNCTIONS ==========
        
