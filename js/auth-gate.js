(function () {
  if (!window.SKATE_MANAGER_CONFIG || !window.SKATE_MANAGER_CLIENT) {
    document.documentElement.innerHTML = '<body style="font:16px system-ui;padding:2rem">Unable to load the Skate Manager sign-in service. Refresh the page and try again.</body>';
    return;
  }

  const authClient = window.SKATE_MANAGER_CLIENT;
  const style = document.createElement('style');
  style.textContent = `
    #sm-auth-gate { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 20px; background: #0f172a; color: #f8fafc; font: 16px system-ui, sans-serif; }
    #sm-auth-gate[hidden] { display: none; }
    #sm-auth-gate .sm-auth-card { width: min(100%, 380px); padding: 28px; border: 1px solid #334155; border-radius: 16px; background: #1e293b; box-shadow: 0 24px 70px #02061799; }
    #sm-auth-gate h1 { margin: 0 0 8px; font-size: 24px; }
    #sm-auth-gate p { margin: 0 0 22px; color: #cbd5e1; line-height: 1.5; }
    #sm-auth-gate label { display: block; margin: 14px 0 6px; font-size: 14px; font-weight: 600; }
    #sm-auth-gate input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #475569; border-radius: 8px; background: #0f172a; color: #f8fafc; font: inherit; }
    #sm-auth-gate button { width: 100%; margin-top: 18px; padding: 12px; border: 0; border-radius: 8px; background: #10b981; color: #052e24; font: inherit; font-weight: 700; cursor: pointer; }
    #sm-auth-gate button:disabled { opacity: .65; cursor: wait; }
    #sm-auth-error { min-height: 1.4em; margin-top: 12px; color: #fca5a5; font-size: 14px; }
    #sm-auth-status { color: #cbd5e1; }
    #sm-sign-out { position: static; flex: 0 0 auto; margin-left: 12px; padding: 9px 12px; border: 1px solid #94a3b8; border-radius: 8px; background: #0f172a; color: white; font: 13px system-ui, sans-serif; cursor: pointer; }
  `;
  style.textContent += `
    html:not([data-skate-role='admin']) [data-admin-only],
    html:not([data-benchapp-owner='true']) [data-benchapp-owner-only],
    html:not([data-skate-role='admin']) #createSkateButton,
    html:not([data-skate-role='admin']) #editSkateButton,
    html:not([data-skate-role='admin']) #deleteSkateButton { display: none !important; }
    html:not([data-skate-role='skate_manager']) [data-skate-manager-only] { display: none !important; }
    [hidden] { display: none !important; }
    @media (max-width: 700px) { #sm-sign-out { align-self: flex-end; margin: 0; } }
  `;
  document.head.appendChild(style);

  const gate = document.createElement('div');
  gate.id = 'sm-auth-gate';
  gate.innerHTML = `
    <form class="sm-auth-card" id="sm-auth-form">
      <h1>Skate Manager</h1>
      <p>Sign in with your Skate Manager account.</p>
      <label for="sm-auth-email">Email</label>
      <input id="sm-auth-email" name="email" type="email" autocomplete="username" required>
      <label for="sm-auth-password">Password</label>
      <input id="sm-auth-password" name="password" type="password" autocomplete="current-password" required>
      <button id="sm-auth-submit" type="submit">Sign in</button>
      <div id="sm-auth-error" role="alert"></div>
      <div id="sm-auth-status" aria-live="polite">Checking sign-in…</div>
    </form>`;
  document.body.appendChild(gate);

  const form = gate.querySelector('#sm-auth-form');
  const submit = gate.querySelector('#sm-auth-submit');
  const errorBox = gate.querySelector('#sm-auth-error');
  const status = gate.querySelector('#sm-auth-status');

  function applyAdminVisibility(user) {
    const appMetadata = user && user.app_metadata ? user.app_metadata : {};
    const roles = Array.isArray(appMetadata.roles) ? appMetadata.roles : [];
    const isAdmin = appMetadata.role === 'admin' || roles.includes('admin');
    const isSkateManager = appMetadata.role === 'skate_manager' || roles.includes('skate_manager');
    const isBenchAppOwner = isAdmin && String(user?.email || '').trim().toLowerCase() === 'zubair@shinnyofchampions.com';
    const role = isAdmin ? 'admin' : isSkateManager ? 'skate_manager' : null;
    window.SKATE_MANAGER_ROLE = role;
    window.SKATE_MANAGER_EMAIL = String(user?.email || '').trim().toLowerCase();
    window.SKATE_MANAGER_CAN_MANAGE_BENCHAPP = isBenchAppOwner;
    document.documentElement.dataset.skateRole = role || 'unassigned';
    document.documentElement.dataset.benchappOwner = String(isBenchAppOwner);
    document.querySelectorAll('[data-admin-only]').forEach((element) => { element.hidden = !isAdmin; });
    document.querySelectorAll('[data-skate-manager-only]').forEach((element) => { element.hidden = !isSkateManager; });
    document.querySelectorAll('[data-benchapp-owner-only]').forEach((element) => { element.hidden = !isBenchAppOwner; });
    if (!role) {
      gate.hidden = false;
      status.textContent = 'Your account is signed in, but an Admin or Skate Manager role has not been assigned yet.';
      return false;
    }
    if (document.body.dataset.adminPage === 'true' && !isAdmin) {
      location.replace('index.html');
      return false;
    }
    if (document.body.dataset.managerPage === 'true' && !isAdmin && !isSkateManager) {
      location.replace('index.html');
      return false;
    }
    document.dispatchEvent(new CustomEvent('skate-manager:role-ready', { detail: { role } }));
    return true;
  }

  window.isSkateAdmin = () => window.SKATE_MANAGER_ROLE === 'admin';
  window.isSkateManager = () => window.SKATE_MANAGER_ROLE === 'skate_manager';
  window.canManageBenchApp = () => window.SKATE_MANAGER_CAN_MANAGE_BENCHAPP === true;

  function addSignOut() {
    if (document.getElementById('sm-sign-out')) return;
    const button = document.createElement('button');
    button.id = 'sm-sign-out';
    button.type = 'button';
    button.textContent = 'Sign out';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Signing out…';
      try {
        const { error } = await authClient.auth.signOut({ scope: 'local' });
        if (error) throw error;

        const { data, error: sessionError } = await authClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (data.session) throw new Error('The local session is still active.');

        window.SKATE_MANAGER_ROLE = null;
        window.SKATE_MANAGER_EMAIL = '';
        window.SKATE_MANAGER_CAN_MANAGE_BENCHAPP = false;
        location.replace('index.html');
      } catch (error) {
        console.error('Sign-out failed:', error);
        button.disabled = false;
        button.textContent = 'Sign out failed — retry';
      }
    });
    const appNav = document.querySelector('.app-nav');
    (appNav || document.body).appendChild(button);
  }

  authClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      status.textContent = 'Could not check your sign-in. Try refreshing.';
      return;
    }
    if (data.session) {
      if (!applyAdminVisibility(data.session.user)) return;
      gate.hidden = true;
      addSignOut();
      return;
    }
    status.textContent = 'Use your Skate Manager account to continue.';
  }).catch(() => {
    status.textContent = 'Could not connect. Check your internet and refresh.';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const { error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) {
      errorBox.textContent = 'Sign-in failed. Check your email and password.';
      submit.disabled = false;
      submit.textContent = 'Sign in';
      return;
    }
    location.reload();
  });
})();
