-- Migración 0029. Enrollment de dispositivos.
-- NOMBRE de DISPOSITIVOS puede quedar vacío (null) hasta configurarlo en web.
-- Semilla DISPOSITIVOS_TIPOS (CODIGO = pendiente) para equipos recién enrollados.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "DISPOSITIVOS"
  ALTER COLUMN "NOMBRE" DROP NOT NULL;

ALTER TABLE "DISPOSITIVOS"
  DROP CONSTRAINT "DISPOSITIVOS_NOMBRE_CHK";

ALTER TABLE "DISPOSITIVOS"
  ADD CONSTRAINT "DISPOSITIVOS_NOMBRE_CHK" CHECK (
    "NOMBRE" IS NULL OR length(btrim("NOMBRE")) > 0
  );

INSERT INTO "DISPOSITIVOS_TIPOS" (
  "CODIGO",
  "NOMBRE",
  "MARCA",
  "MODELO",
  "SISTEMA_OPERATIVO",
  "TIENE_ESCANER",
  "DESCRIPCION",
  "ES_SEMILLA"
)
SELECT
  'pendiente',
  'Pendiente',
  'N/D',
  'N/D',
  'N/D',
  true,
  'Tipo provisional para dispositivos enrollados sin clasificar.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "DISPOSITIVOS_TIPOS" WHERE "CODIGO" = 'pendiente'
);

COMMIT;
