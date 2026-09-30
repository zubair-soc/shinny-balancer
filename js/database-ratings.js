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

            await loadV2RatingHistory(id);

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
                const val = skills?.[key] ?? '';
                return `<section class="v2-skill" style="--skill-color:${def.color}">
                    <div class="v2-skill-heading"><strong>${def.label}</strong><span>${def.weight}%</span><div class="v2-skill-track"><div id="v2bar_${key}"></div></div></div>
                    <input type="hidden" id="simple_${key}" value="${escapeHTML(val)}">
                    <div class="v2-score-options" role="group" aria-label="${def.label} rating">${[1,2,3,4,5].map(n => `<button type="button" class="v2-score" aria-pressed="false" aria-label="${def.label}: ${n}, ${escapeHTML(def.desc[n-1])}" onclick="selectV2Score('${key}', ${n})">${n}</button>`).join('')}</div>
                    <div id="v2description_${key}" class="v2-score-description" aria-live="polite"></div>
                    <div class="v2-skill-tools"><details><summary>Examples & guide</summary><div class="v2-guide">${def.desc.map((d,i) => `<div><strong>${i+1} · ${escapeHTML(d)}</strong>${v2ExampleList(def, i+1)}</div>`).join('')}</div></details><button type="button" class="v2-skip" onclick="selectV2Score('${key}', '')">Not enough observation</button></div>
                </section>`;
            }).join('');
            Object.keys(SIMPLE_RUBRIC).forEach(refreshV2Score);
            updateSimpleComposite();
        }

        function v2ExampleList(def, score) {
            return def.examples[score] ? `<ul>${def.examples[score].map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '';
        }

        function selectV2Score(key, score) {
            document.getElementById(`simple_${key}`).value = score;
            refreshV2Score(key);
            updateSimpleComposite();
        }

        function refreshV2Score(key) {
            const input = document.getElementById(`simple_${key}`);
            const def = SIMPLE_RUBRIC[key];
            const score = input.value === '' ? null : Number(input.value);
            const section = input.closest('.v2-skill');
            section.querySelectorAll('.v2-score').forEach((button, index) => button.setAttribute('aria-pressed', String(score === index+1)));
            document.getElementById(`v2bar_${key}`).style.width = score === null ? '0%' : `${score*20}%`;
            document.getElementById(`v2description_${key}`).innerHTML = score === null ? 'Choose a score, or leave pending observation.'
                : `<strong>${score} · ${escapeHTML(def.desc[Math.floor(score)-1])}</strong>${v2ExampleList(def, score)}`;
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
                const { error } = await supabaseClient.from('player_skills_simple')
                    .upsert({ player_id: id, ...skills, updated_at: new Date().toISOString() }, { onConflict: 'player_id' });
                if (error) throw error;

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

        async function submitV2bRating(nextPlayer = false) {
            if (window.v2RatingSaving) return;
            const id = parseInt(document.getElementById('playerProfileModal').dataset.playerId);

            const skills = {};
            for (const key of Object.keys(SIMPLE_RUBRIC)) {
                const el = document.getElementById(`simple_${key}`);
                skills[key] = el && el.value !== '' ? Math.min(5, Math.max(1, parseFloat(el.value))) : null;
            }
            const composite = calcCompositeSimple(skills);
            if (Object.values(skills).some(value => value === null)) { alert('Rate all five categories before submitting. Use Save Draft for pending observations.'); return; }

            const btn = document.getElementById('submitV2bBtn');
            window.v2RatingSaving = true;
            btn.textContent = 'Saving...';
            btn.disabled = true;

            try {
                // Insert new rating entry
                const { error: insertError } = await supabaseClient.from('v2b_ratings').insert({
                    player_id: id,
                    ...skills,
                    composite
                });

                if (insertError) throw insertError;

                // The database attributes the account and updates the average atomically.
                const { data: savedPlayer, error: scoreError } = await supabaseClient
                    .from(window.isSkateAdmin?.() ? 'players' : 'skate_manager_players').select('rating_v2b').eq('id', id).single();
                if (scoreError) throw scoreError;
                const avg = savedPlayer.rating_v2b;
                document.getElementById('profileV2bDisplay').textContent = avg ?? '—';

                // Update local
                const player = allPlayers.find(p => p.id === id);
                if (player) player.rating_v2b = avg;

                await loadV2RatingHistory(id);
                filterPlayers(document.getElementById('searchBox').value);

                if (nextPlayer) {
                    const term = document.getElementById('searchBox').value.trim().toLowerCase();
                    const queue = allPlayers.filter(item => item.name.toLowerCase().includes(term));
                    const next = queue[queue.findIndex(item => item.id === id) + 1];
                    btn.textContent = 'Submit Rating';
                    btn.disabled = false;
                    if (next) await openPlayerProfile(next.id);
                    else closePillarModal();
                    return;
                }
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
            } finally {
                window.v2RatingSaving = false;
            }
        }

        async function loadV2RatingHistory(id) {
            const isAdmin = window.isSkateAdmin?.() === true;
            document.getElementById('v2RatingHistorySection').hidden = !isAdmin;
            document.getElementById('v2bHistory').innerHTML = '';
            if (!isAdmin) return;
            const { data, error } = await supabaseClient.from('v2b_ratings')
                .select('*').eq('player_id', id).order('created_at', { ascending: false }).limit(10);
            if (error) {
                document.getElementById('v2bHistory').textContent = 'Unable to load rating history.';
                return;
            }
            renderV2bHistory(data || []);
        }

        function renderV2bHistory(history) {
            const container = document.getElementById('v2bHistory');
            if (!container) return;
            if (window.isSkateAdmin?.() !== true) { container.innerHTML = ''; return; }
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
            const rated = Object.values(skills).filter(value => value !== null).length;
            const progress = document.getElementById('v2RatingProgress');
            if (progress) progress.textContent = `${rated} of 5 categories rated`;
            const submit = document.getElementById('submitV2bBtn');
            if (submit && submit.textContent !== 'Saving...') submit.disabled = rated !== 5;
            const next = document.getElementById('submitV2NextBtn');
            if (next) next.disabled = rated !== 5;
            const composite = rated === 5 ? calcCompositeSimple(skills) : null;
            const el = document.getElementById('profileV2bComposite');
            if (el && composite !== null) {
                el.textContent = `V2: ${composite} / 5`;
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

