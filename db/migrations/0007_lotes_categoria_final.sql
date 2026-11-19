-- Migración 0007. La caja y el tambo son categorías finales y contienen productos.
-- La tarima contiene esas categorías y se embarca en la unidad de transporte.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

ALTER TABLE "LOTES_TIPOS"
  ADD COLUMN "ES_FINAL" boolean NOT NULL DEFAULT false,
  ADD COLUMN "MIDE_UNIDAD" boolean NOT NULL DEFAULT false,
  ADD COLUMN "MIDE_LITRO" boolean NOT NULL DEFAULT false,
  ADD COLUMN "MIDE_KILO" boolean NOT NULL DEFAULT false;

ALTER TABLE "LOTES_TIPOS"
  ADD CONSTRAINT "LOTES_TIPOS_MEDIDA_CHK" CHECK (
    (
      "ES_FINAL" = false
      AND "MIDE_UNIDAD" = false
      AND "MIDE_LITRO" = false
      AND "MIDE_KILO" = false
    )
    OR (
      "ES_FINAL" = true
      AND ("MIDE_UNIDAD" = true OR "MIDE_LITRO" = true OR "MIDE_KILO" = true)
    )
  );

ALTER TABLE "LOTES"
  ADD COLUMN "ID_UNIDAD" integer;

ALTER TABLE "LOTES"
  ADD CONSTRAINT "LOTES_ID_UNIDAD_FK"
  FOREIGN KEY ("ID_UNIDAD") REFERENCES "UNIDADES_TRANSPORTE" ("ID");

CREATE INDEX "LOTES_ID_UNIDAD_IDX" ON "LOTES" ("ID_UNIDAD");

ALTER TABLE "LOTES_PRODUCTOS"
  ADD COLUMN "CANTIDAD" numeric(14, 3),
  ADD COLUMN "UNIDAD_MEDIDA" text;

UPDATE "LOTES_PRODUCTOS"
SET "CANTIDAD" = 1, "UNIDAD_MEDIDA" = 'unidad'
WHERE "CANTIDAD" IS NULL;

ALTER TABLE "LOTES_PRODUCTOS"
  ALTER COLUMN "CANTIDAD" SET NOT NULL,
  ALTER COLUMN "UNIDAD_MEDIDA" SET NOT NULL;

ALTER TABLE "LOTES_PRODUCTOS"
  ADD CONSTRAINT "LOTES_PRODUCTOS_CANTIDAD_CHK" CHECK ("CANTIDAD" > 0),
  ADD CONSTRAINT "LOTES_PRODUCTOS_UNIDAD_MEDIDA_CHK" CHECK (
    "UNIDAD_MEDIDA" IN ('unidad', 'litro', 'kilo')
  ),
  ADD CONSTRAINT "LOTES_PRODUCTOS_UNIDAD_ENTERA_CHK" CHECK (
    "UNIDAD_MEDIDA" <> 'unidad' OR "CANTIDAD" = trunc("CANTIDAD")
  );

CREATE OR REPLACE FUNCTION lotes_validar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tipo_final boolean;
  padre_final boolean;
BEGIN
  SELECT "ES_FINAL" INTO tipo_final
  FROM "LOTES_TIPOS"
  WHERE "ID" = NEW."ID_TIPO";

  IF tipo_final IS NULL THEN
    RAISE EXCEPTION 'tipo de lote inexistente' USING ERRCODE = '23503';
  END IF;

  IF tipo_final THEN
    IF NEW."ID_UNIDAD" IS NOT NULL THEN
      RAISE EXCEPTION 'un lote final no se embarca en la unidad' USING ERRCODE = '23514';
    END IF;

    IF NEW."PADRE_ID" IS NOT NULL THEN
      SELECT tipo."ES_FINAL" INTO padre_final
      FROM "LOTES" AS padre
      JOIN "LOTES_TIPOS" AS tipo ON tipo."ID" = padre."ID_TIPO"
      WHERE padre."ID" = NEW."PADRE_ID";

      IF padre_final IS NULL THEN
        RAISE EXCEPTION 'lote padre inexistente' USING ERRCODE = '23503';
      END IF;

      IF padre_final THEN
        RAISE EXCEPTION 'una categoria final no contiene lotes' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW."ID_TIPO" IS DISTINCT FROM OLD."ID_TIPO" THEN
      IF EXISTS (SELECT 1 FROM "LOTES" WHERE "PADRE_ID" = NEW."ID") THEN
        RAISE EXCEPTION 'una categoria final no contiene lotes' USING ERRCODE = '23514';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM "LOTES_PRODUCTOS" AS producto
        JOIN "LOTES_TIPOS" AS tipo ON tipo."ID" = NEW."ID_TIPO"
        WHERE producto."ID_LOTE" = NEW."ID"
          AND NOT (
            (producto."UNIDAD_MEDIDA" = 'unidad' AND tipo."MIDE_UNIDAD")
            OR (producto."UNIDAD_MEDIDA" = 'litro' AND tipo."MIDE_LITRO")
            OR (producto."UNIDAD_MEDIDA" = 'kilo' AND tipo."MIDE_KILO")
          )
      ) THEN
        RAISE EXCEPTION 'la medida del producto no corresponde al tipo de lote' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    IF NEW."PADRE_ID" IS NOT NULL THEN
      RAISE EXCEPTION 'solo un lote final puede ir dentro de otro lote' USING ERRCODE = '23514';
    END IF;

    IF EXISTS (SELECT 1 FROM "LOTES_PRODUCTOS" WHERE "ID_LOTE" = NEW."ID") THEN
      RAISE EXCEPTION 'un lote que no es final no contiene productos' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION lotes_productos_validar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  es_final boolean;
  mide_unidad boolean;
  mide_litro boolean;
  mide_kilo boolean;
BEGIN
  SELECT tipo."ES_FINAL", tipo."MIDE_UNIDAD", tipo."MIDE_LITRO", tipo."MIDE_KILO"
  INTO es_final, mide_unidad, mide_litro, mide_kilo
  FROM "LOTES" AS lote
  JOIN "LOTES_TIPOS" AS tipo ON tipo."ID" = lote."ID_TIPO"
  WHERE lote."ID" = NEW."ID_LOTE";

  IF es_final IS NULL THEN
    RAISE EXCEPTION 'lote inexistente' USING ERRCODE = '23503';
  END IF;

  IF NOT es_final THEN
    RAISE EXCEPTION 'solo un lote final contiene productos' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (NEW."UNIDAD_MEDIDA" = 'unidad' AND mide_unidad)
    OR (NEW."UNIDAD_MEDIDA" = 'litro' AND mide_litro)
    OR (NEW."UNIDAD_MEDIDA" = 'kilo' AND mide_kilo)
  ) THEN
    RAISE EXCEPTION 'la medida del producto no corresponde al tipo de lote' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION lotes_tipos_validar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT NEW."ES_FINAL" AND EXISTS (
    SELECT 1
    FROM "LOTES" AS lote
    JOIN "LOTES_PRODUCTOS" AS producto ON producto."ID_LOTE" = lote."ID"
    WHERE lote."ID_TIPO" = NEW."ID"
  ) THEN
    RAISE EXCEPTION 'el tipo tiene productos y debe seguir siendo final' USING ERRCODE = '23514';
  END IF;

  IF NEW."ES_FINAL" AND EXISTS (
    SELECT 1
    FROM "LOTES" AS hijo
    JOIN "LOTES" AS padre ON padre."ID" = hijo."PADRE_ID"
    WHERE padre."ID_TIPO" = NEW."ID"
  ) THEN
    RAISE EXCEPTION 'el tipo contiene lotes y no puede ser final' USING ERRCODE = '23514';
  END IF;

  IF NOT NEW."ES_FINAL" AND EXISTS (
    SELECT 1 FROM "LOTES"
    WHERE "ID_TIPO" = NEW."ID" AND "PADRE_ID" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'un tipo no final no puede estar dentro de otro lote' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LOTES" AS lote
    JOIN "LOTES_PRODUCTOS" AS producto ON producto."ID_LOTE" = lote."ID"
    WHERE lote."ID_TIPO" = NEW."ID"
      AND NOT (
        (producto."UNIDAD_MEDIDA" = 'unidad' AND NEW."MIDE_UNIDAD")
        OR (producto."UNIDAD_MEDIDA" = 'litro' AND NEW."MIDE_LITRO")
        OR (producto."UNIDAD_MEDIDA" = 'kilo' AND NEW."MIDE_KILO")
      )
  ) THEN
    RAISE EXCEPTION 'hay productos con una medida que el tipo ya no permite' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "LOTES_JERARQUIA_TRG" ON "LOTES";
CREATE TRIGGER "LOTES_JERARQUIA_TRG"
  BEFORE INSERT OR UPDATE ON "LOTES"
  FOR EACH ROW
  EXECUTE FUNCTION lotes_validar();

DROP TRIGGER IF EXISTS "LOTES_PRODUCTOS_MEDIDA_TRG" ON "LOTES_PRODUCTOS";
CREATE TRIGGER "LOTES_PRODUCTOS_MEDIDA_TRG"
  BEFORE INSERT OR UPDATE ON "LOTES_PRODUCTOS"
  FOR EACH ROW
  EXECUTE FUNCTION lotes_productos_validar();

DROP TRIGGER IF EXISTS "LOTES_TIPOS_USO_TRG" ON "LOTES_TIPOS";
CREATE TRIGGER "LOTES_TIPOS_USO_TRG"
  BEFORE UPDATE ON "LOTES_TIPOS"
  FOR EACH ROW
  EXECUTE FUNCTION lotes_tipos_validar();

INSERT INTO "LOTES_TIPOS" (
  "CODIGO",
  "NOMBRE",
  "ES_SEMILLA",
  "ES_FINAL",
  "MIDE_UNIDAD",
  "MIDE_LITRO",
  "MIDE_KILO"
) VALUES
  ('caja', 'Caja', true, true, true, false, false),
  ('tambo', 'Tambo', true, true, false, true, true),
  ('tarima', 'Tarima', true, false, false, false, false)
ON CONFLICT ("CODIGO") DO UPDATE SET
  "ES_SEMILLA" = true,
  "ES_FINAL" = EXCLUDED."ES_FINAL",
  "MIDE_UNIDAD" = EXCLUDED."MIDE_UNIDAD",
  "MIDE_LITRO" = EXCLUDED."MIDE_LITRO",
  "MIDE_KILO" = EXCLUDED."MIDE_KILO";

ALTER FUNCTION lotes_validar() OWNER TO packing;
ALTER FUNCTION lotes_productos_validar() OWNER TO packing;
ALTER FUNCTION lotes_tipos_validar() OWNER TO packing;
