const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');

const TABLES = new Set(['UNIDADES_ESTATUS', 'UNIDADES_TIPOS', 'LOTES_TIPOS', 'UNIDADES']);
const FIELDS = '"ID", "CODIGO", "NOMBRE", "ACTIVO", "ES_SEMILLA"';
const EXTRA = {
  LOTES_TIPOS: { column: 'ES_FINAL', invalid: 'invalid_es_final', check: 'invalid_tipo_lote' },
  UNIDADES: { column: 'ENTERA', invalid: 'invalid_entera', check: 'invalid_entera' },
};

function fieldsFor(table) {
  const extra = EXTRA[table];
  if (!extra) {
    return FIELDS;
  }

  return `${FIELDS}, "${extra.column}"`;
}

function mapRow(row, extra) {
  const mapped = {
    ID: Number(row.ID),
    CODIGO: row.CODIGO,
    NOMBRE: row.NOMBRE,
    ACTIVO: row.ACTIVO,
    ES_SEMILLA: row.ES_SEMILLA,
  };

  if (extra && Object.prototype.hasOwnProperty.call(row, extra.column)) {
    mapped[extra.column] = row[extra.column];
  }

  return mapped;
}

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

function parseFlag(value, error, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    throw httpError(400, error);
  }

  return value;
}

function parseBody(body, extra, keepExtra) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  const record = {
    CODIGO: requiredText(body.CODIGO, 'invalid_codigo'),
    NOMBRE: requiredText(body.NOMBRE, 'invalid_nombre'),
  };

  if (body.ACTIVO === undefined) {
    record.ACTIVO = true;
  } else if (typeof body.ACTIVO !== 'boolean') {
    throw httpError(400, 'invalid_activo');
  } else {
    record.ACTIVO = body.ACTIVO;
  }

  if (extra) {
    record[extra.column] = parseFlag(
      body[extra.column],
      extra.invalid,
      keepExtra ? undefined : false,
    );
  }

  return record;
}

function translate(err, extra) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23505') {
    throw httpError(409, 'duplicate_codigo');
  }

  if (err.code === '23503') {
    throw httpError(409, 'record_in_use');
  }

  if (err.code === '23514') {
    throw httpError(400, extra ? extra.check : 'invalid_tipo_lote');
  }

  throw err;
}

function createCatalogRouter(table) {
  if (!TABLES.has(table)) {
    throw new Error(`Catalogo no permitido: ${table}`);
  }

  const extra = EXTRA[table] || null;
  const fields = fieldsFor(table);
  const columns = ['CODIGO', 'NOMBRE', 'ACTIVO'];
  if (extra) {
    columns.push(extra.column);
  }

  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const page = paginationFromQuery(req.query);
      const totalResult = await pool.query(`SELECT COUNT(*)::int AS total FROM "${table}"`);
      const result = await pool.query(
        `SELECT ${fields} FROM "${table}" ORDER BY "ID" LIMIT $1 OFFSET $2`,
        [page.items, page.offset],
      );
      sendData(
        res,
        200,
        result.rows.map((row) => mapRow(row, extra)),
        paginationMetadata(page.page, page.items, totalResult.rows[0].total),
      );
    } catch (err) {
      translate(err, extra);
    }
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    try {
      const result = await pool.query(
        `SELECT ${fields} FROM "${table}" WHERE "ID" = $1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        throw httpError(404, 'not_found');
      }
      sendData(res, 200, mapRow(row, extra));
    } catch (err) {
      translate(err, extra);
    }
  });

  router.post('/', async (req, res) => {
    const record = parseBody(req.body, extra);
    const quoted = columns.map((name) => `"${name}"`).join(', ');
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    try {
      const result = await pool.query(
        `INSERT INTO "${table}" (${quoted})
         VALUES (${placeholders})
         RETURNING ${fields}`,
        columns.map((name) => record[name]),
      );
      sendData(res, 201, mapRow(result.rows[0], extra));
    } catch (err) {
      translate(err, extra);
    }
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const record = parseBody(req.body, extra, true);
    try {
      if (extra && record[extra.column] === undefined) {
        const current = await pool.query(
          `SELECT "${extra.column}" FROM "${table}" WHERE "ID" = $1`,
          [id],
        );
        const row = current.rows[0];
        if (!row) {
          throw httpError(404, 'not_found');
        }
        record[extra.column] = row[extra.column];
      }

      const assignments = columns.map((name, index) => `"${name}" = $${index + 1}`).join(', ');
      const result = await pool.query(
        `UPDATE "${table}"
         SET ${assignments}
         WHERE "ID" = $${columns.length + 1}
         RETURNING ${fields}`,
        [...columns.map((name) => record[name]), id],
      );
      const row = result.rows[0];
      if (!row) {
        throw httpError(404, 'not_found');
      }
      sendData(res, 200, mapRow(row, extra));
    } catch (err) {
      translate(err, extra);
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    try {
      const existing = await pool.query(
        `SELECT "ES_SEMILLA" FROM "${table}" WHERE "ID" = $1`,
        [id],
      );
      const row = existing.rows[0];
      if (!row) {
        throw httpError(404, 'not_found');
      }
      if (row.ES_SEMILLA) {
        throw httpError(409, 'seed_not_deletable');
      }

      await pool.query(`DELETE FROM "${table}" WHERE "ID" = $1`, [id]);
      sendData(res, 200, null);
    } catch (err) {
      translate(err, extra);
    }
  });

  return router;
}

module.exports = { createCatalogRouter };
