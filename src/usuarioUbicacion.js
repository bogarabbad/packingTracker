const { pool } = require('./db');
const { httpError } = require('./httpError');

/**
 * Exige un usuario interno (`ID_ORIGEN_USUARIO = 1`) con `UBICACION_ID` asignada.
 * Usar al crear entidades ligadas a ubicación (lotes, expediciones, lotes-ubicaciones, recepciones).
 * @returns {Promise<number>} UBICACION_ID del usuario
 */
async function requireUsuarioUbicacion(usuarioId, idOrigenUsuario, db = pool) {
  if (usuarioId === null || idOrigenUsuario !== 1) {
    throw httpError(400, 'usuario_sin_ubicacion');
  }

  const result = await db.query(
    'SELECT "UBICACION_ID" FROM "USUARIOS" WHERE "ID" = $1',
    [usuarioId],
  );
  const row = result.rows[0];
  if (!row) {
    throw httpError(400, 'invalid_usuario_id');
  }

  if (row.UBICACION_ID === null || row.UBICACION_ID === undefined) {
    throw httpError(400, 'usuario_sin_ubicacion');
  }

  return Number(row.UBICACION_ID);
}

module.exports = { requireUsuarioUbicacion };
