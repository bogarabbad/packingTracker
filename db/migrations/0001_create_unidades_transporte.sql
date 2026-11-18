-- Migración 0001. Crea UNIDADES_TRANSPORTE.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

CREATE TABLE "UNIDADES_TRANSPORTE" (
  "ID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "CODIGO" text NOT NULL UNIQUE,
  "TIPO" text NOT NULL,
  "PLACAS" text NOT NULL UNIQUE,
  "NUMERO_ECONOMICO" text UNIQUE,
  "MARCA" text,
  "MODELO" text,
  "ANIO" integer,
  "NUMERO_SERIE" text UNIQUE,
  "CAPACIDAD_CARGA_KG" numeric(12, 2),
  "CAPACIDAD_VOLUMEN_M3" numeric(12, 2),
  "ESTATUS" text NOT NULL DEFAULT 'disponible',
  "ACTIVO" boolean NOT NULL DEFAULT true,
  "CREADO_EN" timestamptz NOT NULL DEFAULT now(),
  "ACTUALIZADO_EN" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UNIDADES_TRANSPORTE_TIPO_CHK" CHECK (
    "TIPO" IN ('tractocamion', 'torton', 'rabon', 'camioneta', 'remolque')
  ),
  CONSTRAINT "UNIDADES_TRANSPORTE_ESTATUS_CHK" CHECK (
    "ESTATUS" IN ('disponible', 'cargando', 'en_transito', 'mantenimiento', 'fuera_de_servicio')
  ),
  CONSTRAINT "UNIDADES_TRANSPORTE_ANIO_CHK" CHECK (
    "ANIO" IS NULL OR "ANIO" BETWEEN 1980 AND 2100
  ),
  CONSTRAINT "UNIDADES_TRANSPORTE_CAPACIDAD_KG_CHK" CHECK (
    "CAPACIDAD_CARGA_KG" IS NULL OR "CAPACIDAD_CARGA_KG" >= 0
  ),
  CONSTRAINT "UNIDADES_TRANSPORTE_CAPACIDAD_M3_CHK" CHECK (
    "CAPACIDAD_VOLUMEN_M3" IS NULL OR "CAPACIDAD_VOLUMEN_M3" >= 0
  )
);

CREATE INDEX "UNIDADES_TRANSPORTE_ESTATUS_IDX" ON "UNIDADES_TRANSPORTE" ("ESTATUS");
