-- Migración 0030. REQUIERE_AUTH en AUTORIZACION_TOKENS.
-- true (default): la app Android exige login de USUARIOS además del token de equipo.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "AUTORIZACION_TOKENS"
  ADD COLUMN "REQUIERE_AUTH" boolean NOT NULL DEFAULT true;

COMMIT;
