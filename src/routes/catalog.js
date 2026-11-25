const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const {
  parseOptionalBoolean,
  parseOptionalQueryText,
  likeContains,
} = require('../listFilters');

const TABLES = new Set([
  'UNIDADES_ESTATUS',
  'UNIDADES_TIPOS',
  'LOTES_TIPOS',
  'UNIDADES',
  'REFERENCIAS_TIPOS',
  'LOTES_UBICACIONES_TIPOS',
]);
const BASE_FIELDS = '"ID", "CODIGO", "NOMBRE", "ACTIVO", "ES_SEMILLA"';
const EXTRAS = {
  LOTES_TIPOS: [
    {
      column: 'ES_FINAL',
      type: 'boolean',
      invalid: 'invalid_es_final',
      check: 'invalid_tipo_lote',
    },
  ],
  UNIDADES: [
    {
      column: 'ENTERA',
      type: 'boolean',
      invalid: 'invalid_entera',
      check: 'invalid_entera',
    },
  ],
  REFERENCIAS_TIPOS: [
    {
      column: 'CLAVE',
      type: 'text',
      invalid: 'invalid_clave',
      duplicate: 'duplicate_clave',
      check: 'invalid_clave',
      uniqueConstraint: 'REFERENCIAS_TIPOS_CLAVE_UQ',
    },
  ],
};

function extrasFor(table) {
  return EXTRAS[table] || [];
}

function fieldsFor(table) {
  const extras = extrasFor(table)
    .map((extra) => `"${extra.column}"`)
    .join(', ');
  const columns = extras ? `${BASE_FIELDS}, ${extras}` : BASE_FIELDS;
  return `${columns}, "CREADO_EN", "ACTUALIZADO_EN"`;
}

function mapRow(row, extras) {
  const mapped = {
    ID: Number(row.ID),
    CODIGO: row.CODIGO,
    NOMBRE: row.NOMBRE,
    ACTIVO: row.ACTIVO,
    ES_SEMILLA: row.ES_SEMILLA,
  };

  extras.forEach((extra) => {
    if (Object.prototype.hasOwnProperty.call(row, extra.column)) {
      mapped[extra.column] = row[extra.column];
    }
  });

  mapped.CREADO_EN = row.CREADO_EN;
  mapped.ACTUALIZADO_EN = row.ACTUALIZADO_EN;

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

function parseBody(body, extras, keepExtras) {
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

  extras.forEach((extra) => {
    if (extra.type === 'boolean') {
      record[extra.column] = parseFlag(
        body[extra.column],
        extra.invalid,
        keepExtras ? undefined : false,
      );
      return;
    }

    if (extra.type === 'text') {
      if (body[extra.column] === undefined && keepExtras) {
        record[extra.column] = undefined;
        return;
      }
      record[extra.column] = requiredText(body[extra.column], extra.invalid);
    }
  });

  return record;
}

function translate(err, extras) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23505') {
    const duplicate = extras.find(
      (extra) => extra.uniqueConstraint && err.constraint === extra.uniqueConstraint,
    );
    if (duplicate) {
      throw httpError(409, duplicate.duplicate || 'duplicate');
    }
    throw httpError(409, 'duplicate_codigo');
  }

  if (err.code === '23503') {
    throw httpError(409, 'record_in_use');
  }

  if (err.code === '23514') {
    const checkExtra = extras.find((extra) => extra.check);
    throw httpError(400, checkExtra ? checkExtra.check : 'invalid_body');
  }

  throw err;
}

function createCatalogRouter(table) {
  if (!TABLES.has(table)) {
    throw new Error(`Catalogo no permitido: ${table}`);
  }

  const extras = extrasFor(table);
  const fields = fieldsFor(table);
  const columns = ['CODIGO', 'NOMBRE', 'ACTIVO', ...extras.map((extra) => extra.column)];

  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const page = paginationFromQuery(req.query);
      const filters = [];
      const params = [];

      const q = parseOptionalQueryText(req.query.q, 'invalid_q');
      if (q !== null) {
        params.push(likeContains(q));
        const textColumns = ['"CODIGO"', '"NOMBRE"'];
        extras.forEach((extra) => {
          if (extra.type === 'text') {
            textColumns.push(`"${extra.column}"`);
          }
        });
        filters.push(
          `(${textColumns.map((column) => `${column} ILIKE $${params.length} ESCAPE '\\'`).join(' OR ')})`,
        );
      }

      const activo = parseOptionalBoolean(req.query.activo, 'invalid_activo');
      if (activo !== null) {
        params.push(activo);
        filters.push(`"ACTIVO" = $${params.length}`);
      }

      extras.forEach((extra) => {
        if (extra.type !== 'boolean') {
          return;
        }
        const flag = parseOptionalBoolean(
          req.query[extra.column.toLowerCase()],
          extra.invalid,
        );
        if (flag !== null) {
          params.push(flag);
          filters.push(`"${extra.column}" = $${params.length}`);
        }
      });

      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const totalResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM "${table}" ${where}`,
        params,
      );
      const listParams = [...params, page.items, page.offset];
      const result = await pool.query(
        `SELECT ${fields} FROM "${table}"
         ${where}
         ORDER BY "CREADO_EN" DESC, "ID" DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        listParams,
      );
      sendData(
        res,
        200,
        result.rows.map((row) => mapRow(row, extras)),
        paginationMetadata(page.page, page.items, totalResult.rows[0].total),
      );
    } catch (err) {
      translate(err, extras);
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
      sendData(res, 200, mapRow(row, extras));
    } catch (err) {
      translate(err, extras);
    }
  });

  router.post('/', async (req, res) => {
    const record = parseBody(req.body, extras);
    const quoted = columns.map((name) => `"${name}"`).join(', ');
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    try {
      const result = await pool.query(
        `INSERT INTO "${table}" (${quoted})
         VALUES (${placeholders})
         RETURNING ${fields}`,
        columns.map((name) => record[name]),
      );
      sendData(res, 201, mapRow(result.rows[0], extras));
    } catch (err) {
      translate(err, extras);
    }
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const record = parseBody(req.body, extras, true);
    try {
      for (const extra of extras) {
        if (record[extra.column] !== undefined) {
          continue;
        }
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
      sendData(res, 200, mapRow(row, extras));
    } catch (err) {
      translate(err, extras);
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
      translate(err, extras);
    }
  });

  return router;
}

module.exports = { createCatalogRouter };
