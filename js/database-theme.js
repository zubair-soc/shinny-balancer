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
