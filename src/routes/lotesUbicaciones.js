const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const { parseOptionalPositiveInt } = require('../listFilters');

const FIELDS = [
  'ID',
  'ID_LOTE',
  'UBICACION_ID',
  'ID_TIPO',
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
    ID_LOTE: requiredInteger(body.ID_LOTE, 'invalid_id_lote'),
    UBICACION_ID: requiredInteger(body.UBICACION_ID, 'invalid_ubicacion_id'),
    ID_TIPO: requiredInteger(body.ID_TIPO, 'invalid_id_tipo'),
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
    ID_LOTE: Number(row.ID_LOTE),
    UBICACION_ID: Number(row.UBICACION_ID),
    ID_TIPO: Number(row.ID_TIPO),
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
    if (err.constraint === 'LOTES_UBICACIONES_DESTINO_UQ') {
      throw httpError(409, 'destino_ya_definido');
    }
    throw httpError(409, 'duplicate');
  }

  if (err.code === '23503') {
    if (err.constraint === 'LOTES_UBICACIONES_ID_LOTE_FK') {
      throw httpError(400, 'invalid_id_lote');
    }
    if (err.constraint === 'LOTES_UBICACIONES_UBICACION_ID_FK') {
      throw httpError(400, 'invalid_ubicacion_id');
    }
    if (err.constraint === 'LOTES_UBICACIONES_ID_TIPO_FK') {
      throw httpError(400, 'invalid_id_tipo');
    }
    if (err.constraint === 'LOTES_UBICACIONES_ID_ORIGEN_USUARIO_FK') {
      throw httpError(400, 'invalid_id_origen_usuario');
    }
    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('usuario interno')) {
      throw httpError(400, 'invalid_usuario_id');
    }
    throw httpError(409, 'record_in_use');
  }

  if (err.code === '23514') {
    if (
      err.constraint === 'LOTES_UBICACIONES_USUARIO_ID_CHK'
      || err.constraint === 'LOTES_UBICACIONES_USUARIO_ORIGEN_CHK'
    ) {
      throw httpError(
        400,
        err.constraint === 'LOTES_UBICACIONES_USUARIO_ORIGEN_CHK'
          ? 'invalid_usuario_origen'
          : 'invalid_usuario_id',
      );
    }
    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('origen deben ir')) {
      throw httpError(400, 'invalid_usuario_origen');
    }
    throw httpError(400, 'invalid_lote_ubicacion');
  }

  throw err;
}

async function listLotesUbicaciones(req, res, fixedIdLote) {
  const page = paginationFromQuery(req.query);
  const filters = [];
  const params = [];

  const idLote = fixedIdLote !== undefined
    ? fixedIdLote
    : parseOptionalPositiveInt(req.query.id_lote, 'invalid_id_lote');
  if (idLote !== null) {
    params.push(idLote);
    filters.push(`"ID_LOTE" = $${params.length}`);
  }

  if (fixedIdLote === undefined) {
    const idTipo = parseOptionalPositiveInt(req.query.id_tipo, 'invalid_id_tipo');
    if (idTipo !== null) {
      params.push(idTipo);
      filters.push(`"ID_TIPO" = $${params.length}`);
    }

    const ubicacionId = parseOptionalPositiveInt(
      req.query.ubicacion_id,
      'invalid_ubicacion_id',
    );
    if (ubicacionId !== null) {
      params.push(ubicacionId);
      filters.push(`"UBICACION_ID" = $${params.length}`);
    }
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM "LOTES_UBICACIONES" ${where}`,
    params,
  );
  const listParams = [...params, page.items, page.offset];
  const result = await pool.query(
    `SELECT ${FIELDS} FROM "LOTES_UBICACIONES"
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
    await listLotesUbicaciones(req, res);
  } catch (err) {
    translate(err);
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "LOTES_UBICACIONES" WHERE "ID" = $1`,
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
      `INSERT INTO "LOTES_UBICACIONES" (
         "ID_LOTE", "UBICACION_ID", "ID_TIPO", "USUARIO_ID", "ID_ORIGEN_USUARIO"
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${FIELDS}`,
      [
        record.ID_LOTE,
        record.UBICACION_ID,
        record.ID_TIPO,
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
      `UPDATE "LOTES_UBICACIONES"
       SET "ID_LOTE" = $1,
           "UBICACION_ID" = $2,
           "ID_TIPO" = $3,
           "USUARIO_ID" = $4,
           "ID_ORIGEN_USUARIO" = $5
       WHERE "ID" = $6
       RETURNING ${FIELDS}`,
      [
        record.ID_LOTE,
        record.UBICACION_ID,
        record.ID_TIPO,
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
      'DELETE FROM "LOTES_UBICACIONES" WHERE "ID" = $1 RETURNING "ID"',
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
module.exports.listLotesUbicaciones = listLotesUbicaciones;
