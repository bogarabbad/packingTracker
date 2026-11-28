-- Migración 0037. FECHA_CIERRE en RECEPCIONES (una por expedición+ubicación).
-- Abrir recepción (FECHA_CIERRE null) pasa expedición TRANSITO → RECEPCION.
-- Cerrar recepción (fijar FECHA_CIERRE) vuelve a TRANSITO si no queda otra abierta.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "RECEPCIONES"
  ADD COLUMN "FECHA_CIERRE" timestamptz;

ALTER TABLE "RECEPCIONES"
  ADD CONSTRAINT "RECEPCIONES_FECHA_CIERRE_CHK" CHECK (
    "FECHA_CIERRE" IS NULL OR "FECHA_CIERRE" >= "CREADO_EN"
  );

CREATE UNIQUE INDEX "RECEPCIONES_EXPEDICION_UBICACION_UQ"
  ON "RECEPCIONES" ("ID_EXPEDICION", "UBICACION_ID");

CREATE OR REPLACE FUNCTION recepciones_expedicion_estatus()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  estatus_actual integer;
  abiertas integer;
  id_expedicion integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    id_expedicion := OLD."ID_EXPEDICION";
  ELSE
    id_expedicion := NEW."ID_EXPEDICION";
  END IF;

  SELECT e."ID_ESTATUS" INTO estatus_actual
  FROM "EXPEDICIONES" AS e
  WHERE e."ID" = id_expedicion;

  IF TG_OP = 'INSERT' THEN
    IF NEW."FECHA_CIERRE" IS NULL AND estatus_actual = 3 THEN
      PERFORM expedicion_registrar_estatus(id_expedicion, 4);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."FECHA_CIERRE" IS NULL
       AND NEW."FECHA_CIERRE" IS NOT NULL
       AND estatus_actual = 4 THEN
      SELECT COUNT(*)::int INTO abiertas
      FROM "RECEPCIONES" AS r
      WHERE r."ID_EXPEDICION" = id_expedicion
        AND r."FECHA_CIERRE" IS NULL
        AND r."ID" <> NEW."ID";

      IF abiertas = 0 THEN
        PERFORM expedicion_registrar_estatus(id_expedicion, 3);
      END IF;
    ELSIF OLD."FECHA_CIERRE" IS NOT NULL
          AND NEW."FECHA_CIERRE" IS NULL
          AND estatus_actual = 3 THEN
      PERFORM expedicion_registrar_estatus(id_expedicion, 4);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."FECHA_CIERRE" IS NULL AND estatus_actual = 4 THEN
      SELECT COUNT(*)::int INTO abiertas
      FROM "RECEPCIONES" AS r
      WHERE r."ID_EXPEDICION" = id_expedicion
        AND r."FECHA_CIERRE" IS NULL;

      IF abiertas = 0 THEN
        PERFORM expedicion_registrar_estatus(id_expedicion, 3);
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "RECEPCIONES_EXPEDICION_ESTATUS_TRG" ON "RECEPCIONES";

CREATE TRIGGER "RECEPCIONES_EXPEDICION_ESTATUS_TRG"
  AFTER INSERT OR UPDATE OR DELETE ON "RECEPCIONES"
  FOR EACH ROW
  EXECUTE FUNCTION recepciones_expedicion_estatus();

CREATE OR REPLACE FUNCTION recepciones_lotes_validar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ubicacion_recepcion integer;
  categoria_recepcion integer;
  es_receptor boolean;
  padre_id integer;
  destino_id integer;
  receptor_id integer;
  fecha_cierre timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT r."UBICACION_ID", u."ID_CATEGORIA", c."ES_RECEPTOR", r."FECHA_CIERRE"
    INTO ubicacion_recepcion, categoria_recepcion, es_receptor, fecha_cierre
  FROM "RECEPCIONES" AS r
  JOIN "UBICACIONES" AS u ON u."ID" = r."UBICACION_ID"
  JOIN "UBICACIONES_CATEGORIAS" AS c ON c."ID" = u."ID_CATEGORIA"
  WHERE r."ID" = NEW."ID_RECEPCION";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recepcion inexistente' USING ERRCODE = '23503';
  END IF;

  IF fecha_cierre IS NOT NULL THEN
    RAISE EXCEPTION 'no se reciben lotes en una recepcion cerrada' USING ERRCODE = '23514';
  END IF;

  SELECT "PADRE_ID" INTO padre_id
  FROM "LOTES"
  WHERE "ID" = NEW."ID_LOTE";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lote inexistente' USING ERRCODE = '23503';
  END IF;

  IF padre_id IS NOT NULL THEN
    RAISE EXCEPTION 'solo se reciben lotes sin padre' USING ERRCODE = '23514';
  END IF;

  SELECT relacion."UBICACION_ID" INTO destino_id
  FROM "LOTES_UBICACIONES" AS relacion
  JOIN "LOTES_UBICACIONES_TIPOS" AS tipo ON tipo."ID" = relacion."ID_TIPO"
  WHERE relacion."ID_LOTE" = NEW."ID_LOTE"
    AND tipo."CODIGO" = 'DESTINO';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'el lote no tiene destino' USING ERRCODE = '23514';
  END IF;

  IF destino_id = ubicacion_recepcion THEN
    RETURN NEW;
  END IF;

  IF es_receptor THEN
    receptor_id := ubicacion_padre_por_categoria(destino_id, categoria_recepcion);
    IF receptor_id = ubicacion_recepcion THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'el destino del lote no coincide con la recepcion'
    USING ERRCODE = '23514';
END;
$$;

COMMIT;
