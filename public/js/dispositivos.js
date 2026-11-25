document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    tipos: new Map(),
    deleteId: null,
    filters: { q: '', id_tipo: '', activo: '' },
  };

  const statusNode = document.getElementById('di-status');
  const tbody = document.getElementById('di-tbody');
  const pageLabel = document.getElementById('di-page-label');
  const prevBtn = document.getElementById('di-prev');
  const nextBtn = document.getElementById('di-next');
  const formDialog = document.getElementById('di-form-dialog');
  const deleteDialog = document.getElementById('di-delete-dialog');
  const form = document.getElementById('di-form');
  const formError = document.getElementById('di-form-error');
  const formTitle = document.getElementById('di-form-title');
  const tipoSelect = document.getElementById('di-id-tipo');
  const filterTipo = document.getElementById('di-filter-tipo');

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
      duplicate_identificador: 'Ya existe un dispositivo con ese identificador.',
      invalid_identificador: 'Identificador inválido.',
      invalid_nombre: 'Nombre inválido.',
      invalid_id_tipo: 'Tipo inválido.',
      invalid_activo: 'Estado activo inválido.',
      invalid_dispositivo: 'Datos del dispositivo inválidos.',
      record_in_use: 'El dispositivo está en uso y no se puede eliminar.',
      not_found: 'Registro no encontrado.',
      unauthorized: 'Sesión no válida.',
    };
    return messages[code] || 'No se pudo completar la operación.';
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
  }

  function tipoLabel(id) {
    const tipo = state.tipos.get(Number(id));
    if (!tipo) {
      return `#${id}`;
    }
    return `${tipo.CODIGO} · ${tipo.NOMBRE}`;
  }

  function fillTipoOptions(select, blankLabel) {
    const previous = select.value;
    const rows = [...state.tipos.values()]
      .filter((row) => row.ACTIVO)
      .sort((a, b) => a.CODIGO.localeCompare(b.CODIGO, 'es'));
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
      option.textContent = `${row.CODIGO} · ${row.NOMBRE}`;
      select.appendChild(option);
    });
    if (previous && [...select.options].some((option) => option.value === previous)) {
      select.value = previous;
    }
  }

  function fillFilterTipo() {
    const previous = filterTipo.value || state.filters.id_tipo;
    const rows = [...state.tipos.values()]
      .sort((a, b) => a.CODIGO.localeCompare(b.CODIGO, 'es'));
    filterTipo.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Todos';
    filterTipo.appendChild(blank);
    rows.forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.ID);
      option.textContent = `${row.CODIGO} · ${row.NOMBRE}`;
      filterTipo.appendChild(option);
    });
    if (previous && [...filterTipo.options].some((option) => option.value === previous)) {
      filterTipo.value = previous;
    }
  }

  function openForm(row) {
    showFormError('');
    form.reset();
    document.getElementById('di-activo').checked = true;
    document.getElementById('di-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar dispositivo' : 'Nuevo dispositivo';
    fillTipoOptions(tipoSelect, 'Selecciona un tipo');

    if (row) {
      const tipo = state.tipos.get(Number(row.ID_TIPO));
      if (tipo && !tipo.ACTIVO) {
        const option = document.createElement('option');
        option.value = String(tipo.ID);
        option.textContent = `${tipo.CODIGO} · ${tipo.NOMBRE} (inactivo)`;
        tipoSelect.appendChild(option);
      }
      document.getElementById('di-nombre').value = row.NOMBRE || '';
      document.getElementById('di-identificador').value = row.IDENTIFICADOR || '';
      tipoSelect.value = String(row.ID_TIPO);
      document.getElementById('di-activo').checked = Boolean(row.ACTIVO);
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

    tbody.innerHTML = rows.map((row) => `
      <tr data-id="${row.ID}">
        <td>${row.NOMBRE ? escapeHtml(row.NOMBRE) : '<span class="text-muted-foreground">Sin nombre</span>'}</td>
        <td class="font-mono text-xs">${escapeHtml(row.IDENTIFICADOR)}</td>
        <td>${escapeHtml(tipoLabel(row.ID_TIPO))}</td>
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
    if (state.filters.id_tipo) {
      params.set('id_tipo', state.filters.id_tipo);
    }
    if (state.filters.activo) {
      params.set('activo', state.filters.activo);
    }
    return `/dispositivos?${params}`;
  }

  function readFilters() {
    state.filters.q = document.getElementById('di-filter-q').value.trim();
    state.filters.id_tipo = filterTipo.value;
    state.filters.activo = document.getElementById('di-filter-activo').value;
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

  async function preloadTipos() {
    const result = await window.PackingApi.request('/dispositivos-tipos?items=100');
    if (!result.ok) {
      throw new Error('catalogs');
    }
    (Array.isArray(result.data) ? result.data : []).forEach((row) => {
      state.tipos.set(row.ID, row);
    });
    fillFilterTipo();
  }

  document.getElementById('di-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('di-form-cancel').addEventListener('click', closeForm);

  document.getElementById('di-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });

  document.getElementById('di-filters-clear').addEventListener('click', async () => {
    document.getElementById('di-filters').reset();
    state.filters = { q: '', id_tipo: '', activo: '' };
    state.page = 1;
    await loadList();
  });

  document.getElementById('di-delete-cancel').addEventListener('click', () => {
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
      const result = await window.PackingApi.request(`/dispositivos/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      openForm(result.data);
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('di-delete-text').textContent =
        `¿Eliminar el dispositivo ${row.children[0].textContent}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('di-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/dispositivos/${id}`, {
      method: 'DELETE',
    });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    deleteDialog.close();
    window.PackingToast.toast('Dispositivo eliminado');
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');

    const idValue = document.getElementById('di-id').value;
    const idTipo = Number(tipoSelect.value);
    if (!Number.isInteger(idTipo) || idTipo < 1) {
      showFormError(mapError('invalid_id_tipo'));
      return;
    }

    const nombre = document.getElementById('di-nombre').value.trim();
    const payload = {
      NOMBRE: nombre === '' ? null : nombre,
      IDENTIFICADOR: document.getElementById('di-identificador').value.trim(),
      ID_TIPO: idTipo,
      ACTIVO: document.getElementById('di-activo').checked,
    };
    const submit = document.getElementById('di-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/dispositivos/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/dispositivos', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      if (!result.ok) {
        showFormError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }

      closeForm();
      window.PackingToast.toast(idValue ? 'Dispositivo actualizado' : 'Dispositivo creado');
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
    await preloadTipos();
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('Error de red', 'error');
  }
});
