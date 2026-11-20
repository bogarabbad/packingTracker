const jwt = require('jsonwebtoken');
const config = require('../config');
const { httpError } = require('../httpError');

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.ID),
      codigo: user.CODIGO,
    },
    config.jwt.secret,
    {
      algorithm: 'HS256',
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    },
  );
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw httpError(401, 'token_expired');
    }
    throw httpError(401, 'invalid_token');
  }
}

module.exports = { signAccessToken, verifyAccessToken };
