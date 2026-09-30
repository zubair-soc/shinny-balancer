        const supabaseClient = window.SKATE_MANAGER_CLIENT;

        let allCredits = [];
        let allPlayers = [];
        let currentFilter = 'active';
        let editingCreditId = null;

        document.addEventListener('DOMContentLoaded', async () => {
            initTheme();
            await loadData();
        });

        async function loadData() {
            try {
                // Load players
                console.log('Loading players...');
                const { data: players, error: playersError } = await supabaseClient
                    .from('players')
                    .select('*')
                    .order('name');

                if (playersError) {
                    console.error('Players error:', playersError);
                    throw playersError;
                }
                console.log('Players loaded:', players?.length || 0);
                allPlayers = players || [];

                // Load credits
                console.log('Loading credits...');
                const { data: credits, error: creditsError } = await supabaseClient
                    .from('player_credits')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (creditsError) {
                    console.error('Credits error:', creditsError);
                    throw creditsError;
                }
                console.log('Credits loaded:', credits?.length || 0);
                
                // Manually join player names
                allCredits = (credits || []).map(credit => {
                    const player = allPlayers.find(p => p.id === credit.player_id);
                    return {
                        ...credit,
                        player: { name: player?.name || 'Unknown Player' }
                    };
                });

                console.log('Final credits with players:', allCredits.length);
                updateSummary();
                renderCredits();
            } catch (error) {
                console.error('Error loading data:', error);
                console.error('Error details:', JSON.stringify(error, null, 2));
                document.getElementById('creditsContent').innerHTML = 
                    `<div class="empty-state">
                        <h3>Failed to load credits</h3>
                        <p>${error.message || 'Check console for details'}</p>
                    </div>`;
            }
        }

        function updateSummary() {
            const active = allCredits.filter(c => c.status === 'active');
            const used = allCredits.filter(c => c.status === 'used');
            const totalAmount = active.reduce((sum, c) => sum + parseFloat(c.amount), 0);
            const uniquePlayers = new Set(active.map(c => c.player_id));

            document.getElementById('activeCount').textContent = active.length;
            document.getElementById('totalAmount').textContent = '$' + totalAmount.toFixed(2);
            document.getElementById('usedCount').textContent = used.length;
            document.getElementById('playersWithCredits').textContent = uniquePlayers.size;
        }

        function renderCredits() {
            let creditsToShow = allCredits;

            // Apply filter
            if (currentFilter === 'active') {
                creditsToShow = creditsToShow.filter(c => c.status === 'active');
            } else if (currentFilter === 'used') {
                creditsToShow = creditsToShow.filter(c => c.status === 'used');
            }

            // Apply search
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            if (searchTerm) {
                creditsToShow = creditsToShow.filter(c => 
                    c.player.name.toLowerCase().includes(searchTerm)
                );
            }

            // Group by player
            const byPlayer = {};
            creditsToShow.forEach(credit => {
                const playerName = credit.player.name;
                if (!byPlayer[playerName]) {
                    byPlayer[playerName] = [];
                }
                byPlayer[playerName].push(credit);
            });

            if (Object.keys(byPlayer).length === 0) {
                document.getElementById('creditsContent').innerHTML = 
                    '<div class="empty-state"><h3>No credits found</h3><p>Try adjusting your filters or search</p></div>';
                return;
            }

            const html = Object.entries(byPlayer).sort(([a], [b]) => a.localeCompare(b)).map(([playerName, credits]) => {
                const activeCredits = credits.filter(c => c.status === 'active');
                const totalAvailable = activeCredits.reduce((sum, c) => sum + parseFloat(c.amount), 0);
                const playerId = credits[0]?.player_id;

                return `
                    <div class="credit-card">
                        <div class="credit-header">
                            <div class="player-info">
                                <div class="player-name">${escapeHTML(playerName)}</div>
                                <div class="credit-amount">$${totalAvailable.toFixed(2)} available</div>
                            </div>
                            ${totalAvailable > 0 ? `
                                <button class="button" onclick="showApplyCreditModal(${playerId}, ${inlineJSString(playerName)}, ${totalAvailable})" style="padding: 8px 16px; font-size: 13px;">
                                    Apply Credit
                                </button>
                            ` : ''}
                        </div>
                        <div class="credit-details">
                            ${credits.map(credit => `
                                <div class="credit-item ${credit.status === 'used' ? 'used' : ''}">
                                    <div class="credit-info">
                                        <div class="credit-reason">
                                            <strong>$${parseFloat(credit.amount).toFixed(2)}</strong>${credit.reason ? ' - ' + escapeHTML(credit.reason) : ''}
                                        </div>
                                        <div class="credit-meta">
                                            ${new Date(credit.created_at).toLocaleDateString()} 
                                            ${credit.status === 'used' ? `• Used on ${new Date(credit.used_at).toLocaleDateString()}` : ''}
                                            ${(() => {
                                                const lastActivity = credit.last_activity_at || credit.created_at;
                                                const monthsInactive = (new Date() - new Date(lastActivity)) / (1000 * 60 * 60 * 24 * 30);
                                                if (monthsInactive >= 12) return `• <span style="color:#ef4444;font-weight:600;">⚠️ Inactive 1+ year — donate to food bank</span>`;
                                                if (monthsInactive >= 11) return `• <span style="color:#f97316;font-weight:600;">⚠️ Expiring soon (${Math.round(monthsInactive)} months inactive)</span>`;
                                                return `• Last activity: ${new Date(lastActivity).toLocaleDateString()}`;
                                            })()}
                                        </div>
                                    </div>
                                    ${credit.status === 'active' ? `
                                        <div class="credit-actions">
                                            <button class="icon-btn btn-edit" onclick="editCredit(${credit.id})">✏️ Edit</button>
                                            <button class="icon-btn btn-delete" onclick="deleteCredit(${credit.id})">🗑️</button>
                                        </div>
                                    ` : `<span class="status-badge status-used">Used</span>`}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('');

            document.getElementById('creditsContent').innerHTML = `<div class="credits-list">${html}</div>`;
        }

        function setFilter(filter) {
            currentFilter = filter;
            
            // Update button states
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            event.target.classList.add('active');

            renderCredits();
        }

        function filterCredits() {
            renderCredits();
        }

        function editCredit(creditId) {
            const credit = allCredits.find(c => c.id === creditId);
            if (!credit) return;

            editingCreditId = creditId;

            // Populate player dropdown
            const playerSelect = document.getElementById('editPlayer');
            playerSelect.innerHTML = '<option value="">Select player...</option>' +
                allPlayers.map(p => `
                    <option value="${p.id}" ${p.id === credit.player_id ? 'selected' : ''}>
                        ${escapeHTML(p.name)}
                    </option>
                `).join('');

            document.getElementById('editAmount').value = credit.amount;
            document.getElementById('editReason').value = credit.reason;
            document.getElementById('editModal').classList.add('active');
        }

        function closeEditModal() {
            document.getElementById('editModal').classList.remove('active');
            editingCreditId = null;
        }

        function showAddCreditModal() {
            // Populate player dropdown
            const playerSelect = document.getElementById('addPlayer');
            playerSelect.innerHTML = '<option value="">Select player...</option>' +
                allPlayers.map(p => `
                    <option value="${p.id}">${escapeHTML(p.name)}</option>
                `).join('');

            document.getElementById('addAmount').value = '';
            document.getElementById('addReason').value = '';
            document.getElementById('addCreditModal').classList.add('active');
            document.getElementById('addPlayer').focus();
        }

        function closeAddCreditModal() {
            document.getElementById('addCreditModal').classList.remove('active');
        }

        async function createCredit() {
            const playerId = document.getElementById('addPlayer').value;
            const amount = document.getElementById('addAmount').value;
            const reason = document.getElementById('addReason').value;

            if (!playerId || !amount) {
                alert('Please fill in player and amount');
                return;
            }

            try {
                const now = new Date().toISOString();
                const { error } = await supabaseClient
                    .from('player_credits')
                    .insert({
                        player_id: parseInt(playerId),
                        amount: parseFloat(amount),
                        reason: reason || '',
                        status: 'active',
                        created_by: 'Manual',
                        created_at: now,
                        last_activity_at: now
                    });

                if (error) throw error;

                closeAddCreditModal();
                await loadData();
            } catch (error) {
                console.error('Error creating credit:', error);
                alert('Failed to create credit: ' + error.message);
            }
        }

        // ========== APPLY CREDIT FUNCTIONS ==========
        let applyingPlayerId = null;
        let applyingPlayerName = '';
        let availableAmount = 0;
        let allSkates = [];

        async function showApplyCreditModal(playerId, playerName, totalAvailable) {
            applyingPlayerId = playerId;
            applyingPlayerName = playerName;
            availableAmount = totalAvailable;

            document.getElementById('applyPlayerName').textContent = playerName;
            document.getElementById('applyAvailableAmount').textContent = `$${totalAvailable.toFixed(2)} available`;

            // Load upcoming skates
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const { data: skates, error } = await supabaseClient
                    .from('skates')
                    .select('*')
                    .gte('date', today.toISOString().split('T')[0])
                    .order('date');

                if (error) throw error;
                allSkates = skates || [];

                const skateSelect = document.getElementById('applySkate');
                if (allSkates.length === 0) {
                    skateSelect.innerHTML = '<option value="">No upcoming skates available</option>';
                } else {
                    skateSelect.innerHTML = '<option value="">Select a skate...</option>' +
                        allSkates.map(s => {
                            const date = new Date(s.date + 'T00:00:00');
                            const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            const cost = parseFloat(s.cost.replace('$', ''));
                            return `<option value="${s.id}" data-cost="${cost}">${escapeHTML(s.title)} - ${dateStr} (${escapeHTML(s.cost)})</option>`;
                        }).join('');
                }

                skateSelect.onchange = updateCreditPreview;
                document.getElementById('applyCreditModal').classList.add('active');
            } catch (error) {
                console.error('Error loading skates:', error);
                alert('Failed to load skates');
            }
        }

        function closeApplyCreditModal() {
            document.getElementById('applyCreditModal').classList.remove('active');
            document.getElementById('creditPreview').style.display = 'none';
            applyingPlayerId = null;
        }

        function updateCreditPreview() {
            const select = document.getElementById('applySkate');
            const selectedOption = select.options[select.selectedIndex];
            
            if (!selectedOption.value) {
                document.getElementById('creditPreview').style.display = 'none';
                document.getElementById('applyButton').disabled = true;
                return;
            }

            const skateCost = parseFloat(selectedOption.dataset.cost);
            
            // Get player's active credits sorted by created_at (FIFO - oldest first)
            const playerCredits = allCredits
                .filter(c => c.player_id === applyingPlayerId && c.status === 'active')
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            // Calculate which credits to use
            let remaining = skateCost;
            const creditsToUse = [];
            
            for (const credit of playerCredits) {
                if (remaining <= 0) break;
                
                const creditAmount = parseFloat(credit.amount);
                const amountToUse = Math.min(creditAmount, remaining);
                
                creditsToUse.push({
                    ...credit,
                    amountToUse: amountToUse,
                    fullyUsed: amountToUse === creditAmount
                });
                
                remaining -= amountToUse;
            }

            const totalApplied = skateCost - Math.max(0, remaining);

            // Display breakdown
            const breakdown = creditsToUse.map(c => `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>• $${c.amountToUse.toFixed(2)} from "${escapeHTML(c.reason)}"</span>
                    <span>${c.fullyUsed ? '(fully used)' : `($${(c.amount - c.amountToUse).toFixed(2)} remains)`}</span>
                </div>
            `).join('');

            document.getElementById('creditBreakdown').innerHTML = breakdown || '<div>No credits needed</div>';
            document.getElementById('totalApplied').textContent = `$${totalApplied.toFixed(2)}`;
            
            if (remaining > 0) {
                document.getElementById('remainingToPay').innerHTML = `
                    <span>Remaining to pay:</span>
                    <span style="color: #ef4444; font-weight: 600;">$${remaining.toFixed(2)}</span>
                `;
            } else {
                document.getElementById('remainingToPay').innerHTML = '';
            }

            document.getElementById('creditPreview').style.display = 'block';
            document.getElementById('applyButton').disabled = totalApplied === 0;
        }

        async function confirmApplyCredit() {
            const select = document.getElementById('applySkate');
            const skateId = parseInt(select.value);
            const selectedOption = select.options[select.selectedIndex];
            const skateCost = parseFloat(selectedOption.dataset.cost);
            
            if (!skateId) return;

            try {
                // Get player's active credits sorted by created_at (FIFO)
                const playerCredits = allCredits
                    .filter(c => c.player_id === applyingPlayerId && c.status === 'active')
                    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                // Calculate which credits to use
                let remaining = skateCost;
                const updates = [];
                
                for (const credit of playerCredits) {
                    if (remaining <= 0) break;
                    
                    const creditAmount = parseFloat(credit.amount);
                    const amountToUse = Math.min(creditAmount, remaining);
                    
                    if (amountToUse === creditAmount) {
                        // Fully used - mark as used
                        updates.push({
                            id: credit.id,
                            update: {
                                status: 'used',
                                used_on_skate_id: skateId,
                                used_at: new Date().toISOString(),
                                used_by: 'System',
                                last_activity_at: new Date().toISOString()
                            }
                        });
                    } else {
                        // Partially used - split the credit
                        // 1. Reduce original credit amount
                        updates.push({
                            id: credit.id,
                            update: {
                                amount: creditAmount - amountToUse,
                                last_activity_at: new Date().toISOString()
                            }
                        });
                        
                        // 2. Create new "used" credit for the used portion
                        updates.push({
                            insert: {
                                player_id: credit.player_id,
                                amount: amountToUse,
                                reason: credit.reason + ' (partial)',
                                source_skate_id: credit.source_skate_id,
                                status: 'used',
                                used_on_skate_id: skateId,
                                used_at: new Date().toISOString(),
                                used_by: 'System',
                                created_at: credit.created_at,
                                created_by: credit.created_by
                            }
                        });
                    }
                    
                    remaining -= amountToUse;
                }

                // Execute all credit updates
                for (const op of updates) {
                    if (op.insert) {
                        const { error } = await supabaseClient
                            .from('player_credits')
                            .insert(op.insert);
                        if (error) throw error;
                    } else {
                        const { error } = await supabaseClient
                            .from('player_credits')
                            .update(op.update)
                            .eq('id', op.id);
                        if (error) throw error;
                    }
                }

                // Get next position for this skate
                const { data: roster } = await supabaseClient
                    .from('skate_registrations')
                    .select('position')
                    .eq('skate_id', skateId)
                    .order('position', { ascending: false })
                    .limit(1);

                const nextPosition = roster && roster.length > 0 ? roster[0].position + 1 : 1;

                // Get player name
                const player = allPlayers.find(p => p.id === applyingPlayerId);
                if (!player) throw new Error('Player not found');

                // Add player to skate
                const { error: addError } = await supabaseClient
                    .from('skate_registrations')
                    .insert({
                        skate_id: skateId,
                        player_id: applyingPlayerId,
                        player_name: player.name,
                        is_goalie: false,
                        is_paid: true,
                        is_waitlist: false,
                        position: nextPosition
                    });

                if (addError) throw addError;

                closeApplyCreditModal();
                await loadData();
                
                alert(`✓ Credit applied! ${applyingPlayerName} added to skate.`);
            } catch (error) {
                console.error('Error applying credit:', error);
                alert('Failed to apply credit: ' + error.message);
            }
        }

        async function saveCredit() {
            const playerId = document.getElementById('editPlayer').value;
            const amount = document.getElementById('editAmount').value;
            const reason = document.getElementById('editReason').value;

            if (!playerId || !amount) {
                alert('Please fill in player and amount');
                return;
            }

            try {
                const { error } = await supabaseClient
                    .from('player_credits')
                    .update({
                        player_id: parseInt(playerId),
                        amount: parseFloat(amount),
                        reason: reason || '',
                        last_activity_at: new Date().toISOString()
                    })
                    .eq('id', editingCreditId);

                if (error) throw error;

                closeEditModal();
                await loadData();
            } catch (error) {
                console.error('Error saving credit:', error);
                alert('Failed to save credit: ' + error.message);
            }
        }

        async function deleteCredit(creditId) {
            if (!confirm('Delete this credit? This cannot be undone.')) return;

            try {
                const { error } = await supabaseClient
                    .from('player_credits')
                    .delete()
                    .eq('id', creditId);

                if (error) throw error;

                await loadData();
            } catch (error) {
                console.error('Error deleting credit:', error);
                alert('Failed to delete credit: ' + error.message);
            }
        }

        function toggleTheme() {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            document.getElementById('themeToggle').textContent = isDark ? '☀️' : '🌙';
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        }

        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                document.getElementById('themeToggle').textContent = '☀️';
            }
        }

        // Click outside modal to close
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                if (e.target.id === 'editModal') closeEditModal();
                else if (e.target.id === 'addCreditModal') closeAddCreditModal();
                else if (e.target.id === 'applyCreditModal') closeApplyCreditModal();
            }
        });
