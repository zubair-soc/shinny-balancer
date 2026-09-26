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

