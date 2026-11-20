(() => {
  const TOKEN_KEY = 'packingTracker.accessToken';
  const USER_KEY = 'packingTracker.usuario';

  function getToken() {
    return window.localStorage.getItem(TOKEN_KEY);
  }

  function getUsuario() {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function setSession(payload) {
    window.localStorage.setItem(TOKEN_KEY, payload.access_token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(payload.usuario));
  }

  function clearSession() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  }

  function isAuthenticated() {
    return Boolean(getToken());
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const token = getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(path, {
      ...options,
      headers,
    });

    let envelope = null;
    const text = await response.text();
    if (text) {
      try {
        envelope = JSON.parse(text);
      } catch {
        envelope = null;
      }
    }

    if (response.status === 401) {
      const code = envelope && envelope.error && envelope.error.error;
      if (code !== 'invalid_credentials') {
        clearSession();
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data: envelope ? envelope.data : null,
      metadata: envelope ? envelope._metadata : {},
      error: envelope && envelope.error ? envelope.error.error : null,
      envelope,
    };
  }

  async function login(codigo, contrasena) {
    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        CODIGO: codigo,
        CONTRASENA: contrasena,
      }),
    });

    if (result.ok && result.data) {
      setSession(result.data);
    }

    return result;
  }

  function logout() {
    clearSession();
  }

  window.PackingApi = {
    request,
    login,
    logout,
    getToken,
    getUsuario,
    isAuthenticated,
    clearSession,
  };
})();
