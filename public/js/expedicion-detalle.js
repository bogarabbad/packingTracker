document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const expedicionId = Number(document.getElementById('exd-id').value);
  if (!Number.isInteger(expedicionId) || expedicionId < 1) {
    window.location.replace('/operacion/expediciones');
    return;
  }

  const state = {
    expedicion: null,
    lotes: [],
    porTipo: [],
    byId: new Map(),
    children: new Map(),
    roots: [],
    focusedId: null,
    collapsed: new Set(),
    unidades: new Map(),
    cargoTab: 'lotes',
    filters: { lote: '', tipo: '', tipoRef: '', ref: '', prod: '' },
  };

  const treeNode = document.getElementById('exd-tree');
  const treeNav = document.getElementById('exd-tree-nav');
  const loteProductosBody = document.getElementById('exd-lote-productos-body');
  const porTipoNode = document.getElementById('exd-por-tipo');
  const cargoTbody = document.getElementById('exd-cargo-tbody');
  const productosTbody = document.getElementById('exd-productos-tbody');
  const cargoStatus = document.getElementById('exd-cargo-status');
  const loteForm = document.getElementById('exd-lote-form');
  const loteSelect = document.getElementById('exd-lote-id');
  const loteError = document.getElementById('exd-lote-error');
  const formDialog = document.getElementById('exd-form-dialog');
  const form = document.getElementById('exd-form');
  const formError = document.getElementById('exd-form-error');
  const unidadSelect = document.getElementById('exd-id-unidad');

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
      invalid_id_unidad: 'Unidad de transporte inválida.',
      invalid_fecha_cierre: 'Fecha de cierre inválida.',
      invalid_id_ubicacion_salida: 'ID de ubicación inválido.',
      invalid_ubicacion_salida_id: 'Ubicación de salida inválida.',
      invalid_id_lote: 'Lote inválido, con padre o no disponible.',
      invalid_id_expedicion: 'Expedición inválida.',
      lote_ya_embarcado: 'Ese lote ya está embarcado en otra expedición.',
      expedicion_cerrada: 'La expedición está cerrada.',
      unidad_ya_abierta: 'Esa unidad ya tiene una expedición abierta.',
      not_found: 'Registro no encontrado.',
      unauthorized: 'Sesión no válida.',
    };
    return messages[code] || 'No se pudo completar la operación.';
  }

  function sessionUsuario() {
    const usuario = window.PackingApi.getUsuario();
    if (!usuario || !usuario.ID) {
      return { USUARIO_ID: null, ID_ORIGEN_USUARIO: null };
    }
    return {
      USUARIO_ID: Number(usuario.ID),
      ID_ORIGEN_USUARIO: 1,
    };
  }

  function optionalNumber(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') {
      return null;
    }
    return Number(trimmed);
  }

  function optionalText(value) {
    const trimmed = String(value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  }

  function formatDate(value) {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleString('es-MX');
  }

  function toLocalInput(value) {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fromLocalInput(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') {
      return null;
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }

  function fillSelect(select, rows, blankLabel, mapLabel) {
    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = blankLabel;
    select.appendChild(blank);
    rows.forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.ID);
      option.textContent = mapLabel(row);
      select.appendChild(option);
    });
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
  }

  function showLoteError(message) {
    loteError.textContent = message;
    loteError.classList.toggle('hidden', !message);
  }

  function unidadLabel(id) {
    const unidad = state.unidades.get(Number(id));
    if (!unidad) {
      return `#${id}`;
    }
    return `${unidad.CODIGO} · ${unidad.PLACAS}`;
  }

  function buildIndex(lotes) {
    state.byId = new Map(lotes.map((lote) => [lote.ID, lote]));
    state.children = new Map();
    lotes.forEach((lote) => {
      const parentId = lote.PADRE_ID;
      if (parentId == null || !state.byId.has(parentId)) {
        return;
      }
      if (!state.children.has(parentId)) {
        state.children.set(parentId, []);
      }
      state.children.get(parentId).push(lote);
    });
    state.children.forEach((rows) => {
      rows.sort((a, b) => a.ID - b.ID);
    });
    state.roots = lotes
      .filter((lote) => lote.EMBARCADO_DIRECTO || lote.PADRE_ID == null || !state.byId.has(lote.PADRE_ID))
      .filter((lote, index, rows) => rows.findIndex((item) => item.ID === lote.ID) === index)
      .sort((a, b) => a.ID - b.ID);
  }

  function pathTo(loteId) {
    const path = [];
    let current = state.byId.get(loteId);
    const guard = new Set();
    while (current && !guard.has(current.ID)) {
      path.unshift(current);
      guard.add(current.ID);
      current = current.PADRE_ID == null ? null : state.byId.get(current.PADRE_ID);
    }
    return path;
  }

  function renderNav() {
    if (state.focusedId == null) {
      treeNav.innerHTML = '<span>Selecciona un lote del árbol</span>';
      return;
    }
    const path = pathTo(state.focusedId);
    treeNav.innerHTML = path.map((lote, index) => {
      const label = `#${lote.ID}`;
      if (index === path.length - 1) {
        return `<span class="font-medium text-foreground">${label}</span>`;
      }
      return `<button type="button" class="hover:text-foreground" data-focus="${lote.ID}">${label}</button><span>/</span>`;
    }).join(' ');
  }

  function renderTreeNode(lote) {
    const children = state.children.get(lote.ID) || [];
    const hasChildren = children.length > 0;
    const collapsed = state.collapsed.has(lote.ID);
    const active = state.focusedId === lote.ID;
    const toggle = hasChildren
      ? `<button type="button" class="ui-tree-toggle" data-toggle="${lote.ID}" aria-label="${collapsed ? 'Expandir' : 'Colapsar'}">${collapsed ? '+' : '−'}</button>`
      : '<span class="inline-block size-6 shrink-0"></span>';

    let html = `
      <div class="ui-tree-node" data-node="${lote.ID}">
        <div class="ui-tree-row ${active ? 'is-active' : ''}">
          ${toggle}
          <button type="button" class="min-w-0 flex-1 text-left" data-focus="${lote.ID}">
            <span class="font-medium">#${lote.ID}</span>
            <span class="ml-2 text-muted-foreground">${escapeHtml(lote.TIPO?.NOMBRE || lote.ID_TIPO)}</span>
            ${lote.EMBARCADO_DIRECTO ? '<span class="ui-badge ui-badge-outline ml-2">Raíz</span>' : ''}
          </button>
        </div>
    `;
    if (hasChildren && !collapsed) {
      html += `<div class="ui-tree-children">${children.map(renderTreeNode).join('')}</div>`;
    }
    html += '</div>';
    return html;
  }

  function renderTree() {
    if (!state.roots.length) {
      treeNode.innerHTML = '<p class="text-sm text-muted-foreground">Sin lotes embarcados.</p>';
      renderNav();
      renderFocusedProductos();
      return;
    }
    treeNode.innerHTML = state.roots.map(renderTreeNode).join('');
    renderNav();
    renderFocusedProductos();
  }

  function renderFocusedProductos() {
    if (state.focusedId == null) {
      loteProductosBody.innerHTML = '<p class="text-muted-foreground">Selecciona un lote del árbol.</p>';
      return;
    }
    const lote = state.byId.get(state.focusedId);
    if (!lote) {
      loteProductosBody.innerHTML = '<p class="text-muted-foreground">Lote no encontrado.</p>';
      return;
    }
    const productos = lote.PRODUCTOS || [];
    if (!productos.length) {
      loteProductosBody.innerHTML =
        `<p class="text-muted-foreground">El lote #${lote.ID} no tiene productos.</p>`;
      return;
    }
    loteProductosBody.innerHTML = `
      <ul class="grid gap-2">
        ${productos.map((prod) => `
          <li class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-medium text-foreground">${escapeHtml(prod.CLAVE_PRODUCTO)}</span>
            <span class="tabular-nums">
              ${escapeHtml(prod.CANTIDAD)}
              ${escapeHtml(prod.UNIDAD?.CODIGO || prod.UNIDAD?.NOMBRE || '')}
            </span>
          </li>
        `).join('')}
      </ul>
    `;
  }

  function renderPorTipo() {
    if (!state.porTipo.length) {
      porTipoNode.innerHTML =
        '<p class="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">Sin lotes embarcados.</p>';
      return;
    }
    porTipoNode.innerHTML = state.porTipo.map((tipo) => `
      <button type="button" class="ui-stat text-left transition-colors hover:bg-accent" data-filter-tipo="${tipo.ID_TIPO}">
        <p class="ui-stat-label">${escapeHtml(tipo.NOMBRE)}</p>
        <p class="ui-stat-value">${tipo.LOTES}</p>
        <p class="mt-1 text-xs text-muted-foreground">
          ${tipo.PRODUCTOS} producto(s)
          ${tipo.ES_FINAL ? ' · Final' : ''}
        </p>
      </button>
    `).join('');
  }

  function formatReferencia(ref) {
    const clave = ref.TIPO?.CLAVE || ref.TIPO?.CODIGO || '?';
    return `[ ${clave} ] ${ref.REFERENCIA || ''}`;
  }

  function matchesFilters(lote) {
    const loteQ = state.filters.lote.trim().toLowerCase();
    if (loteQ) {
      const haystack = `#${lote.ID} ${lote.TIPO?.CODIGO || ''} ${lote.TIPO?.NOMBRE || ''}`.toLowerCase();
      if (!haystack.includes(loteQ) && String(lote.ID) !== loteQ) {
        return false;
      }
    }
    if (state.filters.tipo && String(lote.ID_TIPO) !== state.filters.tipo) {
      return false;
    }
    if (state.filters.tipoRef) {
      const ok = (lote.REFERENCIAS || []).some(
        (ref) => String(ref.ID_TIPO) === state.filters.tipoRef,
      );
      if (!ok) {
        return false;
      }
    }
    const refQ = state.filters.ref.trim().toLowerCase();
    if (refQ) {
      const ok = (lote.REFERENCIAS || []).some((ref) => {
        const text = `${formatReferencia(ref)} ${ref.DESCRIPCION || ''} ${ref.TIPO?.NOMBRE || ''} ${ref.TIPO?.CLAVE || ''}`.toLowerCase();
        return text.includes(refQ);
      });
      if (!ok) {
        return false;
      }
    }
    const prodQ = state.filters.prod.trim().toLowerCase();
    if (prodQ) {
      const ok = (lote.PRODUCTOS || []).some((prod) => {
        const text = `${prod.CLAVE_PRODUCTO || ''} ${prod.UNIDAD?.NOMBRE || ''} ${prod.UNIDAD?.CODIGO || ''}`.toLowerCase();
        return text.includes(prodQ);
      });
      if (!ok) {
        return false;
      }
    }
    return true;
  }

  function scopedLotes() {
    let rows = state.lotes.filter(matchesFilters);
    if (state.focusedId == null) {
      return rows;
    }
    const descendants = new Set();
    const stack = [state.focusedId];
    while (stack.length) {
      const id = stack.pop();
      if (descendants.has(id)) {
        continue;
      }
      descendants.add(id);
      (state.children.get(id) || []).forEach((child) => stack.push(child.ID));
    }
    return rows.filter((lote) => descendants.has(lote.ID));
  }

  function setCargoTab(tab) {
    state.cargoTab = tab === 'productos' ? 'productos' : 'lotes';
    document.querySelectorAll('[data-cargo-tab]').forEach((button) => {
      const active = button.dataset.cargoTab === state.cargoTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-cargo-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.cargoPanel !== state.cargoTab);
    });
    renderCargoTables();
  }

  function renderCargoTables() {
    const abierta = state.expedicion?.FECHA_CIERRE == null;
    const rows = scopedLotes();

    if (state.cargoTab === 'productos') {
      const productos = [];
      rows.forEach((lote) => {
        (lote.PRODUCTOS || []).forEach((prod) => {
          const prodQ = state.filters.prod.trim().toLowerCase();
          if (prodQ) {
            const text = `${prod.CLAVE_PRODUCTO || ''} ${prod.UNIDAD?.NOMBRE || ''} ${prod.UNIDAD?.CODIGO || ''}`.toLowerCase();
            if (!text.includes(prodQ)) {
              return;
            }
          }
          productos.push({ lote, prod });
        });
      });
      cargoStatus.textContent = `${productos.length} producto(s) en ${rows.length} lote(s)`;
      if (!productos.length) {
        productosTbody.innerHTML =
          '<tr><td colspan="6" class="text-muted-foreground">Sin productos.</td></tr>';
        return;
      }
      productosTbody.innerHTML = productos.map(({ lote, prod }) => `
        <tr data-lote="${lote.ID}" class="${state.focusedId === lote.ID ? 'bg-muted/40' : ''}">
          <td class="font-medium">${escapeHtml(prod.CLAVE_PRODUCTO)}</td>
          <td class="tabular-nums">${escapeHtml(prod.CANTIDAD)}</td>
          <td>${escapeHtml(prod.UNIDAD?.NOMBRE || prod.UNIDAD?.CODIGO || prod.ID_UNIDAD)}</td>
          <td>
            <button type="button" class="text-left font-medium hover:underline" data-focus="${lote.ID}">
              #${lote.ID}
            </button>
          </td>
          <td>${escapeHtml(lote.TIPO?.NOMBRE || lote.ID_TIPO)}</td>
          <td class="text-right">
            <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-focus="${lote.ID}">Ver lote</button>
          </td>
        </tr>
      `).join('');
      return;
    }

    cargoStatus.textContent = `${rows.length} lote(s)`;
    if (!rows.length) {
      cargoTbody.innerHTML =
        '<tr><td colspan="6" class="text-muted-foreground">Sin resultados.</td></tr>';
      return;
    }

    cargoTbody.innerHTML = rows.map((lote) => {
      const refsList = lote.REFERENCIAS || [];
      const refs = refsList.length
        ? `<ul class="grid gap-1 whitespace-normal">
            ${refsList.map((ref) => `<li>${escapeHtml(formatReferencia(ref))}</li>`).join('')}
          </ul>`
        : '—';
      const productos = lote.PRODUCTOS || [];
      const prods = productos.length
        ? `<ul class="grid gap-1 whitespace-normal">
            ${productos.map((prod) => `
              <li>
                <span class="font-medium">${escapeHtml(prod.CLAVE_PRODUCTO)}</span>
                <span class="text-muted-foreground">
                  · ${escapeHtml(prod.CANTIDAD)}
                  ${escapeHtml(prod.UNIDAD?.CODIGO || '')}
                </span>
              </li>
            `).join('')}
          </ul>`
        : '—';
      const quitar = lote.EMBARCADO_DIRECTO && abierta && lote.EMBARQUE_ID != null
        ? `<button type="button" class="ui-btn ui-btn-destructive ui-btn-sm" data-action="quitar" data-embarque="${lote.EMBARQUE_ID}">Quitar</button>`
        : '';
      return `
        <tr data-lote="${lote.ID}" class="${state.focusedId === lote.ID ? 'bg-muted/40' : ''}">
          <td>
            <button type="button" class="text-left font-medium hover:underline" data-focus="${lote.ID}">
              #${lote.ID}
            </button>
          </td>
          <td>${escapeHtml(lote.TIPO?.NOMBRE || lote.ID_TIPO)}</td>
          <td>${lote.PADRE_ID == null ? '—' : `#${lote.PADRE_ID}`}</td>
          <td class="whitespace-normal">${refs}</td>
          <td>${prods}</td>
          <td class="text-right">
            <div class="inline-flex flex-wrap justify-end gap-2">
              <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-focus="${lote.ID}">Ver</button>
              ${quitar}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderHeader() {
    const row = state.expedicion;
    const abierta = row.FECHA_CIERRE == null;
    document.getElementById('exd-title').textContent = `Expedición #${row.ID}`;
    document.getElementById('exd-subtitle').textContent = unidadLabel(row.ID_UNIDAD);
    document.getElementById('exd-badges').innerHTML = `
      <span class="ui-badge ${abierta ? 'ui-badge-secondary' : 'ui-badge-outline'}">
        ${abierta ? 'Abierta' : 'Cerrada'}
      </span>
    `;
    document.getElementById('exd-stat-creada').textContent = formatDate(row.CREADO_EN);
    const ubicacionParts = [];
    if (row.ID_UBICACION_SALIDA != null) {
      ubicacionParts.push(`ID ${row.ID_UBICACION_SALIDA}`);
    }
    if (row.UBICACION_SALIDA_ID != null) {
      ubicacionParts.push(`Ubicación ${row.UBICACION_SALIDA_ID}`);
    }
    document.getElementById('exd-stat-ubicacion').textContent =
      ubicacionParts.length ? ubicacionParts.join(' · ') : '—';
    document.getElementById('exd-btn-cerrar').hidden = !abierta;
    loteForm.classList.toggle('hidden', !abierta);
    document.getElementById('exd-lote-hint').classList.toggle('hidden', !abierta);
  }

  function fillTipoFilter() {
    const select = document.getElementById('exd-filter-tipo');
    const previous = select.value || state.filters.tipo;
    const tipos = new Map();
    state.lotes.forEach((lote) => {
      if (!tipos.has(lote.ID_TIPO)) {
        tipos.set(lote.ID_TIPO, {
          ID: lote.ID_TIPO,
          NOMBRE: lote.TIPO?.NOMBRE || String(lote.ID_TIPO),
        });
      }
    });
    fillSelect(
      select,
      [...tipos.values()].sort((a, b) => a.NOMBRE.localeCompare(b.NOMBRE, 'es')),
      'Todos',
      (tipo) => tipo.NOMBRE,
    );
    if (previous && [...select.options].some((option) => option.value === previous)) {
      select.value = previous;
      state.filters.tipo = previous;
    }
  }

  function fillTipoRefFilter() {
    const select = document.getElementById('exd-filter-tipo-ref');
    const previous = select.value || state.filters.tipoRef;
    const tipos = new Map();
    state.lotes.forEach((lote) => {
      (lote.REFERENCIAS || []).forEach((ref) => {
        if (tipos.has(ref.ID_TIPO)) {
          return;
        }
        tipos.set(ref.ID_TIPO, {
          ID: ref.ID_TIPO,
          CLAVE: ref.TIPO?.CLAVE || '',
          NOMBRE: ref.TIPO?.NOMBRE || String(ref.ID_TIPO),
        });
      });
    });
    fillSelect(
      select,
      [...tipos.values()].sort((a, b) => a.NOMBRE.localeCompare(b.NOMBRE, 'es')),
      'Todos',
      (tipo) => (tipo.CLAVE ? `[ ${tipo.CLAVE} ] ${tipo.NOMBRE}` : tipo.NOMBRE),
    );
    if (previous && [...select.options].some((option) => option.value === previous)) {
      select.value = previous;
      state.filters.tipoRef = previous;
    }
  }

  async function loadDisponibles() {
    if (state.expedicion?.FECHA_CIERRE != null) {
      fillSelect(loteSelect, [], 'Expedición cerrada');
      loteSelect.disabled = true;
      return;
    }
    const result = await window.PackingApi.request('/lotes?embarcable=true&items=100');
    if (!result.ok) {
      fillSelect(loteSelect, [], 'No se pudieron cargar lotes');
      loteSelect.disabled = true;
      return;
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    fillSelect(
      loteSelect,
      rows,
      rows.length ? 'Selecciona un lote' : 'Sin lotes disponibles',
      (lote) => `#${lote.ID}`,
    );
    loteSelect.disabled = rows.length === 0;
  }

  async function loadCarga() {
    const result = await window.PackingApi.request(`/expediciones/${expedicionId}/carga`);
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      if (result.status === 404) {
        window.location.replace('/operacion/expediciones');
      }
      return;
    }

    state.expedicion = result.data.EXPEDICION;
    state.lotes = Array.isArray(result.data.LOTES) ? result.data.LOTES : [];
    state.porTipo = Array.isArray(result.data.RESUMEN?.POR_TIPO)
      ? result.data.RESUMEN.POR_TIPO
      : [];
    buildIndex(state.lotes);
    if (state.focusedId != null && !state.byId.has(state.focusedId)) {
      state.focusedId = null;
    }
    document.getElementById('exd-stat-lotes').textContent = String(result.data.RESUMEN?.LOTES ?? 0);
    document.getElementById('exd-stat-productos').textContent = String(result.data.RESUMEN?.PRODUCTOS ?? 0);
    renderHeader();
    fillTipoFilter();
    fillTipoRefFilter();
    renderPorTipo();
    renderTree();
    renderCargoTables();
    await loadDisponibles();
  }

  async function loadCatalogs() {
    const unidades = await window.PackingApi.request('/unidades-transporte?items=100');
    if (!unidades.ok) {
      throw new Error('catalogs');
    }
    state.unidades = new Map((unidades.data || []).map((row) => [row.ID, row]));
  }

  function openEditForm() {
    const row = state.expedicion;
    if (!row) {
      return;
    }
    showFormError('');
    fillSelect(
      unidadSelect,
      [...state.unidades.values()],
      'Selecciona una unidad',
      (unidad) => `${unidad.CODIGO} · ${unidad.PLACAS}`,
    );
    unidadSelect.value = String(row.ID_UNIDAD);
    document.getElementById('exd-id-ubicacion').value =
      row.ID_UBICACION_SALIDA == null ? '' : String(row.ID_UBICACION_SALIDA);
    document.getElementById('exd-ubicacion-salida').value =
      row.UBICACION_SALIDA_ID == null ? '' : String(row.UBICACION_SALIDA_ID);
    document.getElementById('exd-fecha-cierre').value = toLocalInput(row.FECHA_CIERRE);
    formDialog.showModal();
  }

  function focusLote(id) {
    state.focusedId = Number(id);
    let parent = state.byId.get(state.focusedId);
    while (parent?.PADRE_ID != null) {
      state.collapsed.delete(parent.PADRE_ID);
      parent = state.byId.get(parent.PADRE_ID);
    }
    renderTree();
    renderCargoTables();
    const activeTbody = state.cargoTab === 'productos' ? productosTbody : cargoTbody;
    const row = activeTbody.querySelector(`tr[data-lote="${state.focusedId}"]`);
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  treeNode.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      event.preventDefault();
      const id = Number(toggle.dataset.toggle);
      if (state.collapsed.has(id)) {
        state.collapsed.delete(id);
      } else {
        state.collapsed.add(id);
      }
      renderTree();
      return;
    }
    const focus = event.target.closest('[data-focus]');
    if (focus) {
      focusLote(focus.dataset.focus);
    }
  });

  treeNav.addEventListener('click', (event) => {
    const focus = event.target.closest('[data-focus]');
    if (focus) {
      focusLote(focus.dataset.focus);
    }
  });

  async function onCargoClick(event) {
    const focus = event.target.closest('[data-focus]');
    if (focus) {
      focusLote(focus.dataset.focus);
      return;
    }
    const quitar = event.target.closest('[data-action="quitar"]');
    if (!quitar) {
      return;
    }
    const embarqueId = Number(quitar.dataset.embarque);
    const result = await window.PackingApi.request(`/expediciones-lotes/${embarqueId}`, {
      method: 'DELETE',
    });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    window.PackingToast.toast('Lote quitado');
    await loadCarga();
  }

  cargoTbody.addEventListener('click', onCargoClick);
  productosTbody.addEventListener('click', onCargoClick);

  document.querySelectorAll('[data-cargo-tab]').forEach((button) => {
    button.addEventListener('click', () => setCargoTab(button.dataset.cargoTab));
  });

  porTipoNode.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter-tipo]');
    if (!button) {
      return;
    }
    const tipoId = button.dataset.filterTipo;
    document.getElementById('exd-filter-tipo').value = tipoId;
    state.filters.tipo = tipoId;
    state.focusedId = null;
    setCargoTab('lotes');
    renderTree();
    renderCargoTables();
  });

  document.getElementById('exd-cargo-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters.lote = document.getElementById('exd-filter-lote').value;
    state.filters.tipo = document.getElementById('exd-filter-tipo').value;
    state.filters.tipoRef = document.getElementById('exd-filter-tipo-ref').value;
    state.filters.ref = document.getElementById('exd-filter-ref').value;
    state.filters.prod = document.getElementById('exd-filter-prod').value;
    renderCargoTables();
  });

  document.getElementById('exd-cargo-clear').addEventListener('click', () => {
    document.getElementById('exd-cargo-filters').reset();
    state.filters = { lote: '', tipo: '', tipoRef: '', ref: '', prod: '' };
    state.focusedId = null;
    renderTree();
    renderCargoTables();
  });

  loteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.expedicion || state.expedicion.FECHA_CIERRE != null) {
      return;
    }
    showLoteError('');
    const submit = document.getElementById('exd-lote-submit');
    submit.disabled = true;
    try {
      const result = await window.PackingApi.request('/expediciones-lotes', {
        method: 'POST',
        body: JSON.stringify({
          ID_EXPEDICION: expedicionId,
          ID_LOTE: Number(loteSelect.value),
          ...sessionUsuario(),
        }),
      });
      if (!result.ok) {
        showLoteError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      window.PackingToast.toast('Lote embarcado');
      loteForm.reset();
      await loadCarga();
    } catch {
      showLoteError('Error de red.');
      window.PackingToast.toast('Error de red', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById('exd-btn-edit').addEventListener('click', openEditForm);
  document.getElementById('exd-form-cancel').addEventListener('click', () => {
    if (formDialog.open) {
      formDialog.close();
    }
  });

  document.getElementById('exd-btn-cerrar').addEventListener('click', async () => {
    const row = state.expedicion;
    if (!row || row.FECHA_CIERRE != null) {
      return;
    }
    const result = await window.PackingApi.request(`/expediciones/${row.ID}`, {
      method: 'PUT',
      body: JSON.stringify({
        ID_UNIDAD: row.ID_UNIDAD,
        FECHA_CIERRE: new Date().toISOString(),
        ID_UBICACION_SALIDA: row.ID_UBICACION_SALIDA,
        UBICACION_SALIDA_ID: row.UBICACION_SALIDA_ID,
        ...sessionUsuario(),
      }),
    });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    window.PackingToast.toast('Expedición cerrada');
    await loadCarga();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');
    const result = await window.PackingApi.request(`/expediciones/${expedicionId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ID_UNIDAD: Number(unidadSelect.value),
        ID_UBICACION_SALIDA: optionalNumber(document.getElementById('exd-id-ubicacion').value),
        UBICACION_SALIDA_ID: optionalNumber(document.getElementById('exd-ubicacion-salida').value),
        FECHA_CIERRE: fromLocalInput(document.getElementById('exd-fecha-cierre').value),
        ...sessionUsuario(),
      }),
    });
    if (!result.ok) {
      showFormError(mapError(result.error));
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    if (formDialog.open) {
      formDialog.close();
    }
    window.PackingToast.toast('Expedición actualizada');
    await loadCarga();
  });

  try {
    await loadCatalogs();
    await loadCarga();
  } catch {
    window.PackingToast.toast('No se pudo cargar el detalle', 'error');
  }
});
