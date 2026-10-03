        async function loadTeamsForSkate(skateId) {
            const section = document.getElementById('teamsSection');
            try {
                const { data: teams } = await supabaseClient
                    .from('skate_teams')
                    .select('skate_id')
                    .eq('skate_id', skateId)
                    .maybeSingle();

                if (!teams) { section.style.display = 'none'; return; }

                section.style.display = 'block';
            } catch (err) {
                console.error('Error loading teams:', err);
                section.style.display = 'none';
            }
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
