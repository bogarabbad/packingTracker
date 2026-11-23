document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    deleteId: null,
    filters: { q: '', activo: '' },
  };

  const statusNode = document.getElementById('ue-status');
  const tbody = document.getElementById('ue-tbody');
  const pageLabel = document.getElementById('ue-page-label');
  const prevBtn = document.getElementById('ue-prev');
  const nextBtn = document.getElementById('ue-next');
  const formDialog = document.getElementById('ue-form-dialog');
  const deleteDialog = document.getElementById('ue-delete-dialog');
  const form = document.getElementById('ue-form');
  const formError = document.getElementById('ue-form-error');
  const formTitle = document.getElementById('ue-form-title');

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
      duplicate_codigo: 'Ya existe un estatus con ese código.',
      invalid_codigo: 'Código inválido.',
      invalid_nombre: 'Nombre inválido.',
      invalid_activo: 'Estado activo inválido.',
      seed_not_deletable: 'Este registro no se puede eliminar.',
      record_in_use: 'El estatus está en uso y no se puede eliminar.',
      not_found: 'Registro no encontrado.',
      unauthorized: 'Sesión no válida.',
    };
    return messages[code] || 'No se pudo completar la operación.';
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
  }

  function openForm(row) {
    showFormError('');
    form.reset();
    document.getElementById('ue-activo').checked = true;
    document.getElementById('ue-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar estatus' : 'Nuevo estatus';

    if (row) {
      document.getElementById('ue-codigo').value = row.CODIGO || '';
      document.getElementById('ue-nombre').value = row.NOMBRE || '';
      document.getElementById('ue-activo').checked = Boolean(row.ACTIVO);
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
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted-foreground">Sin registros.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => {
      const deleteDisabled = row.ES_SEMILLA ? 'disabled title="Registro semilla"' : '';
      return `
        <tr data-id="${row.ID}">
          <td>${escapeHtml(row.CODIGO)}</td>
          <td>${escapeHtml(row.NOMBRE)}</td>
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
    if (state.filters.activo) {
      params.set('activo', state.filters.activo);
    }
    return `/unidades-estatus?${params}`;
  }

  function readFilters() {
    state.filters.q = document.getElementById('ue-filter-q').value.trim();
    state.filters.activo = document.getElementById('ue-filter-activo').value;
  }

  async function loadList() {
    statusNode.textContent = 'Cargando…';
    const result = await window.PackingApi.request(buildListUrl());

    if (!result.ok) {
      statusNode.textContent = 'Error al cargar';
      tbody.innerHTML = '<tr><td colspan="4" class="text-destructive">No se pudo obtener el catálogo.</td></tr>';
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

  document.getElementById('ue-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('ue-form-cancel').addEventListener('click', closeForm);
  document.getElementById('ue-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });
  document.getElementById('ue-filters-clear').addEventListener('click', async () => {
    document.getElementById('ue-filters').reset();
    state.filters = { q: '', activo: '' };
    state.page = 1;
    await loadList();
  });
  document.getElementById('ue-delete-cancel').addEventListener('click', () => {
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
      const result = await window.PackingApi.request(`/unidades-estatus/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      openForm(result.data);
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('ue-delete-text').textContent = `¿Eliminar el estatus ${row.children[0].textContent}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('ue-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/unidades-estatus/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    deleteDialog.close();
    window.PackingToast.toast('Estatus eliminado');
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');

    const idValue = document.getElementById('ue-id').value;
    const payload = {
      CODIGO: document.getElementById('ue-codigo').value.trim(),
      NOMBRE: document.getElementById('ue-nombre').value.trim(),
      ACTIVO: document.getElementById('ue-activo').checked,
    };
    const submit = document.getElementById('ue-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/unidades-estatus/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/unidades-estatus', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      if (!result.ok) {
        showFormError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }

      closeForm();
      window.PackingToast.toast(idValue ? 'Estatus actualizado' : 'Estatus creado');
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
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('Error de red', 'error');
  }
});
