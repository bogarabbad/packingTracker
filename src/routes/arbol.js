const { pool } = require('../db');
const { httpError } = require('../httpError');

function parsePadreQuery(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value === 'raiz') {
    return { root: true };
  }

  if (!/^[1-9]\d*$/.test(String(value))) {
    throw httpError(400, 'invalid_padre_id');
  }

  return { id: Number(value) };
}

async function assertSinCiclo(table, id, padreId) {
  if (padreId === null) {
    return;
  }

  if (id !== null && padreId === id) {
    throw httpError(400, 'ciclo_padre');
  }

  if (id === null) {
    return;
  }

  const result = await pool.query(
    `WITH RECURSIVE ancestros AS (
       SELECT "ID", "PADRE_ID"
       FROM "${table}"
       WHERE "ID" = $1
       UNION ALL
       SELECT nodo."ID", nodo."PADRE_ID"
       FROM "${table}" AS nodo
       JOIN ancestros ON nodo."ID" = ancestros."PADRE_ID"
     )
     SELECT 1 FROM ancestros WHERE "ID" = $2 LIMIT 1`,
    [padreId, id],
  );

  if (result.rowCount > 0) {
    throw httpError(400, 'ciclo_padre');
  }
}

module.exports = {
  parsePadreQuery,
  assertSinCiclo,
};
