        function handleLocationChange() {
            const select = document.getElementById('locationSelect');
            const input = document.getElementById('location');
            const customInput = document.getElementById('customLocationInput');
            
            if (select.value === 'custom') {
                // Show the custom input box
                select.style.display = 'none';
                customInput.style.display = 'block';
                document.getElementById('customLocationText').focus();
            } else {
                input.value = select.value;
            }
        }

        function saveNewLocation() {
            const customText = document.getElementById('customLocationText').value.trim();
            
            if (customText) {
                const select = document.getElementById('locationSelect');
                const input = document.getElementById('location');
                
                // Add new option before the "+ Add Custom Location" option
                const newOption = document.createElement('option');
                newOption.value = customText;
                newOption.textContent = customText;
                select.insertBefore(newOption, select.lastElementChild);
                
                // Select the new option
                select.value = customText;
                input.value = customText;
                
                // Save to localStorage
                saveCustomLocations();
                
                // Hide custom input, show dropdown
                document.getElementById('customLocationInput').style.display = 'none';
                select.style.display = 'block';
                document.getElementById('customLocationText').value = '';
            } else {
                alert('Please enter a location name');
            }
        }

        function cancelNewLocation() {
            const select = document.getElementById('locationSelect');
            const input = document.getElementById('location');
            
            // Reset to first option
            select.selectedIndex = 0;
            input.value = select.value;
            
            // Hide custom input, show dropdown
            document.getElementById('customLocationInput').style.display = 'none';
            select.style.display = 'block';
            document.getElementById('customLocationText').value = '';
        }

        function saveCustomLocations() {
            const select = document.getElementById('locationSelect');
            const locations = [];
            
            // Get all options except the last one (+ Add Custom Location)
            for (let i = 0; i < select.options.length - 1; i++) {
                locations.push(select.options[i].value);
            }
            
            localStorage.setItem('customLocations', JSON.stringify(locations));
        }

        function loadCustomLocations() {
            const saved = localStorage.getItem('customLocations');
            if (saved) {
                const locations = JSON.parse(saved);
                const select = document.getElementById('locationSelect');
                
                // Clear existing options except custom
                while (select.options.length > 1) {
                    select.remove(0);
                }
                
                // Add saved locations
                locations.forEach(loc => {
                    const option = document.createElement('option');
                    option.value = loc;
                    option.textContent = loc;
                    select.insertBefore(option, select.lastElementChild);
                });
                
                // Set first option as selected
                if (select.options.length > 1) {
                    select.selectedIndex = 0;
                    document.getElementById('location').value = select.value;
                }
            }
        }

        function toggleLocationManager() {
            console.log('toggleLocationManager called');
            const manager = document.getElementById('locationManager');
            console.log('manager element:', manager);
            const isVisible = manager.style.display !== 'none';
            
            if (isVisible) {
                manager.style.display = 'none';
            } else {
                renderLocationList();
                manager.style.display = 'block';
            }
        }

        function renderLocationList() {
            console.log('renderLocationList called');
            const select = document.getElementById('locationSelect');
            const listContainer = document.getElementById('locationList');
            console.log('listContainer:', listContainer);
            
            const allLocations = [];
            for (let i = 0; i < select.options.length - 1; i++) {
                allLocations.push({ value: select.options[i].value, index: i });
            }
            console.log('allLocations:', allLocations);
            
            if (allLocations.length === 0) {
                listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 8px;">No locations available. Click "+ Add Custom Location" to add one.</div>';
                return;
            }
            
            listContainer.innerHTML = allLocations.map((loc, idx) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--card-bg); border-radius: 6px; margin-bottom: 6px;">
                    <span style="color: var(--text); font-size: 14px;">${escapeHTML(loc.value)}</span>
                    <button class="delete-location-btn" data-location="${escapeHTML(loc.value)}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500;">Delete</button>
                </div>
            `).join('');
            
            // Add event listeners to all delete buttons
            const deleteButtons = listContainer.querySelectorAll('.delete-location-btn');
            deleteButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    const locationName = this.getAttribute('data-location');
                    deleteLocationByName(locationName);
                });
            });
        }

        function deleteLocationByName(locationName) {
            console.log('=== deleteLocationByName called ===');
            console.log('locationName:', locationName);
            const select = document.getElementById('locationSelect');
            console.log('select element:', select);
            console.log('select.options.length:', select.options.length);
            
            // Log all current options
            for (let i = 0; i < select.options.length; i++) {
                console.log(`Option ${i}: "${select.options[i].value}"`);
            }
            
            if (!confirm(`Delete "${locationName}"?`)) {
                console.log('User cancelled');
                return;
            }
            
            console.log('User confirmed, finding location...');
            // Find and remove the option by value
            let found = false;
            for (let i = 0; i < select.options.length; i++) {
                console.log(`Checking option ${i}: "${select.options[i].value}" === "${locationName}"?`, select.options[i].value === locationName);
                if (select.options[i].value === locationName) {
                    console.log(`FOUND at index ${i}, removing...`);
                    select.remove(i);
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                console.error('Location not found!');
                alert('Error: Location not found');
                return;
            }
            
            console.log('Calling saveCustomLocations...');
            // Save updated list
            saveCustomLocations();
            
            console.log('Resetting selection...');
            // Reset selection to first option
            select.selectedIndex = 0;
            document.getElementById('location').value = select.value;
            
            console.log('Refreshing list...');
            // Refresh the list
            renderLocationList();
            console.log('=== deleteLocationByName complete ===');
        }

        function deleteLocation(index) {
            const select = document.getElementById('locationSelect');
            const locationName = select.options[index].value;
            deleteLocationByName(locationName);
        }

        function manageLocations() {
            const select = document.getElementById('locationSelect');
            const locations = [];
            const defaultLocations = ['Terwillegar Recreation Centre', 'Donnan', 'NAIT', 'ZerOne W.E.M.', 'Meadows Recreation Centre'];
            
            // Get all locations except "+ Add Custom Location"
            for (let i = 0; i < select.options.length - 1; i++) {
                const locValue = select.options[i].value;
                const isDefault = defaultLocations.includes(locValue);
                locations.push({
                    value: locValue,
                    isDefault: isDefault,
                    index: i
                });
            }

            if (locations.length === 0) {
                alert('No locations to manage');
                return;
            }

            let message = 'Current Locations:\n\n';
            locations.forEach((loc, i) => {
                const label = loc.isDefault ? ' (default)' : '';
                message += `${i + 1}. ${loc.value}${label}\n`;
            });
            message += '\nEnter the number of a CUSTOM location to DELETE\n(default locations cannot be deleted)\n\nPress Cancel to close:';

            const toDelete = prompt(message);
            
            if (toDelete === null) return;

            const userIndex = parseInt(toDelete) - 1;
            if (isNaN(userIndex) || userIndex < 0 || userIndex >= locations.length) {
                alert('Invalid selection');
                return;
            }

            const selectedLocation = locations[userIndex];
            
            if (selectedLocation.isDefault) {
                alert('Cannot delete default locations. Only custom locations can be removed.');
                return;
            }

            if (confirm(`Delete "${selectedLocation.value}"?`)) {
                // Remove from dropdown
                select.remove(selectedLocation.index);
                
                // Save updated list
                saveCustomLocations();
                
                // Reset selection
                select.selectedIndex = 0;
                document.getElementById('location').value = select.value;
                
                alert(`✓ Deleted "${selectedLocation.value}"`);
            }
        }

        // Load custom locations on page load

