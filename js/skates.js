        let rosterSortAlpha = false;

        function toggleRosterSort() {
            rosterSortAlpha = !rosterSortAlpha;
            const btn = document.getElementById('sortToggleBtn');
            btn.textContent = rosterSortAlpha ? '🔢 Position' : '🔤 A–Z';
            btn.style.background = rosterSortAlpha ? 'rgba(var(--primary-rgb), 0.15)' : '';
            btn.style.color = rosterSortAlpha ? 'var(--primary)' : '';
            const skate = allSkates.find(s => s.id === currentSkateId);
            loadRoster(currentSkateId, skate?.capacity || 24);
        }

        function filterPlayerSuggestions(inputId, suggestionsId) {
            const input = document.getElementById(inputId);
            const box = document.getElementById(suggestionsId);
            const query = input.value.trim().toLowerCase();
            if (query.length < 1) { box.style.display = 'none'; return; }
            const matches = allPlayers.filter(p => p.name.toLowerCase().includes(query)).slice(0, 8);
            if (matches.length === 0) { box.style.display = 'none'; return; }
            box.innerHTML = matches.map(p => `
                <div style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--card-border); color: var(--text);"
                    onmousedown="selectPlayerSuggestion('${inputId}', '${suggestionsId}', ${inlineJSString(p.name)})"
                    onmouseover="this.style.background='rgba(var(--primary-rgb),0.1)'"
                    onmouseout="this.style.background=''">
                    ${escapeHTML(p.name)}
                </div>`).join('');
            box.style.display = 'block';
        }

        function selectPlayerSuggestion(inputId, suggestionsId, name) {
            document.getElementById(inputId).value = name;
            document.getElementById(suggestionsId).style.display = 'none';
        }

        async function loadAllPlayers() {
            try {
                const { data, error } = await supabaseClient
                    .from('players')
                    .select('id, name, rating')
                    .order('name');
                if (!error && data) allPlayers = data;
            } catch (e) {
                console.error('Failed to load players:', e);
            }
        }

        async function loadSkates() {
            try {
                const { data, error } = await supabaseClient
                    .from('skates')
                    .select('*')
                    .order('date', { ascending: true })
                    .order('time_start', { ascending: true });

                if (error) {
                    console.error('Supabase error:', error);
                    console.error('Error message:', error.message);
                    console.error('Error details:', JSON.stringify(error, null, 2));
                    throw error;
                }

                allSkates = data;
                renderSkates();
                
                // Auto-show Quick Add on first load only
                if (!window.hasShownQuickAdd && allSkates.length > 0) {
                    window.hasShownQuickAdd = true;
                    setTimeout(() => showQuickAdd(), 300); // Small delay for smooth UX
                }
            } catch (error) {
                console.error('Error loading skates:', error);
                console.error('Full error:', JSON.stringify(error, null, 2));
                document.getElementById('skatesContainer').innerHTML = 
                    `<div class="empty-state"><h3>Failed to load skates</h3><p>Error: ${escapeHTML(error.message || 'Unknown error')}</p><p>Check console for details</p></div>`;
            }
        }

        async function renderSkates() {
            const upcomingContainer = document.getElementById('skatesContainer');
            const pastContainer = document.getElementById('pastSkatesContainer');
            
            if (allSkates.length === 0) {
                upcomingContainer.innerHTML = '<div class="empty-state"><h3>No skates yet</h3><p>Click "Create Skate" to get started</p></div>';
                return;
            }

            // Get today's date at midnight for comparison
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Separate future and past skates
            const futureSkates = allSkates.filter(skate => {
                const skateDate = new Date(skate.date + 'T00:00:00');
                return !skate.is_archived && skateDate >= today;
            }).sort((a, b) => new Date(a.date) - new Date(b.date));

            const pastSkates = allSkates.filter(skate => {
                const skateDate = new Date(skate.date + 'T00:00:00');
                return skate.is_archived || skateDate < today;
            }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Reverse chronological

            // Get registration counts for ALL skates in ONE BULK QUERY (fast!)
            const skateIds = allSkates.map(s => s.id);
            let allRegs = [];
            const chunkSize = 10;
            for (let i = 0; i < skateIds.length; i += chunkSize) {
                const chunk = skateIds.slice(i, i + chunkSize);
                const { data: chunkRegs } = await supabaseClient
                    .from('skate_registrations')
                    .select('skate_id, is_goalie, is_waitlist')
                    .in('skate_id', chunk)
                    .eq('is_waitlist', false)
                    .limit(2000);
                if (chunkRegs) allRegs = allRegs.concat(chunkRegs);
            }
            
            // Group counts by skate
            const skateCounts = {};
            goalieSkaterCounts = {};
            allSkates.forEach(skate => {
                skateCounts[skate.id] = 0;
                goalieSkaterCounts[skate.id] = { goalies: 0, skaters: 0 };
            });
            
            if (allRegs) {
                allRegs.forEach(reg => {
                    skateCounts[reg.skate_id]++;
                    if (reg.is_goalie) {
                        goalieSkaterCounts[reg.skate_id].goalies++;
                    } else {
                        goalieSkaterCounts[reg.skate_id].skaters++;
                    }
                });
            }

            // Helper function to render skate cards
            const renderSkateCards = (skates) => {
                return skates.map(skate => {
                    
                    const { goalies = 0, skaters = 0 } = goalieSkaterCounts[skate.id] || {};
                    const maxSkaters = skate.capacity;
                    const hasPlayers = goalies > 0 || skaters > 0;
                    const countColorClass = hasPlayers ? 'has-players' : 'no-players';
                    const goalieText = goalies === 0 
                        ? `<span style="color:#ef4444">${goalies}/2 goalies</span>`
                        : goalies === 1
                        ? `<span style="color:#f59e0b">${goalies}/2 goalies</span>`
                        : `${goalies}/2 goalies`;
                    
                    return `
                        <div class="skate-card" onclick="openSkate(${skate.id})">
                            <div class="skate-title">${escapeHTML(skate.title)}</div>
                            ${skate.is_archived ? '<div class="skate-detail skate-archived-label">Archived · no longer on BenchApp</div>' : ''}
                            <div class="skate-detail">📅 ${formatDate(skate.date)}</div>
                            <div class="skate-detail">🕐 ${formatTime(skate.time_start)}–${formatTime(skate.time_end)}</div>
                            <div class="skate-detail">📍 ${escapeHTML(skate.location)}</div>
                            ${skate.tier ? `<div class="skate-detail">🏒 ${escapeHTML(skate.tier)}</div>` : ''}
                            <div class="skate-count ${countColorClass}">${goalieText} · ${skaters}/${maxSkaters} skaters</div>
                        </div>
                    `;
                }).join('');
            };

            // Render upcoming skates
            if (futureSkates.length === 0) {
                upcomingContainer.innerHTML = '<div class="empty-state"><h3>No upcoming skates</h3><p>All skates are in the past</p></div>';
            } else {
                upcomingContainer.innerHTML = renderSkateCards(futureSkates);
            }

            // Update counts
            document.getElementById('upcomingCount').textContent = `(${futureSkates.length})`;
            document.getElementById('archiveCount').textContent = pastSkates.length;
            document.getElementById('pastCount').textContent = `(${pastSkates.length})`;

            // Show/hide archive button
            const archiveToggle = document.getElementById('archiveToggle');
            if (pastSkates.length > 0) {
                archiveToggle.style.display = 'block';
            } else {
                archiveToggle.style.display = 'none';
            }

            // Render past skates (always render, visibility controlled by toggle)
            if (pastSkates.length > 0) {
                pastContainer.innerHTML = renderSkateCards(pastSkates);
            }
        }

        function updateSkateTitle() {
            const number = document.getElementById('skateNumber').value;
            const tierSelect = document.getElementById('skateTier');
            const tier = tierSelect.value === 'custom' ? '' : tierSelect.value;
            
            if (number && tier) {
                document.getElementById('skateTitle').value = `${number} ${tier}`;
            } else if (number) {
                document.getElementById('skateTitle').value = `${number}`;
            } else {
                document.getElementById('skateTitle').value = '';
            }
        }

        function populateDateDropdowns() {
            // Populate days (1-31)
            const daySelect = document.getElementById('skateDay');
            daySelect.innerHTML = '<option value="">Day</option>';
            for (let i = 1; i <= 31; i++) {
                daySelect.innerHTML += `<option value="${i}">${i}</option>`;
            }

            // Populate years (current year and next year)
            const yearSelect = document.getElementById('skateYear');
            const currentYear = new Date().getFullYear();
            yearSelect.innerHTML = '<option value="">Year</option>';
            yearSelect.innerHTML += `<option value="${currentYear}">${currentYear}</option>`;
            yearSelect.innerHTML += `<option value="${currentYear + 1}">${currentYear + 1}</option>`;
        }

        function populateTimeDropdowns() {
            const times = [];
            
            // Generate times in 15-minute intervals
            for (let hour = 0; hour < 24; hour++) {
                for (let min = 0; min < 60; min += 15) {
                    const h = hour % 12 || 12;
                    const ampm = hour < 12 ? 'AM' : 'PM';
                    const displayTime = `${h}:${min.toString().padStart(2, '0')} ${ampm}`;
                    const valueTime = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                    times.push({ display: displayTime, value: valueTime });
                }
            }

            const startSelect = document.getElementById('skateStartTime');
            startSelect.innerHTML = '<option value="">Select time</option>';
            
            times.forEach(time => {
                startSelect.innerHTML += `<option value="${time.value}">${time.display}</option>`;
            });
        }

        function handleTierChange() {
            const select = document.getElementById('skateTier');
            
            if (select.value === 'custom') {
                document.getElementById('customTierInput').style.display = 'block';
                document.getElementById('customTierText').focus();
            } else {
                document.getElementById('customTierInput').style.display = 'none';
                updateSkateTitle();
            }

            // Auto-set price and duration based on tier
            const tier = select.value;
            const costEl = document.getElementById('skateCost');
            const durationEl = document.getElementById('skateDuration');

            if (tier === 'Breakfast of Champions') {
                costEl.value = '$30';
                durationEl.value = '120';
            } else if (tier === '3v3') {
                costEl.value = '$20';
                durationEl.value = '60';
            } else if (tier === 'Stick n Puck') {
                costEl.value = '$20';
                durationEl.value = '90';
            } else if (tier && tier !== 'custom') {
                costEl.value = '$25';
                durationEl.value = '90';
            }
        }

        function saveCustomTier() {
            const customText = document.getElementById('customTierText').value.trim();
            
            if (!customText) {
                alert('Please enter a tier/format name');
                return;
            }
            
            const select = document.getElementById('skateTier');
            
            // Add new option before "+ Add Custom Tier"
            const newOption = document.createElement('option');
            newOption.value = customText;
            newOption.textContent = customText;
            select.insertBefore(newOption, select.lastElementChild);
            
            // Select it
            select.value = customText;
            
            // Hide custom input
            document.getElementById('customTierInput').style.display = 'none';
            document.getElementById('customTierText').value = '';
            
            // Save to localStorage
            saveCustomTiers();
            
            // Update title
            updateSkateTitle();
        }

        function cancelCustomTier() {
            const select = document.getElementById('skateTier');
            select.selectedIndex = 0;
            document.getElementById('customTierInput').style.display = 'none';
            document.getElementById('customTierText').value = '';
        }

        function saveCustomTiers() {
            const select = document.getElementById('skateTier');
            const tiers = [];
            
            // Get all options except the last one (+ Add Custom Tier)
            for (let i = 0; i < select.options.length - 1; i++) {
                if (select.options[i].value) {
                    tiers.push(select.options[i].value);
                }
            }
            
            localStorage.setItem('customTiers', JSON.stringify(tiers));
        }

        function loadCustomTiers() {
            const saved = localStorage.getItem('customTiers');
            if (saved) {
                const tiers = JSON.parse(saved);
                const select = document.getElementById('skateTier');
                
                // Clear existing options except first and last
                while (select.options.length > 2) {
                    select.remove(1);
                }
                
                // Add saved tiers
                tiers.forEach(tier => {
                    const option = document.createElement('option');
                    option.value = tier;
                    option.textContent = tier;
                    select.insertBefore(option, select.lastElementChild);
                });
            }
        }

        function showCreateModal() {
            isEditMode = false;
            currentSkateId = null; // Clear any previous skate ID
            console.log('showCreateModal - reset isEditMode to false');
            
            document.getElementById('modalTitle').textContent = 'Create New Skate';
            document.getElementById('saveSkateBtn').textContent = 'Create Skate';
            document.getElementById('skateNumber').value = '';
            document.getElementById('skateTitle').value = '';
            document.getElementById('skateTier').selectedIndex = 0;
            document.getElementById('skateCost').value = '$25';
            document.getElementById('skateFree').checked = false;
            document.getElementById('skateCost').disabled = false;
            document.getElementById('skateIceCost').value = '';
            document.getElementById('skateRefCost').value = '0';
            document.getElementById('skateOtherCost').value = '';
            document.getElementById('skateTotalCost').value = '';
            document.getElementById('skateRevenue').value = '';
            document.getElementById('skateProfit').value = '';
            document.getElementById('iceCostLabel').textContent = '';
            document.getElementById('skateCapacity').value = '24';
            document.getElementById('skateLocation').selectedIndex = 0;
            document.getElementById('customTierInput').style.display = 'none';
            
            // Populate dropdowns
            populateDateDropdowns();
            populateTimeDropdowns();
            
            // Set defaults
            const currentMonth = new Date().getMonth() + 1;
            document.getElementById('skateMonth').value = currentMonth;
            document.getElementById('skateYear').value = '2026'; // Auto-select 2026
            
            // Reset other date/time selections
            document.getElementById('skateDay').selectedIndex = 0;
            document.getElementById('skateStartTime').selectedIndex = 0;
            document.getElementById('skateDuration').value = '90'; // Default 1:30
            
            loadCustomTiers();
            document.getElementById('skateModal').classList.add('active');
        }

        function showEditSkateModal() {
            if (!currentSkateId) return;
            
            console.log('showEditSkateModal - currentSkateId:', currentSkateId);
            isEditMode = true;
            console.log('Set isEditMode to:', isEditMode);
            
            const skate = allSkates.find(s => s.id === currentSkateId);
            if (!skate) return;
            
            console.log('Editing skate:', skate);
            console.log('time_start:', skate.time_start, 'time_end:', skate.time_end);

            document.getElementById('modalTitle').textContent = 'Edit Skate';
            document.getElementById('saveSkateBtn').textContent = 'Save Changes';
            
            // Populate dropdowns first
            populateDateDropdowns();
            populateTimeDropdowns();
            loadCustomTiers();

            // Parse skate number and tier from title
            let skateNumber = '';
            let tier = skate.tier || '';
            
            if (skate.title) {
                // Try "246 Tier 3" format (new format, number first)
                let match = skate.title.match(/^(\d+)\s+(.+)$/);
                if (match) {
                    skateNumber = match[1];
                    tier = match[2];
                } else {
                    // Try legacy "Skate 238: Breakfast" or "Skate 238 Breakfast" formats
                    match = skate.title.match(/^Skate\s+(\d+)[:\s]+(.+)$/i);
                    if (match) {
                        skateNumber = match[1];
                        tier = match[2];
                    }
                }
            }

            document.getElementById('skateNumber').value = skateNumber;
            document.getElementById('skateTitle').value = skate.title || '';
            
            // Set tier dropdown
            const tierSelect = document.getElementById('skateTier');
            let foundTier = false;
            for (let i = 0; i < tierSelect.options.length; i++) {
                if (tierSelect.options[i].value === tier) {
                    tierSelect.selectedIndex = i;
                    foundTier = true;
                    break;
                }
            }
            if (!foundTier && tier) {
                tierSelect.selectedIndex = 0;
            }

            // Parse date
            const dateParts = skate.date.split('-');
            document.getElementById('skateYear').value = dateParts[0];
            document.getElementById('skateMonth').value = parseInt(dateParts[1]);
            document.getElementById('skateDay').value = parseInt(dateParts[2]);

            // Set time with better matching
            const timeSelect = document.getElementById('skateStartTime');
            console.log('Time dropdown has', timeSelect.options.length, 'options');
            console.log('Trying to set time to:', skate.time_start);
            
            if (skate.time_start) {
                // Strip seconds if present (06:30:00 -> 06:30)
                const timeValue = skate.time_start.substring(0, 5);
                console.log('Time value after stripping seconds:', timeValue);
                
                // Try direct match
                timeSelect.value = timeValue;
                console.log('After direct assignment, selected value:', timeSelect.value);
                
                // If that didn't work, try to find it
                if (!timeSelect.value || timeSelect.value === '') {
                    console.log('Direct assignment failed, searching options...');
                    for (let i = 0; i < timeSelect.options.length; i++) {
                        if (timeSelect.options[i].value === timeValue) {
                            console.log('Found match at index', i, ':', timeSelect.options[i].value);
                            timeSelect.selectedIndex = i;
                            break;
                        }
                    }
                    console.log('After search, selected value:', timeSelect.value);
                }
            } else {
                timeSelect.value = '19:00';
            }
            
            // Calculate duration from start and end time
            if (skate.time_start && skate.time_end) {
                // Strip seconds if present
                const startTime = skate.time_start.substring(0, 5);
                const endTime = skate.time_end.substring(0, 5);
                
                const [startH, startM] = startTime.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                const durationMins = (endH * 60 + endM) - (startH * 60 + startM);
                document.getElementById('skateDuration').value = durationMins.toString();
            } else {
                document.getElementById('skateDuration').value = '90'; // Default 1:30
            }

            document.getElementById('skateCost').value = skate.cost || '$25';
            document.getElementById('skateCapacity').value = skate.capacity || 24;
            document.getElementById('skateFree').checked = skate.is_free || false;
            document.getElementById('skateCost').disabled = skate.is_free || false;
            document.getElementById('skateIceCost').value = skate.ice_cost || '';
            const refSelect = document.getElementById('skateRefCost');
            const refVal = skate.ref_cost ? String(Math.round(skate.ref_cost)) : '0';
            refSelect.value = Array.from(refSelect.options).map(o => o.value).includes(refVal) ? refVal : '0';
            document.getElementById('skateOtherCost').value = skate.other_cost || '';
            updateTotalCost(goalieSkaterCounts[skate.id]?.skaters || 0);
            
            // Set location
            const locationSelect = document.getElementById('skateLocation');
            const locationValue = skate.location || '';
            // Try exact match first
            let matched = false;
            for (let i = 0; i < locationSelect.options.length; i++) {
                if (locationSelect.options[i].value === locationValue) {
                    locationSelect.selectedIndex = i;
                    matched = true;
                    break;
                }
            }
            // Case-insensitive fallback
            if (!matched) {
                for (let i = 0; i < locationSelect.options.length; i++) {
                    if (locationSelect.options[i].value.toLowerCase() === locationValue.toLowerCase()) {
                        locationSelect.selectedIndex = i;
                        break;
                    }
                }
            }

            document.getElementById('customTierInput').style.display = 'none';
            
            // Close roster modal and open edit modal
            closeRosterModal();
            document.getElementById('skateModal').classList.add('active');
        }

        function closeSkateModal() {
            document.getElementById('skateModal').classList.remove('active');
            // Don't reset isEditMode here - let it persist until save completes
        }

        async function saveSkate() {
            const skateNumber = document.getElementById('skateNumber').value.trim();
            const month = document.getElementById('skateMonth').value;
            const day = document.getElementById('skateDay').value;
            const year = document.getElementById('skateYear').value;
            const tierSelect = document.getElementById('skateTier');
            const tier = tierSelect.value === 'custom' ? '' : tierSelect.value;
            const timeStart = document.getElementById('skateStartTime').value;
            const duration = document.getElementById('skateDuration').value;
            const cost = document.getElementById('skateCost').value.trim();
            const capacity = parseInt(document.getElementById('skateCapacity').value);
            const location = document.getElementById('skateLocation').value;

            // Only require date, time, cost - title/tier are optional
            if (!month || !day || !year || !timeStart || !duration || !cost) {
                alert('Please fill in date, start time, duration, and cost');
                return;
            }

            // Calculate end time from start time + duration
            const [hours, minutes] = timeStart.split(':').map(Number);
            const durationMins = parseInt(duration);
            const endDate = new Date(2000, 0, 1, hours, minutes + durationMins);
            const timeEnd = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

            // Build title (auto-generated or blank)
            const title = document.getElementById('skateTitle').value.trim();

            // Build date string (YYYY-MM-DD)
            const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

            const ice_cost = parseFloat(document.getElementById('skateIceCost').value) || null;
            const ref_cost = parseFloat(document.getElementById('skateRefCost').value) || null;
            const other_cost = parseFloat(document.getElementById('skateOtherCost').value) || null;
            const is_free = document.getElementById('skateFree').checked;

            const skateData = {
                title,
                date,
                tier,
                time_start: timeStart,
                time_end: timeEnd,
                cost: is_free ? '$0' : cost,
                capacity,
                location,
                ice_cost,
                ref_cost,
                other_cost,
                is_free
            };

            try {
                console.log('saveSkate - isEditMode:', isEditMode, 'currentSkateId:', currentSkateId);
                
                if (isEditMode && currentSkateId) {
                    console.log('Updating skate:', currentSkateId);
                    // Update existing skate
                    const { data, error } = await supabaseClient
                        .from('skates')
                        .update(skateData)
                        .eq('id', currentSkateId)
                        .select();

                    if (error) throw error;
                    console.log('Update successful:', data);

                    isEditMode = false; // Reset after successful update
                    await loadSkates();
                    closeSkateModal();
                    // Reopen the roster modal with updated skate
                    await openSkate(currentSkateId);
                } else {
                    console.log('Creating new skate');
                    // Create new skate
                    const { data, error } = await supabaseClient
                        .from('skates')
                        .insert([skateData])
                        .select();

                    if (error) throw error;

                    isEditMode = false; // Reset after successful create
                    closeSkateModal();
                    await loadSkates();
                    alert('✓ Skate created!');
                }
            } catch (error) {
                console.error('Error saving skate:', error);
                alert('Failed to save skate');
            }
        }

        async function openSkate(skateId) {
            currentSkateId = skateId;
            const skate = allSkates.find(s => s.id === skateId);
            
            if (!skate) return;

            document.getElementById('rosterSkateTitle').textContent = skate.title;
            document.getElementById('rosterSkateDetails').innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 14px;">
                    <div><strong>Date:</strong> ${formatDate(skate.date)}</div>
                    <div><strong>Time:</strong> ${formatTime(skate.time_start)}–${formatTime(skate.time_end)}</div>
                    <div><strong>Cost:</strong> ${escapeHTML(skate.cost)}</div>
                    <div><strong>Location:</strong> ${escapeHTML(skate.location)}</div>
                    ${skate.tier ? `<div><strong>Tier:</strong> ${escapeHTML(skate.tier)}</div>` : ''}
                    <div><strong>Capacity:</strong> ${skate.capacity}</div>
                </div>
            `;

            await loadRoster(skateId, skate.capacity);
            const modal = document.getElementById('rosterModal');
            modal.dataset.skateId = skateId;
            selectedSwapPlayer = null;
            rosterSortAlpha = false;
            const sortBtn = document.getElementById('sortToggleBtn');
            if (sortBtn) { sortBtn.textContent = '🔤 A–Z'; sortBtn.style.background = ''; sortBtn.style.color = ''; }
            modal.classList.add('active');
            loadTeamsForSkate(skateId);
        }

        async function loadRoster(skateId, capacity) {
            try {
                // Get roster - only fetch columns we need
                const { data, error } = await supabaseClient
                    .from('skate_registrations')
                    .select('id, skate_id, player_name, player_id, is_goalie, is_waitlist, is_paid, position, friend_group')
                    .eq('skate_id', skateId)
                    .order('position');

                if (error) throw error;

                // Build rating map from cached allPlayers (no extra DB call)
                const ratingMap = {};
                allPlayers.forEach(p => {
                    ratingMap[p.name.toLowerCase()] = p.rating;
                });

                // Add ratings to roster data
                const dataWithRatings = data.map(player => ({
                    ...player,
                    rating: ratingMap[player.player_name.toLowerCase()] || null
                }));

                const roster = dataWithRatings.filter(p => !p.is_waitlist);
                const waitlist = dataWithRatings.filter(p => p.is_waitlist);

                // Sort roster: goalies first, then skaters
                const sortedRoster = roster.sort((a, b) => {
                    if (a.is_goalie && !b.is_goalie) return -1;
                    if (!a.is_goalie && b.is_goalie) return 1;
                    if (rosterSortAlpha) return a.player_name.localeCompare(b.player_name);
                    return a.position - b.position;
                });

                // Count goalies and skaters
                const goalieCount = sortedRoster.filter(p => p.is_goalie).length;
                const skaterCount = sortedRoster.filter(p => !p.is_goalie).length;

                // Render roster
                const rosterList = document.getElementById('rosterList');
                if (sortedRoster.length === 0) {
                    rosterList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">No players yet</div>';
                } else {
                    let skaterNumber = 1; // Counter for skaters only
                    rosterList.innerHTML = sortedRoster.map(player => {
                        let classes = 'roster-item';
                        if (player.is_goalie) classes += ' goalie';
                        if (!player.is_paid) classes += ' unpaid';

                        // Number skaters only, not goalies
                        const playerDisplay = player.is_goalie 
                            ? `${player.player_name} 🥅`
                            : `${skaterNumber++}. ${player.player_name}`;
                        
                        // Show rating if available (hidden for goalies)
                        const rating = player.rating;
                        const ratingDisplay = player.is_goalie ? '' : (rating ? 
                            `<span style="display: inline-block; background: rgba(var(--primary-rgb), 0.15); color: var(--primary); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 6px; cursor: pointer;" onclick="event.stopPropagation(); editRating(${player.id}, ${inlineJSString(player.player_name)}, ${rating})" title="Click to edit rating">${rating}</span>` :
                            `<span style="display: inline-block; background: rgba(107, 114, 128, 0.15); color: #6b7280; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 6px; cursor: pointer;" onclick="event.stopPropagation(); editRating(${player.id}, ${inlineJSString(player.player_name)}, 0)" title="Click to add rating">No rating</span>`);
                        
                        // Show friend group tag if set
                        const friendTag = player.friend_group ? 
                            `<span style="display: inline-block; background: ${getFriendGroupColor(player.friend_group)}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; margin-left: 6px;">${escapeHTML(player.friend_group)}</span>` : '';

                        return `
                            <div class="${classes}" onclick="selectPlayerForSwap(${player.id}, this)" style="cursor: pointer;">
                                <span class="roster-item-name swappable" data-player-id="${player.id}" data-position="${player.position}">${escapeHTML(playerDisplay)}${ratingDisplay}${friendTag}</span>
                                <div class="player-menu" onclick="event.stopPropagation()">
                                    <button class="menu-button" onclick="toggleMenu(${player.id}, event)">⋮</button>
                                    <div id="menu-${player.id}" class="menu-dropdown">
                                        <div class="menu-item" onclick="showReplacePlayerModal(${player.id}, ${inlineJSString(player.player_name)}); closeMenu(${player.id})">🔁 Replace Player</div>
                                        ${!player.is_goalie ? 
                                            `<div class="menu-item" onclick="toggleGoalie(${player.id}, true); closeMenu(${player.id})">🥅 Mark as Goalie</div>` : 
                                            `<div class="menu-item" onclick="toggleGoalie(${player.id}, false); closeMenu(${player.id})">👤 Remove Goalie</div>`
                                        }
                                        ${player.is_paid ? 
                                            `<div class="menu-item" onclick="togglePaid(${player.id}, false); closeMenu(${player.id})">❌ Mark Unpaid</div>` : 
                                            `<div class="menu-item" onclick="togglePaid(${player.id}, true); closeMenu(${player.id})">💵 Mark Paid</div>`
                                        }
                                        <div class="menu-item" onclick="showFriendGroupMenu(${player.id}, event)">🤝 Friend Group ${player.friend_group ? `[${escapeHTML(player.friend_group)}]` : ''} ›</div>
                                        <div class="menu-item" onclick="giveCredit(${player.id}, ${inlineJSString(player.player_name)}); closeMenu(${player.id})">💳 Give Credit</div>
                                        <div class="menu-item" onclick="showMoveToSkateModal(${player.id}, ${inlineJSString(player.player_name)}); closeMenu(${player.id})">🔄 Move to Another Skate</div>
                                        <div class="menu-item" onclick="moveToWaitlist(${player.id}); closeMenu(${player.id})">⏸️ Move to Waitlist</div>
                                        <div class="menu-item" onclick="window.open('database.html?player=${encodeURIComponent(player.player_name)}', '_blank'); closeMenu(${player.id})">📊 View in Database</div>
                                        <div class="menu-item danger" onclick="deletePlayer(${player.id}); closeMenu(${player.id})">🗑️ Remove Player</div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                // Render waitlist
                const waitlistList = document.getElementById('waitlistList');
                if (waitlist.length === 0) {
                    waitlistList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">No waitlist</div>';
                } else {
                    waitlistList.innerHTML = waitlist.map(player => `
                        <div class="roster-item waitlist">
                            <span class="roster-item-name">${escapeHTML(player.player_name)}</span>
                            <div class="roster-item-actions">
                                <button class="icon-btn" onclick="moveToRoster(${player.id})" title="Move to roster">▶️</button>
                                <button class="icon-btn" onclick="deletePlayer(${player.id})" title="Remove">🗑️</button>
                            </div>
                        </div>
                    `).join('');
                }

                // Update counts with Goalies and Skaters breakdown
                document.getElementById('rosterCount').textContent = `Goalies (${goalieCount}/2) · Skaters (${skaterCount}/${capacity})`;
                document.getElementById('waitlistCount').textContent = `(${waitlist.length})`;

                // Update capacity bar (only count skaters, not goalies)
                const fillPercent = (skaterCount / capacity) * 100;
                const fill = document.getElementById('capacityFill');
                fill.style.width = fillPercent + '%';
                if (skaterCount >= capacity) {
                    fill.classList.add('capacity-full');
                } else {
                    fill.classList.remove('capacity-full');
                }

            } catch (error) {
                console.error('Error loading roster:', error);
            }
        }
