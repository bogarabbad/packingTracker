const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const {
  parseOptionalBoolean,
  parseOptionalPositiveInt,
  parseOptionalQueryText,
  likeContains,
} = require('../listFilters');

const FIELDS = [
  'ID',
  'CODIGO',
  'ID_TIPO',
  'PLACAS',
  'NUMERO_ECONOMICO',
  'MARCA',
  'MODELO',
  'ANIO',
  'NUMERO_SERIE',
  'CAPACIDAD_CARGA_KG',
  'CAPACIDAD_VOLUMEN_M3',
  'ID_ESTATUS',
  'UBICACION_ID',
  'ACTIVO',
  'ES_SEMILLA',
  'CREADO_EN',
  'ACTUALIZADO_EN',
].map((name) => `"${name}"`).join(', ');

const UNIQUE_ERRORS = {
  UNIDADES_TRANSPORTE_CODIGO_key: 'duplicate_codigo',
  UNIDADES_TRANSPORTE_PLACAS_key: 'duplicate_placas',
  UNIDADES_TRANSPORTE_NUMERO_ECONOMICO_key: 'duplicate_numero_economico',
  UNIDADES_TRANSPORTE_NUMERO_SERIE_key: 'duplicate_numero_serie',
};

const FOREIGN_KEY_ERRORS = {
  UNIDADES_TRANSPORTE_ID_TIPO_FK: 'invalid_id_tipo',
  UNIDADES_TRANSPORTE_ID_ESTATUS_FK: 'invalid_id_estatus',
  UNIDADES_TRANSPORTE_UBICACION_ID_FK: 'invalid_ubicacion_id',
  UNIDADES_TRANSPORTE_UBICACIONES_UBICACION_ID_FK: 'invalid_ubicacion_id',
  UNIDADES_TRANSPORTE_UBICACIONES_ID_UNIDAD_FK: 'invalid_id_unidad',
};

function parseId(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw httpError(400, 'invalid_id');
  }

  return Number(value);
}

function requiredText(value, error) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, error);
  }

  return value.trim();
}

function optionalText(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, error);
  }

  return value.trim();
}

function requiredInteger(value, error) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw httpError(400, error);
  }

  return value;
}

function optionalInteger(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  return requiredInteger(value, error);
}

function optionalYear(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1980 || value > 2100) {
    throw httpError(400, 'invalid_anio');
  }

  return value;
}

function optionalCapacity(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 9999999999.99) {
    throw httpError(400, error);
  }

  return value;
}

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  let activo = true;
  if (body.ACTIVO !== undefined) {
    if (typeof body.ACTIVO !== 'boolean') {
      throw httpError(400, 'invalid_activo');
    }
    activo = body.ACTIVO;
  }

  return {
    CODIGO: requiredText(body.CODIGO, 'invalid_codigo'),
    ID_TIPO: requiredInteger(body.ID_TIPO, 'invalid_id_tipo'),
    PLACAS: requiredText(body.PLACAS, 'invalid_placas'),
    NUMERO_ECONOMICO: optionalText(body.NUMERO_ECONOMICO, 'invalid_numero_economico'),
    MARCA: optionalText(body.MARCA, 'invalid_marca'),
    MODELO: optionalText(body.MODELO, 'invalid_modelo'),
    ANIO: optionalYear(body.ANIO),
    NUMERO_SERIE: optionalText(body.NUMERO_SERIE, 'invalid_numero_serie'),
    CAPACIDAD_CARGA_KG: optionalCapacity(body.CAPACIDAD_CARGA_KG, 'invalid_capacidad_carga_kg'),
    CAPACIDAD_VOLUMEN_M3: optionalCapacity(body.CAPACIDAD_VOLUMEN_M3, 'invalid_capacidad_volumen_m3'),
    ID_ESTATUS: requiredInteger(body.ID_ESTATUS, 'invalid_id_estatus'),
    UBICACION_ID: optionalInteger(body.UBICACION_ID, 'invalid_ubicacion_id'),
    ACTIVO: activo,
  };
}

function mapNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    CODIGO: row.CODIGO,
    ID_TIPO: Number(row.ID_TIPO),
    PLACAS: row.PLACAS,
    NUMERO_ECONOMICO: row.NUMERO_ECONOMICO,
    MARCA: row.MARCA,
    MODELO: row.MODELO,
    ANIO: mapNumber(row.ANIO),
    NUMERO_SERIE: row.NUMERO_SERIE,
    CAPACIDAD_CARGA_KG: mapNumber(row.CAPACIDAD_CARGA_KG),
    CAPACIDAD_VOLUMEN_M3: mapNumber(row.CAPACIDAD_VOLUMEN_M3),
    ID_ESTATUS: Number(row.ID_ESTATUS),
    UBICACION_ID: mapNumber(row.UBICACION_ID),
    ACTIVO: row.ACTIVO,
    ES_SEMILLA: row.ES_SEMILLA,
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function translate(err) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23505') {
    throw httpError(409, UNIQUE_ERRORS[err.constraint] || 'duplicate_codigo');
  }

  if (err.code === '23503') {
    throw httpError(400, FOREIGN_KEY_ERRORS[err.constraint] || 'record_in_use');
  }

  if (err.code === '23514') {
    throw httpError(400, 'invalid_anio');
  }

  throw err;
}

/**
 * Si viene una ubicación distinta a la actual, inserta historial y sincroniza
 * `UNIDADES_TRANSPORTE.UBICACION_ID` con el registro más reciente.
 */
async function aplicarUbicacion(client, idUnidad, ubicacionId) {
  if (ubicacionId === null) {
    await client.query(
      'SELECT unidad_transporte_sincronizar_ubicacion($1)',
      [idUnidad],
    );
    return;
  }

  const current = await client.query(
    'SELECT "UBICACION_ID" FROM "UNIDADES_TRANSPORTE" WHERE "ID" = $1',
    [idUnidad],
  );
  const actual = current.rows[0]
    ? mapNumber(current.rows[0].UBICACION_ID)
    : null;

  if (actual === ubicacionId) {
    return;
  }

  await client.query(
    `INSERT INTO "UNIDADES_TRANSPORTE_UBICACIONES" ("ID_UNIDAD", "UBICACION_ID")
     VALUES ($1, $2)`,
    [idUnidad, ubicacionId],
  );
  await client.query(
    'SELECT unidad_transporte_sincronizar_ubicacion($1)',
    [idUnidad],
  );
}

async function fetchUnidad(client, id) {
  const result = await client.query(
    `SELECT ${FIELDS} FROM "UNIDADES_TRANSPORTE" WHERE "ID" = $1`,
    [id],
  );
  return result.rows[0] || null;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const filters = [];
    const params = [];

    const q = parseOptionalQueryText(req.query.q, 'invalid_q');
    if (q !== null) {
      params.push(likeContains(q));
      filters.push(`(
        "CODIGO" ILIKE $${params.length} ESCAPE '\\'
        OR "PLACAS" ILIKE $${params.length} ESCAPE '\\'
        OR COALESCE("NUMERO_ECONOMICO", '') ILIKE $${params.length} ESCAPE '\\'
        OR COALESCE("MARCA", '') ILIKE $${params.length} ESCAPE '\\'
        OR COALESCE("MODELO", '') ILIKE $${params.length} ESCAPE '\\'
      )`);
    }

    const idTipo = parseOptionalPositiveInt(req.query.id_tipo, 'invalid_id_tipo');
    if (idTipo !== null) {
      params.push(idTipo);
      filters.push(`"ID_TIPO" = $${params.length}`);
    }

    const idEstatus = parseOptionalPositiveInt(req.query.id_estatus, 'invalid_id_estatus');
    if (idEstatus !== null) {
      params.push(idEstatus);
      filters.push(`"ID_ESTATUS" = $${params.length}`);
    }

    const ubicacionId = parseOptionalPositiveInt(
      req.query.ubicacion_id,
      'invalid_ubicacion_id',
    );
    if (ubicacionId !== null) {
      params.push(ubicacionId);
      filters.push(`"UBICACION_ID" = $${params.length}`);
    }

    const activo = parseOptionalBoolean(req.query.activo, 'invalid_activo');
    if (activo !== null) {
      params.push(activo);
      filters.push(`"ACTIVO" = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM "UNIDADES_TRANSPORTE" ${where}`,
      params,
    );
    const listParams = [...params, page.items, page.offset];
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "UNIDADES_TRANSPORTE"
       ${where}
       ORDER BY "CREADO_EN" DESC, "ID" DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams,
    );
    sendData(
      res,
      200,
      result.rows.map(mapRow),
      paginationMetadata(page.page, page.items, totalResult.rows[0].total),
    );
  } catch (err) {
    translate(err);
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "UNIDADES_TRANSPORTE" WHERE "ID" = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw httpError(404, 'not_found');
    }
    sendData(res, 200, mapRow(row));
  } catch (err) {
    translate(err);
  }
});

router.post('/', async (req, res) => {
  const record = parseBody(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO "UNIDADES_TRANSPORTE" (
         "CODIGO", "ID_TIPO", "PLACAS", "NUMERO_ECONOMICO", "MARCA", "MODELO",
         "ANIO", "NUMERO_SERIE", "CAPACIDAD_CARGA_KG", "CAPACIDAD_VOLUMEN_M3",
         "ID_ESTATUS", "ACTIVO"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING "ID"`,
      [
        record.CODIGO,
        record.ID_TIPO,
        record.PLACAS,
        record.NUMERO_ECONOMICO,
        record.MARCA,
        record.MODELO,
        record.ANIO,
        record.NUMERO_SERIE,
        record.CAPACIDAD_CARGA_KG,
        record.CAPACIDAD_VOLUMEN_M3,
        record.ID_ESTATUS,
        record.ACTIVO,
      ],
    );
    const id = Number(result.rows[0].ID);
    await aplicarUbicacion(client, id, record.UBICACION_ID);
    const row = await fetchUnidad(client, id);
    await client.query('COMMIT');
    sendData(res, 201, mapRow(row));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    translate(err);
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const record = parseBody(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE "UNIDADES_TRANSPORTE"
       SET "CODIGO" = $1,
           "ID_TIPO" = $2,
           "PLACAS" = $3,
           "NUMERO_ECONOMICO" = $4,
           "MARCA" = $5,
           "MODELO" = $6,
           "ANIO" = $7,
           "NUMERO_SERIE" = $8,
           "CAPACIDAD_CARGA_KG" = $9,
           "CAPACIDAD_VOLUMEN_M3" = $10,
           "ID_ESTATUS" = $11,
           "ACTIVO" = $12,
           "ACTUALIZADO_EN" = now()
       WHERE "ID" = $13
       RETURNING "ID"`,
      [
        record.CODIGO,
        record.ID_TIPO,
        record.PLACAS,
        record.NUMERO_ECONOMICO,
        record.MARCA,
        record.MODELO,
        record.ANIO,
        record.NUMERO_SERIE,
        record.CAPACIDAD_CARGA_KG,
        record.CAPACIDAD_VOLUMEN_M3,
        record.ID_ESTATUS,
        record.ACTIVO,
        id,
      ],
    );
    if (!result.rows[0]) {
      throw httpError(404, 'not_found');
    }
    await aplicarUbicacion(client, id, record.UBICACION_ID);
    const row = await fetchUnidad(client, id);
    await client.query('COMMIT');
    sendData(res, 200, mapRow(row));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    translate(err);
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const existing = await pool.query(
      `SELECT "ES_SEMILLA" FROM "UNIDADES_TRANSPORTE" WHERE "ID" = $1`,
      [id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw httpError(404, 'not_found');
    }
    if (row.ES_SEMILLA) {
      throw httpError(409, 'seed_not_deletable');
    }

    await pool.query(`DELETE FROM "UNIDADES_TRANSPORTE" WHERE "ID" = $1`, [id]);
    sendData(res, 200, null);
  } catch (err) {
    if (err.code === '23503') {
      throw httpError(409, 'record_in_use');
    }
    translate(err);
  }
});

module.exports = router;
