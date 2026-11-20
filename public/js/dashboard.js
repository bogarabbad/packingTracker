document.addEventListener('DOMContentLoaded', async () => {
  const logoutBtn = document.getElementById('btn-logout');
  const sessionUser = document.getElementById('session-user');

  if (!window.PackingApi.isAuthenticated()) {
    window.location.replace('/login');
    return;
  }

  const usuario = window.PackingApi.getUsuario();
  if (usuario && sessionUser) {
    sessionUser.textContent = `${usuario.CODIGO} · ${usuario.NOMBRE}`;
    sessionUser.classList.remove('hidden');
  }

  logoutBtn.addEventListener('click', () => {
    window.PackingApi.logout();
    window.location.assign('/login');
  });

  function fillStat(containerId, total, label) {
    const node = document.getElementById(containerId);
    if (!node) {
      return;
    }
    node.innerHTML = `
      <p class="text-3xl font-semibold tabular-nums">${total}</p>
      <p class="mt-1 text-xs text-muted-foreground">${label}</p>
    `;
  }

  async function loadStats() {
    const [tipos, unidades, lotes] = await Promise.all([
      window.PackingApi.request('/lotes-tipos?items=1'),
      window.PackingApi.request('/unidades-medida?items=1'),
      window.PackingApi.request('/lotes?items=1'),
    ]);

    if (!tipos.ok || !unidades.ok || !lotes.ok) {
      window.PackingToast.toast('No se pudieron cargar las métricas', 'error');
      return;
    }

    fillStat('stat-lotes-tipos', tipos.metadata.total ?? 0, 'registros');
    fillStat('stat-unidades', unidades.metadata.total ?? 0, 'registros');
    fillStat('stat-lotes', lotes.metadata.total ?? 0, 'registros');
  }

  async function loadReferencias() {
    const status = document.getElementById('refs-status');
    const tbody = document.getElementById('refs-tbody');
    status.textContent = 'Cargando…';

    const result = await window.PackingApi.request('/referencias-tipos?items=50');
    if (!result.ok) {
      status.textContent = 'Error al cargar';
      tbody.innerHTML = '<tr><td colspan="4" class="text-destructive">No se pudo obtener el catálogo.</td></tr>';
      window.PackingToast.toast('Error al cargar referencias', 'error');
      return;
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    status.textContent = `${result.metadata.total ?? rows.length} registro(s)`;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted-foreground">Sin registros.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${row.ID}</td>
        <td>${row.CODIGO}</td>
        <td>${row.NOMBRE}</td>
        <td>
          <span class="ui-badge ${row.ACTIVO ? 'ui-badge-secondary' : 'ui-badge-outline'}">
            ${row.ACTIVO ? 'Activo' : 'Inactivo'}
          </span>
        </td>
      </tr>
    `).join('');
  }

  try {
    await Promise.all([loadStats(), loadReferencias()]);
  } catch {
    window.PackingToast.toast('Error de red', 'error');
  }
});
