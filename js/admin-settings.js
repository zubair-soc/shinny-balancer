(() => {
  const client = window.SKATE_MANAGER_CLIENT;
  const form = document.getElementById('parkingCodeForm');
  const input = document.getElementById('naitParkingCode');
  const saveButton = document.getElementById('saveParkingCode');
  const status = document.getElementById('parkingCodeStatus');

  function setStatus(message, type = '') {
    status.textContent = message;
    status.classList.toggle('is-error', type === 'error');
    status.classList.toggle('is-success', type === 'success');
  }

  function isAdmin(user) {
    const metadata = user?.app_metadata || {};
    return metadata.role === 'admin' || (Array.isArray(metadata.roles) && metadata.roles.includes('admin'));
  }

  async function initialize() {
    if (!client) {
      setStatus('Could not connect to the settings service. Refresh and try again.', 'error');
      return;
    }

    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError || !session) {
      setStatus('Sign in with your Skate Manager account to continue.', 'error');
      return;
    }
    if (!isAdmin(session.user)) {
      document.querySelector('.admin-settings-page').innerHTML = '<h1>Admin access required</h1><p>Only an admin can change skate settings.</p>';
      return;
    }

    const { data, error } = await client.from('app_settings').select('value').eq('key', 'nait_parking_code').maybeSingle();
    if (error) {
      console.error('Unable to load NAIT parking code:', error);
      setStatus('Settings are not set up yet. Run the NAIT parking settings SQL in your Skate Manager Supabase project.', 'error');
      return;
    }

    input.value = data?.value || '';
    input.disabled = false;
    saveButton.disabled = false;
    setStatus(input.value ? 'Saved code is ready for NAIT skate posts.' : 'No code saved yet. Add the current code to enable NAIT skate posts.');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      setStatus('Enter a parking code before saving.', 'error');
      input.focus();
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    const { error } = await client.from('app_settings').upsert({
      key: 'nait_parking_code',
      value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

    saveButton.disabled = false;
    saveButton.textContent = 'Save code';
    if (error) {
      console.error('Unable to save NAIT parking code:', error);
      setStatus('Could not save the code. Check your sign-in and Supabase settings.', 'error');
      return;
    }
    setStatus('Parking code saved. It will be included on WhatsApp copies for NAIT skates.', 'success');
  });

  initialize().catch((error) => {
    console.error('Could not initialize admin settings:', error);
    setStatus('Could not load settings. Refresh and try again.', 'error');
  });
})();
