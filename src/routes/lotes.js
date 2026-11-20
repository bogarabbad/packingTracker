const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');

const FIELDS =
  '"ID", "ID_TIPO", "PADRE_ID", "ID_UNIDAD", "USUARIO_ID", "ID_ORIGEN_USUARIO", "CREADO_EN", "ACTUALIZADO_EN"';

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
    ID_TIPO: requiredInteger(body.ID_TIPO, 'invalid_id_tipo'),
    PADRE_ID: optionalInteger(body.PADRE_ID, 'invalid_padre_id'),
    ID_UNIDAD: optionalInteger(body.ID_UNIDAD, 'invalid_id_unidad'),
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
    ID_TIPO: Number(row.ID_TIPO),
    PADRE_ID: mapNumber(row.PADRE_ID),
    ID_UNIDAD: mapNumber(row.ID_UNIDAD),
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

  if (err.code === '23503') {
    if (err.constraint === 'LOTES_ID_UNIDAD_FK') {
      throw httpError(400, 'invalid_id_unidad');
    }
    if (err.constraint === 'LOTES_PADRE_ID_FK') {
      throw httpError(400, 'invalid_padre_id');
    }
    if (err.constraint === 'LOTES_ID_ORIGEN_USUARIO_FK') {
      throw httpError(400, 'invalid_id_origen_usuario');
    }
    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('usuario interno')) {
      throw httpError(400, 'invalid_usuario_id');
    }
    throw httpError(400, 'invalid_id_tipo');
  }

  if (err.code === '23514') {
    if (err.constraint === 'LOTES_PADRE_ID_CHK') {
      throw httpError(400, 'invalid_padre_id');
    }
    if (
      err.constraint === 'LOTES_USUARIO_ID_CHK'
      || err.constraint === 'LOTES_USUARIO_ORIGEN_CHK'
    ) {
      throw httpError(
        400,
        err.constraint === 'LOTES_USUARIO_ORIGEN_CHK'
          ? 'invalid_usuario_origen'
          : 'invalid_usuario_id',
      );
    }

    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('origen deben ir')) {
      throw httpError(400, 'invalid_usuario_origen');
    }
    if (message.includes('embarca')) {
      throw httpError(400, 'invalid_id_unidad');
    }
    if (message.includes('dentro de otro')) {
      throw httpError(400, 'invalid_padre_id');
    }
    if (message.includes('producto') || message.includes('medida')) {
      throw httpError(400, 'invalid_tipo_lote');
    }

    throw httpError(400, 'invalid_lote');
  }

  throw err;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const totalResult = await pool.query('SELECT COUNT(*)::int AS total FROM "LOTES"');
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "LOTES" ORDER BY "ID" LIMIT $1 OFFSET $2`,
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
      `SELECT ${FIELDS} FROM "LOTES" WHERE "ID" = $1`,
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
      `INSERT INTO "LOTES" ("ID_TIPO", "PADRE_ID", "ID_UNIDAD", "USUARIO_ID", "ID_ORIGEN_USUARIO")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${FIELDS}`,
      [
        record.ID_TIPO,
        record.PADRE_ID,
        record.ID_UNIDAD,
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
      `UPDATE "LOTES"
       SET "ID_TIPO" = $1,
           "PADRE_ID" = $2,
           "ID_UNIDAD" = $3,
           "USUARIO_ID" = $4,
           "ID_ORIGEN_USUARIO" = $5
       WHERE "ID" = $6
       RETURNING ${FIELDS}`,
      [
        record.ID_TIPO,
        record.PADRE_ID,
        record.ID_UNIDAD,
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
      `DELETE FROM "LOTES" WHERE "ID" = $1 RETURNING "ID"`,
      [id],
    );
    if (!result.rows[0]) {
      throw httpError(404, 'not_found');
    }
    sendData(res, 200, null);
  } catch (err) {
    if (err.code === '23503') {
      throw httpError(409, 'record_in_use');
    }
    translate(err);
  }
});

module.exports = router;
