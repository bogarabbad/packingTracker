(() => {
  const SIDEBAR_KEY = 'packingTracker.sidebarOpen';

  function requireAuth() {
    if (!window.PackingApi || !window.PackingApi.isAuthenticated()) {
      window.location.replace('/login');
      return false;
    }
    return true;
  }

  function bindSession() {
    const sessionUser = document.getElementById('session-user');
    const logoutBtn = document.getElementById('btn-logout');
    const usuario = window.PackingApi.getUsuario();

    if (usuario && sessionUser) {
      sessionUser.textContent = `${usuario.CODIGO} · ${usuario.NOMBRE}`;
      sessionUser.classList.remove('hidden');
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        window.PackingApi.logout();
        window.location.assign('/login');
      });
    }
  }

  function isDesktop() {
    return window.matchMedia('(min-width: 1024px)').matches;
  }

  function readStoredOpen() {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored === 'true') {
      return true;
    }
    if (stored === 'false') {
      return false;
    }
    return isDesktop();
  }

  function bindDialogLightDismiss() {
    document.addEventListener('click', (event) => {
      const dialog = event.target;
      if (!(dialog instanceof HTMLDialogElement) || !dialog.open) {
        return;
      }
      dialog.close();
    });
  }

  function bindSidebar() {
    const app = document.querySelector('.ui-app');
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const toggle = document.getElementById('btn-sidebar-toggle');

    if (!app || !sidebar || !toggle) {
      return;
    }

    function setOpen(open) {
      sidebar.classList.toggle('is-open', open);
      app.classList.toggle('sidebar-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Ocultar menú' : 'Mostrar menú');
      if (backdrop) {
        backdrop.hidden = !open || isDesktop();
      }
      document.body.classList.toggle('overflow-hidden', open && !isDesktop());
      window.localStorage.setItem(SIDEBAR_KEY, open ? 'true' : 'false');
    }

    setOpen(readStoredOpen());

    toggle.addEventListener('click', () => {
      setOpen(!sidebar.classList.contains('is-open'));
    });

    if (backdrop) {
      backdrop.addEventListener('click', () => setOpen(false));
    }

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar.classList.contains('is-open') && !isDesktop()) {
        setOpen(false);
      }
    });

    window.addEventListener('resize', () => {
      const open = sidebar.classList.contains('is-open');
      if (backdrop) {
        backdrop.hidden = !open || isDesktop();
      }
      document.body.classList.toggle('overflow-hidden', open && !isDesktop());
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) {
      return;
    }
    bindSession();
    bindSidebar();
    bindDialogLightDismiss();
  });

  window.PackingShell = {
    requireAuth,
  };
})();
