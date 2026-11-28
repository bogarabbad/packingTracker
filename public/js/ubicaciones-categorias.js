document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    categorias: new Map(),
    deleteId: null,
    filters: { q: '', padre_id: '', activo: '' },
  };

  const statusNode = document.getElementById('uc-status');
  const tbody = document.getElementById('uc-tbody');
  const pageLabel = document.getElementById('uc-page-label');
  const prevBtn = document.getElementById('uc-prev');
  const nextBtn = document.getElementById('uc-next');
  const formDialog = document.getElementById('uc-form-dialog');
  const deleteDialog = document.getElementById('uc-delete-dialog');
  const form = document.getElementById('uc-form');
  const formError = document.getElementById('uc-form-error');
  const formTitle = document.getElementById('uc-form-title');
  const padreSelect = document.getElementById('uc-padre-id');
  const filterPadre = document.getElementById('uc-filter-padre');

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
      duplicate_codigo: 'Ya existe una categoría con ese código.',
      invalid_codigo: 'Código inválido.',
      invalid_nombre: 'Nombre inválido.',
      invalid_padre_id: 'Padre inválido.',
      ciclo_padre: 'Ese padre formaría un ciclo.',
      invalid_activo: 'Estado activo inválido.',
      seed_not_deletable: 'Este registro no se puede eliminar.',
      record_in_use: 'La categoría está en uso y no se puede eliminar.',
      not_found: 'Registro no encontrado.',
      unauthorized: 'Sesión no válida.',
    };
    return messages[code] || 'No se pudo completar la operación.';
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
  }

  function optionalPadreId(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') {
      return null;
    }
    return Number(trimmed);
  }

  function rememberRows(rows) {
    rows.forEach((row) => {
      state.categorias.set(row.ID, row);
    });
  }

  function categoriaLabel(id) {
    const categoria = state.categorias.get(Number(id));
    if (!categoria) {
      return `#${id}`;
    }
    return `${categoria.CODIGO} · ${categoria.NOMBRE}`;
  }

  function fillPadreOptions(excludeId) {
    const previous = padreSelect.value;
    const rows = [...state.categorias.values()]
      .filter((row) => row.ID !== excludeId)
      .sort((a, b) => a.CODIGO.localeCompare(b.CODIGO, 'es'));
    padreSelect.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Sin padre (raíz)';
    padreSelect.appendChild(blank);
    rows.forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.ID);
      option.textContent = `${row.CODIGO} · ${row.NOMBRE}`;
      padreSelect.appendChild(option);
    });
    if (previous && [...padreSelect.options].some((option) => option.value === previous)) {
      padreSelect.value = previous;
    }
  }

  function fillFilterPadre() {
    const previous = filterPadre.value || state.filters.padre_id;
    const rows = [...state.categorias.values()]
      .sort((a, b) => a.CODIGO.localeCompare(b.CODIGO, 'es'));
    filterPadre.innerHTML = '';
    [
      { value: '', label: 'Todos' },
      { value: 'raiz', label: 'Solo raíces' },
    ].forEach((item) => {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      filterPadre.appendChild(option);
    });
    rows.forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.ID);
      option.textContent = `${row.CODIGO} · ${row.NOMBRE}`;
      filterPadre.appendChild(option);
    });
    if (previous && [...filterPadre.options].some((option) => option.value === previous)) {
      filterPadre.value = previous;
    }
  }

  function openForm(row) {
    showFormError('');
    form.reset();
    document.getElementById('uc-activo').checked = true;
    document.getElementById('uc-es-receptor').checked = false;
    document.getElementById('uc-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar categoría' : 'Nueva categoría';
    fillPadreOptions(row ? row.ID : null);

    if (row) {
      document.getElementById('uc-codigo').value = row.CODIGO || '';
      document.getElementById('uc-nombre').value = row.NOMBRE || '';
      padreSelect.value = row.PADRE_ID == null ? '' : String(row.PADRE_ID);
      document.getElementById('uc-es-receptor').checked = Boolean(row.ES_RECEPTOR);
      document.getElementById('uc-activo').checked = Boolean(row.ACTIVO);
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
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted-foreground">Sin registros.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => {
      const deleteDisabled = row.ES_SEMILLA ? 'disabled title="Registro semilla"' : '';
      return `
        <tr data-id="${row.ID}">
          <td>${escapeHtml(row.CODIGO)}</td>
          <td>${escapeHtml(row.NOMBRE)}</td>
          <td>${row.PADRE_ID == null ? '—' : escapeHtml(categoriaLabel(row.PADRE_ID))}</td>
          <td>
            <span class="ui-badge ${row.ES_RECEPTOR ? 'ui-badge-secondary' : 'ui-badge-outline'}">
              ${row.ES_RECEPTOR ? 'Sí' : 'No'}
            </span>
          </td>
          <td>
            <span class="ui-badge ${row.ACTIVO ? 'ui-badge-secondary' : 'ui-badge-outline'}">
              ${row.ACTIVO ? 'Activa' : 'Inactiva'}
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
    if (state.filters.padre_id) {
      params.set('padre_id', state.filters.padre_id);
    }
    if (state.filters.activo) {
      params.set('activo', state.filters.activo);
    }
    return `/ubicaciones-categorias?${params}`;
  }

  function readFilters() {
    state.filters.q = document.getElementById('uc-filter-q').value.trim();
    state.filters.padre_id = filterPadre.value;
    state.filters.activo = document.getElementById('uc-filter-activo').value;
  }

  async function loadList() {
    statusNode.textContent = 'Cargando…';
    const result = await window.PackingApi.request(buildListUrl());
    if (!result.ok) {
      statusNode.textContent = 'Error al cargar';
      tbody.innerHTML = '<tr><td colspan="6" class="text-destructive">No se pudo obtener el catálogo.</td></tr>';
      window.PackingToast.toast(mapError(result.error), 'error');
      if (result.status === 401) {
        window.location.replace('/login');
      }
      return;
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    rememberRows(rows);
    fillFilterPadre();
    state.total = result.metadata.total ?? rows.length;
    statusNode.textContent = `${state.total} registro(s)`;
    renderRows(rows);
    updatePager();
  }

  async function preloadCategorias() {
    const result = await window.PackingApi.request('/ubicaciones-categorias?items=100');
    if (!result.ok) {
      throw new Error('catalogs');
    }
    rememberRows(Array.isArray(result.data) ? result.data : []);
    fillFilterPadre();
  }

  document.getElementById('uc-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('uc-form-cancel').addEventListener('click', closeForm);

  document.getElementById('uc-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });

  document.getElementById('uc-filters-clear').addEventListener('click', async () => {
    document.getElementById('uc-filters').reset();
    state.filters = { q: '', padre_id: '', activo: '' };
    state.page = 1;
    await loadList();
  });

  document.getElementById('uc-delete-cancel').addEventListener('click', () => {
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
      const result = await window.PackingApi.request(`/ubicaciones-categorias/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      rememberRows([result.data]);
      openForm(result.data);
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('uc-delete-text').textContent =
        `¿Eliminar la categoría ${row.children[0].textContent}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('uc-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/ubicaciones-categorias/${id}`, {
      method: 'DELETE',
    });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    deleteDialog.close();
    window.PackingToast.toast('Categoría eliminada');
    state.categorias.delete(id);
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');

    const idValue = document.getElementById('uc-id').value;
    const payload = {
      CODIGO: document.getElementById('uc-codigo').value.trim(),
      NOMBRE: document.getElementById('uc-nombre').value.trim(),
      PADRE_ID: optionalPadreId(padreSelect.value),
      ES_RECEPTOR: document.getElementById('uc-es-receptor').checked,
      ACTIVO: document.getElementById('uc-activo').checked,
    };
    const submit = document.getElementById('uc-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/ubicaciones-categorias/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/ubicaciones-categorias', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      if (!result.ok) {
        showFormError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }

      rememberRows([result.data]);
      closeForm();
      window.PackingToast.toast(idValue ? 'Categoría actualizada' : 'Categoría creada');
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
    await preloadCategorias();
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('Error de red', 'error');
  }
});
