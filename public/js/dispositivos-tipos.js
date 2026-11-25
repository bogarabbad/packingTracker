document.addEventListener('DOMContentLoaded', async () => {
  if (!window.PackingApi.isAuthenticated()) {
    return;
  }

  const state = {
    page: 1,
    items: 20,
    total: 0,
    deleteId: null,
    filters: { q: '', tiene_escaner: '', activo: '' },
  };

  const statusNode = document.getElementById('dt-status');
  const tbody = document.getElementById('dt-tbody');
  const pageLabel = document.getElementById('dt-page-label');
  const prevBtn = document.getElementById('dt-prev');
  const nextBtn = document.getElementById('dt-next');
  const formDialog = document.getElementById('dt-form-dialog');
  const deleteDialog = document.getElementById('dt-delete-dialog');
  const form = document.getElementById('dt-form');
  const formError = document.getElementById('dt-form-error');
  const formTitle = document.getElementById('dt-form-title');

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

  function mapError(code) {
    const messages = {
      duplicate_codigo: 'Ya existe un tipo con ese código.',
      invalid_codigo: 'Código inválido.',
      invalid_nombre: 'Nombre inválido.',
      invalid_marca: 'Marca inválida.',
      invalid_modelo: 'Modelo inválido.',
      invalid_sistema_operativo: 'Sistema operativo inválido.',
      invalid_version_so_minima: 'Versión de SO inválida.',
      invalid_numero_parte: 'Número de parte inválido.',
      invalid_descripcion: 'Descripción inválida.',
      invalid_tiene_escaner: 'Valor de escáner inválido.',
      invalid_activo: 'Estado activo inválido.',
      invalid_dispositivo_tipo: 'Datos del tipo inválidos.',
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
    document.getElementById('dt-tiene-escaner').checked = true;
    document.getElementById('dt-activo').checked = true;
    document.getElementById('dt-id').value = row ? String(row.ID) : '';
    formTitle.textContent = row ? 'Editar tipo' : 'Nuevo tipo';

    if (row) {
      document.getElementById('dt-codigo').value = row.CODIGO || '';
      document.getElementById('dt-nombre').value = row.NOMBRE || '';
      document.getElementById('dt-marca').value = row.MARCA || '';
      document.getElementById('dt-modelo').value = row.MODELO || '';
      document.getElementById('dt-so').value = row.SISTEMA_OPERATIVO || '';
      document.getElementById('dt-version-so').value = row.VERSION_SO_MINIMA || '';
      document.getElementById('dt-numero-parte').value = row.NUMERO_PARTE || '';
      document.getElementById('dt-descripcion').value = row.DESCRIPCION || '';
      document.getElementById('dt-tiene-escaner').checked = Boolean(row.TIENE_ESCANER);
      document.getElementById('dt-activo').checked = Boolean(row.ACTIVO);
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
      const deleteDisabled = row.ES_SEMILLA ? 'disabled title="Registro semilla"' : '';
      return `
        <tr data-id="${row.ID}">
          <td>${escapeHtml(row.CODIGO)}</td>
          <td>${escapeHtml(row.NOMBRE)}</td>
          <td>${escapeHtml(row.MARCA)}</td>
          <td>${escapeHtml(row.MODELO)}</td>
          <td>${escapeHtml(row.SISTEMA_OPERATIVO)}${row.VERSION_SO_MINIMA ? ` ${escapeHtml(row.VERSION_SO_MINIMA)}` : ''}</td>
          <td>${row.TIENE_ESCANER ? 'Sí' : 'No'}</td>
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
    if (state.filters.tiene_escaner) {
      params.set('tiene_escaner', state.filters.tiene_escaner);
    }
    if (state.filters.activo) {
      params.set('activo', state.filters.activo);
    }
    return `/dispositivos-tipos?${params}`;
  }

  function readFilters() {
    state.filters.q = document.getElementById('dt-filter-q').value.trim();
    state.filters.tiene_escaner = document.getElementById('dt-filter-escaner').value;
    state.filters.activo = document.getElementById('dt-filter-activo').value;
  }

  async function loadList() {
    statusNode.textContent = 'Cargando…';
    const result = await window.PackingApi.request(buildListUrl());
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

  document.getElementById('dt-btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('dt-form-cancel').addEventListener('click', closeForm);

  document.getElementById('dt-filters').addEventListener('submit', async (event) => {
    event.preventDefault();
    readFilters();
    state.page = 1;
    await loadList();
  });

  document.getElementById('dt-filters-clear').addEventListener('click', async () => {
    document.getElementById('dt-filters').reset();
    state.filters = { q: '', tiene_escaner: '', activo: '' };
    state.page = 1;
    await loadList();
  });

  document.getElementById('dt-delete-cancel').addEventListener('click', () => {
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
      const result = await window.PackingApi.request(`/dispositivos-tipos/${id}`);
      if (!result.ok) {
        window.PackingToast.toast(mapError(result.error), 'error');
        return;
      }
      openForm(result.data);
      return;
    }

    if (action === 'delete') {
      state.deleteId = id;
      document.getElementById('dt-delete-text').textContent =
        `¿Eliminar el tipo ${row.children[0].textContent}?`;
      deleteDialog.showModal();
    }
  });

  document.getElementById('dt-delete-confirm').addEventListener('click', async () => {
    if (!state.deleteId) {
      return;
    }
    const id = state.deleteId;
    const result = await window.PackingApi.request(`/dispositivos-tipos/${id}`, {
      method: 'DELETE',
    });
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

    const idValue = document.getElementById('dt-id').value;
    const payload = {
      CODIGO: document.getElementById('dt-codigo').value.trim(),
      NOMBRE: document.getElementById('dt-nombre').value.trim(),
      MARCA: document.getElementById('dt-marca').value.trim(),
      MODELO: document.getElementById('dt-modelo').value.trim(),
      SISTEMA_OPERATIVO: document.getElementById('dt-so').value.trim(),
      VERSION_SO_MINIMA: optionalText(document.getElementById('dt-version-so').value),
      NUMERO_PARTE: optionalText(document.getElementById('dt-numero-parte').value),
      DESCRIPCION: optionalText(document.getElementById('dt-descripcion').value),
      TIENE_ESCANER: document.getElementById('dt-tiene-escaner').checked,
      ACTIVO: document.getElementById('dt-activo').checked,
    };
    const submit = document.getElementById('dt-form-submit');
    submit.disabled = true;

    try {
      const result = idValue
        ? await window.PackingApi.request(`/dispositivos-tipos/${idValue}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        : await window.PackingApi.request('/dispositivos-tipos', {
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
