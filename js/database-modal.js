        // Make modal display flex when active
        const profileModal = document.getElementById('playerProfileModal');
        const origClassList = profileModal.classList;
        Object.defineProperty(profileModal, 'classList', {
            get() { return origClassList; }
        });
        profileModal.classList.add = function(cls) {
            if (cls === 'active') { profileModal.style.display = 'flex'; }
            origClassList.add(cls);
        };
        profileModal.classList.remove = function(cls) {
            if (cls === 'active') { profileModal.style.display = 'none'; }
            origClassList.remove(cls);
        };
