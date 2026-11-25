document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    dispositivos: new Map(),
    deleteId: null,
    filters: { q: '', id_dispositivo: '', activo: '' },
  };

  const statusNode = document.getElementById('at-status');
  const tbody = document.getElementById('at-tbody');
  const pageLabel = document.getElementById('at-page-label');
  const prevBtn = document.getElementById('at-prev');
  const nextBtn = document.getElementById('at-next');
  const formDialog = document.getElementById('at-form-dialog');
  const deleteDialog = document.getElementById('at-delete-dialog');
  const form = document.getElementById('at-form');
  const formError = document.getElementById('at-form-error');
  const formTitle = document.getElementById('at-form-title');
  const dispositivoSelect = document.getElementById('at-id-dispositivo');
  const filterDispositivo = document.getElementById('at-filter-dispositivo');

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function mapError(code) {
    const messages = {
      duplicate_token: 'Ya existe ese token.',
      invalid_token: 'Token inválido.',
      invalid_nombre: 'Nombre inválido.',
      invalid_id_dispositivo: 'Dispositivo inválido.',
      invalid_expira_en: 'Fecha de expiración inválida.',
      invalid_activo: 'Estado activo inválido.',
      invalid_autorizacion_token: 'Datos del token inválidos.',
      record_in_use: 'El token está en uso y no se puede eliminar.',
      not_found: 'Registro no encontrado.',
      unauthorized: 'Sesión no válida.',
    };
    return messages[code] || 'No se pudo completar la operación.';
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
  }

  function dispositivoLabel(id) {
    if (id == null) {
      return '—';
    }
    const dispositivo = state.dispositivos.get(Number(id));
    if (!dispositivo) {
      return `#${id}`;
    }
    return dispositivo.NOMBRE;
  }

  function formatDateTime(value) {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString('es-MX', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  function toDatetimeLocal(iso) {
    if (!iso) {
      return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fromDatetimeLocal(value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
      return null;
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }

  function maskToken(token) {
    const value = String(token ?? '');
    if (value.length <= 12) {
      return value;
    }
    return `${value.slice(0, 8)}…${value.slice(-4)}`;
  }

  function generateToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function fillDispositivoOptions(select, blankLabel) {
    const previous = select.value;
    const rows = [...state.dispositivos.values()]
      .sort((a, b) => a.NOMBRE.localeCompare(b.NOMBRE, 'es'));
    select.innerHTML = '';
    if (blankLabel) {
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = blankLabel;
      select.appendChild(blank);
    }
    rows.forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.ID);
      option.textContent = row.NOMBRE;
      select.appendChild(option);
    });
    if (previous && [...select.options].some((option) => option.value === previous)) {
      select.value = previous;
    }
  }

  function fillFilterDispositivo() {
    const previous = filterDispositivo.value || state.filters.id_dispositivo;
    fillDispositivoOptions(filterDispositivo, 'Todos');
    if (previous && [...filterDispositivo.options].some((option) => option.value === previous)) {
      filterDispositivo.value = previous;
    }
  }

  function openForm(row) {
    showFormError('');
    form.reset();
    document.getElementById('at-activo').checked = true;
    document.getElementById('at-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar token' : 'Nuevo token';
    fillDispositivoOptions(dispositivoSelect, 'Sin dispositivo');

    if (row) {
      document.getElementById('at-nombre').value = row.NOMBRE || '';
      document.getElementById('at-token').value = row.TOKEN || '';
      dispositivoSelect.value = row.ID_DISPOSITIVO == null ? '' : String(row.ID_DISPOSITIVO);
      document.getElementById('at-expira-en').value = toDatetimeLocal(row.EXPIRA_EN);
      document.getElementById('at-activo').checked = Boolean(row.ACTIVO);
    } else {
      document.getElementById('at-token').value = generateToken();
    }

    formDialog.showModal();
  }

  function closeForm() {
    if (formDialog.open) {
      formDialog.close();
    }
  }

  function renderRows(rows) {
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-muted-foreground">Sin registros.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => `
      <tr data-id="${row.ID}">
        <td>${escapeHtml(row.NOMBRE)}</td>
        <td class="font-mono text-xs" title="${escapeHtml(row.TOKEN)}">${escapeHtml(maskToken(row.TOKEN))}</td>
        <td>${escapeHtml(dispositivoLabel(row.ID_DISPOSITIVO))}</td>
        <td>${escapeHtml(formatDateTime(row.EXPIRA_EN))}</td>
        <td>${escapeHtml(formatDateTime(row.ULTIMO_USO_EN))}</td>
        <td>
          <span class="ui-badge ${row.ACTIVO ? 'ui-badge-secondary' : 'ui-badge-outline'}">
            ${row.ACTIVO ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td class="text-right">
          <div class="inline-flex gap-2">
            <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-action="edit">Editar</button>
            <button type="button" class="ui-btn ui-btn-destructive ui-btn-sm" data-action="delete">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function updatePager() {
    const pages = Math.max(1, Math.ceil(state.total / state.items) || 1);
    pageLabel.textContent = state.total
      ? `Página ${state.page} de ${pages} · ${state.total} registro(s)`
      : '';
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= pages || state.total === 0;
  }

  function buildListUrl() {
    const params = new URLSearchParams({
      page: String(state.page),
      items: String(state.items),
    });
    if (state.filters.q) {
      params.set('q', state.filters.q);
    }
    if (state.filters.id_dispositivo) {
      params.set('id_dispositivo', state.filters.id_dispositivo);
    }
    if (state.filters.activo) {
      params.set('activo', state.filters.activo);
    }
    return `/autorizacion-tokens?${params}`;
  }

  function readFilters() {
    state.filters.q = document.getElementById('at-filter-q').value.trim();
    state.filters.id_dispositivo = filterDispositivo.value;
    state.filters.activo = document.getElementById('at-filter-activo').value;
  }

  async function loadList() {
    statusNode.textContent = 'Cargando…';
    const result = await window.PackingApi.request(buildListUrl());
    if (!result.ok) {
      statusNode.textContent = 'Error al cargar';
      tbody.innerHTML = '<tr><td colspan="7" class="text-destructive">No se pudo obtener el catálogo.</td></tr>';
      window.PackingToast.toast(mapError(result.error), 'error');
      if (result.status === 401) {
        window.location.replace('/login');
      }
      return;
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    state.total = result.metadata.total ?? rows.length;
    statusNode.textContent = `${state.total} registro(s)`;
    renderRows(rows);
    updatePager();
  }

  async function preloadDispositivos() {
    const result = await window.PackingApi.request('/dispositivos?items=100');
    if (!result.ok) {
      throw new Error('catalogs');
    }
    (Array.isArray(result.data) ? result.data : []).forEach((row) => {
      state.dispositivos.set(row.ID, row);
    });
    fillFilterDispositivo();
  }

  document.getElementById('at-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('at-form-cancel').addEventListener('click', closeForm);

  document.getElementById('at-token-generate').addEventListener('click', () => {
    document.getElementById('at-token').value = generateToken();
  });

  document.getElementById('at-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });

  document.getElementById('at-filters-clear').addEventListener('click', async () => {
    document.getElementById('at-filters').reset();
    state.filters = { q: '', id_dispositivo: '', activo: '' };
    state.page = 1;
    await loadList();
  });

  document.getElementById('at-delete-cancel').addEventListener('click', () => {
    state.deleteId = null;
    if (deleteDialog.open) {
      deleteDialog.close();
    }
  });

  prevBtn.addEventListener('click', async () => {
    if (state.page <= 1) {
      return;
    }
    state.page -= 1;
    await loadList();
  });

  nextBtn.addEventListener('click', async () => {
    const pages = Math.max(1, Math.ceil(state.total / state.items) || 1);
    if (state.page >= pages) {
      return;
    }
    state.page += 1;
    await loadList();
  });

  tbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }
    const row = button.closest('tr[data-id]');
    if (!row) {
      return;
    }
    const id = Number(row.dataset.id);
    const action = button.dataset.action;

    if (action === 'edit') {
      const result = await window.PackingApi.request(`/autorizacion-tokens/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      openForm(result.data);
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('at-delete-text').textContent =
        `¿Eliminar el token ${row.children[0].textContent}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('at-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/autorizacion-tokens/${id}`, {
      method: 'DELETE',
    });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    deleteDialog.close();
    window.PackingToast.toast('Token eliminado');
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');

    const idValue = document.getElementById('at-id').value;
    const dispositivoValue = dispositivoSelect.value.trim();
    const expiraLocal = document.getElementById('at-expira-en').value;
    const expiraEn = fromDatetimeLocal(expiraLocal);
    if (expiraLocal.trim() && expiraEn === null) {
      showFormError(mapError('invalid_expira_en'));
      return;
    }

    const payload = {
      NOMBRE: document.getElementById('at-nombre').value.trim(),
      TOKEN: document.getElementById('at-token').value.trim(),
      ID_DISPOSITIVO: dispositivoValue === '' ? null : Number(dispositivoValue),
      EXPIRA_EN: expiraEn,
      ACTIVO: document.getElementById('at-activo').checked,
    };
    const submit = document.getElementById('at-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/autorizacion-tokens/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/autorizacion-tokens', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      if (!result.ok) {
        showFormError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }

      closeForm();
      window.PackingToast.toast(idValue ? 'Token actualizado' : 'Token creado');
      if (!idValue) {
        state.page = 1;
      }
      await loadList();
    } catch {
      showFormError('Error de red.');
      window.PackingToast.toast('Error de red', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  try {
    await preloadDispositivos();
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('Error de red', 'error');
  }
});
