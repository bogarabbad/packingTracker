document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    deleteId: null,
    detailLote: null,
    formOptions: null,
    tipos: new Map(),
    refTipos: new Map(),
    unidadesMedida: new Map(),
    unidadesTransporte: new Map(),
    lotesCache: new Map(),
    referencias: [],
    productos: [],
    hijos: [],
    filters: { id_tipo: '', es_final: '', id_unidad: '', padre_id: '' },
  };

  const statusNode = document.getElementById('lo-status');
  const tbody = document.getElementById('lo-tbody');
  const pageLabel = document.getElementById('lo-page-label');
  const prevBtn = document.getElementById('lo-prev');
  const nextBtn = document.getElementById('lo-next');
  const formDialog = document.getElementById('lo-form-dialog');
  const detailDialog = document.getElementById('lo-detail-dialog');
  const deleteDialog = document.getElementById('lo-delete-dialog');
  const form = document.getElementById('lo-form');
  const formError = document.getElementById('lo-form-error');
  const formTitle = document.getElementById('lo-form-title');
  const tipoSelect = document.getElementById('lo-id-tipo');
  const padreSelect = document.getElementById('lo-padre-id');
  const unidadSelect = document.getElementById('lo-id-unidad');
  const padreWrap = document.getElementById('lo-padre-wrap');
  const padreHint = document.getElementById('lo-padre-hint');
  const unidadWrap = document.getElementById('lo-unidad-wrap');
  const prodSection = document.getElementById('lo-prod-section');
  const prodHint = document.getElementById('lo-prod-hint');
  const hijosSection = document.getElementById('lo-hijos-section');
  const hijosTbody = document.getElementById('lo-hijos-tbody');
  const hijosStatus = document.getElementById('lo-hijos-status');

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
      invalid_id_tipo: 'Tipo inválido.',
      invalid_padre_id: 'Lote padre inválido o el lote ya está embarcado.',
      invalid_id_unidad: 'Unidad inválida.',
      invalid_tipo_lote: 'El lote no cumple las reglas de su tipo.',
      invalid_lote: 'Datos de lote inválidos.',
      usuario_sin_ubicacion: 'Tu usuario no tiene una ubicación asignada.',
      invalid_id_lote: 'Lote inválido.',
      invalid_referencia: 'Referencia inválida.',
      invalid_descripcion: 'Descripción inválida.',
      invalid_clave_producto: 'Clave de producto inválida.',
      invalid_cantidad: 'Cantidad inválida.',
      invalid_producto: 'Producto inválido.',
      record_in_use: 'El lote está en uso y no se puede eliminar.',
      lote_has_productos: 'No se puede eliminar: el lote tiene productos.',
      lote_has_referencias: 'No se puede eliminar: el lote tiene referencias.',
      lote_has_hijos: 'No se puede eliminar: el lote tiene lotes hijo.',
      lote_has_ubicaciones: 'No se puede eliminar: el lote tiene ubicaciones.',
      lote_has_productos: 'No se puede eliminar: el lote tiene productos.',
      lote_has_referencias: 'No se puede eliminar: el lote tiene referencias.',
      lote_has_hijos: 'No se puede eliminar: el lote tiene lotes hijo.',
      lote_has_ubicaciones: 'No se puede eliminar: el lote tiene ubicaciones.',
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

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
  }

  function showRefError(message) {
    const node = document.getElementById('lo-ref-error');
    node.textContent = message;
    node.classList.toggle('hidden', !message);
  }

  function showProdError(message) {
    const node = document.getElementById('lo-prod-error');
    node.textContent = message;
    node.classList.toggle('hidden', !message);
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

  function tipoEsFinal(idTipo) {
    return Boolean(state.tipos.get(Number(idTipo))?.ES_FINAL);
  }

  function syncFormByTipo() {
    const final = tipoEsFinal(tipoSelect.value);
    const lockedPadre = state.formOptions?.padreId != null;
    padreWrap.classList.toggle('hidden', !final);
    padreHint.classList.toggle('hidden', !final || lockedPadre);
    unidadWrap.classList.toggle('hidden', final);
    if (!final) {
      padreSelect.value = '';
    } else {
      unidadSelect.value = '';
      if (lockedPadre) {
        padreSelect.value = String(state.formOptions.padreId);
      }
    }
  }

  function openForm(row, options = {}) {
    showFormError('');
    form.reset();
    state.formOptions = {
      padreId: options.padreId ?? null,
      onlyFinalTipos: Boolean(options.onlyFinalTipos),
      returnToPadreId: options.returnToPadreId ?? null,
    };
    document.getElementById('lo-id').value = row ? String(row.ID) : '';
    const creatingChild = !row && state.formOptions.padreId != null;
    formTitle.textContent = row
      ? 'Editar lote'
      : (creatingChild ? `Nuevo hijo de #${state.formOptions.padreId}` : 'Nuevo lote');

    const tiposList = state.formOptions.onlyFinalTipos
      ? [...state.tipos.values()].filter((tipo) => tipo.ES_FINAL)
      : [...state.tipos.values()];
    fillSelect(
      tipoSelect,
      tiposList,
      'Selecciona un tipo',
      (tipo) => `${tipo.CODIGO} · ${tipo.NOMBRE}`,
    );

    const padres = [...state.lotesCache.values()].filter((lote) => {
      if (row && lote.ID === row.ID) {
        return false;
      }
      return !tipoEsFinal(lote.ID_TIPO);
    });
    if (
      state.formOptions.padreId != null
      && !padres.some((lote) => lote.ID === state.formOptions.padreId)
    ) {
      const cached = state.lotesCache.get(state.formOptions.padreId);
      if (cached) {
        padres.unshift(cached);
      } else {
        padres.unshift({ ID: state.formOptions.padreId, ID_TIPO: null });
      }
    }
    fillSelect(
      padreSelect,
      padres,
      'Sin padre',
      (lote) => {
        const tipo = lote.ID_TIPO == null ? null : state.tipos.get(lote.ID_TIPO);
        return `#${lote.ID} · ${tipo ? tipo.NOMBRE : 'lote'}`;
      },
    );

    fillSelect(
      unidadSelect,
      [...state.unidadesTransporte.values()],
      'Sin unidad',
      (unidad) => `${unidad.CODIGO} · ${unidad.PLACAS}`,
    );

    if (row) {
      tipoSelect.value = String(row.ID_TIPO);
      syncFormByTipo();
      padreSelect.value = row.PADRE_ID == null ? '' : String(row.PADRE_ID);
      unidadSelect.value = row.ID_UNIDAD == null ? '' : String(row.ID_UNIDAD);
    } else if (creatingChild) {
      const firstFinal = tiposList[0];
      if (firstFinal) {
        tipoSelect.value = String(firstFinal.ID);
      }
      syncFormByTipo();
      padreSelect.value = String(state.formOptions.padreId);
      padreSelect.disabled = true;
    } else {
      syncFormByTipo();
      padreSelect.disabled = false;
    }

    formDialog.showModal();
  }

  async function closeForm({ reopenPadre = false } = {}) {
    const returnToPadreId = reopenPadre
      ? (state.formOptions?.returnToPadreId ?? null)
      : null;
    state.formOptions = null;
    padreSelect.disabled = false;
    tipoSelect.disabled = false;
    if (formDialog.open) {
      formDialog.close();
    }
    if (returnToPadreId != null) {
      const padreResult = await window.PackingApi.request(`/lotes/${returnToPadreId}`);
      if (padreResult.ok) {
        state.lotesCache.set(padreResult.data.ID, padreResult.data);
        await openDetail(padreResult.data);
      }
    }
  }

  function closeDetail() {
    state.detailLote = null;
    state.referencias = [];
    state.productos = [];
    state.hijos = [];
    if (detailDialog.open) {
      detailDialog.close();
    }
  }

  function renderHijos() {
    const rows = state.hijos;
    hijosStatus.textContent = `${rows.length} hijo(s)`;
    if (!rows.length) {
      hijosTbody.innerHTML =
        '<tr><td colspan="3" class="text-muted-foreground">Sin hijos.</td></tr>';
      return;
    }
    hijosTbody.innerHTML = rows.map((row) => {
      const tipo = state.tipos.get(row.ID_TIPO);
      return `
        <tr data-id="${row.ID}">
          <td>${row.ID}</td>
          <td>${escapeHtml(tipo ? tipo.NOMBRE : row.ID_TIPO)}</td>
          <td class="text-right">
            <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-action="open-hijo">
              Abrir
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderRows(rows) {
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-muted-foreground">Sin registros.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => {
      const tipo = state.tipos.get(row.ID_TIPO);
      const esFinal = Boolean(tipo?.ES_FINAL);
      const unidad = row.ID_UNIDAD == null
        ? '—'
        : (state.unidadesTransporte.get(row.ID_UNIDAD)?.CODIGO || row.ID_UNIDAD);
      return `
        <tr data-id="${row.ID}">
          <td>${row.ID}</td>
          <td>${escapeHtml(tipo ? tipo.NOMBRE : row.ID_TIPO)}</td>
          <td>
            <span class="ui-badge ${esFinal ? 'ui-badge-secondary' : 'ui-badge-outline'}">
              ${esFinal ? 'Sí' : 'No'}
            </span>
          </td>
          <td>${row.PADRE_ID == null ? '—' : `#${row.PADRE_ID}`}</td>
          <td>${escapeHtml(unidad)}</td>
          <td class="text-right">
            <div class="inline-flex flex-wrap justify-end gap-2">
              <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-action="detail">Detalle</button>
              <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-action="edit">Editar</button>
              <button type="button" class="ui-btn ui-btn-destructive ui-btn-sm" data-action="delete">Eliminar</button>
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

  function renderReferencias() {
    const rows = state.referencias;
    document.getElementById('lo-ref-status').textContent = `${rows.length} referencia(s)`;
    if (!rows.length) {
      document.getElementById('lo-ref-tbody').innerHTML =
        '<tr><td colspan="4" class="text-muted-foreground">Sin referencias.</td></tr>';
      return;
    }
    document.getElementById('lo-ref-tbody').innerHTML = rows.map((row) => {
      const tipo = state.refTipos.get(row.ID_TIPO);
      return `
        <tr data-id="${row.ID}">
          <td>${escapeHtml(tipo ? tipo.NOMBRE : row.ID_TIPO)}</td>
          <td>${escapeHtml(row.REFERENCIA)}</td>
          <td>${escapeHtml(row.DESCRIPCION || '—')}</td>
          <td class="text-right">
            <button type="button" class="ui-btn ui-btn-destructive ui-btn-sm" data-action="delete-ref">Quitar</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function defaultUnidadId(unidades) {
    const unidad = unidades.find((row) => row.CODIGO === 'unidad');
    return unidad ? String(unidad.ID) : '';
  }

  function fillProdUnidadSelect(unidades) {
    const select = document.getElementById('lo-prod-unidad');
    fillSelect(
      select,
      unidades,
      unidades.length ? 'Selecciona una unidad' : 'Sin unidades para este tipo',
      (unidad) => `${unidad.CODIGO} · ${unidad.NOMBRE}`,
    );
    select.disabled = unidades.length === 0;
    const defaultId = defaultUnidadId(unidades);
    if (defaultId) {
      select.value = defaultId;
    }
  }

  function renderProductos() {
    const rows = state.productos;
    document.getElementById('lo-prod-status').textContent = `${rows.length} producto(s)`;
    if (!rows.length) {
      document.getElementById('lo-prod-tbody').innerHTML =
        '<tr><td colspan="4" class="text-muted-foreground">Sin productos.</td></tr>';
      return;
    }
    document.getElementById('lo-prod-tbody').innerHTML = rows.map((row) => {
      const unidad = state.unidadesMedida.get(row.ID_UNIDAD);
      return `
        <tr data-id="${row.ID}">
          <td>${escapeHtml(row.CLAVE_PRODUCTO)}</td>
          <td>${escapeHtml(row.CANTIDAD)}</td>
          <td>${escapeHtml(unidad ? unidad.NOMBRE : row.ID_UNIDAD)}</td>
          <td class="text-right">
            <button type="button" class="ui-btn ui-btn-destructive ui-btn-sm" data-action="delete-prod">Quitar</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadDetailChildren(lote) {
    showRefError('');
    showProdError('');
    const esFinal = tipoEsFinal(lote.ID_TIPO);
    const requests = [
      window.PackingApi.request(`/lotes-referencias?id_lote=${lote.ID}&items=100`),
      window.PackingApi.request(`/lotes-productos?id_lote=${lote.ID}&items=100`),
      window.PackingApi.request(`/lotes-tipos-unidades?id_tipo=${lote.ID_TIPO}&items=100`),
    ];
    if (!esFinal) {
      requests.push(
        window.PackingApi.request(`/lotes?padre_id=${lote.ID}&items=100`),
      );
    }

    const [refs, prods, medidas, hijos] = await Promise.all(requests);

    if (!refs.ok) {
      window.PackingToast.toast(mapError(refs.error), 'error');
    } else {
      state.referencias = Array.isArray(refs.data) ? refs.data : [];
      renderReferencias();
    }

    prodSection.classList.toggle('hidden', !esFinal);
    prodHint.classList.toggle('hidden', esFinal);
    hijosSection.classList.toggle('hidden', esFinal);

    if (esFinal) {
      state.hijos = [];
      const relaciones = medidas.ok && Array.isArray(medidas.data) ? medidas.data : [];
      const unidades = relaciones
        .map((rel) => state.unidadesMedida.get(rel.ID_UNIDAD))
        .filter(Boolean);
      fillProdUnidadSelect(unidades);

      if (!prods.ok) {
        window.PackingToast.toast(mapError(prods.error), 'error');
      } else {
        state.productos = Array.isArray(prods.data) ? prods.data : [];
        renderProductos();
      }
    } else {
      state.productos = [];
      if (!hijos.ok) {
        window.PackingToast.toast(mapError(hijos.error), 'error');
        state.hijos = [];
      } else {
        state.hijos = Array.isArray(hijos.data) ? hijos.data : [];
        state.hijos.forEach((row) => state.lotesCache.set(row.ID, row));
      }
      renderHijos();
    }
  }

  async function openDetail(lote) {
    state.detailLote = lote;
    const tipo = state.tipos.get(lote.ID_TIPO);
    document.getElementById('lo-detail-title').textContent = `Lote #${lote.ID}`;
    document.getElementById('lo-detail-subtitle').textContent = tipo
      ? `${tipo.CODIGO} · ${tipo.NOMBRE}`
      : `Tipo ${lote.ID_TIPO}`;

    const badges = [];
    badges.push(`<span class="ui-badge ${tipo?.ES_FINAL ? 'ui-badge-secondary' : 'ui-badge-outline'}">${tipo?.ES_FINAL ? 'Final' : 'No final'}</span>`);
    if (lote.PADRE_ID != null) {
      badges.push(`<span class="ui-badge ui-badge-outline">Padre #${lote.PADRE_ID}</span>`);
    }
    if (lote.ID_UNIDAD != null) {
      const unidad = state.unidadesTransporte.get(lote.ID_UNIDAD);
      badges.push(`<span class="ui-badge ui-badge-outline">${escapeHtml(unidad ? unidad.CODIGO : lote.ID_UNIDAD)}</span>`);
    }
    document.getElementById('lo-detail-badges').innerHTML = badges.join('');

    fillSelect(
      document.getElementById('lo-ref-tipo'),
      [...state.refTipos.values()],
      'Selecciona un tipo',
      (tipoRef) => `${tipoRef.CODIGO} · ${tipoRef.NOMBRE}`,
    );
    document.getElementById('lo-ref-form').reset();
    document.getElementById('lo-prod-form').reset();

    if (!detailDialog.open) {
      detailDialog.showModal();
    }
    await loadDetailChildren(lote);
  }

  async function loadCatalogs() {
    const [tipos, refTipos, unidades, transporte, lotes] = await Promise.all([
      window.PackingApi.request('/lotes-tipos?items=100'),
      window.PackingApi.request('/referencias-tipos?items=100'),
      window.PackingApi.request('/unidades-medida?items=100'),
      window.PackingApi.request('/unidades-transporte?items=100'),
      window.PackingApi.request('/lotes?items=100'),
    ]);

    if (!tipos.ok || !refTipos.ok || !unidades.ok || !transporte.ok || !lotes.ok) {
      throw new Error('catalogs');
    }

    state.tipos = new Map((tipos.data || []).map((row) => [row.ID, row]));
    state.refTipos = new Map((refTipos.data || []).map((row) => [row.ID, row]));
    state.unidadesMedida = new Map((unidades.data || []).map((row) => [row.ID, row]));
    state.unidadesTransporte = new Map((transporte.data || []).map((row) => [row.ID, row]));
    state.lotesCache = new Map((lotes.data || []).map((row) => [row.ID, row]));

    fillSelect(
      document.getElementById('lo-filter-tipo'),
      [...state.tipos.values()],
      'Todos',
      (tipo) => `${tipo.CODIGO} · ${tipo.NOMBRE}`,
    );
    fillSelect(
      document.getElementById('lo-filter-unidad'),
      [...state.unidadesTransporte.values()],
      'Todas',
      (unidad) => `${unidad.CODIGO} · ${unidad.PLACAS}`,
    );
    const padres = [...state.lotesCache.values()].filter((lote) => !tipoEsFinal(lote.ID_TIPO));
    fillSelect(
      document.getElementById('lo-filter-padre'),
      padres,
      'Todos',
      (lote) => {
        const tipo = state.tipos.get(lote.ID_TIPO);
        return `#${lote.ID} · ${tipo ? tipo.NOMBRE : lote.ID_TIPO}`;
      },
    );
  }

  function buildListUrl() {
    const params = new URLSearchParams({
      page: String(state.page),
      items: String(state.items),
    });
    if (state.filters.id_tipo) {
      params.set('id_tipo', state.filters.id_tipo);
    }
    if (state.filters.es_final) {
      params.set('es_final', state.filters.es_final);
    }
    if (state.filters.id_unidad) {
      params.set('id_unidad', state.filters.id_unidad);
    }
    if (state.filters.padre_id) {
      params.set('padre_id', state.filters.padre_id);
    }
    return `/lotes?${params}`;
  }

  function readFilters() {
    state.filters.id_tipo = document.getElementById('lo-filter-tipo').value;
    state.filters.es_final = document.getElementById('lo-filter-final').value;
    state.filters.id_unidad = document.getElementById('lo-filter-unidad').value;
    state.filters.padre_id = document.getElementById('lo-filter-padre').value;
  }

  async function loadList() {
    statusNode.textContent = 'Cargando…';
    const result = await window.PackingApi.request(buildListUrl());
    if (!result.ok) {
      statusNode.textContent = 'Error al cargar';
      tbody.innerHTML = '<tr><td colspan="6" class="text-destructive">No se pudo obtener el listado.</td></tr>';
      window.PackingToast.toast(mapError(result.error), 'error');
      if (result.status === 401) {
        window.location.replace('/login');
      }
      return;
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    rows.forEach((row) => state.lotesCache.set(row.ID, row));
    state.total = result.metadata.total ?? rows.length;
    statusNode.textContent = `${state.total} registro(s)`;
    renderRows(rows);
    updatePager();
  }

  tipoSelect.addEventListener('change', syncFormByTipo);
  document.getElementById('lo-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('lo-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });
  document.getElementById('lo-filters-clear').addEventListener('click', async () => {
    document.getElementById('lo-filter-tipo').value = '';
    document.getElementById('lo-filter-final').value = '';
    document.getElementById('lo-filter-unidad').value = '';
    document.getElementById('lo-filter-padre').value = '';
    state.filters = { id_tipo: '', es_final: '', id_unidad: '', padre_id: '' };
    state.page = 1;
    await loadList();
  });
  document.getElementById('lo-form-cancel').addEventListener('click', () => {
    closeForm({ reopenPadre: true });
  });
  document.getElementById('lo-detail-close').addEventListener('click', closeDetail);
  document.getElementById('lo-detail-edit').addEventListener('click', () => {
    const lote = state.detailLote;
    closeDetail();
    if (lote) {
      openForm(lote);
    }
  });
  document.getElementById('lo-btn-nuevo-hijo').addEventListener('click', () => {
    const padre = state.detailLote;
    if (!padre || tipoEsFinal(padre.ID_TIPO)) {
      return;
    }
    detailDialog.close();
    openForm(null, {
      padreId: padre.ID,
      onlyFinalTipos: true,
      returnToPadreId: padre.ID,
    });
  });
  hijosTbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="open-hijo"]');
    if (!button) {
      return;
    }
    const row = button.closest('tr[data-id]');
    if (!row) {
      return;
    }
    const id = Number(row.dataset.id);
    const result = await window.PackingApi.request(`/lotes/${id}`);
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.lotesCache.set(result.data.ID, result.data);
    await openDetail(result.data);
  });
  document.getElementById('lo-delete-cancel').addEventListener('click', () => {
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

    if (action === 'detail' || action === 'edit') {
      const result = await window.PackingApi.request(`/lotes/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      state.lotesCache.set(result.data.ID, result.data);
      if (action === 'detail') {
        await openDetail(result.data);
      } else {
        openForm(result.data);
      }
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('lo-delete-text').textContent = `¿Eliminar el lote #${id}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('lo-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/lotes/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    state.lotesCache.delete(id);
    deleteDialog.close();
    window.PackingToast.toast('Lote eliminado');
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');
    const idValue = document.getElementById('lo-id').value;
    const final = tipoEsFinal(tipoSelect.value);
    const returnToPadreId = state.formOptions?.returnToPadreId ?? null;
    const payload = {
      ID_TIPO: Number(tipoSelect.value),
      PADRE_ID: final ? optionalNumber(padreSelect.value) : null,
      ID_UNIDAD: final ? null : optionalNumber(unidadSelect.value),
      ...sessionUsuario(),
    };
    const submit = document.getElementById('lo-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/lotes/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/lotes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      if (!result.ok) {
        showFormError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }

      state.formOptions = null;
      padreSelect.disabled = false;
      if (formDialog.open) {
        formDialog.close();
      }
      window.PackingToast.toast(idValue ? 'Lote actualizado' : 'Lote creado');
      state.lotesCache.set(result.data.ID, result.data);
      if (!idValue) {
        state.page = 1;
      }
      await loadList();

      if (returnToPadreId != null) {
        const padreResult = await window.PackingApi.request(`/lotes/${returnToPadreId}`);
        if (padreResult.ok) {
          state.lotesCache.set(padreResult.data.ID, padreResult.data);
          await openDetail(padreResult.data);
          return;
        }
      }
      await openDetail(result.data);
    } catch {
      showFormError('Error de red.');
      window.PackingToast.toast('Error de red', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById('lo-ref-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.detailLote) {
      return;
    }
    showRefError('');
    const payload = {
      ID_LOTE: state.detailLote.ID,
      ID_TIPO: Number(document.getElementById('lo-ref-tipo').value),
      REFERENCIA: document.getElementById('lo-ref-referencia').value.trim(),
      DESCRIPCION: optionalText(document.getElementById('lo-ref-descripcion').value),
      ...sessionUsuario(),
    };
    const result = await window.PackingApi.request('/lotes-referencias', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!result.ok) {
      showRefError(mapError(result.error));
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    document.getElementById('lo-ref-form').reset();
    window.PackingToast.toast('Referencia agregada');
    await loadDetailChildren(state.detailLote);
  });

  document.getElementById('lo-ref-tbody').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="delete-ref"]');
    if (!button || !state.detailLote) {
      return;
    }
    const row = button.closest('tr[data-id]');
    if (!row) {
      return;
    }
    const id = Number(row.dataset.id);
    const result = await window.PackingApi.request(`/lotes-referencias/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    window.PackingToast.toast('Referencia eliminada');
    await loadDetailChildren(state.detailLote);
  });

  document.getElementById('lo-prod-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.detailLote) {
      return;
    }
    showProdError('');
    const payload = {
      ID_LOTE: state.detailLote.ID,
      CLAVE_PRODUCTO: document.getElementById('lo-prod-clave').value.trim(),
      CANTIDAD: Number(document.getElementById('lo-prod-cantidad').value),
      ID_UNIDAD: Number(document.getElementById('lo-prod-unidad').value),
    };
    const result = await window.PackingApi.request('/lotes-productos', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!result.ok) {
      showProdError(mapError(result.error));
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    window.PackingToast.toast('Producto agregado');
    await loadDetailChildren(state.detailLote);
    document.getElementById('lo-prod-form').reset();
    const select = document.getElementById('lo-prod-unidad');
    const unidadDefault = [...select.options].find((option) => {
      const unidad = state.unidadesMedida.get(Number(option.value));
      return unidad && unidad.CODIGO === 'unidad';
    });
    if (unidadDefault) {
      select.value = unidadDefault.value;
    }
  });

  document.getElementById('lo-prod-tbody').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="delete-prod"]');
    if (!button || !state.detailLote) {
      return;
    }
    const row = button.closest('tr[data-id]');
    if (!row) {
      return;
    }
    const id = Number(row.dataset.id);
    const result = await window.PackingApi.request(`/lotes-productos/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    window.PackingToast.toast('Producto eliminado');
    await loadDetailChildren(state.detailLote);
  });

  try {
    await loadCatalogs();
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('No se pudieron cargar los catálogos', 'error');
  }
});
