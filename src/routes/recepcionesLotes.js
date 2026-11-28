const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const { parseOptionalPositiveInt } = require('../listFilters');

const FIELDS = [
  'ID',
  'ID_RECEPCION',
  'ID_LOTE',
  'OBSERVACIONES',
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

function optionalText(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, error);
  }

  return value.trim();
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
    ID_RECEPCION: requiredInteger(body.ID_RECEPCION, 'invalid_id_recepcion'),
    ID_LOTE: requiredInteger(body.ID_LOTE, 'invalid_id_lote'),
    OBSERVACIONES: optionalText(body.OBSERVACIONES, 'invalid_observaciones'),
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
    ID_RECEPCION: Number(row.ID_RECEPCION),
    ID_LOTE: Number(row.ID_LOTE),
    OBSERVACIONES: row.OBSERVACIONES,
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
    throw httpError(409, 'lote_ya_recibido');
  }

  if (err.code === '23503') {
    if (err.constraint === 'RECEPCIONES_LOTES_ID_RECEPCION_FK') {
      throw httpError(400, 'invalid_id_recepcion');
    }
    if (err.constraint === 'RECEPCIONES_LOTES_ID_LOTE_FK') {
      throw httpError(400, 'invalid_id_lote');
    }
    if (err.constraint === 'RECEPCIONES_LOTES_ID_ORIGEN_USUARIO_FK') {
      throw httpError(400, 'invalid_id_origen_usuario');
    }
    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('usuario interno')) {
      throw httpError(400, 'invalid_usuario_id');
    }
    if (message.includes('recepcion inexistente')) {
      throw httpError(400, 'invalid_id_recepcion');
    }
    if (message.includes('lote inexistente')) {
      throw httpError(400, 'invalid_id_lote');
    }
    throw httpError(400, 'invalid_id_lote');
  }

  if (err.code === '23514') {
    if (err.constraint === 'RECEPCIONES_LOTES_OBSERVACIONES_CHK') {
      throw httpError(400, 'invalid_observaciones');
    }
    if (
      err.constraint === 'RECEPCIONES_LOTES_USUARIO_ID_CHK'
      || err.constraint === 'RECEPCIONES_LOTES_USUARIO_ORIGEN_CHK'
    ) {
      throw httpError(
        400,
        err.constraint === 'RECEPCIONES_LOTES_USUARIO_ORIGEN_CHK'
          ? 'invalid_usuario_origen'
          : 'invalid_usuario_id',
      );
    }
    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('origen deben ir')) {
      throw httpError(400, 'invalid_usuario_origen');
    }
    if (message.includes('sin padre')) {
      throw httpError(400, 'invalid_id_lote');
    }
    if (message.includes('no tiene destino')) {
      throw httpError(400, 'sin_destino');
    }
    if (message.includes('no coincide')) {
      throw httpError(400, 'destino_no_coincide');
    }
    if (message.includes('recepcion cerrada')) {
      throw httpError(409, 'recepcion_cerrada');
    }
    throw httpError(400, 'invalid_recepcion_lote');
  }

  throw err;
}

async function listRecepcionesLotes(req, res, fixedIdRecepcion) {
  const page = paginationFromQuery(req.query);
  const filters = [];
  const params = [];

  const idRecepcion = fixedIdRecepcion !== undefined
    ? fixedIdRecepcion
    : parseOptionalPositiveInt(req.query.id_recepcion, 'invalid_id_recepcion');
  if (idRecepcion !== null) {
    params.push(idRecepcion);
    filters.push(`"ID_RECEPCION" = $${params.length}`);
  }

  if (fixedIdRecepcion === undefined) {
    const idLote = parseOptionalPositiveInt(req.query.id_lote, 'invalid_id_lote');
    if (idLote !== null) {
      params.push(idLote);
      filters.push(`"ID_LOTE" = $${params.length}`);
    }
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM "RECEPCIONES_LOTES" ${where}`,
    params,
  );
  const listParams = [...params, page.items, page.offset];
  const result = await pool.query(
    `SELECT ${FIELDS} FROM "RECEPCIONES_LOTES"
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
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await listRecepcionesLotes(req, res);
  } catch (err) {
    translate(err);
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "RECEPCIONES_LOTES" WHERE "ID" = $1`,
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
      `INSERT INTO "RECEPCIONES_LOTES" (
         "ID_RECEPCION", "ID_LOTE", "OBSERVACIONES", "USUARIO_ID", "ID_ORIGEN_USUARIO"
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${FIELDS}`,
      [
        record.ID_RECEPCION,
        record.ID_LOTE,
        record.OBSERVACIONES,
        record.USUARIO_ID,
        record.ID_ORIGEN_USUARIO,
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
      `UPDATE "RECEPCIONES_LOTES"
       SET "ID_RECEPCION" = $1,
           "ID_LOTE" = $2,
           "OBSERVACIONES" = $3,
           "USUARIO_ID" = $4,
           "ID_ORIGEN_USUARIO" = $5
       WHERE "ID" = $6
       RETURNING ${FIELDS}`,
      [
        record.ID_RECEPCION,
        record.ID_LOTE,
        record.OBSERVACIONES,
        record.USUARIO_ID,
        record.ID_ORIGEN_USUARIO,
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
      'DELETE FROM "RECEPCIONES_LOTES" WHERE "ID" = $1 RETURNING "ID"',
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
module.exports.listRecepcionesLotes = listRecepcionesLotes;
