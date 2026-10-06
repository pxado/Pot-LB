(() => {
  const state = { session: null };

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (state.session?.csrfToken && options.method && options.method !== 'GET') {
      headers.set('X-CSRF-Token', state.session.csrfToken);
    }
    const response = await fetch(path, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(payload?.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function loadSession() {
    if (state.session) return state.session;
    try {
      state.session = await api('/api/session');
      return state.session;
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/login');
        return null;
      }
      throw error;
    }
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
    } finally {
      state.session = null;
      window.location.replace('/login');
    }
  }

  function formatRole(role) {
    return String(role || '').split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }

  function formatDate(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  window.Fox = { state, api, loadSession, logout, formatRole, formatDate };
})();
