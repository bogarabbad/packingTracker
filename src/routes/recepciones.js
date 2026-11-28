const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const { parseOptionalPositiveInt } = require('../listFilters');
const { listRecepcionesLotes } = require('./recepcionesLotes');
const { requireUsuarioUbicacion } = require('../usuarioUbicacion');

const FIELDS = [
  'ID',
  'ID_EXPEDICION',
  'UBICACION_ID',
  'FECHA_CIERRE',
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

function parseAudit(body) {
  const usuarioId = optionalInteger(body.USUARIO_ID, 'invalid_usuario_id');
  const idOrigenUsuario = optionalInteger(
    body.ID_ORIGEN_USUARIO,
    'invalid_id_origen_usuario',
  );
  if ((usuarioId === null) !== (idOrigenUsuario === null)) {
    throw httpError(400, 'invalid_usuario_origen');
  }

  return { USUARIO_ID: usuarioId, ID_ORIGEN_USUARIO: idOrigenUsuario };
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

  return {
    ID_EXPEDICION: requiredInteger(body.ID_EXPEDICION, 'invalid_id_expedicion'),
    UBICACION_ID: requiredInteger(body.UBICACION_ID, 'invalid_ubicacion_id'),
    FECHA_CIERRE: optionalTimestamptz(body.FECHA_CIERRE, 'invalid_fecha_cierre'),
    ...parseAudit(body),
  };
}

function mapNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_EXPEDICION: Number(row.ID_EXPEDICION),
    UBICACION_ID: Number(row.UBICACION_ID),
    FECHA_CIERRE: row.FECHA_CIERRE,
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
    if (err.constraint === 'RECEPCIONES_EXPEDICION_UBICACION_UQ') {
      throw httpError(409, 'recepcion_ubicacion_duplicada');
    }
    throw httpError(409, 'duplicate');
  }

  if (err.code === '23503') {
    if (err.constraint === 'RECEPCIONES_ID_EXPEDICION_FK') {
      throw httpError(400, 'invalid_id_expedicion');
    }
    if (err.constraint === 'RECEPCIONES_UBICACION_ID_FK') {
      throw httpError(400, 'invalid_ubicacion_id');
    }
    if (err.constraint === 'RECEPCIONES_ID_ORIGEN_USUARIO_FK') {
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
      err.constraint === 'RECEPCIONES_USUARIO_ID_CHK'
      || err.constraint === 'RECEPCIONES_USUARIO_ORIGEN_CHK'
    ) {
      throw httpError(
        400,
        err.constraint === 'RECEPCIONES_USUARIO_ORIGEN_CHK'
          ? 'invalid_usuario_origen'
          : 'invalid_usuario_id',
      );
    }
    if (err.constraint === 'RECEPCIONES_FECHA_CIERRE_CHK') {
      throw httpError(400, 'invalid_fecha_cierre');
    }
    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('origen deben ir')) {
      throw httpError(400, 'invalid_usuario_origen');
    }
    throw httpError(400, 'invalid_recepcion');
  }

  throw err;
}

async function listRecepciones(req, res, fixedIdExpedicion) {
  const page = paginationFromQuery(req.query);
  const filters = [];
  const params = [];

  const idExpedicion = fixedIdExpedicion !== undefined
    ? fixedIdExpedicion
    : parseOptionalPositiveInt(req.query.id_expedicion, 'invalid_id_expedicion');
  if (idExpedicion !== null) {
    params.push(idExpedicion);
    filters.push(`"ID_EXPEDICION" = $${params.length}`);
  }

  if (fixedIdExpedicion === undefined) {
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
    `SELECT COUNT(*)::int AS total FROM "RECEPCIONES" ${where}`,
    params,
  );
  const listParams = [...params, page.items, page.offset];
  const result = await pool.query(
    `SELECT ${FIELDS} FROM "RECEPCIONES"
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
    await listRecepciones(req, res);
  } catch (err) {
    translate(err);
  }
});

router.get('/:id/lotes', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const existing = await pool.query(
      'SELECT 1 FROM "RECEPCIONES" WHERE "ID" = $1',
      [id],
    );
    if (!existing.rows[0]) {
      throw httpError(404, 'not_found');
    }
    await listRecepcionesLotes(req, res, id);
  } catch (err) {
    translate(err);
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "RECEPCIONES" WHERE "ID" = $1`,
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
    await requireUsuarioUbicacion(record.USUARIO_ID, record.ID_ORIGEN_USUARIO);
    const result = await pool.query(
      `INSERT INTO "RECEPCIONES" (
         "ID_EXPEDICION", "UBICACION_ID", "FECHA_CIERRE",
         "USUARIO_ID", "ID_ORIGEN_USUARIO"
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${FIELDS}`,
      [
        record.ID_EXPEDICION,
        record.UBICACION_ID,
        record.FECHA_CIERRE,
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
      `UPDATE "RECEPCIONES"
       SET "ID_EXPEDICION" = $1,
           "UBICACION_ID" = $2,
           "FECHA_CIERRE" = $3,
           "USUARIO_ID" = $4,
           "ID_ORIGEN_USUARIO" = $5
       WHERE "ID" = $6
       RETURNING ${FIELDS}`,
      [
        record.ID_EXPEDICION,
        record.UBICACION_ID,
        record.FECHA_CIERRE,
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
      'DELETE FROM "RECEPCIONES" WHERE "ID" = $1 RETURNING "ID"',
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
module.exports.listRecepciones = listRecepciones;
