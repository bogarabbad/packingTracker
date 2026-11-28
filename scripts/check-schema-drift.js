/**
 * Compara columnas/tablas que el código actual espera vs la base conectada.
 * Uso (en el host o en el contenedor, con .env cargado):
 *   node scripts/check-schema-drift.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const expected = {
  UNIDADES_TRANSPORTE: [
    'ID',
    'CODIGO',
    'ID_TIPO',
    'PLACAS',
    'NUMERO_ECONOMICO',
    'MARCA',
    'MODELO',
    'ANIO',
    'NUMERO_SERIE',
    'CAPACIDAD_CARGA_KG',
    'CAPACIDAD_VOLUMEN_M3',
    'ID_ESTATUS',
    'UBICACION_ID',
    'ACTIVO',
    'ES_SEMILLA',
    'CREADO_EN',
    'ACTUALIZADO_EN',
  ],
  UNIDADES_TRANSPORTE_UBICACIONES: [
    'ID',
    'ID_UNIDAD',
    'UBICACION_ID',
    'FECHA',
    'ES_SEMILLA',
    'CREADO_EN',
    'ACTUALIZADO_EN',
  ],
  EXPEDICIONES: [
    'ID',
    'ID_UNIDAD',
    'ID_ESTATUS',
    'FECHA_CIERRE',
    'ID_UBICACION_SALIDA',
    'UBICACION_SALIDA_ID',
    'USUARIO_ID',
    'ID_ORIGEN_USUARIO',
    'CREADO_EN',
    'ACTUALIZADO_EN',
  ],
  EXPEDICIONES_ESTATUS: ['ID', 'CODIGO', 'NOMBRE', 'ACTIVO', 'ES_SEMILLA'],
  EXPEDICIONES_ESTATUS_HISTORIAL: [
    'ID',
    'ID_EXPEDICION',
    'ID_ESTATUS',
    'FECHA',
    'ES_SEMILLA',
  ],
  RECEPCIONES: [
    'ID',
    'ID_EXPEDICION',
    'UBICACION_ID',
    'FECHA_CIERRE',
    'USUARIO_ID',
    'ID_ORIGEN_USUARIO',
    'CREADO_EN',
    'ACTUALIZADO_EN',
  ],
  UBICACIONES_CATEGORIAS: ['ID', 'ES_RECEPTOR'],
};

async function main() {
  const pool = new Pool();
  console.log('Conectando:', {
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
  });

  try {
    const who = await pool.query(
      'SELECT current_database() AS db, current_user AS usr, inet_server_addr() AS addr',
    );
    console.log('Sesión:', who.rows[0]);

    for (const [table, cols] of Object.entries(expected)) {
      const exists = await pool.query(
        'SELECT to_regclass($1) AS reg',
        [`public."${table}"`],
      );
      if (!exists.rows[0].reg) {
        console.log(`FALTA TABLA ${table}`);
        continue;
      }
      const result = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const have = new Set(result.rows.map((r) => r.column_name));
      const missing = cols.filter((c) => !have.has(c));
      if (missing.length) {
        console.log(`FALTAN en ${table}:`, missing.join(', '));
      } else {
        console.log(`OK ${table}`);
      }
    }

    try {
      await pool.query(
        'SELECT "ID", "UBICACION_ID" FROM "UNIDADES_TRANSPORTE" LIMIT 1',
      );
      console.log('Query unidades-transporte: OK');
    } catch (err) {
      console.log('Query unidades-transporte: FAIL', err.code, err.message);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
