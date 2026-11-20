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
    `SELECT "ID", "CODIGO", "NOMBRE", "CONTRASENA_HASH", "ACTIVO"
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
    },
  });
});

module.exports = router;
