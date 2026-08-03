-- Fase 5 multi-sucursal: gastos y activos pertenecen a un local.
--
-- Sin esto, el estado de resultados por sucursal daria ingresos separados pero
-- costos mezclados — un numero que no sirve para decidir. Todo lo existente es
-- de la sucursal principal, que es donde opera el negocio hoy.

-- ── Gastos fijos ────────────────────────────────────────────────────────
ALTER TABLE "GastoFijo" ADD COLUMN "sucursal_id" INTEGER;
UPDATE "GastoFijo"
SET "sucursal_id" = (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1)
WHERE "sucursal_id" IS NULL;
ALTER TABLE "GastoFijo" ALTER COLUMN "sucursal_id" SET NOT NULL;
CREATE INDEX "GastoFijo_sucursal_id_idx" ON "GastoFijo"("sucursal_id");
ALTER TABLE "GastoFijo" ADD CONSTRAINT "GastoFijo_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Gastos operativos ───────────────────────────────────────────────────
ALTER TABLE "GastoOperativo" ADD COLUMN "sucursal_id" INTEGER;
UPDATE "GastoOperativo"
SET "sucursal_id" = (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1)
WHERE "sucursal_id" IS NULL;
ALTER TABLE "GastoOperativo" ALTER COLUMN "sucursal_id" SET NOT NULL;
CREATE INDEX "GastoOperativo_sucursal_id_idx" ON "GastoOperativo"("sucursal_id");
ALTER TABLE "GastoOperativo" ADD CONSTRAINT "GastoOperativo_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Activos fijos ───────────────────────────────────────────────────────
ALTER TABLE "ActivoFijo" ADD COLUMN "sucursal_id" INTEGER;
UPDATE "ActivoFijo"
SET "sucursal_id" = (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1)
WHERE "sucursal_id" IS NULL;
ALTER TABLE "ActivoFijo" ALTER COLUMN "sucursal_id" SET NOT NULL;
CREATE INDEX "ActivoFijo_sucursal_id_idx" ON "ActivoFijo"("sucursal_id");
ALTER TABLE "ActivoFijo" ADD CONSTRAINT "ActivoFijo_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
