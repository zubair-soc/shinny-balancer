(function () {
    const SETTINGS_ID = 1;
    const AUTO_SYNC_INTERVAL = 60 * 60 * 1000;
    let syncSettings = null;
    let syncInProgress = false;

    function getStatusElement() {
        return document.getElementById('benchAppSyncStatus');
    }

    function setStatus(message, isError = false) {
        const status = getStatusElement();
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('is-error', isError);
    }

    function validBenchAppUrl(value) {
        try {
            const url = new URL(value.trim());
            return url.protocol === 'https:' && url.hostname === 'ics.benchapp.com';
        } catch {
            return false;
        }
    }

    async function loadBenchAppSettings() {
        const { data, error } = await supabaseClient
            .from('benchapp_sync_settings')
            .select('id, feed_url, updated_at')
            .eq('id', SETTINGS_ID)
            .maybeSingle();
        if (error) throw error;
        syncSettings = data;
        return data;
    }

    window.openBenchAppSettings = async function () {
        try {
            if (!syncSettings) await loadBenchAppSettings();
            const input = document.getElementById('benchAppFeedUrl');
            input.value = syncSettings?.feed_url || '';
            document.getElementById('benchAppSettingsModal').classList.add('active');
        } catch (error) {
            console.error('Could not load BenchApp settings:', error);
            alert('Could not load the BenchApp calendar settings. Make sure the database update has been applied.');
        }
    };

    window.closeBenchAppSettings = function () {
        document.getElementById('benchAppSettingsModal').classList.remove('active');
    };

    window.saveBenchAppSettings = async function () {
        const input = document.getElementById('benchAppFeedUrl');
        const feedUrl = input.value.trim();
        if (!validBenchAppUrl(feedUrl)) {
            alert('Paste the HTTPS link from BenchApp’s “Copy ICS Link” option.');
            return;
        }
        const button = document.getElementById('saveBenchAppSettingsButton');
        button.disabled = true;
        try {
            const { data, error } = await supabaseClient
                .from('benchapp_sync_settings')
                .upsert({ id: SETTINGS_ID, feed_url: feedUrl, updated_at: new Date().toISOString() })
                .select('id, feed_url, updated_at')
                .single();
            if (error) throw error;
            syncSettings = data;
            closeBenchAppSettings();
            setStatus('Calendar link saved');
            await syncBenchAppNow();
        } catch (error) {
            console.error('Could not save BenchApp settings:', error);
            alert('Could not save the calendar link. Make sure the database update has been applied.');
        } finally {
            button.disabled = false;
        }
    };

    window.syncBenchAppNow = async function ({ silent = false } = {}) {
        if (syncInProgress) return;
        syncInProgress = true;
        const button = document.getElementById('benchAppSyncButton');
        if (button) button.disabled = true;
        if (!silent) setStatus('Syncing BenchApp…');
        try {
            if (!syncSettings) await loadBenchAppSettings();
            if (!syncSettings?.feed_url) {
                if (!silent) openBenchAppSettings();
                return;
            }
            const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
            if (sessionError || !sessionData.session) throw new Error('Sign in again to sync the calendar.');

            const response = await fetch('/api/benchapp-sync', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${sessionData.session.access_token}`
                },
                body: JSON.stringify({ feedUrl: syncSettings.feed_url })
            });
            const responseText = await response.text();
            let result = {};
            try {
                result = responseText ? JSON.parse(responseText) : {};
            } catch {
                console.error('BenchApp sync endpoint returned a non-JSON response:', response.status, responseText.slice(0, 500));
                if (response.status === 404) {
                    throw new Error('The sync endpoint was not found on this Vercel deployment (404).');
                }
                throw new Error(`The sync endpoint returned an unexpected response (HTTP ${response.status}).`);
            }
            if (!response.ok) throw new Error(result.error || 'BenchApp sync failed.');

            localStorage.setItem('benchappLastSyncAt', String(Date.now()));
            await loadSkates();
            const summary = `${result.newCount} new · ${result.updatedCount} updated · ${result.archivedCount} removed`;
            setStatus(`Synced ${summary}`);
            if (!silent) alert(`BenchApp calendar synced.\n${result.newCount} new · ${result.updatedCount} updated · ${result.archivedCount} removed from active skates.`);
        } catch (error) {
            console.error('BenchApp sync failed:', error);
            setStatus(error.message || 'BenchApp sync failed', true);
            if (!silent) alert(error.message || 'BenchApp sync failed.');
        } finally {
            syncInProgress = false;
            if (button) button.disabled = false;
        }
    };

    window.syncBenchAppOnOpen = async function () {
        try {
            await loadBenchAppSettings();
            const lastSync = Number(localStorage.getItem('benchappLastSyncAt') || 0);
            if (syncSettings?.feed_url && Date.now() - lastSync > AUTO_SYNC_INTERVAL) {
                await syncBenchAppNow({ silent: true });
            }
        } catch (error) {
            // Keep the skate list available if calendar sync or its migration is unavailable.
            console.warn('Automatic BenchApp sync skipped:', error.message);
        }
    };
})();
