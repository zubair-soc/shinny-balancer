(function () {
  function applyTheme(theme) {
    const dark = theme === 'dark';
    document.body.classList.toggle('dark-mode', dark);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    const button = document.getElementById('accountThemeButton');
    if (button) button.textContent = dark ? 'Use light' : 'Use dark';
  }

  window.toggleAccountTheme = function () {
    const next = localStorage.getItem('theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  };

  applyTheme(localStorage.getItem('theme') || 'light');
})();
