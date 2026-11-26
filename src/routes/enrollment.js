const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { stripEnrollmentPrefix } = require('../scanPrefixes');

const TIPO_PENDIENTE = 'pendiente';

const DISPOSITIVO_FIELDS = [
  'ID',
  'ID_TIPO',
  'IDENTIFICADOR',
  'NOMBRE',
  'ACTIVO',
  'CREADO_EN',
  'ACTUALIZADO_EN',
].map((name) => `"${name}"`).join(', ');

const TOKEN_FIELDS = [
  'ID',
  'ID_DISPOSITIVO',
  'TOKEN',
  'NOMBRE',
  'ACTIVO',
  'REQUIERE_AUTH',
  'EXPIRA_EN',
  'ULTIMO_USO_EN',
  'CREADO_EN',
  'ACTUALIZADO_EN',
].map((name) => `"${name}"`).join(', ');

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

  return {
    TOKEN: stripEnrollmentPrefix(requiredText(body.TOKEN, 'invalid_token')),
    IDENTIFICADOR: requiredText(body.IDENTIFICADOR, 'invalid_identificador'),
  };
}

function mapNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapDispositivo(row) {
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

function mapToken(row) {
  return {
    ID: Number(row.ID),
    ID_DISPOSITIVO: mapNumber(row.ID_DISPOSITIVO),
    TOKEN: row.TOKEN,
    NOMBRE: row.NOMBRE,
    ACTIVO: row.ACTIVO,
    REQUIERE_AUTH: row.REQUIERE_AUTH,
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
    throw httpError(409, 'duplicate_identificador');
  }

  if (err.code === '23503') {
    throw httpError(400, 'invalid_id_tipo');
  }

  throw err;
}

const router = express.Router();

router.post('/', async (req, res) => {
  const record = parseBody(req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tokenResult = await client.query(
      `SELECT ${TOKEN_FIELDS}
       FROM "AUTORIZACION_TOKENS"
       WHERE "TOKEN" = $1
       FOR UPDATE`,
      [record.TOKEN],
    );
    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      throw httpError(404, 'token_not_found');
    }

    if (!tokenRow.ACTIVO) {
      throw httpError(409, 'token_inactive');
    }

    if (tokenRow.EXPIRA_EN !== null) {
      const expira = new Date(tokenRow.EXPIRA_EN);
      if (Number.isNaN(expira.getTime()) || expira.getTime() <= Date.now()) {
        throw httpError(409, 'token_expired');
      }
    }

    const deviceResult = await client.query(
      `SELECT ${DISPOSITIVO_FIELDS}
       FROM "DISPOSITIVOS"
       WHERE "IDENTIFICADOR" = $1
       FOR UPDATE`,
      [record.IDENTIFICADOR],
    );
    let dispositivo = deviceResult.rows[0] || null;
    let creado = false;

    if (tokenRow.ID_DISPOSITIVO !== null) {
      const boundId = Number(tokenRow.ID_DISPOSITIVO);
      if (dispositivo && Number(dispositivo.ID) === boundId) {
        const refresh = await client.query(
          `UPDATE "AUTORIZACION_TOKENS"
           SET "ULTIMO_USO_EN" = now()
           WHERE "ID" = $1
           RETURNING ${TOKEN_FIELDS}`,
          [tokenRow.ID],
        );
        await client.query('COMMIT');
        sendData(res, 200, {
          DISPOSITIVO: mapDispositivo(dispositivo),
          TOKEN: mapToken(refresh.rows[0]),
          CREADO: false,
        });
        return;
      }

      throw httpError(409, 'token_not_free');
    }

    if (!dispositivo) {
      const tipoResult = await client.query(
        `SELECT "ID" FROM "DISPOSITIVOS_TIPOS"
         WHERE "CODIGO" = $1 AND "ACTIVO" = true
         LIMIT 1`,
        [TIPO_PENDIENTE],
      );
      const tipo = tipoResult.rows[0];
      if (!tipo) {
        throw httpError(503, 'seed_tipo_missing');
      }

      const inserted = await client.query(
        `INSERT INTO "DISPOSITIVOS" ("ID_TIPO", "IDENTIFICADOR", "NOMBRE", "ACTIVO")
         VALUES ($1, $2, NULL, true)
         RETURNING ${DISPOSITIVO_FIELDS}`,
        [tipo.ID, record.IDENTIFICADOR],
      );
      dispositivo = inserted.rows[0];
      creado = true;
    }

    const linked = await client.query(
      `UPDATE "AUTORIZACION_TOKENS"
       SET "ID_DISPOSITIVO" = $1,
           "ULTIMO_USO_EN" = now()
       WHERE "ID" = $2
       RETURNING ${TOKEN_FIELDS}`,
      [dispositivo.ID, tokenRow.ID],
    );

    await client.query('COMMIT');
    sendData(res, creado ? 201 : 200, {
      DISPOSITIVO: mapDispositivo(dispositivo),
      TOKEN: mapToken(linked.rows[0]),
      CREADO: creado,
    });
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
