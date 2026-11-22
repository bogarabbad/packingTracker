const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');

const FIELDS = '"ID", "ID_TIPO", "ID_UNIDAD", "ES_SEMILLA", "CREADO_EN", "ACTUALIZADO_EN"';

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
    ID_TIPO: requiredInteger(body.ID_TIPO, 'invalid_id_tipo'),
    ID_UNIDAD: requiredInteger(body.ID_UNIDAD, 'invalid_id_unidad'),
  };
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_TIPO: Number(row.ID_TIPO),
    ID_UNIDAD: Number(row.ID_UNIDAD),
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
    const error = err.constraint === 'LOTES_TIPOS_UNIDADES_ID_UNIDAD_FK'
      ? 'invalid_id_unidad'
      : 'invalid_id_tipo';
    throw httpError(400, error);
  }

  if (err.code === '23514') {
    if (typeof err.message === 'string' && err.message.includes('productos')) {
      throw httpError(409, 'record_in_use');
    }
    throw httpError(400, 'invalid_tipo_lote');
  }

  throw err;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    let idTipo = null;
    if (req.query.id_tipo !== undefined && req.query.id_tipo !== '') {
      if (!/^[1-9]\d*$/.test(String(req.query.id_tipo))) {
        throw httpError(400, 'invalid_id_tipo');
      }
      idTipo = Number(req.query.id_tipo);
    }

    const totalResult = idTipo === null
      ? await pool.query('SELECT COUNT(*)::int AS total FROM "LOTES_TIPOS_UNIDADES"')
      : await pool.query(
        'SELECT COUNT(*)::int AS total FROM "LOTES_TIPOS_UNIDADES" WHERE "ID_TIPO" = $1',
        [idTipo],
      );

    const result = idTipo === null
      ? await pool.query(
        `SELECT ${FIELDS} FROM "LOTES_TIPOS_UNIDADES" ORDER BY "ID" LIMIT $1 OFFSET $2`,
        [page.items, page.offset],
      )
      : await pool.query(
        `SELECT ${FIELDS} FROM "LOTES_TIPOS_UNIDADES"
         WHERE "ID_TIPO" = $1
         ORDER BY "ID" LIMIT $2 OFFSET $3`,
        [idTipo, page.items, page.offset],
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
      `SELECT ${FIELDS} FROM "LOTES_TIPOS_UNIDADES" WHERE "ID" = $1`,
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
      `INSERT INTO "LOTES_TIPOS_UNIDADES" ("ID_TIPO", "ID_UNIDAD")
       VALUES ($1, $2)
       RETURNING ${FIELDS}`,
      [record.ID_TIPO, record.ID_UNIDAD],
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
      `UPDATE "LOTES_TIPOS_UNIDADES"
       SET "ID_TIPO" = $1,
           "ID_UNIDAD" = $2
       WHERE "ID" = $3
       RETURNING ${FIELDS}`,
      [record.ID_TIPO, record.ID_UNIDAD, id],
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
      `SELECT "ES_SEMILLA" FROM "LOTES_TIPOS_UNIDADES" WHERE "ID" = $1`,
      [id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw httpError(404, 'not_found');
    }
    if (row.ES_SEMILLA) {
      throw httpError(409, 'seed_not_deletable');
    }

    await pool.query(`DELETE FROM "LOTES_TIPOS_UNIDADES" WHERE "ID" = $1`, [id]);
    sendData(res, 200, null);
  } catch (err) {
    translate(err);
  }
});

module.exports = router;
