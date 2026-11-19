-- Migración 0004. Marca los registros semilla para impedir su eliminación.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

ALTER TABLE "UNIDADES_ESTATUS"
  ADD COLUMN "ES_SEMILLA" boolean NOT NULL DEFAULT false;

ALTER TABLE "UNIDADES_TIPOS"
  ADD COLUMN "ES_SEMILLA" boolean NOT NULL DEFAULT false;

ALTER TABLE "UNIDADES_TRANSPORTE"
  ADD COLUMN "ES_SEMILLA" boolean NOT NULL DEFAULT false;

UPDATE "UNIDADES_ESTATUS"
SET "ES_SEMILLA" = true
WHERE "ID" IN (1, 2, 3, 4, 5)
   OR "CODIGO" IN ('disponible', 'cargando', 'en_transito', 'mantenimiento', 'fuera_de_servicio');

UPDATE "UNIDADES_TIPOS"
SET "ES_SEMILLA" = true
WHERE "ID" IN (1, 2, 3, 4, 5)
   OR "CODIGO" IN ('tractocamion', 'torton', 'rabon', 'camioneta', 'remolque');

UPDATE "UNIDADES_TRANSPORTE"
SET "ES_SEMILLA" = true
WHERE "ID" IN (1, 2, 3, 4, 5)
   OR "CODIGO" IN ('UT-001', 'UT-002', 'UT-003', 'UT-004', 'UT-005');
