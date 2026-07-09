-- ============================================================
-- Migración: dinero Float (double precision) -> numeric(12,2)
-- Fecha: 2026-07-09
--
-- IMPORTANTE:
--  1. Hacer backup antes:  node scripts/db-backup.mjs
--  2. Coordinar con el equipo: nadie escribiendo durante la corrida
--     (cada ALTER bloquea su tabla unos segundos y reescribe filas).
--  3. Desplegar el código actualizado (schema.prisma en Decimal)
--     inmediatamente después de aplicar este SQL.
--
-- La conversión redondea a 2 decimales, que es la precisión real
-- del dinero: limpia los errores acumulados de punto flotante
-- (p.ej. 129.99999999998 -> 130.00). No hay pérdida de información
-- contablemente significativa.
--
-- Aplicar con:
--   npx prisma db execute --file scripts/migracion-dinero-decimal.sql
-- ============================================================

BEGIN;

-- Ventas
ALTER TABLE "Transaccion"
  ALTER COLUMN "total" TYPE numeric(12,2) USING round("total"::numeric, 2);

ALTER TABLE "TransaccionesDetalles"
  ALTER COLUMN "precio_unitario"   TYPE numeric(12,2) USING round("precio_unitario"::numeric, 2),
  ALTER COLUMN "descuentoAplicado" TYPE numeric(12,2) USING round("descuentoAplicado"::numeric, 2);

-- Catálogo
ALTER TABLE "Producto"
  ALTER COLUMN "precio" TYPE numeric(12,2) USING round("precio"::numeric, 2);

-- Caja legacy (sin frontend, pero con datos históricos)
ALTER TABLE "Caja"
  ALTER COLUMN "monto_inicial" TYPE numeric(12,2) USING round("monto_inicial"::numeric, 2),
  ALTER COLUMN "monto_final"   TYPE numeric(12,2) USING round("monto_final"::numeric, 2),
  ALTER COLUMN "ingresos"      TYPE numeric(12,2) USING round("ingresos"::numeric, 2),
  ALTER COLUMN "egresos"       TYPE numeric(12,2) USING round("egresos"::numeric, 2);

ALTER TABLE "Gasto"
  ALTER COLUMN "monto" TYPE numeric(12,2) USING round("monto"::numeric, 2);

COMMIT;

-- Verificación rápida post-migración:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name IN ('Transaccion','TransaccionesDetalles','Producto','Caja','Gasto')
--    AND column_name IN ('total','precio_unitario','descuentoAplicado','precio','monto_inicial','monto_final','ingresos','egresos','monto');