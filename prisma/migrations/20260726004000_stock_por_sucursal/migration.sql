-- Fase 4 multi-sucursal: el stock pasa a ser de cada local.
--
-- El insumo sigue siendo un catalogo compartido (nombre, unidad de medida) para
-- que las recetas apunten al mismo ingrediente en todos los locales. Lo que pasa
-- a ser propio de cada sucursal es cuanto tiene, a que costo lo compro y sus
-- niveles de alerta.
--
-- Insumo.stock_actual y costo_promedio NO se tocan: quedan como agregado del
-- negocio, que es lo que siguen leyendo los reportes globales.

-- ── 1. Stock por sucursal ───────────────────────────────────────────────
CREATE TABLE "StockSucursal" (
  "id"             SERIAL       NOT NULL,
  "insumo_id"      INTEGER      NOT NULL,
  "sucursal_id"    INTEGER      NOT NULL,
  "stock_actual"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costo_promedio" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "stock_minimo"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "punto_critico"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockSucursal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockSucursal_insumo_id_sucursal_id_key"
  ON "StockSucursal"("insumo_id", "sucursal_id");
CREATE INDEX "StockSucursal_sucursal_id_idx" ON "StockSucursal"("sucursal_id");

ALTER TABLE "StockSucursal" ADD CONSTRAINT "StockSucursal_insumo_id_fkey"
  FOREIGN KEY ("insumo_id") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockSucursal" ADD CONSTRAINT "StockSucursal_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: todo el inventario actual pertenece a la sucursal principal.
INSERT INTO "StockSucursal"
  ("insumo_id", "sucursal_id", "stock_actual", "costo_promedio", "stock_minimo", "punto_critico", "update_at")
SELECT i."id",
       (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1),
       i."stock_actual",
       i."costo_promedio",
       i."stock_minimo",
       i."punto_critico",
       CURRENT_TIMESTAMP
FROM "Insumo" i
WHERE EXISTS (SELECT 1 FROM "Sucursal");

-- ── 2. Sucursal del movimiento de inventario ────────────────────────────
ALTER TABLE "MovimientoInterno" ADD COLUMN "sucursal_id" INTEGER;

-- Si el movimiento vino de una venta, hereda la sucursal de esa venta.
UPDATE "MovimientoInterno" m
SET "sucursal_id" = t."sucursal_id"
FROM "Transaccion" t
WHERE m."transaccion_id" = t."id" AND m."sucursal_id" IS NULL;

-- El resto (compras, mermas, ajustes historicos) es de la sucursal principal.
UPDATE "MovimientoInterno"
SET "sucursal_id" = (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1)
WHERE "sucursal_id" IS NULL;

ALTER TABLE "MovimientoInterno" ALTER COLUMN "sucursal_id" SET NOT NULL;

CREATE INDEX "MovimientoInterno_sucursal_id_created_at_idx"
  ON "MovimientoInterno"("sucursal_id", "created_at");

ALTER TABLE "MovimientoInterno" ADD CONSTRAINT "MovimientoInterno_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
