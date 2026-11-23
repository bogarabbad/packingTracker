const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');

const FIELDS =
  '"ID", "ID_LOTE", "CLAVE_PRODUCTO", "CANTIDAD", "ID_UNIDAD", "CREADO_EN", "ACTUALIZADO_EN"';

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

function requiredText(value, error) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, error);
  }

  return value.trim();
}

function requiredQuantity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw httpError(400, 'invalid_cantidad');
  }

  return value;
}

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  return {
    ID_LOTE: requiredInteger(body.ID_LOTE, 'invalid_id_lote'),
    CLAVE_PRODUCTO: requiredText(body.CLAVE_PRODUCTO, 'invalid_clave_producto'),
    CANTIDAD: requiredQuantity(body.CANTIDAD),
    ID_UNIDAD: requiredInteger(body.ID_UNIDAD, 'invalid_id_unidad'),
  };
}

function mapNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_LOTE: Number(row.ID_LOTE),
    CLAVE_PRODUCTO: row.CLAVE_PRODUCTO,
    CANTIDAD: mapNumber(row.CANTIDAD),
    ID_UNIDAD: Number(row.ID_UNIDAD),
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function translate(err) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23503') {
    if (err.constraint === 'LOTES_PRODUCTOS_ID_LOTE_FK') {
      throw httpError(400, 'invalid_id_lote');
    }
    if (err.constraint === 'LOTES_PRODUCTOS_ID_UNIDAD_FK') {
      throw httpError(400, 'invalid_id_unidad');
    }
    throw httpError(400, 'invalid_id_lote');
  }

  if (err.code === '23514') {
    if (err.constraint === 'LOTES_PRODUCTOS_CANTIDAD_CHK') {
      throw httpError(400, 'invalid_cantidad');
    }
    if (err.constraint === 'LOTES_PRODUCTOS_CLAVE_PRODUCTO_CHK') {
      throw httpError(400, 'invalid_clave_producto');
    }

    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('solo un lote final')) {
      throw httpError(400, 'invalid_tipo_lote');
    }
    if (message.includes('medida del producto')) {
      throw httpError(400, 'invalid_id_unidad');
    }
    if (message.includes('debe ser entera')) {
      throw httpError(400, 'invalid_cantidad');
    }
    throw httpError(400, 'invalid_producto');
  }

  throw err;
}

function parseOptionalIdLote(query) {
  if (query.id_lote === undefined || query.id_lote === '') {
    return null;
  }
  if (!/^[1-9]\d*$/.test(String(query.id_lote))) {
    throw httpError(400, 'invalid_id_lote');
  }
  return Number(query.id_lote);
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const idLote = parseOptionalIdLote(req.query);

    const totalResult = idLote === null
      ? await pool.query('SELECT COUNT(*)::int AS total FROM "LOTES_PRODUCTOS"')
      : await pool.query(
        'SELECT COUNT(*)::int AS total FROM "LOTES_PRODUCTOS" WHERE "ID_LOTE" = $1',
        [idLote],
      );

    const result = idLote === null
      ? await pool.query(
        `SELECT ${FIELDS} FROM "LOTES_PRODUCTOS"
         ORDER BY "CREADO_EN" DESC, "ID" DESC
         LIMIT $1 OFFSET $2`,
        [page.items, page.offset],
      )
      : await pool.query(
        `SELECT ${FIELDS} FROM "LOTES_PRODUCTOS"
         WHERE "ID_LOTE" = $1
         ORDER BY "CREADO_EN" DESC, "ID" DESC
         LIMIT $2 OFFSET $3`,
        [idLote, page.items, page.offset],
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
      `SELECT ${FIELDS} FROM "LOTES_PRODUCTOS" WHERE "ID" = $1`,
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
      `INSERT INTO "LOTES_PRODUCTOS" (
         "ID_LOTE", "CLAVE_PRODUCTO", "CANTIDAD", "ID_UNIDAD"
       )
       VALUES ($1, $2, $3, $4)
       RETURNING ${FIELDS}`,
      [
        record.ID_LOTE,
        record.CLAVE_PRODUCTO,
        record.CANTIDAD,
        record.ID_UNIDAD,
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
      `UPDATE "LOTES_PRODUCTOS"
       SET "ID_LOTE" = $1,
           "CLAVE_PRODUCTO" = $2,
           "CANTIDAD" = $3,
           "ID_UNIDAD" = $4
       WHERE "ID" = $5
       RETURNING ${FIELDS}`,
      [
        record.ID_LOTE,
        record.CLAVE_PRODUCTO,
        record.CANTIDAD,
        record.ID_UNIDAD,
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
    const result = await pool.query(
      `DELETE FROM "LOTES_PRODUCTOS" WHERE "ID" = $1 RETURNING "ID"`,
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
