const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');

const TABLES = new Set(['UNIDADES_ESTATUS', 'UNIDADES_TIPOS', 'LOTES_TIPOS']);
const FIELDS = '"ID", "CODIGO", "NOMBRE", "ACTIVO", "ES_SEMILLA"';
const LOTE_TIPO_FLAGS = [
  ['ES_FINAL', 'invalid_es_final'],
  ['MIDE_UNIDAD', 'invalid_mide_unidad'],
  ['MIDE_LITRO', 'invalid_mide_litro'],
  ['MIDE_KILO', 'invalid_mide_kilo'],
];

function fieldsFor(table) {
  if (table !== 'LOTES_TIPOS') {
    return FIELDS;
  }

  const flags = LOTE_TIPO_FLAGS.map(([name]) => `"${name}"`).join(', ');
  return `${FIELDS}, ${flags}`;
}

function mapRow(row) {
  const mapped = {
    ID: Number(row.ID),
    CODIGO: row.CODIGO,
    NOMBRE: row.NOMBRE,
    ACTIVO: row.ACTIVO,
    ES_SEMILLA: row.ES_SEMILLA,
  };

  for (const [name] of LOTE_TIPO_FLAGS) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      mapped[name] = row[name];
    }
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

function parseBody(body, { loteTipo = false, keepFlags = false } = {}) {
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

  if (loteTipo) {
    for (const [name, error] of LOTE_TIPO_FLAGS) {
      record[name] = parseFlag(body[name], error, keepFlags ? undefined : false);
    }
  }

  return record;
}

function translate(err) {
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
    throw httpError(400, 'invalid_tipo_lote');
  }

  throw err;
}

function createCatalogRouter(table) {
  if (!TABLES.has(table)) {
    throw new Error(`Catalogo no permitido: ${table}`);
  }

  const loteTipo = table === 'LOTES_TIPOS';
  const fields = fieldsFor(table);
  const columns = ['CODIGO', 'NOMBRE', 'ACTIVO'];
  if (loteTipo) {
    columns.push(...LOTE_TIPO_FLAGS.map(([name]) => name));
  }

  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const result = await pool.query(`SELECT ${fields} FROM "${table}" ORDER BY "ID"`);
      res.json(result.rows.map(mapRow));
    } catch (err) {
      translate(err);
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
      res.json(mapRow(row));
    } catch (err) {
      translate(err);
    }
  });

  router.post('/', async (req, res) => {
    const record = parseBody(req.body, { loteTipo });
    const quoted = columns.map((name) => `"${name}"`).join(', ');
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    try {
      const result = await pool.query(
        `INSERT INTO "${table}" (${quoted})
         VALUES (${placeholders})
         RETURNING ${fields}`,
        columns.map((name) => record[name]),
      );
      res.status(201).json(mapRow(result.rows[0]));
    } catch (err) {
      translate(err);
    }
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const record = parseBody(req.body, { loteTipo, keepFlags: true });
    try {
      if (loteTipo) {
        const current = await pool.query(
          `SELECT ${fields} FROM "${table}" WHERE "ID" = $1`,
          [id],
        );
        const row = current.rows[0];
        if (!row) {
          throw httpError(404, 'not_found');
        }
        for (const [name] of LOTE_TIPO_FLAGS) {
          if (record[name] === undefined) {
            record[name] = row[name];
          }
        }
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
      res.json(mapRow(row));
    } catch (err) {
      translate(err);
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
      res.status(204).send();
    } catch (err) {
      translate(err);
    }
  });

  return router;
}

module.exports = { createCatalogRouter };
