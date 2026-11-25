document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    categorias: new Map(),
    ubicaciones: new Map(),
    treeChildren: new Map(),
    treeLoaded: new Set(),
    collapsed: new Set(),
    focusedId: null,
    deleteId: null,
    filters: { q: '', id_categoria: '', padre_id: '', activo: '' },
  };

  const statusNode = document.getElementById('ub-status');
  const tbody = document.getElementById('ub-tbody');
  const pageLabel = document.getElementById('ub-page-label');
  const prevBtn = document.getElementById('ub-prev');
  const nextBtn = document.getElementById('ub-next');
  const treeNode = document.getElementById('ub-tree');
  const treeNav = document.getElementById('ub-tree-nav');
  const formDialog = document.getElementById('ub-form-dialog');
  const deleteDialog = document.getElementById('ub-delete-dialog');
  const form = document.getElementById('ub-form');
  const formError = document.getElementById('ub-form-error');
  const formTitle = document.getElementById('ub-form-title');
  const categoriaSelect = document.getElementById('ub-id-categoria');
  const padreSelect = document.getElementById('ub-padre-id');
  const filterCategoria = document.getElementById('ub-filter-categoria');
  const filterPadre = document.getElementById('ub-filter-padre');

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
      duplicate_codigo: 'Ya existe una ubicación con ese código.',
      invalid_codigo: 'Código inválido.',
      invalid_nombre: 'Nombre inválido.',
      invalid_id_categoria: 'Categoría inválida.',
      invalid_padre_id: 'Padre inválido.',
      ciclo_padre: 'Ese padre formaría un ciclo.',
      invalid_activo: 'Estado activo inválido.',
      seed_not_deletable: 'Este registro no se puede eliminar.',
      record_in_use: 'La ubicación está en uso y no se puede eliminar.',
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

  function fillSelect(select, rows, blankLabel, mapLabel) {
    select.innerHTML = '';
    if (blankLabel != null) {
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = blankLabel;
      select.appendChild(blank);
    }
    rows.forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.ID);
      option.textContent = mapLabel(row);
      select.appendChild(option);
    });
  }

  function rememberRows(rows) {
    rows.forEach((row) => {
      state.ubicaciones.set(row.ID, row);
    });
  }

  function categoriaLabel(id) {
    const categoria = state.categorias.get(Number(id));
    if (!categoria) {
      return `#${id}`;
    }
    return categoria.NOMBRE;
  }

  function ubicacionLabel(id) {
    const ubicacion = state.ubicaciones.get(Number(id));
    if (!ubicacion) {
      return `#${id}`;
    }
    return `${ubicacion.CODIGO} · ${ubicacion.NOMBRE}`;
  }

  function pathTo(id) {
    const path = [];
    let current = state.ubicaciones.get(id);
    const guard = new Set();
    while (current && !guard.has(current.ID)) {
      path.unshift(current);
      guard.add(current.ID);
      current = current.PADRE_ID == null ? null : state.ubicaciones.get(current.PADRE_ID);
    }
    return path;
  }

  function renderNav() {
    if (state.focusedId == null) {
      treeNav.innerHTML = '<span>Raíces</span>';
      return;
    }
    const path = pathTo(state.focusedId);
    const parts = ['<button type="button" class="hover:text-foreground" data-focus-root="1">Raíces</button>'];
    path.forEach((ubicacion, index) => {
      parts.push('<span>/</span>');
      if (index === path.length - 1) {
        parts.push(`<span class="font-medium text-foreground">${escapeHtml(ubicacion.CODIGO)}</span>`);
      } else {
        parts.push(
          `<button type="button" class="hover:text-foreground" data-focus="${ubicacion.ID}">${escapeHtml(ubicacion.CODIGO)}</button>`,
        );
      }
    });
    treeNav.innerHTML = parts.join(' ');
  }

  function renderTreeNode(ubicacion) {
    const children = state.treeChildren.get(ubicacion.ID) || [];
    const loaded = state.treeLoaded.has(ubicacion.ID);
    const collapsed = state.collapsed.has(ubicacion.ID);
    const active = state.focusedId === ubicacion.ID;
    const showChildren = loaded && !collapsed && children.length > 0;
    const toggleLabel = !loaded || collapsed ? '+' : '−';
    const toggle = `
      <button type="button" class="ui-tree-toggle" data-toggle="${ubicacion.ID}" aria-label="${!loaded || collapsed ? 'Expandir' : 'Colapsar'}">
        ${toggleLabel}
      </button>
    `;

    let html = `
      <div class="ui-tree-node" data-node="${ubicacion.ID}">
        <div class="ui-tree-row ${active ? 'is-active' : ''}">
          ${toggle}
          <button type="button" class="min-w-0 flex-1 text-left" data-focus="${ubicacion.ID}">
            <span class="font-medium">${escapeHtml(ubicacion.CODIGO)}</span>
            <span class="ml-2 text-muted-foreground">${escapeHtml(ubicacion.NOMBRE)}</span>
          </button>
        </div>
    `;
    if (showChildren) {
      html += `<div class="ui-tree-children">${children.map(renderTreeNode).join('')}</div>`;
    }
    html += '</div>';
    return html;
  }

  async function fetchChildren(padreId) {
    const params = new URLSearchParams({
      page: '1',
      items: '100',
      padre_id: padreId == null ? 'raiz' : String(padreId),
    });
    const result = await window.PackingApi.request(`/ubicaciones?${params}`);
    if (!result.ok) {
      throw new Error(result.error || 'tree');
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    rememberRows(rows);
    rows.sort((a, b) => a.CODIGO.localeCompare(b.CODIGO, 'es'));
    return rows;
  }

  async function ensureChildren(padreId) {
    const key = padreId == null ? 'raiz' : padreId;
    if (state.treeLoaded.has(key)) {
      return state.treeChildren.get(key) || [];
    }
    const rows = await fetchChildren(padreId);
    state.treeChildren.set(key, rows);
    state.treeLoaded.add(key);
    return rows;
  }

  async function renderTree() {
    try {
      const roots = await ensureChildren(null);
      if (!roots.length) {
        treeNode.innerHTML = '<p class="text-sm text-muted-foreground">Sin ubicaciones raíz.</p>';
        renderNav();
        return;
      }
      treeNode.innerHTML = roots.map(renderTreeNode).join('');
      renderNav();
    } catch {
      treeNode.innerHTML = '<p class="text-sm text-destructive">No se pudo cargar el árbol.</p>';
      renderNav();
    }
  }

  function fillPadreOptions(excludeId) {
    const rows = [...state.ubicaciones.values()]
      .filter((row) => row.ID !== excludeId)
      .sort((a, b) => a.CODIGO.localeCompare(b.CODIGO, 'es'));
    fillSelect(padreSelect, rows, 'Sin padre (raíz)', (row) => `${row.CODIGO} · ${row.NOMBRE}`);
  }

  function fillFilterPadre() {
    const previous = filterPadre.value || state.filters.padre_id;
    const rows = [...state.ubicaciones.values()]
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

  function openForm(row, defaults = {}) {
    showFormError('');
    form.reset();
    document.getElementById('ub-activo').checked = true;
    document.getElementById('ub-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar ubicación' : 'Nueva ubicación';
    fillPadreOptions(row ? row.ID : null);

    if (row) {
      document.getElementById('ub-codigo').value = row.CODIGO || '';
      document.getElementById('ub-nombre').value = row.NOMBRE || '';
      categoriaSelect.value = String(row.ID_CATEGORIA);
      padreSelect.value = row.PADRE_ID == null ? '' : String(row.PADRE_ID);
      document.getElementById('ub-activo').checked = Boolean(row.ACTIVO);
    } else {
      if (defaults.ID_CATEGORIA) {
        categoriaSelect.value = String(defaults.ID_CATEGORIA);
      }
      if (defaults.PADRE_ID) {
        padreSelect.value = String(defaults.PADRE_ID);
      } else if (state.focusedId != null) {
        padreSelect.value = String(state.focusedId);
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
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted-foreground">Sin registros.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => {
      const deleteDisabled = row.ES_SEMILLA ? 'disabled title="Registro semilla"' : '';
      return `
        <tr data-id="${row.ID}" class="${state.focusedId === row.ID ? 'bg-muted/40' : ''}">
          <td>
            <button type="button" class="text-left font-medium hover:underline" data-focus="${row.ID}">
              ${escapeHtml(row.CODIGO)}
            </button>
          </td>
          <td>${escapeHtml(row.NOMBRE)}</td>
          <td>${escapeHtml(categoriaLabel(row.ID_CATEGORIA))}</td>
          <td>${row.PADRE_ID == null ? '—' : escapeHtml(ubicacionLabel(row.PADRE_ID))}</td>
          <td>
            <span class="ui-badge ${row.ACTIVO ? 'ui-badge-secondary' : 'ui-badge-outline'}">
              ${row.ACTIVO ? 'Activa' : 'Inactiva'}
            </span>
          </td>
          <td class="text-right">
            <div class="inline-flex flex-wrap justify-end gap-2">
              <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-action="hijos" data-id="${row.ID}">Hijos</button>
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
    if (state.filters.id_categoria) {
      params.set('id_categoria', state.filters.id_categoria);
    }
    if (state.filters.padre_id) {
      params.set('padre_id', state.filters.padre_id);
    }
    if (state.filters.activo) {
      params.set('activo', state.filters.activo);
    }
    return `/ubicaciones?${params}`;
  }

  function readFilters() {
    state.filters.q = document.getElementById('ub-filter-q').value.trim();
    state.filters.id_categoria = filterCategoria.value;
    state.filters.padre_id = filterPadre.value;
    state.filters.activo = document.getElementById('ub-filter-activo').value;
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

  async function invalidateTree() {
    state.treeChildren = new Map();
    state.treeLoaded = new Set();
    await renderTree();
  }

  async function ensureKnown(id) {
    if (state.ubicaciones.has(id)) {
      return state.ubicaciones.get(id);
    }
    const result = await window.PackingApi.request(`/ubicaciones/${id}`);
    if (!result.ok) {
      return null;
    }
    rememberRows([result.data]);
    return result.data;
  }

  async function focusUbicacion(id, { filterChildren = false } = {}) {
    state.focusedId = Number(id);
    let current = await ensureKnown(state.focusedId);
    const chain = [];
    const guard = new Set();
    while (current && !guard.has(current.ID)) {
      chain.unshift(current);
      guard.add(current.ID);
      if (current.PADRE_ID == null) {
        break;
      }
      current = await ensureKnown(current.PADRE_ID);
    }

    await ensureChildren(null);
    for (const node of chain) {
      state.collapsed.delete(node.ID);
      await ensureChildren(node.ID);
    }
    await renderTree();

    if (filterChildren) {
      state.filters.padre_id = String(state.focusedId);
      filterPadre.value = String(state.focusedId);
      state.page = 1;
      await loadList();
    } else {
      renderNav();
    }
  }

  async function loadCatalogs() {
    const [categorias, ubicaciones] = await Promise.all([
      window.PackingApi.request('/ubicaciones-categorias?items=100'),
      window.PackingApi.request('/ubicaciones?items=100'),
    ]);
    if (!categorias.ok) {
      throw new Error('catalogs');
    }

    const categoriaRows = Array.isArray(categorias.data) ? categorias.data : [];
    state.categorias = new Map(categoriaRows.map((row) => [row.ID, row]));
    fillSelect(
      filterCategoria,
      categoriaRows.sort((a, b) => a.NOMBRE.localeCompare(b.NOMBRE, 'es')),
      'Todas',
      (row) => row.NOMBRE,
    );
    fillSelect(
      categoriaSelect,
      categoriaRows.sort((a, b) => a.NOMBRE.localeCompare(b.NOMBRE, 'es')),
      'Selecciona una categoría',
      (row) => `${row.CODIGO} · ${row.NOMBRE}`,
    );

    if (ubicaciones.ok) {
      rememberRows(Array.isArray(ubicaciones.data) ? ubicaciones.data : []);
      fillFilterPadre();
    }
  }

  document.getElementById('ub-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('ub-form-cancel').addEventListener('click', closeForm);

  document.getElementById('ub-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });

  document.getElementById('ub-filters-clear').addEventListener('click', async () => {
    document.getElementById('ub-filters').reset();
    state.filters = { q: '', id_categoria: '', padre_id: '', activo: '' };
    state.focusedId = null;
    state.page = 1;
    await renderTree();
    await loadList();
  });

  document.getElementById('ub-delete-cancel').addEventListener('click', () => {
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

  treeNode.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      event.preventDefault();
      const id = Number(toggle.dataset.toggle);
      if (!state.treeLoaded.has(id)) {
        try {
          await ensureChildren(id);
          state.collapsed.delete(id);
        } catch {
          window.PackingToast.toast('No se pudieron cargar los hijos', 'error');
          return;
        }
      } else if (state.collapsed.has(id)) {
        state.collapsed.delete(id);
      } else {
        state.collapsed.add(id);
      }
      await renderTree();
      return;
    }

    const focus = event.target.closest('[data-focus]');
    if (focus) {
      await focusUbicacion(focus.dataset.focus, { filterChildren: true });
    }
  });

  treeNav.addEventListener('click', async (event) => {
    if (event.target.closest('[data-focus-root]')) {
      state.focusedId = null;
      state.filters.padre_id = 'raiz';
      filterPadre.value = 'raiz';
      state.page = 1;
      await renderTree();
      await loadList();
      return;
    }
    const focus = event.target.closest('[data-focus]');
    if (focus) {
      await focusUbicacion(focus.dataset.focus, { filterChildren: true });
    }
  });

  tbody.addEventListener('click', async (event) => {
    const focus = event.target.closest('[data-focus]');
    if (focus && !event.target.closest('button[data-action]')) {
      await focusUbicacion(focus.dataset.focus, { filterChildren: true });
      return;
    }

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

    if (action === 'hijos') {
      await focusUbicacion(id, { filterChildren: true });
      return;
    }

    if (action === 'edit') {
      const result = await window.PackingApi.request(`/ubicaciones/${id}`);
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
      document.getElementById('ub-delete-text').textContent =
        `¿Eliminar la ubicación ${row.children[0].textContent.trim()}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('ub-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/ubicaciones/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    deleteDialog.close();
    window.PackingToast.toast('Ubicación eliminada');
    state.ubicaciones.delete(id);
    if (state.focusedId === id) {
      state.focusedId = null;
    }
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await invalidateTree();
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');

    const idValue = document.getElementById('ub-id').value;
    const payload = {
      CODIGO: document.getElementById('ub-codigo').value.trim(),
      NOMBRE: document.getElementById('ub-nombre').value.trim(),
      ID_CATEGORIA: Number(categoriaSelect.value),
      PADRE_ID: optionalPadreId(padreSelect.value),
      ACTIVO: document.getElementById('ub-activo').checked,
    };
    const submit = document.getElementById('ub-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/ubicaciones/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/ubicaciones', {
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
      window.PackingToast.toast(idValue ? 'Ubicación actualizada' : 'Ubicación creada');
      if (!idValue) {
        state.page = 1;
      }
      await invalidateTree();
      await loadList();
    } catch {
      showFormError('Error de red.');
      window.PackingToast.toast('Error de red', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  try {
    await loadCatalogs();
    await renderTree();
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('No se pudieron cargar los catálogos', 'error');
  }
});
