        // Supabase configuration
        let supabaseClient;
        let allSkates = [];
        let allPlayers = [];
        let currentSkateId = null;
        let isEditMode = false;
        let goalieSkaterCounts = {};

        // Format time to 12hr with AM/PM (e.g., "19:45" -> "7:45PM")
        function formatTime(time24) {
            if (!time24) return '';
            const [hours, minutes] = time24.split(':');
            let h = parseInt(hours);
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            return `${h}:${minutes}${ampm}`;
        }

        // Format date (e.g., "2026-02-09" -> "Mon Feb 9")
        function formatDate(dateStr) {
            const date = new Date(dateStr + 'T00:00:00');
            return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }

        // Capitalize names properly (e.g., "dan nguyen" -> "Dan Nguyen")
        function capitalizeName(name) {
            if (!name) return '';
            return name.trim()
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }

        // Get color for friend group letter
        function getFriendGroupColor(letter) {
            const colors = {
                'A': '#10b981', // Green (app color)
                'B': '#06b6d4', // Cyan
                'C': '#3b82f6', // Blue
                'D': '#8b5cf6', // Purple
                'E': '#ec4899', // Pink
                'F': '#ef4444', // Red
                'H': '#f97316', // Orange
                'I': '#eab308'  // Yellow
            };
            return colors[letter] || '#10b981'; // Default to primary green
        }

        // ========== THREE-DOT MENU FUNCTIONS ==========
        function toggleMenu(playerId, event) {
            event.stopPropagation();
            const menu = document.getElementById(`menu-${playerId}`);
            const allMenus = document.querySelectorAll('.menu-dropdown');
            
            // Close all other menus
            allMenus.forEach(m => {
                if (m.id !== `menu-${playerId}`) {
                    m.classList.remove('active');
                    m.classList.remove('open-up');
                }
            });
            
            // Toggle this menu
            menu.classList.toggle('active');
            
            // Check if menu goes off bottom of screen
            if (menu.classList.contains('active')) {
                setTimeout(() => {
                    const rect = menu.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - rect.bottom;
                    
                    // If less than 50px space below, open upward
                    if (spaceBelow < 50) {
                        menu.classList.add('open-up');
                    }
                }, 10);
            }
        }

        function closeMenu(playerId) {
            const menu = document.getElementById(`menu-${playerId}`);
            if (menu) {
                menu.classList.remove('active');
                menu.classList.remove('open-up');
            }
        }

        // Close menus when clicking outside
        document.addEventListener('click', () => {
            document.querySelectorAll('.menu-dropdown').forEach(menu => {
                menu.classList.remove('active');
            });
            document.querySelectorAll('.friend-group-submenu').forEach(submenu => {
                submenu.classList.remove('active');
            });
        });

        // ========== FRIEND GROUP FUNCTIONS ==========
        function showFriendGroupMenu(playerId, event) {
            event.stopPropagation();
            
            // Create submenu if it doesn't exist
            const menu = document.getElementById(`menu-${playerId}`);
            let submenu = document.getElementById(`friend-submenu-${playerId}`);
            
            if (!submenu) {
                submenu = document.createElement('div');
                submenu.id = `friend-submenu-${playerId}`;
                submenu.className = 'friend-group-submenu';
                submenu.innerHTML = `
                    <div class="friend-group-buttons">
                        <div class="friend-group-btn" onclick="setFriendGroup(${playerId}, 'A'); event.stopPropagation()">A</div>
                        <div class="friend-group-btn" onclick="setFriendGroup(${playerId}, 'B'); event.stopPropagation()">B</div>
                        <div class="friend-group-btn" onclick="setFriendGroup(${playerId}, 'C'); event.stopPropagation()">C</div>
                        <div class="friend-group-btn" onclick="setFriendGroup(${playerId}, 'D'); event.stopPropagation()">D</div>
                        <div class="friend-group-btn" onclick="setFriendGroup(${playerId}, 'E'); event.stopPropagation()">E</div>
                        <div class="friend-group-btn" onclick="setFriendGroup(${playerId}, 'F'); event.stopPropagation()">F</div>
                        <div class="friend-group-btn" onclick="setFriendGroup(${playerId}, 'H'); event.stopPropagation()">H</div>
                        <div class="friend-group-btn" onclick="setFriendGroup(${playerId}, 'I'); event.stopPropagation()">I</div>
                        <div class="friend-group-btn clear" onclick="setFriendGroup(${playerId}, null); event.stopPropagation()">Clear Group</div>
                    </div>
                `;
                submenu.addEventListener('click', (e) => e.stopPropagation());
                
                // Find the Friend Group menu item and append submenu there
                const friendGroupItem = Array.from(menu.querySelectorAll('.menu-item'))
                    .find(item => item.textContent.includes('Friend Group'));
                if (friendGroupItem) {
                    friendGroupItem.style.position = 'relative';
                    friendGroupItem.appendChild(submenu);
                }
            }
            
            // Toggle submenu
            submenu.classList.toggle('active');
        }

        async function setFriendGroup(playerId, letter) {
            try {
                const { error } = await supabaseClient
                    .from('skate_registrations')
                    .update({ friend_group: letter })
                    .eq('id', playerId);

                if (error) throw error;

                // Reload roster
                const skate = allSkates.find(s => s.id === currentSkateId);
                await loadRoster(currentSkateId, skate.capacity);
                
                // Close menu
                closeMenu(playerId);
            } catch (error) {
                console.error('Error setting friend group:', error);
                alert('Failed to set friend group');
            }
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

        // ========== CLICK OUTSIDE MODALS TO CLOSE ==========
        document.addEventListener('click', (e) => {
            // Check if click is on a modal backdrop (not modal-content)
            if (e.target.classList.contains('modal')) {
                // Close the appropriate modal
                if (e.target.id === 'skateModal') closeSkateModal();
                else if (e.target.id === 'skateOptionsModal') closeSkateOptions();
                else if (e.target.id === 'benchAppSettingsModal') closeBenchAppSettings();
                else if (e.target.id === 'rosterModal') closeRosterModal();
                else if (e.target.id === 'csvPreviewModal') closeCSVPreviewModal();
                else if (e.target.id === 'quickAddModal') closeQuickAdd();
                else if (e.target.id === 'moveToSkateModal') closeMoveToSkateModal();
                else if (e.target.id === 'replacePlayerModal') closeReplacePlayerModal();
                else if (e.target.id === 'manualCopyModal') document.getElementById('manualCopyModal').classList.remove('active');
                else if (e.target.id === 'atAGlanceModal') closeAtAGlance();
            }
        });

        // ========== ARCHIVE TOGGLE ==========
        let showingArchive = false;

        function toggleArchive() {
            showingArchive = !showingArchive;
            const pastSection = document.getElementById('pastSkatesSection');
            const toggleBtn = document.getElementById('archiveToggle');
            const archiveCount = document.getElementById('archiveCount').textContent;
            
            if (showingArchive) {
                pastSection.style.setProperty('display', 'block', 'important');
                toggleBtn.innerHTML = `📦 Hide Past / Removed (<span id="archiveCount">${archiveCount}</span>)`;
                // Scroll to past skates section
                setTimeout(() => {
                    pastSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            } else {
                pastSection.style.setProperty('display', 'none', 'important');
                toggleBtn.innerHTML = `📦 Show Past / Removed (<span id="archiveCount">${archiveCount}</span>)`;
            }
        }

        // Initialize
        window.addEventListener('DOMContentLoaded', () => {
            initTheme(); // Load saved theme preference
            
            if (window.SKATE_MANAGER_CLIENT) {
                supabaseClient = window.SKATE_MANAGER_CLIENT;
                loadSkates();
                loadAllPlayers();
                if (window.syncBenchAppOnOpen) window.syncBenchAppOnOpen();
            } else {
                alert('Database connection failed. Please refresh.');
            }
        });

        // Refresh players cache when returning to this page (e.g. after deleting in database.html)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && supabaseClient) {
                loadAllPlayers();
            }
        });
