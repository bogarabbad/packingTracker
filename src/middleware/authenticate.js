const { verifyAccessToken } = require('../auth/token');
const { resolveDeviceToken } = require('../auth/deviceToken');
const { httpError } = require('../httpError');
const { sendError } = require('../respond');

const PUBLIC_PATHS = new Set([
  '/health',
  '/auth/login',
  '/enrollment',
  '/',
  '/login',
  '/dashboard',
  '/catalogos/unidades-transporte',
  '/catalogos/unidades-tipos',
  '/catalogos/unidades-estatus',
  '/catalogos/unidades-medida',
  '/catalogos/lotes-tipos',
  '/catalogos/referencias-tipos',
  '/catalogos/ubicaciones',
  '/catalogos/ubicaciones-categorias',
  '/catalogos/dispositivos',
  '/catalogos/dispositivos-tipos',
  '/catalogos/autorizacion-tokens',
  '/operacion/lotes',
  '/operacion/expediciones',
]);

function looksLikeJwt(token) {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

async function authenticate(req, res, next) {
  if (
    PUBLIC_PATHS.has(req.path)
    || req.path.startsWith('/css/')
    || req.path.startsWith('/js/')
    || /^\/operacion\/expediciones\/[1-9]\d*$/.test(req.path)
  ) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    sendError(res, 401, { error: 'unauthorized' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    sendError(res, 401, { error: 'unauthorized' });
    return;
  }

  try {
    if (looksLikeJwt(token)) {
      const payload = verifyAccessToken(token);
      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || userId < 1) {
        throw httpError(401, 'invalid_token');
      }

      req.auth = {
        kind: 'usuario',
        userId,
        codigo: payload.codigo,
      };
      next();
      return;
    }

    req.auth = await resolveDeviceToken(token);
    next();
  } catch (err) {
    if (err.publicError) {
      sendError(res, err.status || 401, { error: err.publicError });
      return;
    }
    next(err);
  }
}

module.exports = authenticate;
