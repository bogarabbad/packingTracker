-- Migración 0018. CONTRASENA_HASH permite autenticar usuarios internos con JWT.
-- ADMIN nace con una contraseña temporal documentada en .env.example.
-- No editar este archivo. El siguiente cambio va en una migración nueva
-- y debe reflejarse en db/init.sql.

BEGIN;

ALTER TABLE "USUARIOS"
  ADD COLUMN "CONTRASENA_HASH" text;

UPDATE "USUARIOS"
SET "CONTRASENA_HASH" = '$2b$10$RIli5rPftgft63PF.1KBGePj34zVYfF9jKyLm.YuaeyrrPzudNx/q'
WHERE "CODIGO" = 'ADMIN';

ALTER TABLE "USUARIOS"
  ALTER COLUMN "CONTRASENA_HASH" SET NOT NULL;

COMMIT;
