document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    tipos: new Map(),
    estatus: new Map(),
    deleteId: null,
  };

  const statusNode = document.getElementById('ut-status');
  const tbody = document.getElementById('ut-tbody');
  const pageLabel = document.getElementById('ut-page-label');
  const prevBtn = document.getElementById('ut-prev');
  const nextBtn = document.getElementById('ut-next');
  const formDialog = document.getElementById('ut-form-dialog');
  const deleteDialog = document.getElementById('ut-delete-dialog');
  const form = document.getElementById('ut-form');
  const formError = document.getElementById('ut-form-error');
  const formTitle = document.getElementById('ut-form-title');
  const tipoSelect = document.getElementById('ut-id-tipo');
  const estatusSelect = document.getElementById('ut-id-estatus');

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function optionalText(value) {
    const trimmed = String(value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  }

  function optionalNumber(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') {
      return null;
    }
    return Number(trimmed);
  }

  function fillSelect(select, rows, blankLabel) {
    select.innerHTML = '';
    if (blankLabel) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = blankLabel;
      select.appendChild(option);
    }
    rows.forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.ID);
      option.textContent = row.NOMBRE;
      select.appendChild(option);
    });
  }

  function mapError(code) {
    const messages = {
      duplicate_codigo: 'Ya existe una unidad con ese código.',
      duplicate_placas: 'Ya existen esas placas.',
      duplicate_numero_economico: 'Ya existe ese número económico.',
      duplicate_numero_serie: 'Ya existe ese número de serie.',
      invalid_codigo: 'Código inválido.',
      invalid_placas: 'Placas inválidas.',
      invalid_id_tipo: 'Tipo inválido.',
      invalid_id_estatus: 'Estatus inválido.',
      invalid_anio: 'Año inválido (1980–2100).',
      invalid_capacidad_carga_kg: 'Capacidad en kg inválida.',
      invalid_capacidad_volumen_m3: 'Capacidad en m³ inválida.',
      invalid_numero_economico: 'Número económico inválido.',
      invalid_marca: 'Marca inválida.',
      invalid_modelo: 'Modelo inválido.',
      invalid_numero_serie: 'Número de serie inválido.',
      seed_not_deletable: 'Este registro no se puede eliminar.',
      record_in_use: 'La unidad está en uso y no se puede eliminar.',
      not_found: 'Registro no encontrado.',
      unauthorized: 'Sesión no válida.',
    };
    return messages[code] || 'No se pudo completar la operación.';
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.toggle('hidden', !message);
  }

  function readForm() {
    return {
      CODIGO: document.getElementById('ut-codigo').value.trim(),
      PLACAS: document.getElementById('ut-placas').value.trim(),
      ID_TIPO: Number(document.getElementById('ut-id-tipo').value),
      ID_ESTATUS: Number(document.getElementById('ut-id-estatus').value),
      NUMERO_ECONOMICO: optionalText(document.getElementById('ut-numero-economico').value),
      NUMERO_SERIE: optionalText(document.getElementById('ut-numero-serie').value),
      MARCA: optionalText(document.getElementById('ut-marca').value),
      MODELO: optionalText(document.getElementById('ut-modelo').value),
      ANIO: optionalNumber(document.getElementById('ut-anio').value),
      CAPACIDAD_CARGA_KG: optionalNumber(document.getElementById('ut-capacidad-kg').value),
      CAPACIDAD_VOLUMEN_M3: optionalNumber(document.getElementById('ut-capacidad-m3').value),
      ACTIVO: document.getElementById('ut-activo').checked,
    };
  }

  function openForm(row) {
    showFormError('');
    form.reset();
    document.getElementById('ut-activo').checked = true;
    document.getElementById('ut-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar unidad' : 'Nueva unidad';

    if (row) {
      document.getElementById('ut-codigo').value = row.CODIGO || '';
      document.getElementById('ut-placas').value = row.PLACAS || '';
      document.getElementById('ut-id-tipo').value = String(row.ID_TIPO);
      document.getElementById('ut-id-estatus').value = String(row.ID_ESTATUS);
      document.getElementById('ut-numero-economico').value = row.NUMERO_ECONOMICO || '';
      document.getElementById('ut-numero-serie').value = row.NUMERO_SERIE || '';
      document.getElementById('ut-marca').value = row.MARCA || '';
      document.getElementById('ut-modelo').value = row.MODELO || '';
      document.getElementById('ut-anio').value = row.ANIO == null ? '' : String(row.ANIO);
      document.getElementById('ut-capacidad-kg').value = row.CAPACIDAD_CARGA_KG == null ? '' : String(row.CAPACIDAD_CARGA_KG);
      document.getElementById('ut-capacidad-m3').value = row.CAPACIDAD_VOLUMEN_M3 == null ? '' : String(row.CAPACIDAD_VOLUMEN_M3);
      document.getElementById('ut-activo').checked = Boolean(row.ACTIVO);
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
      tbody.innerHTML = '<tr><td colspan="8" class="text-muted-foreground">Sin registros.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => {
      const tipo = state.tipos.get(row.ID_TIPO)?.NOMBRE || row.ID_TIPO;
      const estatus = state.estatus.get(row.ID_ESTATUS)?.NOMBRE || row.ID_ESTATUS;
      const deleteDisabled = row.ES_SEMILLA ? 'disabled title="Registro semilla"' : '';
      return `
        <tr data-id="${row.ID}">
          <td>${escapeHtml(row.CODIGO)}</td>
          <td>${escapeHtml(row.PLACAS)}</td>
          <td>${escapeHtml(tipo)}</td>
          <td>${escapeHtml(estatus)}</td>
          <td>${escapeHtml(row.MARCA || '—')}</td>
          <td>${escapeHtml(row.MODELO || '—')}</td>
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

  async function loadCatalogs() {
    const [tipos, estatus] = await Promise.all([
      window.PackingApi.request('/unidades-tipos?items=100'),
      window.PackingApi.request('/unidades-estatus?items=100'),
    ]);

    if (!tipos.ok || !estatus.ok) {
      throw new Error('catalogs');
    }

    const tipoRows = Array.isArray(tipos.data) ? tipos.data : [];
    const estatusRows = Array.isArray(estatus.data) ? estatus.data : [];

    state.tipos = new Map(tipoRows.map((row) => [row.ID, row]));
    state.estatus = new Map(estatusRows.map((row) => [row.ID, row]));

    fillSelect(tipoSelect, tipoRows, 'Selecciona un tipo');
    fillSelect(estatusSelect, estatusRows, 'Selecciona un estatus');
  }

  async function loadList() {
    statusNode.textContent = 'Cargando…';
    const result = await window.PackingApi.request(
      `/unidades-transporte?page=${state.page}&items=${state.items}`,
    );

    if (!result.ok) {
      statusNode.textContent = 'Error al cargar';
      tbody.innerHTML = '<tr><td colspan="8" class="text-destructive">No se pudo obtener el catálogo.</td></tr>';
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

  document.getElementById('ut-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('ut-form-cancel').addEventListener('click', closeForm);
  document.getElementById('ut-delete-cancel').addEventListener('click', () => {
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
      const result = await window.PackingApi.request(`/unidades-transporte/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      openForm(result.data);
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('ut-delete-text').textContent = `¿Eliminar la unidad ${row.children[0].textContent}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('ut-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/unidades-transporte/${id}`, { method: 'DELETE' });
    if (!result.ok) {
      window.PackingToast.toast(mapError(result.error), 'error');
      return;
    }
    state.deleteId = null;
    deleteDialog.close();
    window.PackingToast.toast('Unidad eliminada');
    if (state.page > 1 && (state.total - 1) <= (state.page - 1) * state.items) {
      state.page -= 1;
    }
    await loadList();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFormError('');

    const idValue = document.getElementById('ut-id').value;
    const payload = readForm();
    const submit = document.getElementById('ut-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/unidades-transporte/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/unidades-transporte', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

      if (!result.ok) {
        showFormError(mapError(result.error));
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }

      closeForm();
      window.PackingToast.toast(idValue ? 'Unidad actualizada' : 'Unidad creada');
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
    await loadCatalogs();
    await loadList();
  } catch {
    statusNode.textContent = 'Error al cargar';
    window.PackingToast.toast('No se pudieron cargar los catálogos', 'error');
  }
});
