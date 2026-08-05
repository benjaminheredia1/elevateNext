-- Correlativo de pedido propio de cada sucursal.
--
-- `Transaccion.id` es un contador compartido por todo el negocio: una sucursal
-- nueva mostraba "#2101" en su primera venta solo porque las otras ya llevaban
-- 2100. `numero_sucursal` cuenta 1, 2, 3… dentro de cada local y no reinicia.

ALTER TABLE "Transaccion" ADD COLUMN "numero_sucursal" INTEGER;

-- Backfill: se numera lo que ya existe respetando el orden real de las ventas
-- de cada sucursal, para que el histórico quede coherente con las nuevas.
WITH numeradas AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "sucursal_id" ORDER BY "created_at" ASC, "id" ASC) AS n
    FROM "Transaccion"
)
UPDATE "Transaccion" t
   SET "numero_sucursal" = numeradas.n
  FROM numeradas
 WHERE t."id" = numeradas."id";

-- Dos ventas simultáneas no pueden quedarse con el mismo número.
CREATE UNIQUE INDEX "Transaccion_sucursal_id_numero_sucursal_key"
    ON "Transaccion"("sucursal_id", "numero_sucursal");
