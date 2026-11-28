const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const { parseOptionalPositiveInt } = require('../listFilters');

const FIELDS = [
  'ID',
  'ID_UNIDAD',
  'UBICACION_ID',
  'FECHA',
  'ES_SEMILLA',
  'CREADO_EN',
  'ACTUALIZADO_EN',
].map((name) => `"${name}"`).join(', ');

const TABLE = 'UNIDADES_TRANSPORTE_UBICACIONES';

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

function optionalFecha(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw httpError(400, 'invalid_fecha');
  }

  return value;
}

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  return {
    ID_UNIDAD: requiredInteger(body.ID_UNIDAD, 'invalid_id_unidad'),
    UBICACION_ID: requiredInteger(body.UBICACION_ID, 'invalid_ubicacion_id'),
    FECHA: optionalFecha(body.FECHA),
  };
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_UNIDAD: Number(row.ID_UNIDAD),
    UBICACION_ID: Number(row.UBICACION_ID),
    FECHA: row.FECHA,
    ES_SEMILLA: row.ES_SEMILLA,
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function translate(err) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23503') {
    if (err.constraint === 'UNIDADES_TRANSPORTE_UBICACIONES_ID_UNIDAD_FK') {
      throw httpError(400, 'invalid_id_unidad');
    }
    if (err.constraint === 'UNIDADES_TRANSPORTE_UBICACIONES_UBICACION_ID_FK') {
      throw httpError(400, 'invalid_ubicacion_id');
    }
    throw httpError(409, 'record_in_use');
  }

  throw err;
}

async function sincronizarUnidad(client, idUnidad) {
  await client.query(
    'SELECT unidad_transporte_sincronizar_ubicacion($1)',
    [idUnidad],
  );
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const filters = [];
    const params = [];

    const idUnidad = parseOptionalPositiveInt(
      req.query.id_unidad,
      'invalid_id_unidad',
    );
    if (idUnidad !== null) {
      params.push(idUnidad);
      filters.push(`"ID_UNIDAD" = $${params.length}`);
    }

    const ubicacionId = parseOptionalPositiveInt(
      req.query.ubicacion_id,
      'invalid_ubicacion_id',
    );
    if (ubicacionId !== null) {
      params.push(ubicacionId);
      filters.push(`"UBICACION_ID" = $${params.length}`);
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
       ORDER BY "FECHA" DESC, "ID" DESC
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = record.FECHA === null
      ? await client.query(
        `INSERT INTO "${TABLE}" ("ID_UNIDAD", "UBICACION_ID")
         VALUES ($1, $2)
         RETURNING ${FIELDS}`,
        [record.ID_UNIDAD, record.UBICACION_ID],
      )
      : await client.query(
        `INSERT INTO "${TABLE}" ("ID_UNIDAD", "UBICACION_ID", "FECHA")
         VALUES ($1, $2, $3)
         RETURNING ${FIELDS}`,
        [record.ID_UNIDAD, record.UBICACION_ID, record.FECHA],
      );
    await sincronizarUnidad(client, record.ID_UNIDAD);
    await client.query('COMMIT');
    sendData(res, 201, mapRow(result.rows[0]));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    translate(err);
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const record = parseBody(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT "ID_UNIDAD" FROM "${TABLE}" WHERE "ID" = $1`,
      [id],
    );
    const previous = existing.rows[0];
    if (!previous) {
      throw httpError(404, 'not_found');
    }

    const fecha = record.FECHA === null ? new Date().toISOString() : record.FECHA;
    const result = await client.query(
      `UPDATE "${TABLE}"
       SET "ID_UNIDAD" = $1,
           "UBICACION_ID" = $2,
           "FECHA" = $3
       WHERE "ID" = $4
       RETURNING ${FIELDS}`,
      [record.ID_UNIDAD, record.UBICACION_ID, fecha, id],
    );

    const previousUnidad = Number(previous.ID_UNIDAD);
    await sincronizarUnidad(client, record.ID_UNIDAD);
    if (previousUnidad !== record.ID_UNIDAD) {
      await sincronizarUnidad(client, previousUnidad);
    }

    await client.query('COMMIT');
    sendData(res, 200, mapRow(result.rows[0]));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    translate(err);
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT "ID_UNIDAD", "ES_SEMILLA" FROM "${TABLE}" WHERE "ID" = $1`,
      [id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw httpError(404, 'not_found');
    }
    if (row.ES_SEMILLA) {
      throw httpError(409, 'seed_not_deletable');
    }

    await client.query(`DELETE FROM "${TABLE}" WHERE "ID" = $1`, [id]);
    await sincronizarUnidad(client, Number(row.ID_UNIDAD));
    await client.query('COMMIT');
    sendData(res, 200, null);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    translate(err);
  } finally {
    client.release();
  }
});

module.exports = router;
