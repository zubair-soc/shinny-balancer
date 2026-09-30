        // Make modal display flex when active
        const profileModal = document.getElementById('playerProfileModal');
        const origClassList = profileModal.classList;
        const addClass = origClassList.add.bind(origClassList);
        const removeClass = origClassList.remove.bind(origClassList);
        profileModal.classList.add = function(cls) {
            if (cls === 'active') { profileModal.style.display = 'flex'; }
            addClass(cls);
        };
        profileModal.classList.remove = function(cls) {
            if (cls === 'active') { profileModal.style.display = 'none'; }
            removeClass(cls);
        };
