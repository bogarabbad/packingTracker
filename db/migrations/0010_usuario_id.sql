-- Migración 0010. USUARIO_ID guarda quién registró el lote, la expedición
-- y quién cargó el lote en la unidad. Es un identificador externo: no tiene llave foránea.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "LOTES"
  ADD COLUMN "USUARIO_ID" integer NOT NULL,
  ADD CONSTRAINT "LOTES_USUARIO_ID_CHK" CHECK ("USUARIO_ID" > 0);

ALTER TABLE "EXPEDICIONES"
  ADD COLUMN "USUARIO_ID" integer NOT NULL,
  ADD CONSTRAINT "EXPEDICIONES_USUARIO_ID_CHK" CHECK ("USUARIO_ID" > 0);

ALTER TABLE "EXPEDICIONES_LOTES"
  ADD COLUMN "USUARIO_ID" integer NOT NULL,
  ADD CONSTRAINT "EXPEDICIONES_LOTES_USUARIO_ID_CHK" CHECK ("USUARIO_ID" > 0);

COMMIT;
