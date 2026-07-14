-- Feriados globales (sucursal_id IS NULL): la unique (fecha, sucursal_id) no los
-- cubre porque en Postgres los NULL son distintos entre sí. Este índice parcial
-- garantiza a nivel de BD que no haya dos feriados globales en la misma fecha.
-- Aditivo: no modifica ni elimina datos.
CREATE UNIQUE INDEX IF NOT EXISTS "DiaFeriado_fecha_global_key"
  ON "DiaFeriado" ("fecha")
  WHERE "sucursal_id" IS NULL;
