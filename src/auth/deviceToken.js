const { pool } = require('../db');
const { httpError } = require('../httpError');

async function resolveDeviceToken(rawToken) {
  const result = await pool.query(
    `SELECT
       t."ID" AS "TOKEN_ID",
       t."ID_DISPOSITIVO",
       t."ACTIVO" AS "TOKEN_ACTIVO",
       t."REQUIERE_AUTH",
       t."NOMBRE" AS "TOKEN_NOMBRE",
       t."EXPIRA_EN",
       d."ID" AS "DISPOSITIVO_ID",
       d."IDENTIFICADOR",
       d."NOMBRE" AS "DISPOSITIVO_NOMBRE",
       d."ACTIVO" AS "DISPOSITIVO_ACTIVO"
     FROM "AUTORIZACION_TOKENS" t
     LEFT JOIN "DISPOSITIVOS" d ON d."ID" = t."ID_DISPOSITIVO"
     WHERE t."TOKEN" = $1`,
    [rawToken],
  );

  const row = result.rows[0];
  if (!row) {
    throw httpError(401, 'invalid_token');
  }

  if (!row.TOKEN_ACTIVO) {
    throw httpError(401, 'token_inactive');
  }

  if (row.EXPIRA_EN !== null) {
    const expira = new Date(row.EXPIRA_EN);
    if (Number.isNaN(expira.getTime()) || expira.getTime() <= Date.now()) {
      throw httpError(401, 'token_expired');
    }
  }

  if (row.ID_DISPOSITIVO === null || row.DISPOSITIVO_ID === null) {
    throw httpError(401, 'token_not_bound');
  }

  if (!row.DISPOSITIVO_ACTIVO) {
    throw httpError(401, 'dispositivo_inactive');
  }

  await pool.query(
    `UPDATE "AUTORIZACION_TOKENS"
     SET "ULTIMO_USO_EN" = now()
     WHERE "ID" = $1`,
    [row.TOKEN_ID],
  );

  return {
    kind: 'dispositivo',
    tokenId: Number(row.TOKEN_ID),
    dispositivoId: Number(row.DISPOSITIVO_ID),
    identificador: row.IDENTIFICADOR,
    requiereAuth: Boolean(row.REQUIERE_AUTH),
    tokenNombre: row.TOKEN_NOMBRE,
    dispositivoNombre: row.DISPOSITIVO_NOMBRE,
  };
}

module.exports = { resolveDeviceToken };
