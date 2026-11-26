const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { verifyPassword } = require('../auth/password');
const { signAccessToken } = require('../auth/token');
const config = require('../config');

const router = express.Router();

function requiredText(value, error) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, error);
  }

  return value.trim();
}

router.post('/login', async (req, res) => {
  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  const codigo = requiredText(body.CODIGO, 'invalid_codigo');
  const contrasena = requiredText(body.CONTRASENA, 'invalid_contrasena');

  const result = await pool.query(
    `SELECT "ID", "CODIGO", "NOMBRE", "CONTRASENA_HASH", "UBICACION_ID", "ACTIVO"
     FROM "USUARIOS"
     WHERE "CODIGO" = $1`,
    [codigo],
  );
  const user = result.rows[0];
  if (!user || !user.ACTIVO) {
    throw httpError(401, 'invalid_credentials');
  }

  const matches = await verifyPassword(contrasena, user.CONTRASENA_HASH);
  if (!matches) {
    throw httpError(401, 'invalid_credentials');
  }

  const accessToken = signAccessToken({
    ID: Number(user.ID),
    CODIGO: user.CODIGO,
  });

  sendData(res, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: config.jwt.expiresInSeconds,
    usuario: {
      ID: Number(user.ID),
      CODIGO: user.CODIGO,
      NOMBRE: user.NOMBRE,
      UBICACION_ID:
        user.UBICACION_ID === null || user.UBICACION_ID === undefined
          ? null
          : Number(user.UBICACION_ID),
    },
  });
});

/**
 * Sesión del dispositivo enrollado.
 * Autentica solo con Bearer = AUTORIZACION_TOKENS.TOKEN
 * (incluso si REQUIERE_AUTH = true).
 */
router.get('/session', async (req, res) => {
  const auth = req.auth;
  if (!auth || auth.kind !== 'dispositivo') {
    throw httpError(401, 'unauthorized');
  }

  sendData(res, 200, {
    REQUIERE_AUTH: Boolean(auth.requiereAuth),
    DISPOSITIVO: {
      ID: auth.dispositivoId,
      IDENTIFICADOR: auth.identificador,
      NOMBRE: auth.dispositivoNombre,
    },
    TOKEN: {
      ID: auth.tokenId,
      NOMBRE: auth.tokenNombre,
      REQUIERE_AUTH: Boolean(auth.requiereAuth),
    },
  });
});

module.exports = router;
