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
            const chunkSize = 10;
            const skateIdChunks = [];
            for (let i = 0; i < skateIds.length; i += chunkSize) {
                skateIdChunks.push(skateIds.slice(i, i + chunkSize));
            }

            // Fetch count data for all skate groups concurrently so older skates do
            // not make the home page wait through one network round trip per group.
            const registrationResults = await Promise.all(skateIdChunks.map(chunk =>
                supabaseClient
                    .from('skate_registrations')
                    .select('skate_id, is_goalie, is_waitlist')
                    .in('skate_id', chunk)
                    .eq('is_waitlist', false)
                    .limit(2000)
            ));
            const allRegs = registrationResults.flatMap(result => result.data || []);
            
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
            const tier = tierSelect.value;
            
            if (number && tier) {
                document.getElementById('skateTitle').value = `${number} ${tier}`;
            } else if (number) {
                document.getElementById('skateTitle').value = `${number}`;
            } else if (tier) {
                document.getElementById('skateTitle').value = tier;
            } else {
                document.getElementById('skateTitle').value = '';
            }
        }

        let skateOptionRows = [];

        function populateTimeDropdowns() {
            const startSelect = document.getElementById('skateStartTime');
            startSelect.innerHTML = '<option value="">Select a time</option>';
            const pmGroup = document.createElement('optgroup');
            pmGroup.label = 'PM times';
            const amGroup = document.createElement('optgroup');
            amGroup.label = 'AM times';

            // Evening times first, descending. Exclude midnight through 5:45 AM.
            for (let totalMinutes = 23 * 60 + 45; totalMinutes >= 6 * 60; totalMinutes -= 15) {
                const hour24 = Math.floor(totalMinutes / 60);
                const minute = totalMinutes % 60;
                const hour12 = hour24 % 12 || 12;
                const period = hour24 >= 12 ? 'PM' : 'AM';
                const option = document.createElement('option');
                option.value = String(hour24).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
                option.textContent = hour12 + ':' + String(minute).padStart(2, '0') + ' ' + period;
                (period === 'PM' ? pmGroup : amGroup).appendChild(option);
            }

            startSelect.append(pmGroup, amGroup);
        }

        function setSkateOptionSelect(selectId, type, selectedValue = '') {
            const select = document.getElementById(selectId);
            const placeholder = type === 'tier' ? 'Select a format' : 'Select a rink';
            select.innerHTML = '<option value="">' + placeholder + '</option>';
            skateOptionRows
                .filter(option => option.option_type === type && option.is_active)
                .forEach(option => {
                    const item = document.createElement('option');
                    item.value = option.name;
                    item.textContent = option.name;
                    select.appendChild(item);
                });

            if (selectedValue && !Array.from(select.options).some(option => option.value === selectedValue)) {
                const legacy = document.createElement('option');
                legacy.value = selectedValue;
                legacy.textContent = selectedValue + ' (used on this skate)';
                select.appendChild(legacy);
            }
            select.value = selectedValue || '';
        }

        async function loadSkateOptions() {
            const selectedTier = document.getElementById('skateTier')?.value || '';
            const selectedLocation = document.getElementById('skateLocation')?.value || '';
            const { data, error } = await supabaseClient
                .from('skate_options')
                .select('id, option_type, name, sort_order, is_active')
                .order('sort_order', { ascending: true })
                .order('name', { ascending: true });

            if (error) {
                console.error('Unable to load skate options:', error);
                setSkateOptionsStatus('Options could not load. Run the Skate Options SQL setup in Supabase, then refresh.', true);
                const notice = document.getElementById('skateOptionsFormNotice');
                if (notice) {
                    notice.textContent = 'Tiers and locations need their one-time Supabase setup before you can create a skate.';
                    notice.classList.add('is-error');
                }
                return false;
            }

            const notice = document.getElementById('skateOptionsFormNotice');
            if (notice) {
                notice.textContent = '';
                notice.classList.remove('is-error');
            }
            skateOptionRows = data || [];

            // Bring forward custom tiers saved in this browser by the old version.
            let legacyTiers = [];
            try { legacyTiers = JSON.parse(localStorage.getItem('customTiers') || '[]'); } catch (_) {}
            const missingLegacy = legacyTiers
                .filter(name => typeof name === 'string' && name.trim())
                .filter(name => !skateOptionRows.some(option => option.option_type === 'tier' && option.name.toLowerCase() === name.trim().toLowerCase()))
                .map((name, index) => ({ option_type: 'tier', name: name.trim(), sort_order: 1000 + index }));
            if (missingLegacy.length) {
                const { error: legacyError } = await supabaseClient
                    .from('skate_options')
                    .upsert(missingLegacy, { onConflict: 'option_type,name', ignoreDuplicates: true });
                if (!legacyError) {
                    localStorage.removeItem('customTiers');
                    const refreshed = await supabaseClient.from('skate_options')
                        .select('id, option_type, name, sort_order, is_active')
                        .order('sort_order', { ascending: true }).order('name', { ascending: true });
                    if (!refreshed.error) skateOptionRows = refreshed.data || skateOptionRows;
                } else {
                    console.warn('Legacy local tiers were not migrated:', legacyError);
                }
            }

            setSkateOptionSelects(selectedTier, selectedLocation);
            renderSkateOptionLists();
            return true;
        }

        function setSkateOptionSelects(selectedTier = '', selectedLocation = '') {
            setSkateOptionSelect('skateTier', 'tier', selectedTier);
            setSkateOptionSelect('skateLocation', 'location', selectedLocation);
        }

        function renderSkateOptionLists() {
            const renderGroup = (type, containerId) => {
                const container = document.getElementById(containerId);
                if (!container) return;
                const options = skateOptionRows.filter(option => option.option_type === type && option.is_active);
                container.innerHTML = options.length ? options.map(option =>
                    '<div class="skate-option-item"><span>' + escapeHTML(option.name) +
                    '</span><button type="button" onclick="archiveSkateOption(' + option.id +
                    ')" aria-label="Remove ' + escapeHTML(option.name) +
                    '" title="Remove from future skates">×</button></div>'
                ).join('') : '<p class="skate-options-empty">No options yet. Add one above.</p>';
            };
            renderGroup('tier', 'tierOptionsList');
            renderGroup('location', 'locationOptionsList');
        }

        function openSkateOptions() {
            const modal = document.getElementById('skateOptionsModal');
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            setSkateOptionsStatus('');
            loadSkateOptions();
        }

        function closeSkateOptions() {
            const modal = document.getElementById('skateOptionsModal');
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }

        function setSkateOptionsStatus(message, isError = false) {
            const status = document.getElementById('skateOptionsStatus');
            if (!status) return;
            status.textContent = message;
            status.classList.toggle('is-error', Boolean(isError));
        }

        async function addSkateOption(event, type) {
            event.preventDefault();
            const inputId = type === 'tier' ? 'newTierOption' : 'newLocationOption';
            const input = document.getElementById(inputId);
            const name = input.value.trim();
            if (!name) return;

            const existingOption = skateOptionRows.find(option => option.option_type === type && option.name.toLowerCase() === name.toLowerCase());
            if (existingOption?.is_active) {
                setSkateOptionsStatus('That option is already on the list.', true);
                return;
            }

            const currentOptions = skateOptionRows.filter(option => option.option_type === type);
            const sort_order = Math.max(0, ...currentOptions.map(option => Number(option.sort_order) || 0)) + 10;
            const { error } = existingOption
                ? await supabaseClient.from('skate_options').update({ is_active: true, sort_order }).eq('id', existingOption.id)
                : await supabaseClient.from('skate_options').insert({ option_type: type, name, sort_order });
            if (error) {
                console.error('Unable to add skate option:', error);
                setSkateOptionsStatus('Could not save that option. Please try again.', true);
                return;
            }

            input.value = '';
            setSkateOptionsStatus((type === 'tier' ? 'Tier' : 'Location') + (existingOption ? ' restored.' : ' added.'));
            await loadSkateOptions();
        }

        async function archiveSkateOption(id) {
            const option = skateOptionRows.find(item => Number(item.id) === Number(id));
            if (!option) return;
            const typeName = option.option_type === 'tier' ? 'tier' : 'location';
            if (!confirm('Remove “' + option.name + '” from future skates? Existing skate records will keep this value.')) return;

            const { error } = await supabaseClient.from('skate_options')
                .update({ is_active: false }).eq('id', option.id);
            if (error) {
                console.error('Unable to remove skate option:', error);
                setSkateOptionsStatus('Could not remove that ' + typeName + '. Please try again.', true);
                return;
            }

            setSkateOptionsStatus(typeName[0].toUpperCase() + typeName.slice(1) + ' removed from future skates.');
            await loadSkateOptions();
        }

        function adjustSkateCapacity(change) {
            const input = document.getElementById('skateCapacity');
            input.value = Math.max(1, Math.min(100, (parseInt(input.value, 10) || 24) + change));
        }

        function handleTierChange() {
            updateSkateTitle();
        }

        async function showCreateModal() {
            isEditMode = false;
            currentSkateId = null;

            document.getElementById('modalTitle').textContent = 'Create a skate';
            document.getElementById('saveSkateBtn').innerHTML = '<span>Create skate</span><span aria-hidden="true">→</span>';
            document.getElementById('skateNumber').value = '';
            document.getElementById('skateTitle').value = '';
            document.getElementById('skateDate').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            document.getElementById('skateCapacity').value = '24';
            document.getElementById('skateDuration').value = '90';
            document.getElementById('skateCost').value = '$25';
            document.getElementById('skateFree').checked = false;
            document.getElementById('skateIceCost').value = '';
            document.getElementById('skateRefCost').value = '0';
            document.getElementById('skateOtherCost').value = '';
            document.getElementById('skateTotalCost').value = '';
            document.getElementById('skateRevenue').value = '';
            document.getElementById('skateProfit').value = '';
            document.getElementById('iceCostLabel').textContent = '';

            populateTimeDropdowns();
            document.getElementById('skateStartTime').value = '19:30';
            await loadSkateOptions();
            setSkateOptionSelects('', '');
            document.getElementById('skateModal').classList.add('active');
        }

        async function showEditSkateModal() {
            if (!currentSkateId) return;
            const skate = allSkates.find(item => item.id === currentSkateId);
            if (!skate) return;

            isEditMode = true;
            document.getElementById('modalTitle').textContent = 'Edit skate';
            document.getElementById('saveSkateBtn').innerHTML = '<span>Save changes</span><span aria-hidden="true">→</span>';
            populateTimeDropdowns();
            await loadSkateOptions();

            let skateNumber = '';
            let tier = skate.tier || '';
            if (skate.title) {
                let match = skate.title.match(/^(\d+)\s+(.+)$/);
                if (match) {
                    skateNumber = match[1];
                    tier = match[2];
                } else {
                    match = skate.title.match(/^Skate\s+(\d+)[:\s]+(.+)$/i);
                    if (match) {
                        skateNumber = match[1];
                        tier = match[2];
                    }
                }
            }

            document.getElementById('skateNumber').value = skateNumber;
            document.getElementById('skateTitle').value = skate.title || '';
            document.getElementById('skateDate').value = skate.date || '';
            document.getElementById('skateCapacity').value = skate.capacity || 24;
            setSkateOptionSelects(tier, skate.location || '');

            const timeSelect = document.getElementById('skateStartTime');
            const timeValue = skate.time_start ? skate.time_start.substring(0, 5) : '19:30';
            if (!Array.from(timeSelect.options).some(option => option.value === timeValue)) {
                const legacyTime = document.createElement('option');
                legacyTime.value = timeValue;
                legacyTime.textContent = timeValue + ' (existing time)';
                timeSelect.appendChild(legacyTime);
            }
            timeSelect.value = timeValue;

            let duration = 90;
            if (skate.time_start && skate.time_end) {
                const startParts = skate.time_start.substring(0, 5).split(':').map(Number);
                const endParts = skate.time_end.substring(0, 5).split(':').map(Number);
                const startMinutes = startParts[0] * 60 + startParts[1];
                let endMinutes = endParts[0] * 60 + endParts[1];
                if (endMinutes < startMinutes) endMinutes += 24 * 60;
                duration = endMinutes - startMinutes;
            }
            document.getElementById('skateDuration').value = String(duration);
            document.getElementById('skateCost').value = skate.cost || '$25';
            document.getElementById('skateFree').checked = skate.is_free || false;
            document.getElementById('skateCost').disabled = skate.is_free || false;
            document.getElementById('skateIceCost').value = skate.ice_cost || '';
            const refSelect = document.getElementById('skateRefCost');
            const refVal = skate.ref_cost ? String(Math.round(skate.ref_cost)) : '0';
            refSelect.value = Array.from(refSelect.options).some(option => option.value === refVal) ? refVal : '0';
            document.getElementById('skateOtherCost').value = skate.other_cost || '';
            updateTotalCost(goalieSkaterCounts[skate.id]?.skaters || 0);

            closeRosterModal();
            document.getElementById('skateModal').classList.add('active');
        }

        function closeSkateModal() {
            document.getElementById('skateModal').classList.remove('active');
            // Don't reset isEditMode here - let it persist until save completes
        }

        async function saveSkate() {
            const skateNumber = document.getElementById('skateNumber').value.trim();
            const date = document.getElementById('skateDate').value;
            const tierSelect = document.getElementById('skateTier');
            const tier = tierSelect.value;
            const timeStart = document.getElementById('skateStartTime').value;
            const duration = document.getElementById('skateDuration').value;
            const cost = document.getElementById('skateCost').value.trim();
            const capacity = parseInt(document.getElementById('skateCapacity').value);
            const location = document.getElementById('skateLocation').value;

            if (!date || !timeStart || !duration || !tier || !location) {
                alert('Please choose a tier, location, date, start time, and duration.');
                return;
            }

            // Calculate end time from start time + duration
            const [hours, minutes] = timeStart.split(':').map(Number);
            const durationMins = parseInt(duration);
            const endDate = new Date(2000, 0, 1, hours, minutes + durationMins);
            const timeEnd = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

            // Build title (auto-generated or blank)
            const title = document.getElementById('skateTitle').value.trim() || [skateNumber, tier].filter(Boolean).join(' ') || 'Skate';

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
                <div class="roster-details-grid">
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
