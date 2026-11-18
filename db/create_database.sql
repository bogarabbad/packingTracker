-- Primera ejecución en el servidor PostgreSQL.
-- Crea el usuario y la base vacía. No crea tablas.
-- Ejecutar una sola vez, conectado a la base postgres, como superusuario:
--   psql -U postgres -f db/create_database.sql
-- Sustituye la contraseña antes de ejecutarlo.
-- Después aplica db/init.sql sobre packing_tracker.

CREATE USER packing WITH PASSWORD 'elige-una-contrasena';

CREATE DATABASE packing_tracker OWNER packing;
