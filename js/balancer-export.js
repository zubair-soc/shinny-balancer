        let currentNaitParkingCode = null;
        let naitParkingCodeLoad = null;

        function isNaitBalancingLocation() {
            return String(document.getElementById('location')?.value || '').trim().toLowerCase().startsWith('nait');
        }

        function generateExport(parkingCodeOverride) {
            const skateTitle = document.getElementById('skateTitle').value.replace(/^\s*🏒\s*/, '');
            const dateTime = document.getElementById('dateTime').value;
            const cost = document.getElementById('cost').value;
            const email = document.getElementById('email').value;
            const location = document.getElementById('location').value;

            let output = `${skateTitle}\n`;
            if (dateTime) output += `Date & Time: ${dateTime}\n`;
            if (cost) output += `Cost: ${cost} — ${email}\n`;
            if (location && isNaitBalancingLocation()) {
                const parkingCode = parkingCodeOverride === undefined ? currentNaitParkingCode : parkingCodeOverride;
                const parkingDetail = parkingCode === null
                    ? 'Loading current code…'
                    : (parkingCode || 'Code not set in Admin → Settings');
                output += `Location: NAIT — Parking code: ${parkingDetail} in Honk app (Lot E)\n`;
            } else if (location) {
                output += `Location: ${location}\n`;
            }

            output += `\nDark ⚫️\n`;
            darkTeam.forEach((player, i) => {
                output += `${i + 1}. ${player.name}${player.isGoalie ? ' 🥅' : ''}\n`;
            });

            output += `\nLight ⚪️\n`;
            lightTeam.forEach((player, i) => {
                output += `${i + 1}. ${player.name}${player.isGoalie ? ' 🥅' : ''}\n`;
            });

            output += '\nPlease make sure everyone has signed the waiver before playing: shinnyofchampions.com/waiver\n';

            return output;
        }

        function renderExport() {
            const root = document.getElementById('exportSection');
            root.innerHTML = `
                <div class="export-section">
                    <h2>Share teams</h2>
                    <div id="balancerExportPreview" class="export-preview"></div>
                    <button class="button" onclick="copyToClipboard()">📋 Copy to Clipboard</button>
                </div>`;
            const preview = document.getElementById('balancerExportPreview');
            preview.textContent = generateExport();

            if (isNaitBalancingLocation() && currentNaitParkingCode === null && !naitParkingCodeLoad) {
                if (!window.getNaitParkingCode) {
                    currentNaitParkingCode = '';
                    preview.textContent = generateExport();
                    return;
                }
                naitParkingCodeLoad = window.getNaitParkingCode()
                    .then(code => { currentNaitParkingCode = code; })
                    .catch(error => {
                        console.error('Could not load the NAIT parking code:', error);
                        currentNaitParkingCode = '';
                    })
                    .finally(() => {
                        naitParkingCodeLoad = null;
                        if (document.getElementById('balancerExportPreview')) {
                            document.getElementById('balancerExportPreview').textContent = generateExport();
                        }
                    });
            }
        }

        async function copyToClipboard() {
            let messageText;
            let parkingCode;
            try {
                if (isNaitBalancingLocation()) {
                    try {
                        parkingCode = await window.getNaitParkingCode();
                    } catch (error) {
                        console.error('Could not load the NAIT parking code:', error);
                        alert('Could not load the NAIT parking code. Check Admin → Settings, then try again.');
                        return;
                    }
                    if (!parkingCode) {
                        currentNaitParkingCode = '';
                        renderExport();
                        alert('Add the current NAIT parking code under Admin → Settings before copying this roster.');
                        return;
                    }
                    currentNaitParkingCode = parkingCode;
                }
                messageText = generateExport(parkingCode);
                await navigator.clipboard.writeText(messageText);
                alert('✓ Copied to clipboard! Ready to paste into WhatsApp.');
            } catch (error) {
                console.error('Copy failed:', error);
                // Fallback method
                const textArea = document.createElement('textarea');
                textArea.value = messageText || generateExport(parkingCode);
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    alert('✓ Copied to clipboard! Ready to paste into WhatsApp.');
                } catch (err) {
                    alert('Failed to copy. Please manually select and copy the text above.');
                }
                document.body.removeChild(textArea);
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

        // Initialize theme on page load
        initTheme();
