const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');

const FIELDS =
  '"ID", "ID_LOTE", "ID_TIPO", "REFERENCIA", "USUARIO_ID", "CREADO_EN", "ACTUALIZADO_EN"';

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

function optionalInteger(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  return requiredInteger(value, error);
}

function requiredText(value, error) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, error);
  }

  return value.trim();
}

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  return {
    ID_LOTE: requiredInteger(body.ID_LOTE, 'invalid_id_lote'),
    ID_TIPO: requiredInteger(body.ID_TIPO, 'invalid_id_tipo'),
    REFERENCIA: requiredText(body.REFERENCIA, 'invalid_referencia'),
    USUARIO_ID: optionalInteger(body.USUARIO_ID, 'invalid_usuario_id'),
  };
}

function mapNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_LOTE: Number(row.ID_LOTE),
    ID_TIPO: Number(row.ID_TIPO),
    REFERENCIA: row.REFERENCIA,
    USUARIO_ID: mapNumber(row.USUARIO_ID),
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function translate(err) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23503') {
    if (err.constraint === 'LOTES_REFERENCIAS_ID_LOTE_FK') {
      throw httpError(400, 'invalid_id_lote');
    }
    throw httpError(400, 'invalid_id_tipo');
  }

  if (err.code === '23514') {
    if (err.constraint === 'LOTES_REFERENCIAS_USUARIO_ID_CHK') {
      throw httpError(400, 'invalid_usuario_id');
    }
    throw httpError(400, 'invalid_referencia');
  }

  throw err;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const totalResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM "LOTES_REFERENCIAS"',
    );
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "LOTES_REFERENCIAS" ORDER BY "ID" LIMIT $1 OFFSET $2`,
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
      `SELECT ${FIELDS} FROM "LOTES_REFERENCIAS" WHERE "ID" = $1`,
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
      `INSERT INTO "LOTES_REFERENCIAS" ("ID_LOTE", "ID_TIPO", "REFERENCIA", "USUARIO_ID")
       VALUES ($1, $2, $3, $4)
       RETURNING ${FIELDS}`,
      [record.ID_LOTE, record.ID_TIPO, record.REFERENCIA, record.USUARIO_ID],
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
      `UPDATE "LOTES_REFERENCIAS"
       SET "ID_LOTE" = $1,
           "ID_TIPO" = $2,
           "REFERENCIA" = $3,
           "USUARIO_ID" = $4
       WHERE "ID" = $5
       RETURNING ${FIELDS}`,
      [record.ID_LOTE, record.ID_TIPO, record.REFERENCIA, record.USUARIO_ID, id],
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
    const result = await pool.query(
      `DELETE FROM "LOTES_REFERENCIAS" WHERE "ID" = $1 RETURNING "ID"`,
      [id],
    );
    if (!result.rows[0]) {
      throw httpError(404, 'not_found');
    }
    sendData(res, 200, null);
  } catch (err) {
    translate(err);
  }
});

module.exports = router;
