-- Migración 0013. USUARIO_ID guarda quién registró la referencia del lote.
-- Es un identificador externo: no tiene llave foránea.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "LOTES_REFERENCIAS"
  ADD COLUMN "USUARIO_ID" integer NOT NULL,
  ADD CONSTRAINT "LOTES_REFERENCIAS_USUARIO_ID_CHK" CHECK ("USUARIO_ID" > 0);

COMMIT;
