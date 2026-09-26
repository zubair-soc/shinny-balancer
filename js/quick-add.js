        let selectedSkatesForQuickAdd = new Set();

        function showQuickAdd() {
            // Only show if there are future skates
            if (!allSkates || allSkates.length === 0) {
                alert('No skates available. Create a skate first!');
                return;
            }

            // Filter to only future skates (including today)
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            
            const futureSkates = allSkates.filter(skate => {
                const skateDate = new Date(skate.date + 'T00:00:00');
                return skateDate >= now;
            });

            if (futureSkates.length === 0) {
                alert('No upcoming skates found. Quick Add only works for future skates!');
                return;
            }

            // Render skate cards
            const skatesList = document.getElementById('quickAddSkatesList');
            skatesList.innerHTML = futureSkates.map(skate => {
                const date = new Date(skate.date + 'T00:00:00');
                const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                
                // Extract skate number from title (e.g., "246 Tier 3" -> "246" or legacy "Skate 225 Mixed" -> "225")
                const skateNumber = skate.title?.match(/^(\d+)/)?.[1] || skate.title?.match(/Skate\s+(\d+)/i)?.[1] || skate.id;
                
                return `
                    <div class="quick-add-skate-card" data-skate-id="${skate.id}" data-skate-number="${skateNumber}" onclick="toggleSkateSelection(${skate.id})">
                        <div class="quick-add-skate-info">
                            <div class="quick-add-skate-title">${escapeHTML(skate.title || `Skate ${skate.id}`)}</div>
                            <div class="quick-add-skate-date">${dateStr}</div>
                        </div>
                        <div class="quick-add-checkmark">
                            <span style="display: none; color: white; font-size: 14px;">✓</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Show modal
            document.getElementById('quickAddModal').classList.add('active');
            
            // Focus on player name input
            setTimeout(() => {
                document.getElementById('quickAddPlayerName').focus();
            }, 100);
        }

        function toggleSkateSelection(skateId) {
            const card = document.querySelector(`.quick-add-skate-card[data-skate-id="${skateId}"]`);
            const checkmark = card.querySelector('.quick-add-checkmark span');
            
            if (selectedSkatesForQuickAdd.has(skateId)) {
                selectedSkatesForQuickAdd.delete(skateId);
                card.classList.remove('selected');
                checkmark.style.display = 'none';
            } else {
                selectedSkatesForQuickAdd.add(skateId);
                card.classList.add('selected');
                checkmark.style.display = 'block';
            }
            
            // Update counter
            updateSelectedSkatesCount();
        }

        function updateSelectedSkatesCount() {
            const countElement = document.getElementById('selectedSkatesCount');
            
            if (selectedSkatesForQuickAdd.size === 0) {
                countElement.textContent = '(0 selected)';
                countElement.style.color = 'var(--text-muted)';
            } else {
                // Get skate numbers from selected cards
                const skateNumbers = [];
                selectedSkatesForQuickAdd.forEach(skateId => {
                    const card = document.querySelector(`.quick-add-skate-card[data-skate-id="${skateId}"]`);
                    if (card) {
                        const skateNumber = card.getAttribute('data-skate-number');
                        skateNumbers.push(skateNumber);
                    }
                });
                
                // Sort numerically
                skateNumbers.sort((a, b) => parseInt(a) - parseInt(b));
                
                countElement.textContent = `(${skateNumbers.join(', ')})`;
                countElement.style.color = 'var(--primary)';
            }
        }

        function closeQuickAdd() {
            document.getElementById('quickAddModal').classList.remove('active');
            selectedSkatesForQuickAdd.clear();
            document.getElementById('quickAddPlayerName').value = '';
            
            // Clear all selections
            document.querySelectorAll('.quick-add-skate-card').forEach(card => {
                card.classList.remove('selected');
                card.querySelector('.quick-add-checkmark span').style.display = 'none';
            });
            
            // Reset counter
            updateSelectedSkatesCount();
        }

        async function quickAddPlayer() {
            const playerName = capitalizeName(document.getElementById('quickAddPlayerName').value);
            
            if (!playerName) {
                return; // Just silently return if no name
            }

            if (selectedSkatesForQuickAdd.size === 0) {
                return; // Just silently return if no skates selected
            }

            try {
                const selectedSkateIds = Array.from(selectedSkatesForQuickAdd);
                let successCount = 0;

                for (const skateId of selectedSkateIds) {
                    try {
                        // Duplicate check
                        const isDup = await checkDuplicate(skateId, playerName);
                        if (isDup) {
                            console.log(`${playerName} already on skate ${skateId}, skipping`);
                            continue;
                        }

                        // Get current roster for position
                        const { data: roster } = await supabaseClient
                            .from('skate_registrations')
                            .select('position')
                            .eq('skate_id', skateId)
                            .order('position', { ascending: false })
                            .limit(1);

                        const nextPosition = roster && roster.length > 0 ? roster[0].position + 1 : 1;

                        // Add player
                        const { error } = await supabaseClient
                            .from('skate_registrations')
                            .insert({
                                skate_id: skateId,
                                player_name: playerName,
                                position: nextPosition,
                                is_waitlist: false,
                                is_goalie: false,
                                is_paid: true
                            });

                        if (!error) successCount++;
                    } catch (error) {
                        console.error(`Error adding to skate ${skateId}:`, error);
                    }
                }

                if (successCount > 0) {
                    // Haptic feedback on mobile
                    if (navigator.vibrate) {
                        navigator.vibrate(50); // Quick 50ms vibration
                    }
                    
                    // Visual feedback - pulse the button
                    const addBtn = event?.target || document.querySelector('#quickAddModal .button:not(.button-secondary)');
                    if (addBtn) {
                        addBtn.style.transform = 'scale(0.95)';
                        addBtn.style.background = '#059669';
                        setTimeout(() => {
                            addBtn.style.transform = 'scale(1)';
                            addBtn.style.background = '';
                        }, 150);
                    }
                    
                    // Clear the input
                    document.getElementById('quickAddPlayerName').value = '';
                    document.getElementById('quickAddPlayerName').focus();
                    
                    // Clear skate selections
                    selectedSkatesForQuickAdd.clear();
                    document.querySelectorAll('.quick-add-skate-card').forEach(card => {
                        card.classList.remove('selected');
                        card.querySelector('.quick-add-checkmark span').style.display = 'none';
                    });
                    updateSelectedSkatesCount();
                    
                    // Reload skates in background
                    await loadSkates();
                }

            } catch (error) {
                console.error('Error in quickAddPlayer:', error);
            }
        }

        // ========== TOAST ==========
        let toastTimer;
        function showToast(message) {
            let toast = document.getElementById('toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'toast';
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            clearTimeout(toastTimer);
            toast.classList.add('show');
            toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
        }

        // ========== TEAMS + NUDGE + TUG OF WAR ==========
