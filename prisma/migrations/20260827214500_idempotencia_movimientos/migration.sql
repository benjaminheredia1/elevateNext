-- Idempotencia de los movimientos de stock.
--
-- Columna nullable: el histórico no tiene clave y Postgres permite múltiples
-- NULL bajo un índice único, así que no hace falta backfill ni DEFAULT.
--
-- NOTA DE DESPLIEGUE: `MovimientoInterno` es una tabla caliente (cada venta
-- escribe ahí). El CREATE UNIQUE INDEX toma un ShareLock sobre la tabla
-- mientras construye. En producción, aplicar en un momento tranquilo; si la
-- tabla creciera mucho, reemplazar por CREATE UNIQUE INDEX CONCURRENTLY
-- ejecutado fuera de esta migración (Prisma corre cada migración en una
-- transacción y CONCURRENTLY no puede vivir dentro de una).

ALTER TABLE "MovimientoCentro" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "MovimientoInterno" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "MovimientoCentro_idempotency_key_key" ON "MovimientoCentro"("idempotency_key");
CREATE UNIQUE INDEX "MovimientoInterno_idempotency_key_key" ON "MovimientoInterno"("idempotency_key");
