const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');

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

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const totalResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM "UNIDADES_TRANSPORTE"',
    );
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "UNIDADES_TRANSPORTE" ORDER BY "ID" LIMIT $1 OFFSET $2`,
      [page.items, page.offset],
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
  try {
    const result = await pool.query(
      `INSERT INTO "UNIDADES_TRANSPORTE" (
         "CODIGO", "ID_TIPO", "PLACAS", "NUMERO_ECONOMICO", "MARCA", "MODELO",
         "ANIO", "NUMERO_SERIE", "CAPACIDAD_CARGA_KG", "CAPACIDAD_VOLUMEN_M3",
         "ID_ESTATUS", "ACTIVO"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${FIELDS}`,
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
    sendData(res, 201, mapRow(result.rows[0]));
  } catch (err) {
    translate(err);
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const record = parseBody(req.body);
  try {
    const result = await pool.query(
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
       RETURNING ${FIELDS}`,
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
    const row = result.rows[0];
    if (!row) {
      throw httpError(404, 'not_found');
    }
    sendData(res, 200, mapRow(row));
  } catch (err) {
    translate(err);
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
