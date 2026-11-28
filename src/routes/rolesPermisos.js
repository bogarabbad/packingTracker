const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const { parseOptionalPositiveInt } = require('../listFilters');

const TABLE = 'ROLES_PERMISOS';
const FIELDS = [
  'ID',
  'ROL_ID',
  'PERMISO_ID',
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

function requiredInteger(value, error) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw httpError(400, error);
  }

  return value;
}

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  return {
    ROL_ID: requiredInteger(body.ROL_ID, 'invalid_rol_id'),
    PERMISO_ID: requiredInteger(body.PERMISO_ID, 'invalid_permiso_id'),
  };
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ROL_ID: Number(row.ROL_ID),
    PERMISO_ID: Number(row.PERMISO_ID),
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
    throw httpError(409, 'duplicate_relacion');
  }

  if (err.code === '23503') {
    if (err.constraint === 'ROLES_PERMISOS_ROL_ID_FK') {
      throw httpError(400, 'invalid_rol_id');
    }
    if (err.constraint === 'ROLES_PERMISOS_PERMISO_ID_FK') {
      throw httpError(400, 'invalid_permiso_id');
    }
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

    const rolId = parseOptionalPositiveInt(req.query.rol_id, 'invalid_rol_id');
    if (rolId !== null) {
      params.push(rolId);
      filters.push(`"ROL_ID" = $${params.length}`);
    }

    const permisoId = parseOptionalPositiveInt(
      req.query.permiso_id,
      'invalid_permiso_id',
    );
    if (permisoId !== null) {
      params.push(permisoId);
      filters.push(`"PERMISO_ID" = $${params.length}`);
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
      `INSERT INTO "${TABLE}" ("ROL_ID", "PERMISO_ID")
       VALUES ($1, $2)
       RETURNING ${FIELDS}`,
      [record.ROL_ID, record.PERMISO_ID],
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
       SET "ROL_ID" = $1,
           "PERMISO_ID" = $2
       WHERE "ID" = $3
       RETURNING ${FIELDS}`,
      [record.ROL_ID, record.PERMISO_ID, id],
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
