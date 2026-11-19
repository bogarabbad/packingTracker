const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');

const TABLES = new Set(['UNIDADES_ESTATUS', 'UNIDADES_TIPOS']);
const FIELDS = '"ID", "CODIGO", "NOMBRE", "ACTIVO", "ES_SEMILLA"';

function mapRow(row) {
  return {
    ID: Number(row.ID),
    CODIGO: row.CODIGO,
    NOMBRE: row.NOMBRE,
    ACTIVO: row.ACTIVO,
    ES_SEMILLA: row.ES_SEMILLA,
  };
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

function parseBody(body) {
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

  throw err;
}

function createCatalogRouter(table) {
  if (!TABLES.has(table)) {
    throw new Error(`Catalogo no permitido: ${table}`);
  }

  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const result = await pool.query(`SELECT ${FIELDS} FROM "${table}" ORDER BY "ID"`);
      res.json(result.rows.map(mapRow));
    } catch (err) {
      translate(err);
    }
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    try {
      const result = await pool.query(
        `SELECT ${FIELDS} FROM "${table}" WHERE "ID" = $1`,
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
    const record = parseBody(req.body);
    try {
      const result = await pool.query(
        `INSERT INTO "${table}" ("CODIGO", "NOMBRE", "ACTIVO")
         VALUES ($1, $2, $3)
         RETURNING ${FIELDS}`,
        [record.CODIGO, record.NOMBRE, record.ACTIVO],
      );
      res.status(201).json(mapRow(result.rows[0]));
    } catch (err) {
      translate(err);
    }
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const record = parseBody(req.body);
    try {
      const result = await pool.query(
        `UPDATE "${table}"
         SET "CODIGO" = $1, "NOMBRE" = $2, "ACTIVO" = $3
         WHERE "ID" = $4
         RETURNING ${FIELDS}`,
        [record.CODIGO, record.NOMBRE, record.ACTIVO, id],
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
