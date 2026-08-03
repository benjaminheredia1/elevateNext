-- Fase 2 multi-sucursal: el movimiento de caja guarda su sucursal.
--
-- Antes se inferia por el turno, pero no todo movimiento tiene turno (gastos y
-- ajustes registrados fuera de caja), y esos desaparecian al filtrar por
-- sucursal. Mismo procedimiento seguro: nullable -> backfill -> NOT NULL.

ALTER TABLE "MovimientoCaja" ADD COLUMN "sucursal_id" INTEGER;

-- 1. Si el movimiento tiene turno, la sucursal es la del turno.
UPDATE "MovimientoCaja" m
SET "sucursal_id" = c."sucursal_id"
FROM "CajaTurno" c
WHERE m."turno_id" = c."id" AND m."sucursal_id" IS NULL;

-- 2. Si no tiene turno pero si venta asociada, se toma la de la venta.
UPDATE "MovimientoCaja" m
SET "sucursal_id" = t."sucursal_id"
FROM "Transaccion" t
WHERE m."transaccion_id" = t."id" AND m."sucursal_id" IS NULL;

-- 3. Si no tiene ninguna de las dos, se toma la de su cuenta financiera
--    (toda cuenta pertenece a una sucursal).
UPDATE "MovimientoCaja" m
SET "sucursal_id" = f."sucursal_id"
FROM "CuentaFinanciera" f
WHERE m."cuenta_id" = f."id" AND m."sucursal_id" IS NULL;

-- 4. Red de seguridad: cualquier resto va a la sucursal mas antigua.
UPDATE "MovimientoCaja"
SET "sucursal_id" = (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1)
WHERE "sucursal_id" IS NULL;

ALTER TABLE "MovimientoCaja" ALTER COLUMN "sucursal_id" SET NOT NULL;

CREATE INDEX "MovimientoCaja_sucursal_id_created_at_idx" ON "MovimientoCaja"("sucursal_id", "created_at");

ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
