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

const TABLE = 'ROLES';
const FIELDS = [
  'ID',
  'CODIGO',
  'NOMBRE',
  'DESCRIPCION',
  'ACTIVO',
  'ES_SEMILLA',
  'CREADO_EN',
  'ACTUALIZADO_EN',
].map((name) => `"${name}"`).join(', ');

const PERMISO_FIELDS = [
  'ID',
  'CODIGO',
  'NOMBRE',
  'DESCRIPCION',
  'ACTIVO',
  'ES_SEMILLA',
  'CREADO_EN',
  'ACTUALIZADO_EN',
].map((name) => `p."${name}"`).join(', ');

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

function optionalDescripcion(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw httpError(400, 'invalid_descripcion');
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
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

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  return {
    CODIGO: requiredText(body.CODIGO, 'invalid_codigo'),
    NOMBRE: requiredText(body.NOMBRE, 'invalid_nombre'),
    DESCRIPCION: optionalDescripcion(body.DESCRIPCION),
    ACTIVO: parseActivo(body.ACTIVO),
  };
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    CODIGO: row.CODIGO,
    NOMBRE: row.NOMBRE,
    DESCRIPCION: row.DESCRIPCION,
    ACTIVO: row.ACTIVO,
    ES_SEMILLA: row.ES_SEMILLA,
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function mapPermiso(row) {
  return {
    ID: Number(row.ID),
    CODIGO: row.CODIGO,
    NOMBRE: row.NOMBRE,
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
        `("CODIGO" ILIKE $${params.length} ESCAPE '\\' OR "NOMBRE" ILIKE $${params.length} ESCAPE '\\')`,
      );
    }

    const activo = parseOptionalBoolean(req.query.activo, 'invalid_activo');
    if (activo !== null) {
      params.push(activo);
      filters.push(`"ACTIVO" = $${params.length}`);
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
       ORDER BY "CODIGO" ASC, "ID" ASC
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

router.get('/:id/permisos', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const existing = await pool.query(
      `SELECT 1 FROM "${TABLE}" WHERE "ID" = $1`,
      [id],
    );
    if (!existing.rows[0]) {
      throw httpError(404, 'not_found');
    }

    const page = paginationFromQuery(req.query);
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM "ROLES_PERMISOS" AS rp
       WHERE rp."ROL_ID" = $1`,
      [id],
    );
    const result = await pool.query(
      `SELECT ${PERMISO_FIELDS}
       FROM "ROLES_PERMISOS" AS rp
       JOIN "PERMISOS" AS p ON p."ID" = rp."PERMISO_ID"
       WHERE rp."ROL_ID" = $1
       ORDER BY p."CODIGO" ASC, p."ID" ASC
       LIMIT $2 OFFSET $3`,
      [id, page.items, page.offset],
    );
    sendData(
      res,
      200,
      result.rows.map(mapPermiso),
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
      `INSERT INTO "${TABLE}" ("CODIGO", "NOMBRE", "DESCRIPCION", "ACTIVO")
       VALUES ($1, $2, $3, $4)
       RETURNING ${FIELDS}`,
      [record.CODIGO, record.NOMBRE, record.DESCRIPCION, record.ACTIVO],
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
           "DESCRIPCION" = $3,
           "ACTIVO" = $4
       WHERE "ID" = $5
       RETURNING ${FIELDS}`,
      [record.CODIGO, record.NOMBRE, record.DESCRIPCION, record.ACTIVO, id],
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
