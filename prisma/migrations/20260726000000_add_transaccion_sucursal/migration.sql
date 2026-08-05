-- Fase 1 multi-sucursal: atribuir cada venta a una sucursal.
--
-- La columna entra NULLABLE a propósito: agregarla no toca ninguna fila
-- existente. El backfill de más abajo la completa, y una migración posterior
-- la marca NOT NULL solo cuando ya no quedan nulos. Nada se borra.

-- 1. Columna nueva, nullable.
ALTER TABLE "Transaccion" ADD COLUMN "sucursal_id" INTEGER;

-- 2. Backfill.
--    a) Si la venta tiene turno, la sucursal es la del turno (dato exacto).
UPDATE "Transaccion" t
SET "sucursal_id" = c."sucursal_id"
FROM "CajaTurno" c
WHERE t."turno_id" = c."id" AND t."sucursal_id" IS NULL;

--    b) El resto (ventas web, que nunca tuvieron turno) va a la sucursal más
--       antigua: hoy existe una sola y todo el histórico le pertenece.
UPDATE "Transaccion"
SET "sucursal_id" = (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1)
WHERE "sucursal_id" IS NULL;

-- 3. Índice para los reportes filtrados por sucursal y rango de fechas.
CREATE INDEX "Transaccion_sucursal_id_created_at_idx" ON "Transaccion"("sucursal_id", "created_at");

-- 4. Clave foránea.
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
