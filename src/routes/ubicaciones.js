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
const { parsePadreQuery, assertSinCiclo } = require('./arbol');

const TABLE = 'UBICACIONES';
const FIELDS = [
  'ID',
  'ID_CATEGORIA',
  'PADRE_ID',
  'CODIGO',
  'NOMBRE',
  'ACTIVO',
  'ES_SEMILLA',
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

function optionalInteger(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  return requiredInteger(value, error);
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
    ID_CATEGORIA: requiredInteger(body.ID_CATEGORIA, 'invalid_id_categoria'),
    PADRE_ID: optionalInteger(body.PADRE_ID, 'invalid_padre_id'),
    CODIGO: requiredText(body.CODIGO, 'invalid_codigo'),
    NOMBRE: requiredText(body.NOMBRE, 'invalid_nombre'),
    ACTIVO: parseActivo(body.ACTIVO),
  };
}

function mapNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_CATEGORIA: Number(row.ID_CATEGORIA),
    PADRE_ID: mapNumber(row.PADRE_ID),
    CODIGO: row.CODIGO,
    NOMBRE: row.NOMBRE,
    ACTIVO: row.ACTIVO,
    ES_SEMILLA: row.ES_SEMILLA,
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function translate(err) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23505') {
    throw httpError(409, 'duplicate_codigo');
  }

  if (err.code === '23503') {
    if (err.constraint === 'UBICACIONES_ID_CATEGORIA_FK') {
      throw httpError(400, 'invalid_id_categoria');
    }
    if (err.constraint === 'UBICACIONES_PADRE_ID_FK') {
      throw httpError(400, 'invalid_padre_id');
    }
    throw httpError(409, 'record_in_use');
  }

  if (err.code === '23514') {
    if (err.constraint === 'UBICACIONES_PADRE_ID_CHK') {
      throw httpError(400, 'ciclo_padre');
    }
    throw httpError(400, 'invalid_padre_id');
  }

  throw err;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const filters = [];
    const params = [];

    const padre = parsePadreQuery(req.query.padre_id);
    if (padre && padre.root) {
      filters.push('"PADRE_ID" IS NULL');
    } else if (padre) {
      params.push(padre.id);
      filters.push(`"PADRE_ID" = $${params.length}`);
    }

    const idCategoria = parseOptionalPositiveInt(
      req.query.id_categoria,
      'invalid_id_categoria',
    );
    if (idCategoria !== null) {
      params.push(idCategoria);
      filters.push(`"ID_CATEGORIA" = $${params.length}`);
    }

    const q = parseOptionalQueryText(req.query.q, 'invalid_q');
    if (q !== null) {
      params.push(likeContains(q));
      filters.push(
        `("CODIGO" ILIKE $${params.length} ESCAPE '\\' OR "NOMBRE" ILIKE $${params.length} ESCAPE '\\')`,
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

router.get('/:id/padre-por-categoria', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const idCategoria = parseOptionalPositiveInt(
      req.query.id_categoria,
      'invalid_id_categoria',
    );
    if (idCategoria === null) {
      throw httpError(400, 'invalid_id_categoria');
    }

    const existing = await pool.query(
      `SELECT 1 FROM "${TABLE}" WHERE "ID" = $1`,
      [id],
    );
    if (!existing.rows[0]) {
      throw httpError(404, 'not_found');
    }

    const categoria = await pool.query(
      'SELECT 1 FROM "UBICACIONES_CATEGORIAS" WHERE "ID" = $1',
      [idCategoria],
    );
    if (!categoria.rows[0]) {
      throw httpError(400, 'invalid_id_categoria');
    }

    const resolved = await pool.query(
      'SELECT ubicacion_padre_por_categoria($1, $2) AS "ID"',
      [id, idCategoria],
    );
    const padreId = resolved.rows[0]
      ? Number(resolved.rows[0].ID)
      : null;
    if (padreId == null) {
      throw httpError(404, 'not_found');
    }

    const result = await pool.query(
      `SELECT ${FIELDS} FROM "${TABLE}" WHERE "ID" = $1`,
      [padreId],
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
    await assertSinCiclo(TABLE, null, record.PADRE_ID);
    const result = await pool.query(
      `INSERT INTO "${TABLE}" ("ID_CATEGORIA", "PADRE_ID", "CODIGO", "NOMBRE", "ACTIVO")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${FIELDS}`,
      [
        record.ID_CATEGORIA,
        record.PADRE_ID,
        record.CODIGO,
        record.NOMBRE,
        record.ACTIVO,
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
    await assertSinCiclo(TABLE, id, record.PADRE_ID);
    const result = await pool.query(
      `UPDATE "${TABLE}"
       SET "ID_CATEGORIA" = $1,
           "PADRE_ID" = $2,
           "CODIGO" = $3,
           "NOMBRE" = $4,
           "ACTIVO" = $5
       WHERE "ID" = $6
       RETURNING ${FIELDS}`,
      [
        record.ID_CATEGORIA,
        record.PADRE_ID,
        record.CODIGO,
        record.NOMBRE,
        record.ACTIVO,
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
      `SELECT "ES_SEMILLA" FROM "${TABLE}" WHERE "ID" = $1`,
      [id],
    );
    const row = existing.rows[0];
    if (!row) {
      throw httpError(404, 'not_found');
    }
    if (row.ES_SEMILLA) {
      throw httpError(409, 'seed_not_deletable');
    }

    await pool.query(`DELETE FROM "${TABLE}" WHERE "ID" = $1`, [id]);
    sendData(res, 200, null);
  } catch (err) {
    translate(err);
  }
});

module.exports = router;
