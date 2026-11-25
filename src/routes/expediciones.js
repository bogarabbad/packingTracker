const express = require('express');
const { pool } = require('../db');
const { httpError } = require('../httpError');
const { sendData } = require('../respond');
const { paginationFromQuery, paginationMetadata } = require('../pagination');
const {
  parseOptionalBoolean,
  parseOptionalPositiveInt,
  parseOptionalQueryText,
  likeContains,
} = require('../listFilters');

const FIELDS = [
  'ID',
  'ID_UNIDAD',
  'FECHA_CIERRE',
  'ID_UBICACION_SALIDA',
  'CLAVE_UBICACION_SALIDA',
  'USUARIO_ID',
  'ID_ORIGEN_USUARIO',
  'CREADO_EN',
  'ACTUALIZADO_EN',
].map((name) => `"${name}"`).join(', ');

function parseId(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw httpError(400, 'invalid_id');
  }

  return Number(value);
}

function requiredInteger(value, error) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw httpError(400, error);
  }

  return value;
}

function optionalInteger(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  return requiredInteger(value, error);
}

function optionalText(value, error) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, error);
  }

  return value.trim();
}

function optionalTimestamptz(value, error) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw httpError(400, error);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, error);
  }

  return date.toISOString();
}

function parseBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'invalid_body');
  }

  const usuarioId = optionalInteger(body.USUARIO_ID, 'invalid_usuario_id');
  const idOrigenUsuario = optionalInteger(
    body.ID_ORIGEN_USUARIO,
    'invalid_id_origen_usuario',
  );
  if ((usuarioId === null) !== (idOrigenUsuario === null)) {
    throw httpError(400, 'invalid_usuario_origen');
  }

  return {
    ID_UNIDAD: requiredInteger(body.ID_UNIDAD, 'invalid_id_unidad'),
    FECHA_CIERRE: optionalTimestamptz(body.FECHA_CIERRE, 'invalid_fecha_cierre'),
    ID_UBICACION_SALIDA: optionalInteger(
      body.ID_UBICACION_SALIDA,
      'invalid_id_ubicacion_salida',
    ),
    CLAVE_UBICACION_SALIDA: optionalText(
      body.CLAVE_UBICACION_SALIDA,
      'invalid_clave_ubicacion_salida',
    ),
    USUARIO_ID: usuarioId,
    ID_ORIGEN_USUARIO: idOrigenUsuario,
  };
}

function mapNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapRow(row) {
  return {
    ID: Number(row.ID),
    ID_UNIDAD: Number(row.ID_UNIDAD),
    FECHA_CIERRE: row.FECHA_CIERRE,
    ID_UBICACION_SALIDA: mapNumber(row.ID_UBICACION_SALIDA),
    CLAVE_UBICACION_SALIDA: row.CLAVE_UBICACION_SALIDA,
    USUARIO_ID: mapNumber(row.USUARIO_ID),
    ID_ORIGEN_USUARIO: mapNumber(row.ID_ORIGEN_USUARIO),
    CREADO_EN: row.CREADO_EN,
    ACTUALIZADO_EN: row.ACTUALIZADO_EN,
  };
}

function translate(err) {
  if (err.publicError) {
    throw err;
  }

  if (err.code === '23505') {
    if (err.constraint === 'EXPEDICIONES_UNIDAD_ABIERTA_UQ') {
      throw httpError(409, 'unidad_ya_abierta');
    }
    throw httpError(409, 'duplicate');
  }

  if (err.code === '23503') {
    if (err.constraint === 'EXPEDICIONES_ID_UNIDAD_FK') {
      throw httpError(400, 'invalid_id_unidad');
    }
    if (err.constraint === 'EXPEDICIONES_ID_ORIGEN_USUARIO_FK') {
      throw httpError(400, 'invalid_id_origen_usuario');
    }
    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('usuario interno')) {
      throw httpError(400, 'invalid_usuario_id');
    }
    throw httpError(400, 'invalid_id_unidad');
  }

  if (err.code === '23514') {
    if (
      err.constraint === 'EXPEDICIONES_USUARIO_ID_CHK'
      || err.constraint === 'EXPEDICIONES_USUARIO_ORIGEN_CHK'
    ) {
      throw httpError(
        400,
        err.constraint === 'EXPEDICIONES_USUARIO_ORIGEN_CHK'
          ? 'invalid_usuario_origen'
          : 'invalid_usuario_id',
      );
    }
    if (err.constraint === 'EXPEDICIONES_FECHA_CIERRE_CHK') {
      throw httpError(400, 'invalid_fecha_cierre');
    }
    if (err.constraint === 'EXPEDICIONES_ID_UBICACION_SALIDA_CHK') {
      throw httpError(400, 'invalid_id_ubicacion_salida');
    }
    if (err.constraint === 'EXPEDICIONES_CLAVE_UBICACION_SALIDA_CHK') {
      throw httpError(400, 'invalid_clave_ubicacion_salida');
    }

    const message = typeof err.message === 'string' ? err.message : '';
    if (message.includes('origen deben ir')) {
      throw httpError(400, 'invalid_usuario_origen');
    }

    throw httpError(400, 'invalid_expedicion');
  }

  throw err;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = paginationFromQuery(req.query);
    const filters = [];
    const params = [];

    const idUnidad = parseOptionalPositiveInt(req.query.id_unidad, 'invalid_id_unidad');
    if (idUnidad !== null) {
      params.push(idUnidad);
      filters.push(`"ID_UNIDAD" = $${params.length}`);
    }

    const abierta = parseOptionalBoolean(req.query.abierta, 'invalid_abierta');
    if (abierta === true) {
      filters.push('"FECHA_CIERRE" IS NULL');
    } else if (abierta === false) {
      filters.push('"FECHA_CIERRE" IS NOT NULL');
    }

    const q = parseOptionalQueryText(req.query.q, 'invalid_q');
    if (q !== null) {
      params.push(likeContains(q));
      filters.push(
        `COALESCE("CLAVE_UBICACION_SALIDA", '') ILIKE $${params.length} ESCAPE '\\'`,
      );
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM "EXPEDICIONES" ${where}`,
      params,
    );
    const listParams = [...params, page.items, page.offset];
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "EXPEDICIONES"
       ${where}
       ORDER BY "CREADO_EN" DESC, "ID" DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams,
    );
    sendData(
      res,
      200,
      result.rows.map(mapRow),
      paginationMetadata(page.page, page.items, totalResult.rows[0].total),
    );
  } catch (err) {
    translate(err);
  }
});

router.get('/:id/carga', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const expedicionResult = await pool.query(
      `SELECT ${FIELDS} FROM "EXPEDICIONES" WHERE "ID" = $1`,
      [id],
    );
    const expedicion = expedicionResult.rows[0];
    if (!expedicion) {
      throw httpError(404, 'not_found');
    }

    const lotesResult = await pool.query(
      `WITH RECURSIVE cargo AS (
         SELECT
           l."ID",
           l."ID_TIPO",
           l."PADRE_ID",
           l."ID_UNIDAD",
           el."ID" AS "EMBARQUE_ID",
           el."EMBARCADO_EN",
           true AS "EMBARCADO_DIRECTO"
         FROM "EXPEDICIONES_LOTES" AS el
         JOIN "LOTES" AS l ON l."ID" = el."ID_LOTE"
         WHERE el."ID_EXPEDICION" = $1
         UNION ALL
         SELECT
           hijo."ID",
           hijo."ID_TIPO",
           hijo."PADRE_ID",
           hijo."ID_UNIDAD",
           NULL::integer AS "EMBARQUE_ID",
           NULL::timestamptz AS "EMBARCADO_EN",
           false AS "EMBARCADO_DIRECTO"
         FROM "LOTES" AS hijo
         JOIN cargo AS c ON hijo."PADRE_ID" = c."ID"
       )
       SELECT DISTINCT ON (cargo."ID")
         cargo."ID",
         cargo."ID_TIPO",
         cargo."PADRE_ID",
         cargo."ID_UNIDAD",
         cargo."EMBARQUE_ID",
         cargo."EMBARCADO_EN",
         cargo."EMBARCADO_DIRECTO",
         tipo."CODIGO" AS "TIPO_CODIGO",
         tipo."NOMBRE" AS "TIPO_NOMBRE",
         tipo."ES_FINAL" AS "TIPO_ES_FINAL"
       FROM cargo
       JOIN "LOTES_TIPOS" AS tipo ON tipo."ID" = cargo."ID_TIPO"
       ORDER BY cargo."ID", cargo."EMBARCADO_DIRECTO" DESC`,
      [id],
    );

    const lotes = lotesResult.rows.map((row) => ({
      ID: Number(row.ID),
      ID_TIPO: Number(row.ID_TIPO),
      PADRE_ID: row.PADRE_ID == null ? null : Number(row.PADRE_ID),
      ID_UNIDAD: row.ID_UNIDAD == null ? null : Number(row.ID_UNIDAD),
      EMBARQUE_ID: row.EMBARQUE_ID == null ? null : Number(row.EMBARQUE_ID),
      EMBARCADO_EN: row.EMBARCADO_EN,
      EMBARCADO_DIRECTO: Boolean(row.EMBARCADO_DIRECTO),
      TIPO: {
        ID: Number(row.ID_TIPO),
        CODIGO: row.TIPO_CODIGO,
        NOMBRE: row.TIPO_NOMBRE,
        ES_FINAL: Boolean(row.TIPO_ES_FINAL),
      },
      REFERENCIAS: [],
      PRODUCTOS: [],
    }));

    const loteIds = lotes.map((lote) => lote.ID);
    if (loteIds.length) {
      const [refsResult, prodsResult] = await Promise.all([
        pool.query(
          `SELECT r."ID", r."ID_LOTE", r."ID_TIPO", r."REFERENCIA", r."DESCRIPCION",
                  t."CODIGO" AS "TIPO_CODIGO", t."CLAVE" AS "TIPO_CLAVE",
                  t."NOMBRE" AS "TIPO_NOMBRE"
           FROM "LOTES_REFERENCIAS" AS r
           JOIN "REFERENCIAS_TIPOS" AS t ON t."ID" = r."ID_TIPO"
           WHERE r."ID_LOTE" = ANY($1::int[])
           ORDER BY r."CREADO_EN" DESC, r."ID" DESC`,
          [loteIds],
        ),
        pool.query(
          `SELECT p."ID", p."ID_LOTE", p."CLAVE_PRODUCTO", p."CANTIDAD", p."ID_UNIDAD",
                  u."CODIGO" AS "UNIDAD_CODIGO", u."NOMBRE" AS "UNIDAD_NOMBRE"
           FROM "LOTES_PRODUCTOS" AS p
           JOIN "UNIDADES" AS u ON u."ID" = p."ID_UNIDAD"
           WHERE p."ID_LOTE" = ANY($1::int[])
           ORDER BY p."CREADO_EN" DESC, p."ID" DESC`,
          [loteIds],
        ),
      ]);

      const byId = new Map(lotes.map((lote) => [lote.ID, lote]));
      refsResult.rows.forEach((row) => {
        const lote = byId.get(Number(row.ID_LOTE));
        if (!lote) {
          return;
        }
        lote.REFERENCIAS.push({
          ID: Number(row.ID),
          ID_TIPO: Number(row.ID_TIPO),
          REFERENCIA: row.REFERENCIA,
          DESCRIPCION: row.DESCRIPCION,
          TIPO: {
            CODIGO: row.TIPO_CODIGO,
            CLAVE: row.TIPO_CLAVE,
            NOMBRE: row.TIPO_NOMBRE,
          },
        });
      });
      prodsResult.rows.forEach((row) => {
        const lote = byId.get(Number(row.ID_LOTE));
        if (!lote) {
          return;
        }
        lote.PRODUCTOS.push({
          ID: Number(row.ID),
          CLAVE_PRODUCTO: row.CLAVE_PRODUCTO,
          CANTIDAD: Number(row.CANTIDAD),
          ID_UNIDAD: Number(row.ID_UNIDAD),
          UNIDAD: {
            CODIGO: row.UNIDAD_CODIGO,
            NOMBRE: row.UNIDAD_NOMBRE,
          },
        });
      });
    }

    const productosTotal = lotes.reduce(
      (sum, lote) => sum + lote.PRODUCTOS.length,
      0,
    );

    const porTipoMap = new Map();
    lotes.forEach((lote) => {
      let entry = porTipoMap.get(lote.ID_TIPO);
      if (!entry) {
        entry = {
          ID_TIPO: lote.ID_TIPO,
          CODIGO: lote.TIPO.CODIGO,
          NOMBRE: lote.TIPO.NOMBRE,
          ES_FINAL: lote.TIPO.ES_FINAL,
          LOTES: 0,
          PRODUCTOS: 0,
        };
        porTipoMap.set(lote.ID_TIPO, entry);
      }
      entry.LOTES += 1;
      entry.PRODUCTOS += lote.PRODUCTOS.length;
    });
    const porTipo = [...porTipoMap.values()].sort((a, b) =>
      a.NOMBRE.localeCompare(b.NOMBRE, 'es'),
    );

    sendData(res, 200, {
      EXPEDICION: mapRow(expedicion),
      RESUMEN: {
        LOTES: lotes.length,
        PRODUCTOS: productosTotal,
        POR_TIPO: porTipo,
      },
      LOTES: lotes,
    });
  } catch (err) {
    translate(err);
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const result = await pool.query(
      `SELECT ${FIELDS} FROM "EXPEDICIONES" WHERE "ID" = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw httpError(404, 'not_found');
    }
    sendData(res, 200, mapRow(row));
  } catch (err) {
    translate(err);
  }
});

router.post('/', async (req, res) => {
  const record = parseBody(req.body);
  try {
    const result = await pool.query(
      `INSERT INTO "EXPEDICIONES" (
         "ID_UNIDAD", "FECHA_CIERRE", "ID_UBICACION_SALIDA",
         "CLAVE_UBICACION_SALIDA", "USUARIO_ID", "ID_ORIGEN_USUARIO"
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${FIELDS}`,
      [
        record.ID_UNIDAD,
        record.FECHA_CIERRE,
        record.ID_UBICACION_SALIDA,
        record.CLAVE_UBICACION_SALIDA,
        record.USUARIO_ID,
        record.ID_ORIGEN_USUARIO,
      ],
    );
    sendData(res, 201, mapRow(result.rows[0]));
  } catch (err) {
    translate(err);
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const record = parseBody(req.body);
  try {
    const result = await pool.query(
      `UPDATE "EXPEDICIONES"
       SET "ID_UNIDAD" = $1,
           "FECHA_CIERRE" = $2,
           "ID_UBICACION_SALIDA" = $3,
           "CLAVE_UBICACION_SALIDA" = $4,
           "USUARIO_ID" = $5,
           "ID_ORIGEN_USUARIO" = $6
       WHERE "ID" = $7
       RETURNING ${FIELDS}`,
      [
        record.ID_UNIDAD,
        record.FECHA_CIERRE,
        record.ID_UBICACION_SALIDA,
        record.CLAVE_UBICACION_SALIDA,
        record.USUARIO_ID,
        record.ID_ORIGEN_USUARIO,
        id,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw httpError(404, 'not_found');
    }
    sendData(res, 200, mapRow(row));
  } catch (err) {
    translate(err);
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const result = await pool.query(
      `DELETE FROM "EXPEDICIONES" WHERE "ID" = $1 RETURNING "ID"`,
      [id],
    );
    if (!result.rows[0]) {
      throw httpError(404, 'not_found');
    }
    sendData(res, 200, null);
  } catch (err) {
    if (err.code === '23503') {
      throw httpError(409, 'record_in_use');
    }
    translate(err);
  }
});

module.exports = router;
