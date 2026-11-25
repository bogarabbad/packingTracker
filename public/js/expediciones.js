document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    deleteId: null,
    unidades: new Map(),
    filters: { id_unidad: '', abierta: '', q: '' },
  };

  const statusNode = document.getElementById('ex-status');
  const tbody = document.getElementById('ex-tbody');
  const pageLabel = document.getElementById('ex-page-label');
  const prevBtn = document.getElementById('ex-prev');
  const nextBtn = document.getElementById('ex-next');
  const formDialog = document.getElementById('ex-form-dialog');
  const deleteDialog = document.getElementById('ex-delete-dialog');
  const form = document.getElementById('ex-form');
  const formError = document.getElementById('ex-form-error');
  const formTitle = document.getElementById('ex-form-title');
  const unidadSelect = document.getElementById('ex-id-unidad');
  const cierreWrap = document.getElementById('ex-cierre-wrap');

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
      invalid_usuario_id: 'Usuario inválido.',
      invalid_id_origen_usuario: 'Origen de usuario inválido.',
      invalid_usuario_origen: 'Usuario y origen deben ir juntos.',
      invalid_expedicion: 'Datos de expedición inválidos.',
      invalid_abierta: 'Filtro de abierta inválido.',
      unidad_ya_abierta: 'Esa unidad ya tiene una expedición abierta.',
      record_in_use: 'La expedición tiene lotes y no se puede eliminar.',
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

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
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

  function unidadLabel(id) {
    const unidad = state.unidades.get(Number(id));
    if (!unidad) {
      return `#${id}`;
    }
    return `${unidad.CODIGO} · ${unidad.PLACAS}`;
  }

  function openForm(row) {
    showFormError('');
    form.reset();
    document.getElementById('ex-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar expedición' : 'Nueva expedición';
    cierreWrap.classList.toggle('hidden', !row);

    fillSelect(
      unidadSelect,
      [...state.unidades.values()],
      'Selecciona una unidad',
      (unidad) => `${unidad.CODIGO} · ${unidad.PLACAS}`,
    );

    if (row) {
      unidadSelect.value = String(row.ID_UNIDAD);
      document.getElementById('ex-id-ubicacion').value =
        row.ID_UBICACION_SALIDA == null ? '' : String(row.ID_UBICACION_SALIDA);
      document.getElementById('ex-ubicacion-salida').value =
        row.UBICACION_SALIDA_ID == null ? '' : String(row.UBICACION_SALIDA_ID);
      document.getElementById('ex-fecha-cierre').value = toLocalInput(row.FECHA_CIERRE);
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
      const abierta = row.FECHA_CIERRE == null;
      return `
        <tr data-id="${row.ID}">
          <td>${row.ID}</td>
          <td>${escapeHtml(unidadLabel(row.ID_UNIDAD))}</td>
          <td>
            <span class="ui-badge ${abierta ? 'ui-badge-secondary' : 'ui-badge-outline'}">
              ${abierta ? 'Abierta' : 'Cerrada'}
            </span>
          </td>
          <td>${escapeHtml(formatDate(row.CREADO_EN))}</td>
          <td>${escapeHtml(formatDate(row.FECHA_CIERRE))}</td>
          <td class="text-right">
            <div class="inline-flex flex-wrap justify-end gap-2">
              <a href="/operacion/expediciones/${row.ID}" class="ui-btn ui-btn-outline ui-btn-sm">Detalle</a>
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

  async function loadCatalogs() {
    const unidades = await window.PackingApi.request('/unidades-transporte?items=100');
    if (!unidades.ok) {
      throw new Error('catalogs');
    }
    state.unidades = new Map((unidades.data || []).map((row) => [row.ID, row]));
    fillSelect(
      document.getElementById('ex-filter-unidad'),
      [...state.unidades.values()],
      'Todas',
      (unidad) => `${unidad.CODIGO} · ${unidad.PLACAS}`,
    );
  }

  function buildListUrl() {
    const params = new URLSearchParams({
      page: String(state.page),
      items: String(state.items),
    });
    if (state.filters.id_unidad) {
      params.set('id_unidad', state.filters.id_unidad);
    }
    if (state.filters.abierta) {
      params.set('abierta', state.filters.abierta);
    }
    if (state.filters.q) {
      params.set('q', state.filters.q);
    }
    return `/expediciones?${params}`;
  }

  function readFilters() {
    state.filters.id_unidad = document.getElementById('ex-filter-unidad').value;
    state.filters.abierta = document.getElementById('ex-filter-abierta').value;
    state.filters.q = document.getElementById('ex-filter-q').value.trim();
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
    state.total = result.metadata.total ?? rows.length;
    statusNode.textContent = `${state.total} registro(s)`;
    renderRows(rows);
    updatePager();
  }

  document.getElementById('ex-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('ex-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });
  document.getElementById('ex-filters-clear').addEventListener('click', async () => {
    document.getElementById('ex-filter-unidad').value = '';
    document.getElementById('ex-filter-abierta').value = '';
    document.getElementById('ex-filter-q').value = '';
    state.filters = { id_unidad: '', abierta: '', q: '' };
    state.page = 1;
    await loadList();
  });
  document.getElementById('ex-form-cancel').addEventListener('click', closeForm);
  document.getElementById('ex-delete-cancel').addEventListener('click', () => {
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
      const result = await window.PackingApi.request(`/expediciones/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      openForm(result.data);
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('ex-delete-text').textContent = `¿Eliminar la expedición #${id}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('ex-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/expediciones/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    deleteDialog.close();
    window.PackingToast.toast('Expedición eliminada');
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');
    const idValue = document.getElementById('ex-id').value;
    const payload = {
      ID_UNIDAD: Number(unidadSelect.value),
      ID_UBICACION_SALIDA: optionalNumber(document.getElementById('ex-id-ubicacion').value),
      UBICACION_SALIDA_ID: optionalNumber(document.getElementById('ex-ubicacion-salida').value),
      FECHA_CIERRE: idValue
        ? fromLocalInput(document.getElementById('ex-fecha-cierre').value)
        : null,
      ...sessionUsuario(),
    };
    const submit = document.getElementById('ex-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/expediciones/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/expediciones', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      if (!result.ok) {
        showFormError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }

      closeForm();
      window.PackingToast.toast(idValue ? 'Expedición actualizada' : 'Expedición creada');
      if (!idValue) {
        window.location.assign(`/operacion/expediciones/${result.data.ID}`);
        return;
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
    await loadCatalogs();
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('No se pudieron cargar los catálogos', 'error');
  }
});
