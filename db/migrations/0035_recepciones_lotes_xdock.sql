-- Migración 0035. Historial XDOCK al recibir en ubicación receptora.
-- Unique (lote, tipo, ubicación) solo para ORIGEN/DESTINO; XDOCK puede repetir.
-- Tras INSERT en RECEPCIONES_LOTES, si la recepción es ancestro receptor del
-- DESTINO (no el DESTINO mismo), se inserta LOTES_UBICACIONES tipo XDOCK.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "LOTES_UBICACIONES"
  DROP CONSTRAINT "LOTES_UBICACIONES_LOTE_TIPO_UBICACION_UQ";

CREATE UNIQUE INDEX "LOTES_UBICACIONES_LOTE_TIPO_UBICACION_UQ"
  ON "LOTES_UBICACIONES" ("ID_LOTE", "ID_TIPO", "UBICACION_ID")
  WHERE "ID_TIPO" IN (1, 2);

CREATE OR REPLACE FUNCTION recepciones_lotes_registrar_xdock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ubicacion_recepcion integer;
  categoria_recepcion integer;
  es_receptor boolean;
  destino_id integer;
  receptor_id integer;
BEGIN
  SELECT r."UBICACION_ID", u."ID_CATEGORIA", c."ES_RECEPTOR"
    INTO ubicacion_recepcion, categoria_recepcion, es_receptor
  FROM "RECEPCIONES" AS r
  JOIN "UBICACIONES" AS u ON u."ID" = r."UBICACION_ID"
  JOIN "UBICACIONES_CATEGORIAS" AS c ON c."ID" = u."ID_CATEGORIA"
  WHERE r."ID" = NEW."ID_RECEPCION";

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT relacion."UBICACION_ID" INTO destino_id
  FROM "LOTES_UBICACIONES" AS relacion
  JOIN "LOTES_UBICACIONES_TIPOS" AS tipo ON tipo."ID" = relacion."ID_TIPO"
  WHERE relacion."ID_LOTE" = NEW."ID_LOTE"
    AND tipo."CODIGO" = 'DESTINO';

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF destino_id = ubicacion_recepcion THEN
    RETURN NEW;
  END IF;

  IF NOT es_receptor THEN
    RETURN NEW;
  END IF;

  receptor_id := ubicacion_padre_por_categoria(destino_id, categoria_recepcion);
  IF receptor_id IS DISTINCT FROM ubicacion_recepcion THEN
    RETURN NEW;
  END IF;

  INSERT INTO "LOTES_UBICACIONES" (
    "ID_LOTE",
    "UBICACION_ID",
    "ID_TIPO",
    "USUARIO_ID",
    "ID_ORIGEN_USUARIO"
  )
  VALUES (
    NEW."ID_LOTE",
    ubicacion_recepcion,
    3,
    NEW."USUARIO_ID",
    NEW."ID_ORIGEN_USUARIO"
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER "RECEPCIONES_LOTES_XDOCK_TRG"
  AFTER INSERT ON "RECEPCIONES_LOTES"
  FOR EACH ROW
  EXECUTE FUNCTION recepciones_lotes_registrar_xdock();

ALTER FUNCTION recepciones_lotes_registrar_xdock() OWNER TO packing;

COMMIT;
