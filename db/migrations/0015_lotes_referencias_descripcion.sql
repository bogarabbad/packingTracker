-- Migración 0015. DESCRIPCION opcional en LOTES_REFERENCIAS.
-- Si viene, no puede quedar vacía después de recortar espacios.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "LOTES_REFERENCIAS"
  ADD COLUMN "DESCRIPCION" text,
  ADD CONSTRAINT "LOTES_REFERENCIAS_DESCRIPCION_CHK" CHECK (
    "DESCRIPCION" IS NULL OR length(btrim("DESCRIPCION")) > 0
  );

COMMIT;
