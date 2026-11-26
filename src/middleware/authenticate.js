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
  '/catalogos/usuarios',
  '/operacion/lotes',
  '/operacion/expediciones',
]);

const DEVICE_SESSION_PATH = '/auth/session';
const DEVICE_TOKEN_HEADER = 'x-device-token';

function looksLikeJwt(token) {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function readBearer(header) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token || null;
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

  const bearer = readBearer(req.headers.authorization);
  if (!bearer) {
    sendError(res, 401, { error: 'unauthorized' });
    return;
  }

  try {
    if (looksLikeJwt(bearer)) {
      const payload = verifyAccessToken(bearer);
      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || userId < 1) {
        throw httpError(401, 'invalid_token');
      }

      const deviceRaw = typeof req.headers[DEVICE_TOKEN_HEADER] === 'string'
        ? req.headers[DEVICE_TOKEN_HEADER].trim()
        : '';

      if (deviceRaw) {
        const device = await resolveDeviceToken(deviceRaw);
        req.auth = {
          kind: 'usuario_dispositivo',
          userId,
          codigo: payload.codigo,
          tokenId: device.tokenId,
          dispositivoId: device.dispositivoId,
          identificador: device.identificador,
          requiereAuth: device.requiereAuth,
        };
      } else {
        // Plataforma web: JWT de usuario sin token de equipo.
        req.auth = {
          kind: 'usuario',
          userId,
          codigo: payload.codigo,
        };
      }
      next();
      return;
    }

    const device = await resolveDeviceToken(bearer);

    if (req.path === DEVICE_SESSION_PATH) {
      req.auth = device;
      next();
      return;
    }

    if (device.requiereAuth) {
      throw httpError(401, 'auth_required');
    }

    req.auth = device;
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
