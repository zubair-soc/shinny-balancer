        // Supabase configuration
        let supabaseClient;
        let allPlayers = [];
        let filteredPlayers = [];
        let sortColumn = 'name';
        let sortDirection = 'asc';

        // Initialize
        window.addEventListener('DOMContentLoaded', () => {
            if (window.SKATE_MANAGER_CLIENT) {
                supabaseClient = window.SKATE_MANAGER_CLIENT;
                loadPlayers();
            } else {
                alert('Database connection failed. Please refresh.');
            }

            // Search functionality
            document.getElementById('searchBox').addEventListener('input', (e) => {
                filterPlayers(e.target.value);
            });
        });

        async function loadPlayers() {
            try {
                const { data, error } = await supabaseClient
                    .from('players')
                    .select('id, name, rating, rating_v2, rating_v2b, rating_v2_anchored, is_pillar, lower_pillar_id, upper_pillar_id')
                    .order('name');

                if (error) throw error;

                allPlayers = data;
                filteredPlayers = [...allPlayers];
                renderTable();
                updateStats();
                checkDeepLink();
            } catch (error) {
                console.error('Error loading players:', error);
                document.getElementById('playerTableBody').innerHTML = 
                    `<tr><td colspan="3" class="empty-state"><h3>Failed to load players</h3><p>${error.message || 'Please refresh the page'}</p></td></tr>`;
            }
        }

        function filterPlayers(searchTerm) {
            const term = searchTerm.toLowerCase().trim();
            filteredPlayers = allPlayers.filter(p => {
                const matchesSearch = !term || p.name.toLowerCase().includes(term);
                const matchesPillar = !pillarFilterActive || p.is_pillar;
                return matchesSearch && matchesPillar;
            });
            // Re-apply current sort
            filteredPlayers.sort((a, b) => {
                let aVal = a[sortColumn] ?? (sortDirection === 'asc' ? Infinity : -Infinity);
                let bVal = b[sortColumn] ?? (sortDirection === 'asc' ? Infinity : -Infinity);
                if (sortColumn === 'name') { aVal = String(aVal).toLowerCase(); bVal = String(bVal).toLowerCase(); }
                if (sortDirection === 'asc') return aVal > bVal ? 1 : -1;
                else return aVal < bVal ? 1 : -1;
            });
            renderTable();
            updateStats();
        }

        function sortTable(column) {
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }

            filteredPlayers.sort((a, b) => {
                let aVal = a[column];
                let bVal = b[column];

                if (column === 'name') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }

                if (sortDirection === 'asc') {
                    return aVal > bVal ? 1 : -1;
                } else {
                    return aVal < bVal ? 1 : -1;
                }
            });

            renderTable();
        }

        function renderTable() {
            const tbody = document.getElementById('playerTableBody');
            if (!tbody) return;

            if (filteredPlayers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><h3>No players found</h3><p>Try a different search or add a new player</p></td></tr>';
                return;
            }

            tbody.innerHTML = filteredPlayers.map(player => {
                const safeName = inlineJSString(player.name);
                return `
                <tr>
                    <td>${escapeHTML(player.name)} ${player.is_pillar ? '' : ''}</td>
                    <td class="rating-cell" style="color:var(--primary)">${player.rating ?? '—'}</td>
                    <td class="rating-cell" style="color:#10b981">${player.rating_v2b !== null && player.rating_v2b !== undefined ? player.rating_v2b : '—'}</td>
                    <td class="actions">
                        <div style="display:flex; gap:4px; flex-wrap:wrap;">
                            <button class="icon-button" onclick="editName(${player.id}, ${safeName})" title="Edit name">🖊️</button>
                            <button class="icon-button" onclick="editRating(${player.id}, ${safeName}, ${player.rating})" title="Edit rating">✏️</button>
                            <button class="icon-button" onclick="openPlayerProfile(${player.id})" title="Rate Player" style="color:#10b981;">📊</button>
                            <button class="icon-button delete" onclick="confirmDelete(${player.id}, ${safeName})" title="Delete">🗑️</button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        }

                function sortTable(column) {
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }

            filteredPlayers.sort((a, b) => {
                let aVal = a[column];
                let bVal = b[column];

                if (column === 'name') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }

                if (sortDirection === 'asc') {
                    return aVal > bVal ? 1 : -1;
                } else {
                    return aVal < bVal ? 1 : -1;
                }
            });

            renderTable();
        }

        function updateStats() {
            document.getElementById('playerCount').textContent = `${allPlayers.length} players`;
            const filtered = document.getElementById('filteredCount');
            if (filteredPlayers.length !== allPlayers.length) {
                filtered.textContent = `(${filteredPlayers.length} shown)`;
            } else {
                filtered.textContent = '';
            }
        }

        // Add Player
        function showAddModal() {
            document.getElementById('addModal').classList.add('active');
            document.getElementById('newPlayerName').value = '';
            document.getElementById('newPlayerRating').value = '';
            document.getElementById('newPlayerName').focus();
        }

        function closeAddModal() {
            document.getElementById('addModal').classList.remove('active');
        }

        async function addPlayer() {
            const name = document.getElementById('newPlayerName').value.trim();
            const rating = parseFloat(document.getElementById('newPlayerRating').value);

            if (!name) {
                alert('Please enter a player name');
                return;
            }

            if (isNaN(rating) || rating < 0 || rating > 20) {
                alert('Please enter a valid rating between 0 and 20');
                return;
            }

            try {
                const { data, error } = await supabaseClient
                    .from('players')
                    .insert([{ name, rating }])
                    .select();

                if (error) throw error;

                allPlayers.push(data[0]);
                allPlayers.sort((a, b) => a.name.localeCompare(b.name));
                filterPlayers(document.getElementById('searchBox').value);
                closeAddModal();
                alert(`✓ Added ${name}`);
            } catch (error) {
                console.error('Error adding player:', error);
                if (error.code === '23505') {
                    alert('A player with this name already exists');
                } else {
                    alert('Failed to add player. Please try again.');
                }
            }
        }

        // Edit Rating
        async function editRating(id, name, currentRating) {
            const newRating = prompt(`Enter new rating for ${name}:`, currentRating);
            
            if (newRating === null) return;
            
            const rating = parseFloat(newRating);
            if (isNaN(rating) || rating < 0 || rating > 20) {
                alert('Please enter a valid rating between 0 and 20');
                return;
            }

            try {
                const { error } = await supabaseClient
                    .from('players')
                    .update({ rating, updated_at: new Date().toISOString() })
                    .eq('id', id);

                if (error) throw error;

                const player = allPlayers.find(p => p.id === id);
                if (player) player.rating = rating;
                
                filterPlayers(document.getElementById('searchBox').value);
            } catch (error) {
                console.error('Error updating rating:', error);
                alert('Failed to update rating. Please try again.');
            }
        }

        // Edit Name
        async function editName(id, currentName) {
            const newName = prompt(`Edit name:`, currentName);
            if (newName === null) return;
            const trimmed = newName.trim();
            if (!trimmed) { alert('Name cannot be empty'); return; }
            if (trimmed === currentName) return;

            try {
                const { error } = await supabaseClient
                    .from('players')
                    .update({ name: trimmed })
                    .eq('id', id);

                if (error) throw error;

                const player = allPlayers.find(p => p.id === id);
                if (player) player.name = trimmed;
                allPlayers.sort((a, b) => a.name.localeCompare(b.name));
                filterPlayers(document.getElementById('searchBox').value);
            } catch (error) {
                console.error('Error updating name:', error);
                alert('Failed to update name. Please try again.');
            }
        }

        // Delete Player
        function confirmDelete(id, name) {
            if (!confirm(`Delete ${name}?\n\nThis cannot be undone.`)) {
                return;
            }
            deletePlayer(id, name);
        }

        async function deletePlayer(id, name) {
            try {
                // Check for active credits first
                const { data: credits } = await supabaseClient
                    .from('player_credits')
                    .select('id, amount, status')
                    .eq('player_id', id)
                    .eq('status', 'active');

                if (credits && credits.length > 0) {
                    const total = credits.reduce((sum, c) => sum + parseFloat(c.amount), 0);
                    const decision = confirm(`⚠️ ${name} has ${credits.length} active credit(s) totalling $${total.toFixed(2)}.\n\nDelete player AND their credits?\n\nClick OK to delete everything, Cancel to abort.`);
                    if (!decision) return;

                    // Delete credits first
                    await supabaseClient.from('player_credits').delete().eq('player_id', id);
                }

                const { error } = await supabaseClient
                    .from('players')
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                allPlayers = allPlayers.filter(p => p.id !== id);
                filterPlayers(document.getElementById('searchBox').value);
                alert('✓ Player deleted');
            } catch (error) {
                console.error('Error deleting player:', error);
                alert('Failed to delete player. Please try again.');
            }
        }

        // Export CSV
        function exportCSV() {
            const csv = ['Name,Rating'];
            allPlayers.forEach(p => {
                csv.push(`"${p.name}",${p.rating}`);
            });

            const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `shinny-players-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }

        // ========== DEEP LINK FROM ROSTER ==========
        function checkDeepLink() {
            const params = new URLSearchParams(window.location.search);
            const playerName = params.get('player');
            if (!playerName) return;

            // Search for the player
            document.getElementById('searchBox').value = playerName;
            filterPlayers(playerName);

            // Find and open their profile
            const player = allPlayers.find(p => p.name.toLowerCase() === playerName.toLowerCase());
            if (player) {
                setTimeout(() => openPlayerProfile(player.id), 300);
            }
        }

        // ========== DB ACTION MENU ==========
        let openDbMenuId = null;

        function toggleDbMenu(event, id) {
            if (openDbMenuId && openDbMenuId !== id) closeDbMenu(openDbMenuId);
            const menu = document.getElementById(`dbmenu-${id}`);
            if (!menu) return;
            const isOpen = menu.style.display === 'block';
            if (isOpen) { closeDbMenu(id); return; }

            const btn = event.currentTarget;
            const rect = btn.getBoundingClientRect();
            const menuWidth = 160;
            const menuHeight = 160; // approximate

            // Horizontal: align to right of button, clamp to viewport
            const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));

            // Vertical: open upward if not enough space below
            const spaceBelow = window.innerHeight - rect.bottom;
            const top = spaceBelow < menuHeight + 8
                ? Math.max(8, rect.top - menuHeight - 4)
                : rect.bottom + 4;

            menu.style.display = 'block';
            menu.style.top = top + 'px';
            menu.style.left = left + 'px';
            openDbMenuId = id;
        }

        function closeDbMenu(id) {
            const menu = document.getElementById(`dbmenu-${id}`);
            if (menu) menu.style.display = 'none';
            openDbMenuId = null;
        }

        document.addEventListener('click', (e) => {
            if (openDbMenuId && !e.target.closest(`#dbmenu-${openDbMenuId}`) && !e.target.closest('.icon-button')) {
                closeDbMenu(openDbMenuId);
            }
        });

        // ========== PILLAR FILTER ==========
        let pillarFilterActive = false;

        function togglePillarFilter() {
            pillarFilterActive = !pillarFilterActive;
            const btn = document.getElementById('pillarFilterBtn');
            btn.style.background = pillarFilterActive ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.15)';
            btn.textContent = pillarFilterActive ? '⭐ Pillars ×' : '⭐ Pillars';
            filterPlayers(document.getElementById('searchBox').value);
        }

        // ========== V2 RATING / PILLAR PROFILE ==========
        const SIMPLE_RUBRIC = {
            skating: { label: 'Skating', weight: 35, color: '#3b82f6',
                desc: ['Struggles to move/play safely', 'Can skate but movement limits gameplay', 'Functional movement for shinny pace', 'Strong mobility and recovery', 'Skating consistently impacts play'],
                examples: {
                    1: ['Falls often', 'Cannot stop consistently', 'Avoids puck pressure'],
                    3: ['Moves well enough to participate', 'Can stop and turn functionally', 'Keeps up with normal play'],
                    5: ['Creates separation', 'Recovers quickly', 'Uses skating as a major advantage']
                }
            },
            puck_skills: { label: 'Puck Skills', weight: 25, color: '#10b981',
                desc: ['Frequently loses puck', 'Limited puck control under pressure', 'Functional puck play', 'Strong execution during gameplay', 'Creates offense consistently'],
                examples: {
                    1: ['Puck bounces away constantly', 'Rarely completes passes', 'Cannot handle pressure'],
                    3: ['Makes simple plays', 'Functional passing/shooting', 'Can maintain possession briefly'],
                    5: ['Controls possession confidently', 'Creates plays regularly', 'Dangerous offensively']
                }
            },
            hockey_iq: { label: 'Hockey IQ', weight: 20, color: '#8b5cf6',
                desc: ['Frequently lost or out of position', 'Limited awareness of game flow', 'Understands basic positioning', 'Strong support and positioning', 'Anticipates and controls play'],
                examples: {
                    1: ['Constant puck chasing', 'No defensive awareness', 'Frequently confused'],
                    3: ['Generally understands where to go', 'Makes decent simple plays', 'Supports teammates reasonably'],
                    5: ['Reads plays early', 'Rarely out of position', 'Makes teammates better']
                }
            },
            competitiveness: { label: 'Competitiveness', weight: 10, color: '#f59e0b',
                desc: ['Frequently disengaged', 'Inconsistent effort', 'Competes reasonably consistently', 'Strong consistent engagement', 'Drives play through effort level'],
                examples: {
                    1: ['Glides constantly', 'Stops moving defensively', 'Avoids pressure'],
                    3: ['Reasonable effort level', 'Backchecks most plays', 'Competes enough to contribute'],
                    5: ['High motor every shift', 'Creates pressure consistently', 'Impacts game through effort']
                }
            },
            game_readiness: { label: 'Game Readiness', weight: 10, color: '#ef4444',
                desc: ['Frequently overwhelmed', 'Struggles processing game pace', 'Can participate independently', 'Comfortable and confident', 'Thrives in fast-paced gameplay'],
                examples: {
                    1: ['Panics immediately with puck', 'Avoids involvement', 'Looks overwhelmed'],
                    3: ['Participates independently', 'Handles normal shinny pace', 'Can recover from mistakes'],
                    5: ['Calm under pressure', 'Processes quickly', 'Drives game flow confidently']
                }
            }
        };

        function calcCompositeSimple(skills) {
            if (!skills) return null;
            let total = 0, weightSum = 0;
            for (const [key, def] of Object.entries(SIMPLE_RUBRIC)) {
                const val = skills[key];
                if (val === null || val === undefined) continue;
                total += val * (def.weight / 100);
                weightSum += def.weight / 100;
            }
            return weightSum > 0 ? Math.round((total / weightSum) * 10) / 10 : null;
        }

        const SKILLS_SCHEMA = {
            skating: {
                label: 'Skating', weight: 35, color: '#3b82f6',
                skills: ['balance','strides','direction_change','pivots','zone_entry','off_wall','corners','punch_turns','mohawks','backwards_basic','backwards_crossovers'],
                labels: ['Balance','Strides','Direction Change','Pivots','Zone Entry','Off the Wall','Corners','Punch Turns','Mohawks','Backwards Basic','Backwards Crossovers']
            },
            puck: {
                label: 'Puck Skills', weight: 25, color: '#10b981',
                skills: ['shooting','passing','stickhandling','receiving','protection'],
                labels: ['Shooting','Passing','Stickhandling','Receiving','Puck Protection']
            },
            iq: {
                label: 'Hockey IQ', weight: 20, color: '#8b5cf6',
                skills: ['positioning','reads_anticipation','defensive_awareness','offensive_awareness','transition'],
                labels: ['Positioning','Reads & Anticipation','Defensive Awareness','Offensive Awareness','Transition Play']
            },
            compete: {
                label: 'Competitiveness', weight: 10, color: '#f59e0b',
                skills: ['level','battle_wins','effort','resilience'],
                labels: ['Compete Level','Battle Wins','Effort','Resilience']
            },
            readiness: {
                label: 'Game Readiness', weight: 10, color: '#ef4444',
                skills: ['conditioning','consistency'],
                labels: ['Conditioning','Consistency']
            }
        };

        function calcComposite(skills) {
            if (!skills) return null;
            let total = 0, weightSum = 0;
            for (const [cat, def] of Object.entries(SKILLS_SCHEMA)) {
                const vals = def.skills.map(s => skills[`${cat}_${s}`]).filter(v => v !== null && v !== undefined);
                if (vals.length === 0) continue;
                // Skills are 0-10, scale to 0-100 for composite
                const catAvg = (vals.reduce((a, b) => a + b, 0) / vals.length) * 10;
                total += catAvg * (def.weight / 100);
                weightSum += def.weight / 100;
            }
            return weightSum > 0 ? Math.round((total / weightSum) * 10) / 10 : null;
        }

        async function openPlayerProfile(id) {
            const player = allPlayers.find(p => p.id === id);
            if (!player) return;

            const pillars = allPlayers.filter(p => p.is_pillar && p.id !== id).sort((a, b) => (a.rating_v2 || 0) - (b.rating_v2 || 0));

            document.getElementById('profileName').textContent = player.name;
            document.getElementById('profileV1Rating').textContent = player.rating ?? '—';
            document.getElementById('profileV2Rating').value = player.rating_v2 !== null && player.rating_v2 !== undefined ? player.rating_v2 : '';
            document.getElementById('profileIsPillar').checked = player.is_pillar || false;
            document.getElementById('profileAnchored').textContent = '';
            document.getElementById('profileV2bDisplay').textContent = player.rating_v2b !== null && player.rating_v2b !== undefined ? player.rating_v2b : '—';

            const pillarOptions = '<option value="">— None —</option>' + pillars.map(p =>
                `<option value="${p.id}">${escapeHTML(p.name)} (${p.rating_v2 !== null && p.rating_v2 !== undefined ? p.rating_v2 : '?'})</option>`
            ).join('');
            document.getElementById('profileLowerPillar').innerHTML = pillarOptions;
            document.getElementById('profileUpperPillar').innerHTML = pillarOptions;

            const lowerPillar = allPlayers.find(p => p.id === player.lower_pillar_id);
            const upperPillar = allPlayers.find(p => p.id === player.upper_pillar_id);
            if (lowerPillar) document.getElementById('profileLowerPillar').value = lowerPillar.id;
            if (upperPillar) document.getElementById('profileUpperPillar').value = upperPillar.id;

            // Hook pillar selects to auto-calculate midpoint
            document.getElementById('profileLowerPillar').onchange = recalcFromPillars;
            document.getElementById('profileUpperPillar').onchange = recalcFromPillars;

            // Auto-calc on open if pillars already set and no manual v2 override
            if (lowerPillar && upperPillar) setTimeout(recalcFromPillars, 100);

            // Load detailed skills
            const { data: skills } = await supabaseClient
                .from('player_skills')
                .select('*')
                .eq('player_id', id)
                .maybeSingle();

            // If no skills but player has a v2 rating, prefill inputs proportionally
            if (!skills && player.rating_v2) {
                const prefillVal = Math.round((player.rating_v2 / 10) * 10) / 10;
                const prefilled = {};
                for (const [cat, def] of Object.entries(SKILLS_SCHEMA)) {
                    for (const s of def.skills) {
                        prefilled[`${cat}_${s}`] = Math.min(10, prefillVal);
                    }
                }
                renderSkillsForm(prefilled);
            } else {
                renderSkillsForm(skills);
            }

            // Load draft from player_skills_simple
            const { data: draft } = await supabaseClient
                .from('player_skills_simple')
                .select('*')
                .eq('player_id', id)
                .maybeSingle();
            renderSimpleRubricForm(draft);

            // Load v2b ratings history
            const { data: v2bHistory } = await supabaseClient
                .from('v2b_ratings')
                .select('*')
                .eq('player_id', id)
                .order('created_at', { ascending: false })
                .limit(10);
            renderV2bHistory(v2bHistory || []);

            document.getElementById('playerProfileModal').dataset.playerId = id;
            document.getElementById('playerProfileModal').classList.add('active');
        }

        function renderSkillsForm(skills) {
            const container = document.getElementById('skillsContainer');
            container.innerHTML = Object.entries(SKILLS_SCHEMA).map(([cat, def]) => `
                <div style="margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                        <span style="font-size: 13px; font-weight: 700; color: ${def.color}; text-transform: uppercase; letter-spacing: 0.5px;">${def.label}</span>
                        <span style="font-size: 11px; color: var(--text-muted);">${def.weight}%</span>
                        <div style="flex: 1; height: 1px; background: var(--card-border);"></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        ${def.skills.map((s, i) => {
                            const key = `${cat}_${s}`;
                            const val = skills ? (skills[key] !== null && skills[key] !== undefined ? skills[key] : '') : '';
                            return `<div style="display: flex; align-items: center; gap: 8px;">
                                <label style="flex: 1; font-size: 12px; color: var(--text-muted);">${def.labels[i]}</label>
                                <input type="number" id="skill_${key}" min="0" max="10" step="0.5" value="${val}" placeholder="—"
                                    style="width: 60px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 6px; padding: 4px 8px; color: var(--text); font-size: 13px; text-align: center;">
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `).join('');
        }

        function renderSimpleRubricForm(skills) {
            const container = document.getElementById('simpleRubricContainer');
            if (!container) return;
            container.innerHTML = Object.entries(SIMPLE_RUBRIC).map(([key, def]) => {
                const val = skills ? (skills[key] !== null && skills[key] !== undefined ? skills[key] : '') : '';
                const examplesHtml = Object.entries(def.examples).map(([level, items]) => `
                    <div style="margin-bottom:8px;">
                        <span style="color:${def.color}; font-weight:700; font-size:12px;">${level} — </span>
                        <span style="color:var(--text-muted); font-size:12px;">${def.desc[parseInt(level)-1]}</span>
                        <ul style="margin:4px 0 0 16px; padding:0;">
                            ${items.map(i => `<li style="font-size:11px; color:var(--text-muted); margin-bottom:2px;">${i}</li>`).join('')}
                        </ul>
                    </div>`).join('');

                return `
                <div style="margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span style="font-size: 13px; font-weight: 700; color: ${def.color}; text-transform: uppercase; letter-spacing: 0.5px;">${def.label}</span>
                        <span style="font-size: 11px; color: var(--text-muted);">${def.weight}%</span>
                        <button onclick="toggleRubricInfo('info_${key}')" style="background:rgba(100,100,255,0.15); border:1px solid rgba(100,100,255,0.3); color:#6366f1; border-radius:50%; width:20px; height:20px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0;">ℹ</button>
                        <div style="flex: 1; height: 1px; background: var(--card-border);"></div>
                    </div>
                    <div id="info_${key}" style="display:none; background:rgba(0,0,0,0.15); border-radius:8px; padding:12px; margin-bottom:10px;">
                        ${examplesHtml}
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <input type="number" id="simple_${key}" min="1" max="5" step="0.5" value="${val}" placeholder="—"
                            oninput="updateSimpleComposite()"
                            style="width: 70px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 6px; padding: 6px 10px; color: var(--text); font-size: 14px; text-align: center;">
                        <div style="flex: 1;">
                            ${def.desc.map((d, i) => `<div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;"><span style="color: ${def.color}; font-weight: 600;">${i+1}</span> — ${d}</div>`).join('')}
                        </div>
                    </div>
                </div>`;
            }).join('');
            updateSimpleComposite();
        }

        function toggleRubricInfo(id) {
            const el = document.getElementById(id);
            if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
        }

        async function saveDraftV2b() {
            const id = parseInt(document.getElementById('playerProfileModal').dataset.playerId);

            const skills = {};
            for (const key of Object.keys(SIMPLE_RUBRIC)) {
                const el = document.getElementById(`simple_${key}`);
                skills[key] = el && el.value !== '' ? Math.min(5, Math.max(1, parseFloat(el.value))) : null;
            }
            const composite = calcCompositeSimple(skills);

            try {
                // Save to player_skills_simple as draft
                await supabaseClient.from('player_skills_simple')
                    .upsert({ player_id: id, ...skills, updated_at: new Date().toISOString() }, { onConflict: 'player_id' });

                const btn = document.querySelector('#playerProfileModal button[onclick="saveDraftV2b()"]');
                if (btn) {
                    const orig = btn.textContent;
                    btn.textContent = '✓ Saved';
                    btn.style.background = '#22c55e';
                    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2000);
                }
            } catch (err) {
                console.error('Save draft failed:', err);
                alert('Failed to save: ' + (err.message || err));
            }
        }

        async function submitV2bRating() {
            const id = parseInt(document.getElementById('playerProfileModal').dataset.playerId);
            const rater = document.getElementById('v2bRater').value;
            if (!rater) { alert('Please select a rater'); return; }

            const skills = {};
            for (const key of Object.keys(SIMPLE_RUBRIC)) {
                const el = document.getElementById(`simple_${key}`);
                skills[key] = el && el.value !== '' ? Math.min(5, Math.max(1, parseFloat(el.value))) : null;
            }
            const composite = calcCompositeSimple(skills);
            if (!composite) { alert('Please fill in at least one category'); return; }

            const btn = document.getElementById('submitV2bBtn');
            btn.textContent = 'Saving...';
            btn.disabled = true;

            try {
                // Insert new rating entry
                await supabaseClient.from('v2b_ratings').insert({
                    player_id: id,
                    rater,
                    ...skills,
                    composite
                });

                // Recalculate average from 3 most recent
                const { data: recent } = await supabaseClient
                    .from('v2b_ratings')
                    .select('composite')
                    .eq('player_id', id)
                    .order('created_at', { ascending: false })
                    .limit(3);

                const avg = recent && recent.length > 0
                    ? Math.round((recent.reduce((s, r) => s + r.composite, 0) / recent.length) * 10) / 10
                    : composite;

                // Update player's rating_v2b
                await supabaseClient.from('players').update({ rating_v2b: avg }).eq('id', id);

                // Update local
                const player = allPlayers.find(p => p.id === id);
                if (player) player.rating_v2b = avg;

                // Reload history
                const { data: v2bHistory } = await supabaseClient
                    .from('v2b_ratings')
                    .select('*')
                    .eq('player_id', id)
                    .order('created_at', { ascending: false })
                    .limit(10);
                renderV2bHistory(v2bHistory || []);
                filterPlayers(document.getElementById('searchBox').value);

                btn.textContent = '✓ Submitted';
                btn.style.background = '#22c55e';
                setTimeout(() => {
                    btn.textContent = 'Submit Rating';
                    btn.style.background = '';
                    btn.disabled = false;
                }, 2000);

            } catch (err) {
                console.error('Submit failed:', err);
                alert('Failed to submit: ' + (err.message || err));
                btn.textContent = 'Submit Rating';
                btn.disabled = false;
            }
        }

        function renderV2bHistory(history) {
            const container = document.getElementById('v2bHistory');
            if (!container) return;
            if (!history.length) {
                container.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">No ratings yet.</p>';
                return;
            }

            // Show top 3 used for average, rest grayed out
            container.innerHTML = history.map((entry, i) => {
                const date = new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const isActive = i < 3;
                return `<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-radius:8px; margin-bottom:6px; background:${isActive ? 'rgba(16,185,129,0.08)' : 'rgba(128,128,128,0.05)'}; border:1px solid ${isActive ? 'rgba(16,185,129,0.2)' : 'rgba(128,128,128,0.1)'}; opacity:${isActive ? '1' : '0.5'};">
                    <div>
                        <span style="font-size:13px; font-weight:600; color:var(--text);">${escapeHTML(entry.rater)}</span>
                        <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">${date}</span>
                        ${i === 0 ? '<span style="font-size:10px; color:#10b981; margin-left:6px;">latest</span>' : ''}
                        ${i >= 3 ? '<span style="font-size:10px; color:var(--text-muted); margin-left:6px;">not counted</span>' : ''}
                    </div>
                    <span style="font-size:14px; font-weight:700; color:${isActive ? '#10b981' : 'var(--text-muted)'};">${entry.composite}</span>
                </div>`;
            }).join('');

            // Show average
            const active = history.slice(0, 3);
            const avg = Math.round((active.reduce((s, r) => s + r.composite, 0) / active.length) * 10) / 10;
            container.innerHTML += `<div style="margin-top:10px; padding:8px 12px; border-radius:8px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; font-weight:700; color:#10b981;">Average (${active.length} rating${active.length !== 1 ? 's' : ''})</span>
                <span style="font-size:16px; font-weight:800; color:#10b981;">${avg}</span>
            </div>`;
        }

        function updateSimpleComposite() {
            const skills = {};
            for (const key of Object.keys(SIMPLE_RUBRIC)) {
                const el = document.getElementById(`simple_${key}`);
                skills[key] = el && el.value !== '' ? parseFloat(el.value) : null;
            }
            const composite = calcCompositeSimple(skills);
            const el = document.getElementById('profileV2bComposite');
            if (el && composite !== null) {
                const outOf100 = Math.round((composite / 5) * 100);
                el.textContent = `→ V2B: ${composite} (${outOf100})`;
            } else if (el) {
                el.textContent = '';
            }
        }

        function recalcFromPillars() {
            const lowerId = document.getElementById('profileLowerPillar').value;
            const upperId = document.getElementById('profileUpperPillar').value;
            if (!lowerId || !upperId) return;

            const lower = allPlayers.find(p => p.id == lowerId);
            const upper = allPlayers.find(p => p.id == upperId);
            if (!lower || !upper) return;

            const lowerV2 = lower.rating_v2 || 0;
            const upperV2 = upper.rating_v2 || 0;
            const midpoint = Math.round(((lowerV2 + upperV2) / 2) * 10) / 10;

            // Set v2 override field
            document.getElementById('profileV2Rating').value = midpoint;

            // Pre-fill all skills proportionally (midpoint/10 on 0-10 scale)
            const skillVal = Math.round((midpoint / 10) * 10) / 10;
            for (const [cat, def] of Object.entries(SKILLS_SCHEMA)) {
                for (const s of def.skills) {
                    const el = document.getElementById(`skill_${cat}_${s}`);
                    if (el && (!el.value || el.value === '')) {
                        el.value = Math.min(10, skillVal);
                    }
                }
            }
        }

        async function savePlayerProfile() {
            const id = parseInt(document.getElementById('playerProfileModal').dataset.playerId);
            const player = allPlayers.find(p => p.id === id);
            if (!player) return;

            // Collect all skill values (clamped 0-10)
            const skillsData = { player_id: id, updated_at: new Date().toISOString() };
            for (const [cat, def] of Object.entries(SKILLS_SCHEMA)) {
                for (const s of def.skills) {
                    const key = `${cat}_${s}`;
                    const el = document.getElementById(`skill_${key}`);
                    skillsData[key] = el && el.value !== '' ? Math.min(10, Math.max(0, parseFloat(el.value))) : null;
                }
            }

            // Calculate composite from skills if skills exist, else use manual v2
            const composite = calcComposite(skillsData);
            const manualV2Raw = document.getElementById('profileV2Rating').value;
            const manualV2 = manualV2Raw !== '' ? parseFloat(manualV2Raw) : null;
            const rating_v2 = composite !== null ? composite : manualV2;

            // If manual v2 set but no skills filled in yet, auto-distribute across all skills
            // skill value = (v2 / 100) * 10 = v2 / 10
            const hasSkills = composite !== null;
            if (!hasSkills && manualV2 !== null) {
                const skillVal = Math.round((manualV2 / 10) * 10) / 10;
                for (const [cat, def] of Object.entries(SKILLS_SCHEMA)) {
                    for (const s of def.skills) {
                        const key = `${cat}_${s}`;
                        if (skillsData[key] === null) {
                            skillsData[key] = Math.min(10, skillVal);
                        }
                    }
                }
            }

            const is_pillar = document.getElementById('profileIsPillar').checked;
            const lower_pillar_id = document.getElementById('profileLowerPillar').value || null;
            const upper_pillar_id = document.getElementById('profileUpperPillar').value || null;
            const rating_v2_anchored = rating_v2 !== null;

            try {
                // Save player fields
                const { error } = await supabaseClient
                    .from('players')
                    .update({ rating_v2, is_pillar, lower_pillar_id, upper_pillar_id, rating_v2_anchored })
                    .eq('id', id);
                if (error) throw error;

                // Upsert detailed skills
                const { error: skillsError } = await supabaseClient
                    .from('player_skills')
                    .upsert(skillsData, { onConflict: 'player_id' });
                if (skillsError) throw skillsError;

                // Collect and upsert simple rubric skills
                const simpleData = { player_id: id, updated_at: new Date().toISOString() };
                for (const key of Object.keys(SIMPLE_RUBRIC)) {
                    const el = document.getElementById(`simple_${key}`);
                    simpleData[key] = el && el.value !== '' ? Math.min(5, Math.max(1, parseFloat(el.value))) : null;
                }
                const rating_v2b = calcCompositeSimple(simpleData);
                const { error: simpleError } = await supabaseClient
                    .from('player_skills_simple')
                    .upsert(simpleData, { onConflict: 'player_id' });
                if (simpleError) throw simpleError;

                // Update v2b on players table
                await supabaseClient.from('players').update({ rating_v2b }).eq('id', id);

                player.rating_v2 = rating_v2;
                player.rating_v2b = rating_v2b;
                player.is_pillar = is_pillar;
                player.lower_pillar_id = lower_pillar_id;
                player.upper_pillar_id = upper_pillar_id;
                player.rating_v2_anchored = rating_v2_anchored;

                filterPlayers(document.getElementById('searchBox').value);
                // Show saved confirmation without closing
                const saveBtn = document.querySelector('#playerProfileModal button[onclick="savePlayerProfile()"]');
                if (saveBtn) {
                    const orig = saveBtn.textContent;
                    saveBtn.textContent = '✓ Saved';
                    saveBtn.style.background = '#22c55e';
                    setTimeout(() => { saveBtn.textContent = orig; saveBtn.style.background = ''; }, 2000);
                }
            } catch (err) {
                console.error('Save failed:', err);
                alert('Failed to save player profile: ' + (err.message || JSON.stringify(err)));
            }
        }

        function closePillarModal() {
            document.getElementById('playerProfileModal').classList.remove('active');
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

