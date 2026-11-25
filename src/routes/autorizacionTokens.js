const express = require('express');
const QRCode = require('qrcode');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const {
  parseOptionalBoolean,
  parseOptionalPositiveInt,
  parseOptionalQueryText,
  likeContains,
} = require('../listFilters');

const TABLE = 'AUTORIZACION_TOKENS';
const FIELDS = [
  'ID',
  'ID_DISPOSITIVO',
  'TOKEN',
  'NOMBRE',
  'ACTIVO',
  'EXPIRA_EN',
  'ULTIMO_USO_EN',
  'CREADO_EN',
  'ACTUALIZADO_EN',
].map((name) => `"${name}"`).join(', ');

function parseId(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw httpError(400, 'invalid_id');
  }

  return Number(value);
}

function requiredText(value, error) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, error);
  }

  return value.trim();
}

function optionalInteger(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw httpError(400, error);
  }

  return value;
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

function parseActivo(value) {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== 'boolean') {
    throw httpError(400, 'invalid_activo');
  }

  return value;
}

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  return {
    ID_DISPOSITIVO: optionalInteger(body.ID_DISPOSITIVO, 'invalid_id_dispositivo'),
    TOKEN: requiredText(body.TOKEN, 'invalid_token'),
    NOMBRE: requiredText(body.NOMBRE, 'invalid_nombre'),
    ACTIVO: parseActivo(body.ACTIVO),
    EXPIRA_EN: optionalTimestamptz(body.EXPIRA_EN, 'invalid_expira_en'),
  };
}

function mapNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_DISPOSITIVO: mapNumber(row.ID_DISPOSITIVO),
    TOKEN: row.TOKEN,
    NOMBRE: row.NOMBRE,
    ACTIVO: row.ACTIVO,
    EXPIRA_EN: row.EXPIRA_EN,
    ULTIMO_USO_EN: row.ULTIMO_USO_EN,
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function translate(err) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23505') {
    throw httpError(409, 'duplicate_token');
  }

  if (err.code === '23503') {
    if (err.constraint === 'AUTORIZACION_TOKENS_ID_DISPOSITIVO_FK') {
      throw httpError(400, 'invalid_id_dispositivo');
    }
    throw httpError(409, 'record_in_use');
  }

  if (err.code === '23514') {
    throw httpError(400, 'invalid_autorizacion_token');
  }

  throw err;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const filters = [];
    const params = [];

    const idDispositivo = parseOptionalPositiveInt(
      req.query.id_dispositivo,
      'invalid_id_dispositivo',
    );
    if (idDispositivo !== null) {
      params.push(idDispositivo);
      filters.push(`"ID_DISPOSITIVO" = $${params.length}`);
    }

    const q = parseOptionalQueryText(req.query.q, 'invalid_q');
    if (q !== null) {
      params.push(likeContains(q));
      filters.push(
        `("NOMBRE" ILIKE $${params.length} ESCAPE '\\'
         OR "TOKEN" ILIKE $${params.length} ESCAPE '\\')`,
      );
    }

    const activo = parseOptionalBoolean(req.query.activo, 'invalid_activo');
    if (activo !== null) {
      params.push(activo);
      filters.push(`"ACTIVO" = $${params.length}`);
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

router.get('/:id/qr', async (req, res) => {
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

    const dataUrl = await QRCode.toDataURL(row.TOKEN, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
    });

    sendData(res, 200, {
      ID: Number(row.ID),
      TOKEN: row.TOKEN,
      NOMBRE: row.NOMBRE,
      DATA_URL: dataUrl,
    });
  } catch (err) {
    translate(err);
  }
});

router.post('/', async (req, res) => {
  const record = parseBody(req.body);
  try {
    const result = await pool.query(
      `INSERT INTO "${TABLE}" (
         "ID_DISPOSITIVO", "TOKEN", "NOMBRE", "ACTIVO", "EXPIRA_EN"
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${FIELDS}`,
      [
        record.ID_DISPOSITIVO,
        record.TOKEN,
        record.NOMBRE,
        record.ACTIVO,
        record.EXPIRA_EN,
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
      `UPDATE "${TABLE}"
       SET "ID_DISPOSITIVO" = $1,
           "TOKEN" = $2,
           "NOMBRE" = $3,
           "ACTIVO" = $4,
           "EXPIRA_EN" = $5
       WHERE "ID" = $6
       RETURNING ${FIELDS}`,
      [
        record.ID_DISPOSITIVO,
        record.TOKEN,
        record.NOMBRE,
        record.ACTIVO,
        record.EXPIRA_EN,
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
      `DELETE FROM "${TABLE}" WHERE "ID" = $1 RETURNING "ID"`,
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
