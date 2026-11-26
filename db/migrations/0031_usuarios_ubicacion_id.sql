-- Migración 0031. UBICACION_ID en USUARIOS: ubicación origen por defecto del usuario.
-- Al crear un lote con USUARIO_ID interno, si el usuario tiene UBICACION_ID
-- se inserta LOTES_UBICACIONES tipo ORIGEN con esa ubicación.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "USUARIOS"
  ADD COLUMN "UBICACION_ID" integer;

ALTER TABLE "USUARIOS"
  ADD CONSTRAINT "USUARIOS_UBICACION_ID_FK"
    FOREIGN KEY ("UBICACION_ID") REFERENCES "UBICACIONES" ("ID");

CREATE INDEX "USUARIOS_UBICACION_ID_IDX" ON "USUARIOS" ("UBICACION_ID");

COMMIT;
