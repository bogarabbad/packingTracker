const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const {
  parseOptionalBoolean,
  parseOptionalQueryText,
  likeContains,
} = require('../listFilters');

const TABLE = 'DISPOSITIVOS_TIPOS';
const FIELDS = [
  'ID',
  'CODIGO',
  'NOMBRE',
  'MARCA',
  'MODELO',
  'SISTEMA_OPERATIVO',
  'VERSION_SO_MINIMA',
  'NUMERO_PARTE',
  'TIENE_ESCANER',
  'DESCRIPCION',
  'ACTIVO',
  'ES_SEMILLA',
  'CREADO_EN',
  'ACTUALIZADO_EN',
].map((name) => `"${name}"`).join(', ');

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

  if (typeof value !== 'string') {
    throw httpError(400, error);
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    throw httpError(400, error);
  }

  return trimmed;
}

function parseActivo(value) {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== 'boolean') {
    throw httpError(400, 'invalid_activo');
  }

  return value;
}

function parseTieneEscaner(value) {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== 'boolean') {
    throw httpError(400, 'invalid_tiene_escaner');
  }

  return value;
}

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  return {
    CODIGO: requiredText(body.CODIGO, 'invalid_codigo'),
    NOMBRE: requiredText(body.NOMBRE, 'invalid_nombre'),
    MARCA: requiredText(body.MARCA, 'invalid_marca'),
    MODELO: requiredText(body.MODELO, 'invalid_modelo'),
    SISTEMA_OPERATIVO: requiredText(body.SISTEMA_OPERATIVO, 'invalid_sistema_operativo'),
    VERSION_SO_MINIMA: optionalText(body.VERSION_SO_MINIMA, 'invalid_version_so_minima'),
    NUMERO_PARTE: optionalText(body.NUMERO_PARTE, 'invalid_numero_parte'),
    TIENE_ESCANER: parseTieneEscaner(body.TIENE_ESCANER),
    DESCRIPCION: optionalText(body.DESCRIPCION, 'invalid_descripcion'),
    ACTIVO: parseActivo(body.ACTIVO),
  };
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    CODIGO: row.CODIGO,
    NOMBRE: row.NOMBRE,
    MARCA: row.MARCA,
    MODELO: row.MODELO,
    SISTEMA_OPERATIVO: row.SISTEMA_OPERATIVO,
    VERSION_SO_MINIMA: row.VERSION_SO_MINIMA,
    NUMERO_PARTE: row.NUMERO_PARTE,
    TIENE_ESCANER: Boolean(row.TIENE_ESCANER),
    DESCRIPCION: row.DESCRIPCION,
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
    throw httpError(409, 'duplicate_codigo');
  }

  if (err.code === '23503') {
    throw httpError(409, 'record_in_use');
  }

  if (err.code === '23514') {
    throw httpError(400, 'invalid_dispositivo_tipo');
  }

  throw err;
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
      filters.push(
        `("CODIGO" ILIKE $${params.length} ESCAPE '\\'
         OR "NOMBRE" ILIKE $${params.length} ESCAPE '\\'
         OR "MARCA" ILIKE $${params.length} ESCAPE '\\'
         OR "MODELO" ILIKE $${params.length} ESCAPE '\\'
         OR COALESCE("NUMERO_PARTE", '') ILIKE $${params.length} ESCAPE '\\')`,
      );
    }

    const activo = parseOptionalBoolean(req.query.activo, 'invalid_activo');
    if (activo !== null) {
      params.push(activo);
      filters.push(`"ACTIVO" = $${params.length}`);
    }

    const tieneEscaner = parseOptionalBoolean(
      req.query.tiene_escaner,
      'invalid_tiene_escaner',
    );
    if (tieneEscaner !== null) {
      params.push(tieneEscaner);
      filters.push(`"TIENE_ESCANER" = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM "${TABLE}" ${where}`,
      params,
    );
    const listParams = [...params, page.items, page.offset];
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "${TABLE}"
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
      `SELECT ${FIELDS} FROM "${TABLE}" WHERE "ID" = $1`,
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
      `INSERT INTO "${TABLE}" (
         "CODIGO", "NOMBRE", "MARCA", "MODELO", "SISTEMA_OPERATIVO",
         "VERSION_SO_MINIMA", "NUMERO_PARTE", "TIENE_ESCANER",
         "DESCRIPCION", "ACTIVO"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${FIELDS}`,
      [
        record.CODIGO,
        record.NOMBRE,
        record.MARCA,
        record.MODELO,
        record.SISTEMA_OPERATIVO,
        record.VERSION_SO_MINIMA,
        record.NUMERO_PARTE,
        record.TIENE_ESCANER,
        record.DESCRIPCION,
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
      `UPDATE "${TABLE}"
       SET "CODIGO" = $1,
           "NOMBRE" = $2,
           "MARCA" = $3,
           "MODELO" = $4,
           "SISTEMA_OPERATIVO" = $5,
           "VERSION_SO_MINIMA" = $6,
           "NUMERO_PARTE" = $7,
           "TIENE_ESCANER" = $8,
           "DESCRIPCION" = $9,
           "ACTIVO" = $10
       WHERE "ID" = $11
       RETURNING ${FIELDS}`,
      [
        record.CODIGO,
        record.NOMBRE,
        record.MARCA,
        record.MODELO,
        record.SISTEMA_OPERATIVO,
        record.VERSION_SO_MINIMA,
        record.NUMERO_PARTE,
        record.TIENE_ESCANER,
        record.DESCRIPCION,
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
      `SELECT "ES_SEMILLA" FROM "${TABLE}" WHERE "ID" = $1`,
      [id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw httpError(404, 'not_found');
    }
    if (row.ES_SEMILLA) {
      throw httpError(409, 'seed_not_deletable');
    }

    await pool.query(`DELETE FROM "${TABLE}" WHERE "ID" = $1`, [id]);
    sendData(res, 200, null);
  } catch (err) {
    translate(err);
  }
});

module.exports = router;
