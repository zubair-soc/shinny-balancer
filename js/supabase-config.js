// Staging project configuration. The publishable key is intended for browser use.
window.SKATE_MANAGER_CONFIG = Object.freeze({
  url: 'https://jabumqdjahkprjmntmkz.supabase.co',
  publishableKey: 'sb_publishable_Zcp8wGkFBcR67tR7GGXh2w_5ozRV1uB'
});

// Share one browser client across the five pages so auth state and API setup
// stay consistent throughout the app.
window.SKATE_MANAGER_CLIENT = window.supabase?.createClient(
  window.SKATE_MANAGER_CONFIG.url,
  window.SKATE_MANAGER_CONFIG.publishableKey
);

window.escapeHTML = function (value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
};

// JSON-encode values used as arguments inside inline HTML event handlers,
// then escape the resulting attribute text for the HTML parser.
window.inlineJSString = function (value) {
  return window.escapeHTML(JSON.stringify(String(value ?? '')));
};
