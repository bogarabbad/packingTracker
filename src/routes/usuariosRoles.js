const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const { parseOptionalPositiveInt } = require('../listFilters');

const TABLE = 'USUARIOS_ROLES';
const FIELDS = [
  'ID',
  'USUARIO_ID',
  'ROL_ID',
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
    USUARIO_ID: requiredInteger(body.USUARIO_ID, 'invalid_usuario_id'),
    ROL_ID: requiredInteger(body.ROL_ID, 'invalid_rol_id'),
  };
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    USUARIO_ID: Number(row.USUARIO_ID),
    ROL_ID: Number(row.ROL_ID),
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
    if (err.constraint === 'USUARIOS_ROLES_USUARIO_ID_FK') {
      throw httpError(400, 'invalid_usuario_id');
    }
    if (err.constraint === 'USUARIOS_ROLES_ROL_ID_FK') {
      throw httpError(400, 'invalid_rol_id');
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

    const usuarioId = parseOptionalPositiveInt(
      req.query.usuario_id,
      'invalid_usuario_id',
    );
    if (usuarioId !== null) {
      params.push(usuarioId);
      filters.push(`"USUARIO_ID" = $${params.length}`);
    }

    const rolId = parseOptionalPositiveInt(req.query.rol_id, 'invalid_rol_id');
    if (rolId !== null) {
      params.push(rolId);
      filters.push(`"ROL_ID" = $${params.length}`);
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
      `INSERT INTO "${TABLE}" ("USUARIO_ID", "ROL_ID")
       VALUES ($1, $2)
       RETURNING ${FIELDS}`,
      [record.USUARIO_ID, record.ROL_ID],
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
       SET "USUARIO_ID" = $1,
           "ROL_ID" = $2
       WHERE "ID" = $3
       RETURNING ${FIELDS}`,
      [record.USUARIO_ID, record.ROL_ID, id],
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
