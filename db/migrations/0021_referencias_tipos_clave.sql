-- Migración 0021. REFERENCIAS_TIPOS.CLAVE es la abreviatura del tipo de referencia.
-- Packing nace con CLAVE = P. No editar este archivo. El siguiente cambio va
-- en una migración nueva y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "REFERENCIAS_TIPOS"
  ADD COLUMN "CLAVE" text;

UPDATE "REFERENCIAS_TIPOS"
SET "CLAVE" = 'P'
WHERE "CODIGO" = 'PACKING';

UPDATE "REFERENCIAS_TIPOS"
SET "CLAVE" = upper(left(btrim("CODIGO"), 1))
WHERE "CLAVE" IS NULL;

ALTER TABLE "REFERENCIAS_TIPOS"
  ALTER COLUMN "CLAVE" SET NOT NULL;

ALTER TABLE "REFERENCIAS_TIPOS"
  ADD CONSTRAINT "REFERENCIAS_TIPOS_CLAVE_CHK" CHECK (
    length(btrim("CLAVE")) > 0
    AND length(btrim("CLAVE")) <= 8
  );

ALTER TABLE "REFERENCIAS_TIPOS"
  ADD CONSTRAINT "REFERENCIAS_TIPOS_CLAVE_UQ" UNIQUE ("CLAVE");

COMMIT;
