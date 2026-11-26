document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    ubicaciones: new Map(),
    deleteId: null,
    filters: { q: '', ubicacion_id: '', activo: '' },
  };

  const statusNode = document.getElementById('us-status');
  const tbody = document.getElementById('us-tbody');
  const pageLabel = document.getElementById('us-page-label');
  const prevBtn = document.getElementById('us-prev');
  const nextBtn = document.getElementById('us-next');
  const formDialog = document.getElementById('us-form-dialog');
  const deleteDialog = document.getElementById('us-delete-dialog');
  const form = document.getElementById('us-form');
  const formError = document.getElementById('us-form-error');
  const formTitle = document.getElementById('us-form-title');
  const ubicacionSelect = document.getElementById('us-ubicacion');
  const filterUbicacion = document.getElementById('us-filter-ubicacion');
  const contrasenaInput = document.getElementById('us-contrasena');
  const contrasenaHint = document.getElementById('us-contrasena-hint');

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
      duplicate_codigo: 'Ya existe un usuario con ese código.',
      invalid_codigo: 'Código inválido.',
      invalid_nombre: 'Nombre inválido.',
      invalid_contrasena: 'Contraseña inválida.',
      invalid_ubicacion_id: 'Ubicación inválida.',
      invalid_activo: 'Estado activo inválido.',
      seed_not_deletable: 'Este registro no se puede eliminar.',
      record_in_use: 'El usuario está en uso y no se puede eliminar.',
      not_found: 'Registro no encontrado.',
      unauthorized: 'Sesión no válida.',
    };
    return messages[code] || 'No se pudo completar la operación.';
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
  }

  function ubicacionLabel(id) {
    if (id == null) {
      return '—';
    }
    const ubicacion = state.ubicaciones.get(Number(id));
    if (!ubicacion) {
      return `#${id}`;
    }
    return `${ubicacion.CODIGO} · ${ubicacion.NOMBRE}`;
  }

  function fillUbicacionOptions(select, { blankLabel, onlyActivos }) {
    const previous = select.value;
    let rows = [...state.ubicaciones.values()];
    if (onlyActivos) {
      rows = rows.filter((row) => row.ACTIVO);
    }
    rows.sort((a, b) => a.CODIGO.localeCompare(b.CODIGO, 'es'));

    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = blankLabel;
    select.appendChild(blank);

    rows.forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.ID);
      option.textContent = `${row.CODIGO} · ${row.NOMBRE}`;
      select.appendChild(option);
    });

    if (previous && [...select.options].some((option) => option.value === previous)) {
      select.value = previous;
    }
  }

  function refreshUbicacionSelects() {
    fillUbicacionOptions(ubicacionSelect, {
      blankLabel: 'Sin ubicación',
      onlyActivos: true,
    });
    fillUbicacionOptions(filterUbicacion, {
      blankLabel: 'Todas',
      onlyActivos: false,
    });
    if (state.filters.ubicacion_id) {
      filterUbicacion.value = state.filters.ubicacion_id;
    }
  }

  function syncSessionUsuario(user) {
    const current = window.PackingApi.getUsuario();
    if (!current || Number(current.ID) !== Number(user.ID)) {
      return;
    }
    window.localStorage.setItem(
      'packingTracker.usuario',
      JSON.stringify({
        ID: Number(user.ID),
        CODIGO: user.CODIGO,
        NOMBRE: user.NOMBRE,
        UBICACION_ID: user.UBICACION_ID == null ? null : Number(user.UBICACION_ID),
      }),
    );
    const sessionUser = document.getElementById('session-user');
    if (sessionUser) {
      sessionUser.textContent = `${user.CODIGO} · ${user.NOMBRE}`;
    }
  }

  function openForm(row) {
    showFormError('');
    form.reset();
    document.getElementById('us-activo').checked = true;
    document.getElementById('us-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar usuario' : 'Nuevo usuario';
    contrasenaInput.value = '';
    contrasenaInput.required = !row;
    contrasenaHint.textContent = row
      ? 'Déjala vacía para no cambiarla.'
      : 'Obligatoria al crear.';

    refreshUbicacionSelects();

    if (row) {
      document.getElementById('us-codigo').value = row.CODIGO || '';
      document.getElementById('us-nombre').value = row.NOMBRE || '';
      document.getElementById('us-activo').checked = Boolean(row.ACTIVO);
      if (row.UBICACION_ID != null) {
        const id = String(row.UBICACION_ID);
        if (![...ubicacionSelect.options].some((option) => option.value === id)) {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = ubicacionLabel(row.UBICACION_ID);
          ubicacionSelect.appendChild(option);
        }
        ubicacionSelect.value = id;
      } else {
        ubicacionSelect.value = '';
      }
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
      tbody.innerHTML = '<tr><td colspan="5" class="text-muted-foreground">Sin registros.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => {
      const deleteDisabled = row.ES_SEMILLA ? 'disabled title="Registro semilla"' : '';
      return `
        <tr data-id="${row.ID}">
          <td>${escapeHtml(row.CODIGO)}</td>
          <td>${escapeHtml(row.NOMBRE)}</td>
          <td>${escapeHtml(ubicacionLabel(row.UBICACION_ID))}</td>
          <td>
            <span class="ui-badge ${row.ACTIVO ? 'ui-badge-secondary' : 'ui-badge-outline'}">
              ${row.ACTIVO ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td class="text-right">
            <div class="inline-flex gap-2">
              <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-action="edit">Editar</button>
              <button type="button" class="ui-btn ui-btn-destructive ui-btn-sm" data-action="delete" ${deleteDisabled}>Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
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
    if (state.filters.ubicacion_id) {
      params.set('ubicacion_id', state.filters.ubicacion_id);
    }
    if (state.filters.activo) {
      params.set('activo', state.filters.activo);
    }
    return `/usuarios?${params}`;
  }

  function readFilters() {
    state.filters.q = document.getElementById('us-filter-q').value.trim();
    state.filters.ubicacion_id = filterUbicacion.value;
    state.filters.activo = document.getElementById('us-filter-activo').value;
  }

  async function loadUbicaciones() {
    const result = await window.PackingApi.request('/ubicaciones?items=100');
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.ubicaciones.clear();
    const rows = Array.isArray(result.data) ? result.data : [];
    rows.forEach((row) => {
      state.ubicaciones.set(Number(row.ID), row);
    });
    refreshUbicacionSelects();
  }

  async function loadList() {
    statusNode.textContent = 'Cargando…';
    const result = await window.PackingApi.request(buildListUrl());

    if (!result.ok) {
      statusNode.textContent = 'Error al cargar';
      tbody.innerHTML = '<tr><td colspan="5" class="text-destructive">No se pudo obtener el catálogo.</td></tr>';
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

  document.getElementById('us-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('us-form-cancel').addEventListener('click', closeForm);
  document.getElementById('us-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });
  document.getElementById('us-filters-clear').addEventListener('click', async () => {
    document.getElementById('us-filters').reset();
    state.filters = { q: '', ubicacion_id: '', activo: '' };
    state.page = 1;
    refreshUbicacionSelects();
    await loadList();
  });
  document.getElementById('us-delete-cancel').addEventListener('click', () => {
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
      const result = await window.PackingApi.request(`/usuarios/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      openForm(result.data);
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('us-delete-text').textContent = `¿Eliminar el usuario ${row.children[0].textContent}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('us-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/usuarios/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    deleteDialog.close();
    window.PackingToast.toast('Usuario eliminado');
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');

    const idValue = document.getElementById('us-id').value;
    const ubicacionRaw = ubicacionSelect.value.trim();
    const contrasena = contrasenaInput.value;
    const payload = {
      CODIGO: document.getElementById('us-codigo').value.trim(),
      NOMBRE: document.getElementById('us-nombre').value.trim(),
      UBICACION_ID: ubicacionRaw === '' ? null : Number(ubicacionRaw),
      ACTIVO: document.getElementById('us-activo').checked,
    };

    if (!idValue) {
      if (!contrasena) {
        showFormError(mapError('invalid_contrasena'));
        return;
      }
      payload.CONTRASENA = contrasena;
    } else if (contrasena) {
      payload.CONTRASENA = contrasena;
    }

    const submit = document.getElementById('us-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/usuarios/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/usuarios', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      if (!result.ok) {
        showFormError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }

      if (result.data) {
        syncSessionUsuario(result.data);
      }

      closeForm();
      window.PackingToast.toast(idValue ? 'Usuario actualizado' : 'Usuario creado');
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
    await loadUbicaciones();
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('Error de red', 'error');
  }
});
