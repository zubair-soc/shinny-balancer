(function () {
  if (!window.SKATE_MANAGER_CONFIG || !window.SKATE_MANAGER_CLIENT) {
    document.documentElement.innerHTML = '<body style="font:16px system-ui;padding:2rem">Unable to load the Skate Manager sign-in service. Refresh the page and try again.</body>';
    return;
  }

  const authClient = window.SKATE_MANAGER_CLIENT;
  const storedTheme = localStorage.getItem('theme') || 'light';
  document.body.classList.toggle('dark-mode', storedTheme === 'dark');
  if (storedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
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

  function navigationIcon(name) {
    const icons = {
      home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9.5 20v-6h5v6"/></svg>',
      players: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM16 11a3 3 0 0 0 0-6M17 14a4 4 0 0 1 4 4v2"/></svg>',
      credits: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></svg>',
      account: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>'
    };
    return icons[name] || '';
  }

  function setupNavigation(user) {
    const page = location.pathname.split('/').pop() || 'index.html';
    const isAdmin = window.isSkateAdmin();
    const creditsHref = isAdmin ? 'credits.html' : 'manager-credits.html';
    const activeSection = ['index.html', 'balancer.html', ''].includes(page)
      ? 'home'
      : page === 'database.html'
        ? 'players'
        : ['credits.html', 'manager-credits.html'].includes(page)
          ? 'credits'
          : 'account';
    const items = [
      { key: 'home', label: 'Home', href: 'index.html' },
      { key: 'players', label: 'Players', href: 'database.html' },
      { key: 'credits', label: 'Credits', href: creditsHref },
      { key: 'account', label: 'Account', href: 'account.html' }
    ];
    const linkMarkup = (item, bottom = false) => {
      const active = item.key === activeSection;
      const className = bottom ? 'app-bottom-link' : 'app-nav-link';
      return `<a class="${className}${active ? ' is-active' : ''}" href="${item.href}"${active ? ' aria-current="page"' : ''}>${bottom ? `<span class="app-bottom-icon">${navigationIcon(item.key)}</span>` : ''}<span>${item.label}</span></a>`;
    };

    document.querySelectorAll('.app-nav-links').forEach((links) => {
      links.innerHTML = items.map((item) => linkMarkup(item)).join('');
    });

    let bottomNav = document.querySelector('.app-bottom-nav');
    if (!bottomNav) {
      bottomNav = document.createElement('nav');
      bottomNav.className = 'app-bottom-nav';
      bottomNav.setAttribute('aria-label', 'App');
      document.body.appendChild(bottomNav);
    }
    bottomNav.innerHTML = items.map((item) => linkMarkup(item, true)).join('');
    document.body.classList.add('has-bottom-nav');

    const email = document.getElementById('accountEmail');
    const role = document.getElementById('accountRole');
    if (email) email.textContent = String(user?.email || '');
    if (role) role.textContent = isAdmin ? 'Admin' : 'Skate Manager';
  }

  function addSignOut() {
    if (document.getElementById('sm-sign-out')) return;
    const slot = document.getElementById('accountSignOutSlot');
    if (!slot) return;
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
    slot.appendChild(button);
  }

  authClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      status.textContent = 'Could not check your sign-in. Try refreshing.';
      return;
    }
    if (data.session) {
      if (!applyAdminVisibility(data.session.user)) return;
      setupNavigation(data.session.user);
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
