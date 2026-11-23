document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    deleteId: null,
    detailTipo: null,
    unidades: new Map(),
    relaciones: [],
    filters: { q: '', activo: '', es_final: '' },
  };

  const statusNode = document.getElementById('lt-status');
  const tbody = document.getElementById('lt-tbody');
  const pageLabel = document.getElementById('lt-page-label');
  const prevBtn = document.getElementById('lt-prev');
  const nextBtn = document.getElementById('lt-next');
  const formDialog = document.getElementById('lt-form-dialog');
  const detailDialog = document.getElementById('lt-detail-dialog');
  const deleteDialog = document.getElementById('lt-delete-dialog');
  const form = document.getElementById('lt-form');
  const formError = document.getElementById('lt-form-error');
  const formTitle = document.getElementById('lt-form-title');
  const detailAddForm = document.getElementById('lt-detail-add-form');
  const detailUnidadSelect = document.getElementById('lt-detail-unidad');
  const detailUnidadesError = document.getElementById('lt-detail-unidades-error');
  const detailUnidadesTbody = document.getElementById('lt-detail-unidades-tbody');
  const detailUnidadesStatus = document.getElementById('lt-detail-unidades-status');
  const detailUnidadesSection = document.getElementById('lt-detail-unidades');
  const detailUnidadesHint = document.getElementById('lt-detail-unidades-hint');

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
      duplicate_relacion: 'Esa unidad ya está asignada al tipo.',
      invalid_codigo: 'Código inválido.',
      invalid_nombre: 'Nombre inválido.',
      invalid_activo: 'Estado activo inválido.',
      invalid_es_final: 'No se puede cambiar la categoría final.',
      invalid_tipo_lote: 'El tipo queda inconsistente con sus lotes o unidades.',
      invalid_id_tipo: 'Tipo inválido.',
      invalid_id_unidad: 'Unidad de medida inválida.',
      seed_not_deletable: 'Este registro no se puede eliminar.',
      record_in_use: 'El registro está en uso y no se puede eliminar.',
      not_found: 'Registro no encontrado.',
      unauthorized: 'Sesión no válida.',
    };
    return messages[code] || 'No se pudo completar la operación.';
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
  }

  function showDetailUnidadesError(message) {
    detailUnidadesError.textContent = message;
    detailUnidadesError.classList.toggle('hidden', !message);
  }

  function openForm(row) {
    showFormError('');
    form.reset();
    document.getElementById('lt-es-final').checked = false;
    document.getElementById('lt-activo').checked = true;
    document.getElementById('lt-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar tipo' : 'Nuevo tipo';

    if (row) {
      document.getElementById('lt-codigo').value = row.CODIGO || '';
      document.getElementById('lt-nombre').value = row.NOMBRE || '';
      document.getElementById('lt-es-final').checked = Boolean(row.ES_FINAL);
      document.getElementById('lt-activo').checked = Boolean(row.ACTIVO);
    }

    formDialog.showModal();
  }

  function closeForm() {
    if (formDialog.open) {
      formDialog.close();
    }
  }

  function closeDetail() {
    state.detailTipo = null;
    state.relaciones = [];
    if (detailDialog.open) {
      detailDialog.close();
    }
  }

  function fillUnidadSelect(available) {
    detailUnidadSelect.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = available.length ? 'Selecciona una unidad' : 'No hay unidades disponibles';
    detailUnidadSelect.appendChild(blank);

    available.forEach((unidad) => {
      const option = document.createElement('option');
      option.value = String(unidad.ID);
      option.textContent = `${unidad.CODIGO} · ${unidad.NOMBRE}`;
      detailUnidadSelect.appendChild(option);
    });

    detailUnidadSelect.disabled = available.length === 0;
    document.getElementById('lt-detail-add').disabled = available.length === 0;
  }

  function renderDetailUnidades() {
    const rows = state.relaciones;
    detailUnidadesStatus.textContent = `${rows.length} unidad(es)`;

    if (!rows.length) {
      detailUnidadesTbody.innerHTML = '<tr><td colspan="3" class="text-muted-foreground">Sin unidades.</td></tr>';
    } else {
      detailUnidadesTbody.innerHTML = rows.map((rel) => {
        const unidad = state.unidades.get(rel.ID_UNIDAD);
        const codigo = unidad ? unidad.CODIGO : rel.ID_UNIDAD;
        const nombre = unidad ? unidad.NOMBRE : '—';
        const deleteDisabled = rel.ES_SEMILLA ? 'disabled title="Registro semilla"' : '';
        return `
          <tr data-rel-id="${rel.ID}">
            <td>${escapeHtml(codigo)}</td>
            <td>${escapeHtml(nombre)}</td>
            <td class="text-right">
              <button type="button" class="ui-btn ui-btn-destructive ui-btn-sm" data-action="remove-unidad" ${deleteDisabled}>
                Quitar
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    const assigned = new Set(rows.map((rel) => rel.ID_UNIDAD));
    const available = [...state.unidades.values()].filter((unidad) => !assigned.has(unidad.ID));
    fillUnidadSelect(available);
  }

  async function loadDetailUnidades(tipoId) {
    showDetailUnidadesError('');
    detailUnidadesStatus.textContent = 'Cargando…';
    const result = await window.PackingApi.request(
      `/lotes-tipos-unidades?id_tipo=${tipoId}&items=100`,
    );
    if (!result.ok) {
      detailUnidadesStatus.textContent = 'Error al cargar';
      showDetailUnidadesError(mapError(result.error));
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.relaciones = Array.isArray(result.data) ? result.data : [];
    renderDetailUnidades();
  }

  async function openDetail(row) {
    state.detailTipo = row;
    document.getElementById('lt-detail-title').textContent = row.NOMBRE || 'Detalle del tipo';
    document.getElementById('lt-detail-subtitle').textContent = row.CODIGO || '';

    const finalBadge = document.getElementById('lt-detail-final');
    finalBadge.textContent = row.ES_FINAL ? 'Categoría final' : 'No final';
    finalBadge.className = `ui-badge ${row.ES_FINAL ? 'ui-badge-secondary' : 'ui-badge-outline'}`;

    const activoBadge = document.getElementById('lt-detail-activo');
    activoBadge.textContent = row.ACTIVO ? 'Activo' : 'Inactivo';
    activoBadge.className = `ui-badge ${row.ACTIVO ? 'ui-badge-secondary' : 'ui-badge-outline'}`;

    detailUnidadesSection.classList.toggle('hidden', !row.ES_FINAL);
    detailUnidadesHint.classList.toggle('hidden', Boolean(row.ES_FINAL));

    detailDialog.showModal();

    if (row.ES_FINAL) {
      await loadDetailUnidades(row.ID);
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
          <td>
            <span class="ui-badge ${row.ES_FINAL ? 'ui-badge-secondary' : 'ui-badge-outline'}">
              ${row.ES_FINAL ? 'Sí' : 'No'}
            </span>
          </td>
          <td>
            <span class="ui-badge ${row.ACTIVO ? 'ui-badge-secondary' : 'ui-badge-outline'}">
              ${row.ACTIVO ? 'Activo' : 'Inactivo'}
            </span>
          </td>
          <td class="text-right">
            <div class="inline-flex flex-wrap justify-end gap-2">
              <button type="button" class="ui-btn ui-btn-outline ui-btn-sm" data-action="detail">Detalle</button>
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

  async function loadUnidadesMedida() {
    const result = await window.PackingApi.request('/unidades-medida?items=100');
    if (!result.ok) {
      throw new Error('unidades');
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    state.unidades = new Map(rows.map((row) => [row.ID, row]));
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
    if (state.filters.es_final) {
      params.set('es_final', state.filters.es_final);
    }
    return `/lotes-tipos?${params}`;
  }

  function readFilters() {
    state.filters.q = document.getElementById('lt-filter-q').value.trim();
    state.filters.activo = document.getElementById('lt-filter-activo').value;
    state.filters.es_final = document.getElementById('lt-filter-final').value;
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

  document.getElementById('lt-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('lt-form-cancel').addEventListener('click', closeForm);
  document.getElementById('lt-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });
  document.getElementById('lt-filters-clear').addEventListener('click', async () => {
    document.getElementById('lt-filters').reset();
    state.filters = { q: '', activo: '', es_final: '' };
    state.page = 1;
    await loadList();
  });
  document.getElementById('lt-detail-close').addEventListener('click', closeDetail);
  document.getElementById('lt-detail-edit').addEventListener('click', () => {
    const tipo = state.detailTipo;
    closeDetail();
    if (tipo) {
      openForm(tipo);
    }
  });
  document.getElementById('lt-delete-cancel').addEventListener('click', () => {
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
      const result = await window.PackingApi.request(`/lotes-tipos/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      if (action === 'detail') {
        await openDetail(result.data);
      } else {
        openForm(result.data);
      }
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('lt-delete-text').textContent = `¿Eliminar el tipo ${row.children[0].textContent}?`;
      deleteDialog.showModal();
    }
  });

  detailUnidadesTbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="remove-unidad"]');
    if (!button || !state.detailTipo) {
      return;
    }
    const row = button.closest('tr[data-rel-id]');
    if (!row) {
      return;
    }
    const relId = Number(row.dataset.relId);
    button.disabled = true;
    const result = await window.PackingApi.request(`/lotes-tipos-unidades/${relId}`, {
      method: 'DELETE',
    });
    if (!result.ok) {
      button.disabled = false;
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    window.PackingToast.toast('Unidad quitada');
    await loadDetailUnidades(state.detailTipo.ID);
  });

  detailAddForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.detailTipo) {
      return;
    }
    showDetailUnidadesError('');
    const idUnidad = Number(detailUnidadSelect.value);
    if (!idUnidad) {
      showDetailUnidadesError('Selecciona una unidad.');
      return;
    }

    const submit = document.getElementById('lt-detail-add');
    submit.disabled = true;
    try {
      const result = await window.PackingApi.request('/lotes-tipos-unidades', {
        method: 'POST',
        body: JSON.stringify({
          ID_TIPO: state.detailTipo.ID,
          ID_UNIDAD: idUnidad,
        }),
      });
      if (!result.ok) {
        showDetailUnidadesError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      window.PackingToast.toast('Unidad agregada');
      await loadDetailUnidades(state.detailTipo.ID);
    } catch {
      showDetailUnidadesError('Error de red.');
      window.PackingToast.toast('Error de red', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById('lt-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/lotes-tipos/${id}`, { method: 'DELETE' });
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

    const idValue = document.getElementById('lt-id').value;
    const payload = {
      CODIGO: document.getElementById('lt-codigo').value.trim(),
      NOMBRE: document.getElementById('lt-nombre').value.trim(),
      ES_FINAL: document.getElementById('lt-es-final').checked,
      ACTIVO: document.getElementById('lt-activo').checked,
    };
    const submit = document.getElementById('lt-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/lotes-tipos/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/lotes-tipos', {
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

      if (result.data && result.data.ES_FINAL) {
        await openDetail(result.data);
      }
    } catch {
      showFormError('Error de red.');
      window.PackingToast.toast('Error de red', 'error');
    } finally {
      submit.disabled = false;
    }
  });

  try {
    await loadUnidadesMedida();
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('Error de red', 'error');
  }
});
