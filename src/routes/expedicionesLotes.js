const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const { parseOptionalPositiveInt } = require('../listFilters');

const FIELDS = [
  'ID',
  'ID_EXPEDICION',
  'ID_LOTE',
  'EMBARCADO_EN',
  'USUARIO_ID',
  'ID_ORIGEN_USUARIO',
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

function optionalInteger(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  return requiredInteger(value, error);
}

function optionalTimestamptz(value, error) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw httpError(400, error);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, error);
  }

  return date.toISOString();
}

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  const usuarioId = optionalInteger(body.USUARIO_ID, 'invalid_usuario_id');
  const idOrigenUsuario = optionalInteger(
    body.ID_ORIGEN_USUARIO,
    'invalid_id_origen_usuario',
  );
  if ((usuarioId === null) !== (idOrigenUsuario === null)) {
    throw httpError(400, 'invalid_usuario_origen');
  }

  return {
    ID_EXPEDICION: requiredInteger(body.ID_EXPEDICION, 'invalid_id_expedicion'),
    ID_LOTE: requiredInteger(body.ID_LOTE, 'invalid_id_lote'),
    EMBARCADO_EN: optionalTimestamptz(body.EMBARCADO_EN, 'invalid_embarcado_en'),
    USUARIO_ID: usuarioId,
    ID_ORIGEN_USUARIO: idOrigenUsuario,
  };
}

function mapNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_EXPEDICION: Number(row.ID_EXPEDICION),
    ID_LOTE: Number(row.ID_LOTE),
    EMBARCADO_EN: row.EMBARCADO_EN,
    USUARIO_ID: mapNumber(row.USUARIO_ID),
    ID_ORIGEN_USUARIO: mapNumber(row.ID_ORIGEN_USUARIO),
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function translate(err) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23505') {
    throw httpError(409, 'lote_ya_embarcado');
  }

  if (err.code === '23503') {
    if (err.constraint === 'EXPEDICIONES_LOTES_ID_EXPEDICION_FK') {
      throw httpError(400, 'invalid_id_expedicion');
    }
    if (err.constraint === 'EXPEDICIONES_LOTES_ID_LOTE_FK') {
      throw httpError(400, 'invalid_id_lote');
    }
    if (err.constraint === 'EXPEDICIONES_LOTES_ID_ORIGEN_USUARIO_FK') {
      throw httpError(400, 'invalid_id_origen_usuario');
    }
    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('usuario interno')) {
      throw httpError(400, 'invalid_usuario_id');
    }
    if (message.includes('lote inexistente')) {
      throw httpError(400, 'invalid_id_lote');
    }
    if (message.includes('expedicion inexistente')) {
      throw httpError(400, 'invalid_id_expedicion');
    }
    throw httpError(400, 'invalid_id_lote');
  }

  if (err.code === '23514') {
    if (
      err.constraint === 'EXPEDICIONES_LOTES_USUARIO_ID_CHK'
      || err.constraint === 'EXPEDICIONES_LOTES_USUARIO_ORIGEN_CHK'
    ) {
      throw httpError(
        400,
        err.constraint === 'EXPEDICIONES_LOTES_USUARIO_ORIGEN_CHK'
          ? 'invalid_usuario_origen'
          : 'invalid_usuario_id',
      );
    }

    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('origen deben ir')) {
      throw httpError(400, 'invalid_usuario_origen');
    }
    if (message.includes('cerrada conserva') || message.includes('expedicion cerrada')) {
      throw httpError(409, 'expedicion_cerrada');
    }
    if (message.includes('sin padre')) {
      throw httpError(400, 'invalid_id_lote');
    }
    if (message.includes('anterior a la expedicion')) {
      throw httpError(400, 'invalid_embarcado_en');
    }

    throw httpError(400, 'invalid_embarque');
  }

  throw err;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const filters = [];
    const params = [];

    const idExpedicion = parseOptionalPositiveInt(
      req.query.id_expedicion,
      'invalid_id_expedicion',
    );
    if (idExpedicion !== null) {
      params.push(idExpedicion);
      filters.push(`"ID_EXPEDICION" = $${params.length}`);
    }

    const idLote = parseOptionalPositiveInt(req.query.id_lote, 'invalid_id_lote');
    if (idLote !== null) {
      params.push(idLote);
      filters.push(`"ID_LOTE" = $${params.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM "EXPEDICIONES_LOTES" ${where}`,
      params,
    );
    const listParams = [...params, page.items, page.offset];
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "EXPEDICIONES_LOTES"
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
      `SELECT ${FIELDS} FROM "EXPEDICIONES_LOTES" WHERE "ID" = $1`,
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
    const result = record.EMBARCADO_EN === null
      ? await pool.query(
        `INSERT INTO "EXPEDICIONES_LOTES" (
           "ID_EXPEDICION", "ID_LOTE", "USUARIO_ID", "ID_ORIGEN_USUARIO"
         )
         VALUES ($1, $2, $3, $4)
         RETURNING ${FIELDS}`,
        [
          record.ID_EXPEDICION,
          record.ID_LOTE,
          record.USUARIO_ID,
          record.ID_ORIGEN_USUARIO,
        ],
      )
      : await pool.query(
        `INSERT INTO "EXPEDICIONES_LOTES" (
           "ID_EXPEDICION", "ID_LOTE", "EMBARCADO_EN",
           "USUARIO_ID", "ID_ORIGEN_USUARIO"
         )
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${FIELDS}`,
        [
          record.ID_EXPEDICION,
          record.ID_LOTE,
          record.EMBARCADO_EN,
          record.USUARIO_ID,
          record.ID_ORIGEN_USUARIO,
        ],
      );
    sendData(res, 201, mapRow(result.rows[0]));
  } catch (err) {
    translate(err);
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const result = await pool.query(
      `DELETE FROM "EXPEDICIONES_LOTES" WHERE "ID" = $1 RETURNING "ID"`,
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
