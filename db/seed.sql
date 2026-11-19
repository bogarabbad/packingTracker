-- Unidades de prueba. Los catálogos de estatus y tipos ya vienen en db/init.sql.
-- Ejecutar después de db/init.sql, como usuario packing:
--   psql -U packing -d packing_tracker -f db/seed.sql

INSERT INTO "UNIDADES_TRANSPORTE" (
  "ID",
  "CODIGO",
  "ID_TIPO",
  "PLACAS",
  "NUMERO_ECONOMICO",
  "MARCA",
  "MODELO",
  "ANIO",
  "NUMERO_SERIE",
  "CAPACIDAD_CARGA_KG",
  "CAPACIDAD_VOLUMEN_M3",
  "ID_ESTATUS",
  "ES_SEMILLA"
) VALUES
  (1, 'UT-001', 1, '84AB3C1', 'KW-680-01', 'Kenworth', 'T680', 2022, '1XKYDP9X5NJ123001', NULL, NULL, 1, true),
  (2, 'UT-002', 5, '91RD7K2', 'CS-53-02', 'Utility', '4000DX', 2021, '1UYVS2535M8123002', 24000.00, 90.00, 1, true),
  (3, 'UT-003', 2, '73TL4M8', 'FL-M2-03', 'Freightliner', 'M2 106', 2019, '3ALACWDT5KD123003', 16000.00, 45.00, 3, true),
  (4, 'UT-004', 3, '62RB9P3', 'INT-4300-04', 'International', '4300', 2018, '3HTMMAAR5JL123004', 8000.00, 28.00, 4, true),
  (5, 'UT-005', 4, '15NP6Q4', 'NP300-05', 'Nissan', 'NP300', 2023, '3N6CM0KN8PK123005', 1500.00, 6.50, 1, true);

SELECT setval(pg_get_serial_sequence('"UNIDADES_TRANSPORTE"', 'ID'), (SELECT MAX("ID") FROM "UNIDADES_TRANSPORTE"));
