-- Numeración de pedidos por turno de caja: #1..#n desde cada apertura.
-- Aditivo: no toca datos existentes (los pedidos previos quedan con NULL).
ALTER TABLE "Transaccion" ADD COLUMN IF NOT EXISTS "numero_turno" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "Transaccion_turno_id_numero_turno_key" ON "Transaccion"("turno_id", "numero_turno");
