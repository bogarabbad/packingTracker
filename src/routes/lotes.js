const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const {
  parseOptionalBoolean,
  parseOptionalPositiveInt,
} = require('../listFilters');
const { listLotesUbicaciones } = require('./lotesUbicaciones');

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
    if (
      message.includes('dentro de otro')
      || message.includes('embarcado no puede tener padre')
    ) {
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
    const filters = [];
    const params = [];
    let joinTipos = false;

    const padreId = parseOptionalPositiveInt(req.query.padre_id, 'invalid_padre_id');
    if (padreId !== null) {
      params.push(padreId);
      filters.push(`l."PADRE_ID" = $${params.length}`);
    }

    const idTipo = parseOptionalPositiveInt(req.query.id_tipo, 'invalid_id_tipo');
    if (idTipo !== null) {
      params.push(idTipo);
      filters.push(`l."ID_TIPO" = $${params.length}`);
    }

    const idUnidad = parseOptionalPositiveInt(req.query.id_unidad, 'invalid_id_unidad');
    if (idUnidad !== null) {
      params.push(idUnidad);
      filters.push(`l."ID_UNIDAD" = $${params.length}`);
    }

    const esFinal = parseOptionalBoolean(req.query.es_final, 'invalid_es_final');
    if (esFinal !== null) {
      joinTipos = true;
      params.push(esFinal);
      filters.push(`t."ES_FINAL" = $${params.length}`);
    }

    const embarcable = parseOptionalBoolean(req.query.embarcable, 'invalid_embarcable');
    if (embarcable === true) {
      filters.push('l."PADRE_ID" IS NULL');
      filters.push(`NOT EXISTS (
        SELECT 1 FROM "EXPEDICIONES_LOTES" AS el WHERE el."ID_LOTE" = l."ID"
      )`);
    } else if (embarcable === false) {
      filters.push(`(
        l."PADRE_ID" IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM "EXPEDICIONES_LOTES" AS el WHERE el."ID_LOTE" = l."ID"
        )
      )`);
    }

    const from = joinTipos
      ? '"LOTES" AS l JOIN "LOTES_TIPOS" AS t ON t."ID" = l."ID_TIPO"'
      : '"LOTES" AS l';
    const selectFields = FIELDS.split(', ').map((col) => `l.${col}`).join(', ');
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM ${from} ${where}`,
      params,
    );
    const listParams = [...params, page.items, page.offset];
    const result = await pool.query(
      `SELECT ${selectFields} FROM ${from}
       ${where}
       ORDER BY l."CREADO_EN" DESC, l."ID" DESC
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

router.get('/:id/ubicaciones', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const existing = await pool.query(
      'SELECT 1 FROM "LOTES" WHERE "ID" = $1',
      [id],
    );
    if (!existing.rows[0]) {
      throw httpError(404, 'not_found');
    }
    await listLotesUbicaciones(req, res, id);
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
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
    const lote = result.rows[0];

    // Usuario interno con ubicación por defecto → ORIGEN del lote.
    if (record.USUARIO_ID !== null && record.ID_ORIGEN_USUARIO === 1) {
      const userResult = await client.query(
        `SELECT "UBICACION_ID" FROM "USUARIOS" WHERE "ID" = $1`,
        [record.USUARIO_ID],
      );
      const ubicacionId = userResult.rows[0]
        ? mapNumber(userResult.rows[0].UBICACION_ID)
        : null;
      if (ubicacionId !== null) {
        await client.query(
          `INSERT INTO "LOTES_UBICACIONES" (
             "ID_LOTE", "UBICACION_ID", "ID_TIPO", "USUARIO_ID", "ID_ORIGEN_USUARIO"
           )
           VALUES ($1, $2, 1, $3, $4)`,
          [
            lote.ID,
            ubicacionId,
            record.USUARIO_ID,
            record.ID_ORIGEN_USUARIO,
          ],
        );
      }
    }

    await client.query('COMMIT');
    sendData(res, 201, mapRow(lote));
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
    const existing = await pool.query(
      'SELECT 1 FROM "LOTES" WHERE "ID" = $1',
      [id],
    );
    if (!existing.rows[0]) {
      throw httpError(404, 'not_found');
    }

    const deps = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "LOTES_PRODUCTOS" WHERE "ID_LOTE" = $1) AS productos,
         (SELECT COUNT(*)::int FROM "LOTES_REFERENCIAS" WHERE "ID_LOTE" = $1) AS referencias,
         (SELECT COUNT(*)::int FROM "LOTES" WHERE "PADRE_ID" = $1) AS hijos,
         (SELECT COUNT(*)::int FROM "LOTES_UBICACIONES" WHERE "ID_LOTE" = $1) AS ubicaciones,
         (SELECT COUNT(*)::int FROM "EXPEDICIONES_LOTES" WHERE "ID_LOTE" = $1) AS expediciones,
         (SELECT COUNT(*)::int FROM "RECEPCIONES_LOTES" WHERE "ID_LOTE" = $1) AS recepciones`,
      [id],
    );
    const counts = deps.rows[0];
    if (Number(counts.productos) > 0) {
      throw httpError(409, 'lote_has_productos');
    }
    if (Number(counts.referencias) > 0) {
      throw httpError(409, 'lote_has_referencias');
    }
    if (Number(counts.hijos) > 0) {
      throw httpError(409, 'lote_has_hijos');
    }
    if (Number(counts.ubicaciones) > 0) {
      throw httpError(409, 'lote_has_ubicaciones');
    }
    if (Number(counts.expediciones) > 0 || Number(counts.recepciones) > 0) {
      throw httpError(409, 'record_in_use');
    }

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
