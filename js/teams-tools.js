        let currentSkateVote = null;

        function toggleTeamsSection() {
            const content = document.getElementById('teamsContent');
            const toggle = document.getElementById('teamsSectionToggle');
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            toggle.textContent = isHidden ? '▲ Hide' : '▼ Show';
        }

        async function loadTeamsForSkate(skateId) {
            const section = document.getElementById('teamsSection');
            try {
                const { data: teams } = await supabaseClient
                    .from('skate_teams')
                    .select('dark_team, light_team')
                    .eq('skate_id', skateId)
                    .maybeSingle();

                if (!teams) { section.style.display = 'none'; return; }

                section.style.display = 'block';
                renderTeamsList('teamsModalDark', teams.dark_team || [], skateId);
                renderTeamsList('teamsModalLight', teams.light_team || [], skateId);

                // Load vote
                const { data: vote } = await supabaseClient
                    .from('skate_votes')
                    .select('dark_votes, light_votes')
                    .eq('skate_id', skateId)
                    .maybeSingle();

                currentSkateVote = vote;
                updateTugBar(vote);

            } catch (err) {
                console.error('Error loading teams:', err);
                section.style.display = 'none';
            }
        }

        function renderTeamsList(containerId, players, skateId) {
            const container = document.getElementById(containerId);
            if (!players.length) { container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No players</p>'; return; }
            container.innerHTML = players.filter(p => !p.isGoalie).map(p => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; margin-bottom:6px; background:rgba(0,0,0,0.2); border-radius:8px; font-size:13px;">
                    <a href="balancer.html?player=${encodeURIComponent(p.name)}" style="color:var(--text); text-decoration:none; flex:1;" title="View profile">${escapeHTML(p.name)}</a>
                    <div style="display:flex; gap:4px; align-items:center;">
                        <span style="color:var(--text-muted); font-size:11px; margin-right:4px;">${getV2Score(allPlayers.find(player => player.name.toLowerCase() === p.name.toLowerCase())?.rating_v2b) ?? '—'}</span>
                    </div>
                </div>
            `).join('');
        }

        const NUDGE_SKILLS = [
            'skating_balance','skating_strides','skating_direction_change','skating_pivots','skating_zone_entry',
            'skating_off_wall','skating_corners','skating_punch_turns','skating_mohawks','skating_backwards_basic','skating_backwards_crossovers',
            'puck_shooting','puck_passing','puck_stickhandling','puck_receiving','puck_protection',
            'iq_positioning','iq_reads_anticipation','iq_defensive_awareness','iq_offensive_awareness','iq_transition',
            'compete_level','compete_battle_wins','compete_effort','compete_resilience',
            'readiness_conditioning','readiness_consistency'
        ];

        async function nudgePlayer(playerName, skateId, direction) {
            try {
                const { data: player } = await supabaseClient
                    .from('skate_manager_players')
                    .select('id, rating_v2')
                    .ilike('name', playerName)
                    .maybeSingle();

                if (!player) { showToast('Player not found in database'); return; }

                const nudgeAmount = direction === 'up' ? 1 : -1;
                const newRating = Math.min(100, Math.max(0, (player.rating_v2 || 50) + nudgeAmount));

                // Log nudge
                await supabaseClient.from('rating_nudges').insert({
                    player_id: player.id,
                    skate_id: skateId,
                    direction,
                    source: 'manual',
                    nudge_amount: 1
                });

                // Update composite rating
                await supabaseClient.from('players').update({ rating_v2: newRating }).eq('id', player.id);

                // Distribute nudge equally across all skills
                const { data: skills } = await supabaseClient
                    .from('player_skills').select('*').eq('player_id', player.id).maybeSingle();

                if (skills) {
                    // Skills are 0-10, composite is 0-100
                    // 1 composite point = 0.1 skill points spread across all skills
                    const skillNudge = Math.round(((nudgeAmount * 0.1) / NUDGE_SKILLS.length) * 1000) / 1000;
                    const updates = {};
                    for (const key of NUDGE_SKILLS) {
                        const current = skills[key] !== null && skills[key] !== undefined ? skills[key] : 5;
                        updates[key] = Math.min(10, Math.max(0, Math.round((current + skillNudge) * 1000) / 1000));
                    }
                    updates.updated_at = new Date().toISOString();
                    await supabaseClient.from('player_skills').update(updates).eq('player_id', player.id);
                }

                showToast(`${playerName} ${direction === 'up' ? '▲' : '▼'} → ${newRating}`);
                await loadTeamsForSkate(skateId);

            } catch (err) {
                console.error('Nudge failed:', err);
                showToast('Nudge failed');
            }
        }

        async function castVote(team) {
            const skateId = parseInt(document.getElementById('rosterModal').dataset.skateId);
            if (!skateId) return;

            // strength is 0-100, starts at 50 (even), each tap shifts by 10
            const current = currentSkateVote ? (currentSkateVote.dark_strength ?? 50) : 50;
            const newStrength = team === 'dark'
                ? Math.min(100, current + 10)
                : Math.max(0, current - 10);

            try {
                if (currentSkateVote) {
                    await supabaseClient.from('skate_votes')
                        .update({ dark_strength: newStrength, last_updated: new Date().toISOString() })
                        .eq('skate_id', skateId);
                } else {
                    await supabaseClient.from('skate_votes').insert({
                        skate_id: skateId,
                        dark_strength: newStrength
                    });
                }
                await loadTeamsForSkate(skateId);
            } catch (err) {
                console.error('Vote failed:', err);
            }
        }

        async function resetTugOfWar() {
            const skateId = parseInt(document.getElementById('rosterModal').dataset.skateId);
            if (!skateId) return;
            try {
                if (currentSkateVote) {
                    await supabaseClient.from('skate_votes')
                        .update({ dark_strength: 50, last_updated: new Date().toISOString() })
                        .eq('skate_id', skateId);
                } else {
                    await supabaseClient.from('skate_votes').insert({ skate_id: skateId, dark_strength: 50 });
                }
                await loadTeamsForSkate(skateId);
            } catch (err) {
                console.error('Reset failed:', err);
            }
        }

        function updateTugBar(vote) {
            const bar = document.getElementById('tugBar');
            const label = document.getElementById('tugLabel');
            const count = document.getElementById('tugVoteCount');
            if (!bar || !label) return;

            const pct = vote && vote.dark_strength !== null && vote.dark_strength !== undefined
                ? vote.dark_strength
                : 50;
            const isEven = pct === 50;

            bar.style.width = pct + '%';
            label.textContent = isEven ? '—' : `${pct}% / ${100 - pct}%`;
            count.textContent = isEven ? 'Even' : (pct > 50 ? '⬛ Dark stronger' : '⬜ Light stronger');
        }

        // ========== ICE COST CALCULATOR ==========
        const COE_RINKS = [
            'bill hunter','callingwood','castle downs','clareview','confederation',
            'crestwood','donnan','downtown community','george s hughes','glengarry',
            'grand trunk','kenilworth','kinsmen','londonderry','michael cameron',
            'mill woods','millwoods','meadows','russ barnes','terwillegar',
            'tipton','westwood','wîhkwêntôwin','oliver','castledowns','castledown'
        ];

        function getRinkGroup(location) {
            if (!location) return null;
            const loc = location.toLowerCase();
            if (loc.includes('nait')) return 'NAIT';
            if (loc.includes('rivercree')) return 'Rivercree';
            if (loc.includes('silent ice shooting')) return 'Silent Ice Shooting';
            if (loc.includes('silent ice')) return 'Silent Ice';
            if (loc.includes('zerone') || loc.includes('zer one')) return 'ZerOne';
            if (loc.includes('heavy metal')) return 'Heavy Metal';
            if (COE_RINKS.some(r => loc.includes(r))) return 'CoE';
            return null;
        }

        function getSeason(date) {
            if (!date) return null;
            const d = new Date(date + 'T12:00:00');
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const afterMar30 = month > 3 || (month === 3 && day >= 30);
            const beforeAug31 = month < 8 || (month === 8 && day <= 30);
            return (afterMar30 && beforeAug31) ? 'summer' : 'winter';
        }

        function getDayType(date) {
            if (!date) return null;
            const d = new Date(date + 'T12:00:00');
            return (d.getDay() === 0 || d.getDay() === 6) ? 'weekend' : 'weekday';
        }

        function handleFreeSkate() {
            const isFree = document.getElementById('skateFree').checked;
            const costEl = document.getElementById('skateCost');
            if (isFree) { costEl.value = '$0'; costEl.disabled = true; }
            else { costEl.value = '$25'; costEl.disabled = false; }
            updateTotalCost();
        }

        function autoSetRefCost() {
            const duration = parseInt(document.getElementById('skateDuration')?.value);
            const refSelect = document.getElementById('skateRefCost');
            if (!refSelect || !duration) return;
            if (refSelect.value !== '0' && refSelect.value !== '') return;
            if (duration <= 60) refSelect.value = '40';
            else if (duration <= 75) refSelect.value = '45';
            else if (duration <= 90) refSelect.value = '50';
            else if (duration >= 120) refSelect.value = '70';
            updateTotalCost();
        }

        function calcIceCost() {
            const location = document.getElementById('skateLocation')?.value;
            const date = document.getElementById('skateDate')?.value || null;
            const timeStart = document.getElementById('skateStartTime')?.value;
            const duration = parseInt(document.getElementById('skateDuration')?.value);
            autoSetRefCost();

            const rinkGroup = getRinkGroup(location);
            const labelEl = document.getElementById('iceCostLabel');
            updateTotalCost();

            if (!rinkGroup || !date || !timeStart || !duration) {
                if (labelEl) labelEl.textContent = rinkGroup ? '— fill in date, time & duration' : '— no rate data for this rink';
                return;
            }

            const season = getSeason(date);
            const dayType = getDayType(date);
            const [h, m] = timeStart.split(':').map(Number);
            const startMins = h * 60 + m;
            const hours = duration / 60;

            let rate = null;
            let slotLabel = '';

            if (rinkGroup === 'NAIT') {
                rate = 230; slotLabel = 'NAIT standard';
            } else if (rinkGroup === 'Rivercree') {
                rate = 144; slotLabel = 'Rivercree AM';
            } else if (rinkGroup === 'Silent Ice Shooting') {
                rate = 40; slotLabel = 'Silent Ice Shooting Lanes';
            } else if (rinkGroup === 'Silent Ice') {
                rate = 375.75; slotLabel = 'Silent Ice';
            } else if (rinkGroup === 'ZerOne') {
                rate = 150; slotLabel = 'ZerOne W.E.M.';
            } else if (rinkGroup === 'Heavy Metal') {
                rate = 262; slotLabel = 'Heavy Metal Place';
            } else if (rinkGroup === 'CoE') {
                if (season === 'summer') {
                    const isHigh = (dayType === 'weekday' && startMins >= 18 * 60) || dayType === 'weekend';
                    rate = isHigh ? 265 : 201;
                    slotLabel = `CoE Summer ${isHigh ? 'High' : 'Low'} Priority`;
                } else {
                    const isPrime = (dayType === 'weekday' && startMins >= 16*60 && startMins < 23*60) ||
                                    (dayType === 'weekend' && startMins >= 8*60 && startMins < 23*60);
                    rate = isPrime ? 342 : 203;
                    slotLabel = `CoE Winter ${isPrime ? 'Prime' : 'Non-Prime'}`;
                }
            }

            if (rate !== null) {
                const iceCost = Math.round(rate * hours * 100) / 100;
                document.getElementById('skateIceCost').value = iceCost;
                if (labelEl) labelEl.textContent = `${slotLabel} · $${rate}/hr × ${hours}hr = $${iceCost}`;
                updateTotalCost();
            }
        }

        function updateTotalCost(skaterCount) {
            const ice = parseFloat(document.getElementById('skateIceCost')?.value) || 0;
            const ref = parseFloat(document.getElementById('skateRefCost')?.value) || 0;
            const other = parseFloat(document.getElementById('skateOtherCost')?.value) || 0;
            const total = ice + ref + other;
            const totalEl = document.getElementById('skateTotalCost');
            if (totalEl) totalEl.value = total > 0 ? `$${total.toFixed(2)}` : '—';

            const isFree = document.getElementById('skateFree')?.checked;
            const costStr = document.getElementById('skateCost')?.value || '';
            const costPerPlayer = parseFloat(costStr.replace('$', '')) || 0;
            const skaters = skaterCount !== undefined ? skaterCount :
                (currentSkateId ? (goalieSkaterCounts[currentSkateId]?.skaters || 0) : 0);
            const revenue = isFree ? 0 : costPerPlayer * skaters;
            const profit = revenue - total;

            const revEl = document.getElementById('skateRevenue');
            const profEl = document.getElementById('skateProfit');
            if (revEl) revEl.value = revenue > 0 ? `$${revenue.toFixed(2)}` : '—';
            if (profEl) {
                profEl.value = (total > 0 || revenue > 0) ? `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}` : '—';
                profEl.style.color = profit >= 0 ? '#10b981' : '#ef4444';
            }
        }

        // ========== AT A GLANCE FUNCTIONS ==========
        // ========== AT A GLANCE FUNCTIONS ==========
        async function showAtAGlance() {
            document.getElementById('atAGlanceModal').classList.add('active');
            document.getElementById('atAGlanceContent').innerHTML = '<div class="loading">Loading rosters...</div>';
            
            // Prevent body scroll
            document.body.style.overflow = 'hidden';

            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const futureSkates = allSkates.filter(s => new Date(s.date + 'T00:00:00') >= today)
                    .sort((a, b) => new Date(a.date) - new Date(b.date));

                if (futureSkates.length === 0) {
                    document.getElementById('atAGlanceContent').innerHTML = '<div class="empty-state"><h3>No upcoming skates</h3></div>';
                    return;
                }

                // Fetch all registrations for upcoming skates in ONE BULK QUERY (fast!)
                const skateIds = futureSkates.map(s => s.id);
                const { data: regs, error } = await supabaseClient
                    .from('skate_registrations')
                    .select('skate_id, player_name, is_goalie, is_waitlist, position')
                    .in('skate_id', skateIds)
                    .order('position');

                if (error) throw error;

                // Group by skate
                const regsBySkate = {};
                skateIds.forEach(id => regsBySkate[id] = { roster: [], waitlist: [] });
                (regs || []).forEach(r => {
                    if (!regsBySkate[r.skate_id]) return;
                    if (r.is_waitlist) regsBySkate[r.skate_id].waitlist.push(r);
                    else regsBySkate[r.skate_id].roster.push(r);
                });

                // Render columns
                const cols = futureSkates.map(skate => {
                    const { roster, waitlist } = regsBySkate[skate.id];
                    const goalies = roster.filter(p => p.is_goalie);
                    const skaters = roster.filter(p => !p.is_goalie);
                    const maxSkaters = skate.capacity;
                    const isFull = skaters.length >= skate.capacity; // Only count skaters
                    const spotsLeft = skate.capacity - skaters.length; // Only count skaters

                    const statusColor = isFull ? '#ef4444' : 'var(--primary)';
                    const statusText = isFull ? '🔴 Full' : `🟢 ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`;

                    const renderPlayer = (p, i) => {
                        const bg = p.is_goalie ? 'background:#fef08a;color:#713f12;' : 'background:var(--bg-start);color:var(--text);';
                        return `<div style="${bg} padding:6px 10px; border-radius:6px; margin-bottom:4px; font-size:13px; display:flex; justify-content:space-between;">
                            <span>${i + 1}. ${escapeHTML(p.player_name)}${p.is_goalie ? ' 🥅' : ''}</span>
                        </div>`;
                    };

                    const waitlistHtml = waitlist.length > 0 ? `
                        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--card-border);">
                            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Waitlist (${waitlist.length})</div>
                            ${waitlist.map((p, i) => `<div style="padding:5px 10px; border-radius:6px; margin-bottom:4px; font-size:12px; color:var(--text-muted); background:var(--card-border);">${i+1}. ${escapeHTML(p.player_name)}</div>`).join('')}
                        </div>` : '';

                    return `
                        <div style="background:var(--card-bg); border:1px solid var(--card-border); border-radius:12px; padding:16px; min-width:220px; flex:0 0 220px;">
                            <div style="font-weight:700; font-size:15px; color:var(--text); margin-bottom:4px;">${escapeHTML(skate.title)}</div>
                            <div style="font-size:12px; color:var(--text-muted); margin-bottom:2px;">📅 ${formatDate(skate.date)}</div>
                            <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">🕐 ${formatTime(skate.time_start)}–${formatTime(skate.time_end)}</div>
                            <div style="font-size:12px; font-weight:600; color:${statusColor}; margin-bottom:10px;">${statusText} · ${skaters.length}/${skate.capacity}</div>

                            ${goalies.length > 0 ? `
                            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Goalies (${goalies.length}/2)</div>
                            ${goalies.map((p, i) => renderPlayer(p, i)).join('')}
                            <div style="margin-top:8px;"></div>` : `
                            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Goalies (0/2)</div>
                            <div style="font-size:12px; color:var(--text-muted); padding:6px 10px; margin-bottom:8px;">No goalies yet</div>`}

                            <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Skaters (${skaters.length}/${maxSkaters})</div>
                            ${skaters.length > 0 ? skaters.map((p, i) => renderPlayer(p, i)).join('') : '<div style="font-size:12px; color:var(--text-muted); padding:6px 10px;">No skaters yet</div>'}

                            ${waitlistHtml}
                        </div>
                    `;
                }).join('');

                document.getElementById('atAGlanceContent').innerHTML = `
                    <div id="glanceScroller" style="display:flex; gap:16px; overflow:auto; padding-bottom:12px; align-items:flex-start; cursor:grab; user-select:none; flex:1; height:100%;">
                        ${cols}
                    </div>`;

                // Click and drag to scroll horizontally
                const scroller = document.getElementById('glanceScroller');
                let isDown = false, startX, scrollLeft;
                scroller.addEventListener('mousedown', (e) => {
                    isDown = true;
                    scroller.style.cursor = 'grabbing';
                    startX = e.pageX - scroller.offsetLeft;
                    scrollLeft = scroller.scrollLeft;
                });
                document.addEventListener('mouseup', () => {
                    isDown = false;
                    if (scroller) scroller.style.cursor = 'grab';
                });
                scroller.addEventListener('mousemove', (e) => {
                    if (!isDown) return;
                    e.preventDefault();
                    const x = e.pageX - scroller.offsetLeft;
                    scroller.scrollLeft = scrollLeft - (x - startX);
                });

            } catch (err) {
                console.error(err);
                document.getElementById('atAGlanceContent').innerHTML = '<div class="empty-state"><h3>Failed to load</h3></div>';
            }
        }

        function closeAtAGlance() {
            document.getElementById('atAGlanceModal').classList.remove('active');
            // Restore body scroll
            document.body.style.overflow = '';
        }

