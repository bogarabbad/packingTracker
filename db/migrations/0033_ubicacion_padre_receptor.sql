-- Migración 0033. ES_RECEPTOR en UBICACIONES_CATEGORIAS y
-- ubicacion_padre_por_categoria() para resolver el ancestro receptor.
-- recepciones_lotes_validar acepta DESTINO hijo si la recepción es ese padre
-- y la categoría de la recepción tiene ES_RECEPTOR = true.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "UBICACIONES_CATEGORIAS"
  ADD COLUMN "ES_RECEPTOR" boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION ubicacion_padre_por_categoria(
  p_ubicacion_id integer,
  p_categoria_id integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  actual_id integer;
  actual_categoria integer;
  actual_padre integer;
  profundidad integer := 0;
BEGIN
  IF p_ubicacion_id IS NULL OR p_ubicacion_id < 1
     OR p_categoria_id IS NULL OR p_categoria_id < 1 THEN
    RETURN NULL;
  END IF;

  SELECT u."ID", u."ID_CATEGORIA", u."PADRE_ID"
    INTO actual_id, actual_categoria, actual_padre
  FROM "UBICACIONES" AS u
  WHERE u."ID" = p_ubicacion_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF actual_categoria = p_categoria_id THEN
    RETURN actual_id;
  END IF;

  LOOP
    IF actual_padre IS NULL THEN
      RETURN p_ubicacion_id;
    END IF;

    profundidad := profundidad + 1;
    IF profundidad > 100 THEN
      RETURN p_ubicacion_id;
    END IF;

    SELECT u."ID", u."ID_CATEGORIA", u."PADRE_ID"
      INTO actual_id, actual_categoria, actual_padre
    FROM "UBICACIONES" AS u
    WHERE u."ID" = actual_padre;

    IF NOT FOUND THEN
      RETURN p_ubicacion_id;
    END IF;

    IF actual_categoria = p_categoria_id THEN
      RETURN actual_id;
    END IF;
  END LOOP;
END;
$$;

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
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT r."UBICACION_ID", u."ID_CATEGORIA", c."ES_RECEPTOR"
    INTO ubicacion_recepcion, categoria_recepcion, es_receptor
  FROM "RECEPCIONES" AS r
  JOIN "UBICACIONES" AS u ON u."ID" = r."UBICACION_ID"
  JOIN "UBICACIONES_CATEGORIAS" AS c ON c."ID" = u."ID_CATEGORIA"
  WHERE r."ID" = NEW."ID_RECEPCION";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recepcion inexistente' USING ERRCODE = '23503';
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

ALTER FUNCTION ubicacion_padre_por_categoria(integer, integer) OWNER TO packing;
ALTER FUNCTION recepciones_lotes_validar() OWNER TO packing;

COMMIT;
