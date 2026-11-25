const express = require('express');
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

const TABLE = 'DISPOSITIVOS';
const FIELDS = [
  'ID',
  'ID_TIPO',
  'IDENTIFICADOR',
  'NOMBRE',
  'ACTIVO',
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

function requiredInteger(value, error) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw httpError(400, error);
  }

  return value;
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
    ID_TIPO: requiredInteger(body.ID_TIPO, 'invalid_id_tipo'),
    IDENTIFICADOR: requiredText(body.IDENTIFICADOR, 'invalid_identificador'),
    NOMBRE: requiredText(body.NOMBRE, 'invalid_nombre'),
    ACTIVO: parseActivo(body.ACTIVO),
  };
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_TIPO: Number(row.ID_TIPO),
    IDENTIFICADOR: row.IDENTIFICADOR,
    NOMBRE: row.NOMBRE,
    ACTIVO: row.ACTIVO,
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function translate(err) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23505') {
    if (err.constraint === 'DISPOSITIVOS_IDENTIFICADOR_key') {
      throw httpError(409, 'duplicate_identificador');
    }
    throw httpError(409, 'duplicate_identificador');
  }

  if (err.code === '23503') {
    if (err.constraint === 'DISPOSITIVOS_ID_TIPO_FK') {
      throw httpError(400, 'invalid_id_tipo');
    }
    throw httpError(409, 'record_in_use');
  }

  if (err.code === '23514') {
    throw httpError(400, 'invalid_dispositivo');
  }

  throw err;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const filters = [];
    const params = [];

    const idTipo = parseOptionalPositiveInt(req.query.id_tipo, 'invalid_id_tipo');
    if (idTipo !== null) {
      params.push(idTipo);
      filters.push(`"ID_TIPO" = $${params.length}`);
    }

    const q = parseOptionalQueryText(req.query.q, 'invalid_q');
    if (q !== null) {
      params.push(likeContains(q));
      filters.push(
        `("IDENTIFICADOR" ILIKE $${params.length} ESCAPE '\\'
         OR "NOMBRE" ILIKE $${params.length} ESCAPE '\\')`,
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

router.post('/', async (req, res) => {
  const record = parseBody(req.body);
  try {
    const result = await pool.query(
      `INSERT INTO "${TABLE}" ("ID_TIPO", "IDENTIFICADOR", "NOMBRE", "ACTIVO")
       VALUES ($1, $2, $3, $4)
       RETURNING ${FIELDS}`,
      [record.ID_TIPO, record.IDENTIFICADOR, record.NOMBRE, record.ACTIVO],
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
       SET "ID_TIPO" = $1,
           "IDENTIFICADOR" = $2,
           "NOMBRE" = $3,
           "ACTIVO" = $4
       WHERE "ID" = $5
       RETURNING ${FIELDS}`,
      [record.ID_TIPO, record.IDENTIFICADOR, record.NOMBRE, record.ACTIVO, id],
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
