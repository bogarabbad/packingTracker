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

  const statusNode = document.getElementById('rt-status');
  const tbody = document.getElementById('rt-tbody');
  const pageLabel = document.getElementById('rt-page-label');
  const prevBtn = document.getElementById('rt-prev');
  const nextBtn = document.getElementById('rt-next');
  const formDialog = document.getElementById('rt-form-dialog');
  const deleteDialog = document.getElementById('rt-delete-dialog');
  const form = document.getElementById('rt-form');
  const formError = document.getElementById('rt-form-error');
  const formTitle = document.getElementById('rt-form-title');

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
      duplicate_codigo: 'Ya existe un tipo con ese código.',
      invalid_codigo: 'Código inválido.',
      invalid_nombre: 'Nombre inválido.',
      invalid_activo: 'Estado activo inválido.',
      seed_not_deletable: 'Este registro no se puede eliminar.',
      record_in_use: 'El tipo está en uso y no se puede eliminar.',
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
    document.getElementById('rt-activo').checked = true;
    document.getElementById('rt-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar tipo' : 'Nuevo tipo';

    if (row) {
      document.getElementById('rt-codigo').value = row.CODIGO || '';
      document.getElementById('rt-nombre').value = row.NOMBRE || '';
      document.getElementById('rt-activo').checked = Boolean(row.ACTIVO);
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
    return `/referencias-tipos?${params}`;
  }

  function readFilters() {
    state.filters.q = document.getElementById('rt-filter-q').value.trim();
    state.filters.activo = document.getElementById('rt-filter-activo').value;
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

  document.getElementById('rt-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('rt-form-cancel').addEventListener('click', closeForm);
  document.getElementById('rt-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });
  document.getElementById('rt-filters-clear').addEventListener('click', async () => {
    document.getElementById('rt-filters').reset();
    state.filters = { q: '', activo: '' };
    state.page = 1;
    await loadList();
  });
  document.getElementById('rt-delete-cancel').addEventListener('click', () => {
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
      const result = await window.PackingApi.request(`/referencias-tipos/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      openForm(result.data);
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('rt-delete-text').textContent = `¿Eliminar el tipo ${row.children[0].textContent}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('rt-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/referencias-tipos/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    deleteDialog.close();
    window.PackingToast.toast('Tipo eliminado');
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');

    const idValue = document.getElementById('rt-id').value;
    const payload = {
      CODIGO: document.getElementById('rt-codigo').value.trim(),
      NOMBRE: document.getElementById('rt-nombre').value.trim(),
      ACTIVO: document.getElementById('rt-activo').checked,
    };
    const submit = document.getElementById('rt-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/referencias-tipos/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/referencias-tipos', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      if (!result.ok) {
        showFormError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }

      closeForm();
      window.PackingToast.toast(idValue ? 'Tipo actualizado' : 'Tipo creado');
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
