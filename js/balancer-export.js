        function generateExport() {
            const skateTitle = document.getElementById('skateTitle').value;
            const dateTime = document.getElementById('dateTime').value;
            const cost = document.getElementById('cost').value;
            const email = document.getElementById('email').value;
            const location = document.getElementById('location').value;

            let output = `🏒 ${skateTitle}\n`;
            if (dateTime) output += `Date & Time: ${dateTime}\n`;
            if (cost) output += `Cost: ${cost} — ${email}\n`;
            if (location) output += `Location: ${location}\n`;

            output += `\nDark ⚫️\n`;
            darkTeam.forEach((player, i) => {
                output += `${i + 1}. ${player.name}${player.isGoalie ? ' 🥅' : ''}\n`;
            });

            output += `\nLight ⚪️\n`;
            lightTeam.forEach((player, i) => {
                output += `${i + 1}. ${player.name}${player.isGoalie ? ' 🥅' : ''}\n`;
            });

            return output;
        }

        function renderExport() {
            const html = `
                <div class="export-section">
                    <h2>Share teams</h2>
                    <div class="export-preview">${generateExport()}</div>
                    <button class="button" onclick="copyToClipboard()">📋 Copy to Clipboard</button>
                </div>
            `;
            document.getElementById('exportSection').innerHTML = html;
        }

        async function copyToClipboard() {
            try {
                const text = generateExport();
                await navigator.clipboard.writeText(text);
                alert('✓ Copied to clipboard! Ready to paste into WhatsApp.');
            } catch (error) {
                console.error('Copy failed:', error);
                // Fallback method
                const textArea = document.createElement('textarea');
                textArea.value = generateExport();
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
