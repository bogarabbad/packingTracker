-- Migración 0017. El usuario ADMIN nace como semilla en USUARIOS.
-- Se puede modificar y no se puede eliminar.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

INSERT INTO "USUARIOS" ("ID", "CODIGO", "NOMBRE", "ES_SEMILLA") VALUES
  (1, 'ADMIN', 'Administrador', true);

SELECT setval(
  pg_get_serial_sequence('"USUARIOS"', 'ID'),
  (SELECT MAX("ID") FROM "USUARIOS")
);

COMMIT;
