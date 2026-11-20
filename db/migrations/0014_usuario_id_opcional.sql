-- Migración 0014. USUARIO_ID deja de ser obligatorio.
-- Sigue siendo un identificador externo sin llave foránea.
-- Si viene, debe ser mayor que cero. Si se omite, queda null.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "LOTES"
  ALTER COLUMN "USUARIO_ID" DROP NOT NULL;

ALTER TABLE "EXPEDICIONES"
  ALTER COLUMN "USUARIO_ID" DROP NOT NULL;

ALTER TABLE "EXPEDICIONES_LOTES"
  ALTER COLUMN "USUARIO_ID" DROP NOT NULL;

ALTER TABLE "LOTES_REFERENCIAS"
  ALTER COLUMN "USUARIO_ID" DROP NOT NULL;

COMMIT;
