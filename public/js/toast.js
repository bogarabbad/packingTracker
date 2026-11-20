(() => {
  function ensureViewport() {
    let viewport = document.getElementById('toast-viewport');
    if (!viewport) {
      viewport = document.createElement('div');
      viewport.id = 'toast-viewport';
      viewport.className = 'ui-toast-viewport';
      viewport.setAttribute('aria-live', 'polite');
      document.body.appendChild(viewport);
    }
    return viewport;
  }

  function toast(message, variant = 'success') {
    const viewport = ensureViewport();
    const node = document.createElement('div');
    node.className = `ui-toast ui-toast-${variant === 'error' ? 'error' : 'success'}`;
    node.textContent = message;
    viewport.appendChild(node);
    window.setTimeout(() => {
      node.remove();
    }, 3200);
  }

  window.PackingToast = { toast };
})();
