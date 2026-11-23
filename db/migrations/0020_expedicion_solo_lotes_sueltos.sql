-- Migración 0020. Solo lotes sin PADRE_ID (sueltos) pueden embarcarse en una expedición.
-- Un lote ya embarcado no puede pasar a tener padre.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

CREATE OR REPLACE FUNCTION expediciones_lotes_validar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cierre timestamptz;
  creada timestamptz;
  cierre_anterior timestamptz;
  padre_id integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT "FECHA_CIERRE" INTO cierre
    FROM "EXPEDICIONES"
    WHERE "ID" = OLD."ID_EXPEDICION";

    IF cierre IS NOT NULL THEN
      RAISE EXCEPTION 'la expedicion cerrada conserva sus lotes' USING ERRCODE = '23514';
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT "FECHA_CIERRE" INTO cierre_anterior
    FROM "EXPEDICIONES"
    WHERE "ID" = OLD."ID_EXPEDICION";

    IF cierre_anterior IS NOT NULL THEN
      RAISE EXCEPTION 'la expedicion cerrada conserva sus lotes' USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT "FECHA_CIERRE", "CREADO_EN" INTO cierre, creada
  FROM "EXPEDICIONES"
  WHERE "ID" = NEW."ID_EXPEDICION";

  IF creada IS NULL THEN
    RAISE EXCEPTION 'expedicion inexistente' USING ERRCODE = '23503';
  END IF;

  IF cierre IS NOT NULL THEN
    RAISE EXCEPTION 'no se embarcan lotes en una expedicion cerrada' USING ERRCODE = '23514';
  END IF;

  IF NEW."EMBARCADO_EN" < creada THEN
    RAISE EXCEPTION 'el embarque no puede ser anterior a la expedicion' USING ERRCODE = '23514';
  END IF;

  SELECT "PADRE_ID" INTO padre_id
  FROM "LOTES"
  WHERE "ID" = NEW."ID_LOTE";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lote inexistente' USING ERRCODE = '23503';
  END IF;

  IF padre_id IS NOT NULL THEN
    RAISE EXCEPTION 'solo se embarcan lotes sin padre' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

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
      IF EXISTS (
        SELECT 1
        FROM "EXPEDICIONES_LOTES"
        WHERE "ID_LOTE" = NEW."ID"
      ) THEN
        RAISE EXCEPTION 'un lote embarcado no puede tener padre' USING ERRCODE = '23514';
      END IF;

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
        WHERE producto."ID_LOTE" = NEW."ID"
          AND NOT EXISTS (
            SELECT 1
            FROM "LOTES_TIPOS_UNIDADES" AS relacion
            WHERE relacion."ID_TIPO" = NEW."ID_TIPO"
              AND relacion."ID_UNIDAD" = producto."ID_UNIDAD"
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

ALTER FUNCTION expediciones_lotes_validar() OWNER TO packing;
ALTER FUNCTION lotes_validar() OWNER TO packing;
