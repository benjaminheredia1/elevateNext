-- ============================================================
-- HANDOFF: estructuras de fiado / privilegios / gastos operativos
-- Branch de origen: feat/caja-pedidos-pagos
-- Fecha: 2026-07-05
--
-- Este SQL es 100% ADITIVO e IDEMPOTENTE: se puede correr varias
-- veces sin dañar nada, y NO toca las columnas de soft-delete
-- (Insumo.activo, fecha_baja, motivo_baja, etc.) de otros branches.
--
-- IMPORTANTE para quien despliega:
--   NO correr `prisma db push` ni `prisma migrate dev` desde un
--   schema que no incluya estos modelos — eso ELIMINA estas tablas
--   y rompe el módulo de fiado/deudores de la caja en producción.
--   Fusionar primero el schema.prisma de feat/caja-pedidos-pagos.
-- ============================================================

BEGIN;

-- Columnas de fiado en CuentaCorriente
ALTER TABLE "CuentaCorriente" ADD COLUMN IF NOT EXISTS "cliente_id" INTEGER;
ALTER TABLE "CuentaCorriente" ADD COLUMN IF NOT EXISTS "transaccion_id" INTEGER;

-- Tabla de privilegios (descuentos por tipo de cliente)
CREATE TABLE IF NOT EXISTS "Privilegio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Privilegio_pkey" PRIMARY KEY ("id")
);

-- Relación cliente-privilegio
CREATE TABLE IF NOT EXISTS "ClientePrivilegio" (
    "cliente_id" INTEGER NOT NULL,
    "privilegio_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientePrivilegio_pkey" PRIMARY KEY ("cliente_id","privilegio_id")
);

-- Gastos operativos (registro contable, aparte de MovimientoCaja)
CREATE TABLE IF NOT EXISTS "GastoOperativo" (
    "id" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo_pago" "TipoCuenta" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "notas" TEXT,
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GastoOperativo_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX IF NOT EXISTS "Privilegio_activo_idx" ON "Privilegio"("activo");
CREATE INDEX IF NOT EXISTS "ClientePrivilegio_privilegio_id_idx" ON "ClientePrivilegio"("privilegio_id");
CREATE INDEX IF NOT EXISTS "GastoOperativo_fecha_idx" ON "GastoOperativo"("fecha");
CREATE INDEX IF NOT EXISTS "GastoOperativo_categoria_idx" ON "GastoOperativo"("categoria");
CREATE INDEX IF NOT EXISTS "GastoOperativo_metodo_pago_idx" ON "GastoOperativo"("metodo_pago");
CREATE UNIQUE INDEX IF NOT EXISTS "CuentaCorriente_transaccion_id_key" ON "CuentaCorriente"("transaccion_id");
CREATE INDEX IF NOT EXISTS "CuentaCorriente_cliente_id_idx" ON "CuentaCorriente"("cliente_id");
CREATE INDEX IF NOT EXISTS "CuentaCorriente_vencimiento_idx" ON "CuentaCorriente"("vencimiento");

-- Foreign keys (DO-block para idempotencia: ADD CONSTRAINT no soporta IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientePrivilegio_cliente_id_fkey') THEN
    ALTER TABLE "ClientePrivilegio" ADD CONSTRAINT "ClientePrivilegio_cliente_id_fkey"
      FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientePrivilegio_privilegio_id_fkey') THEN
    ALTER TABLE "ClientePrivilegio" ADD CONSTRAINT "ClientePrivilegio_privilegio_id_fkey"
      FOREIGN KEY ("privilegio_id") REFERENCES "Privilegio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CuentaCorriente_cliente_id_fkey') THEN
    ALTER TABLE "CuentaCorriente" ADD CONSTRAINT "CuentaCorriente_cliente_id_fkey"
      FOREIGN KEY ("cliente_id") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CuentaCorriente_transaccion_id_fkey') THEN
    ALTER TABLE "CuentaCorriente" ADD CONSTRAINT "CuentaCorriente_transaccion_id_fkey"
      FOREIGN KEY ("transaccion_id") REFERENCES "Transaccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Privilegio base usado por la operación (si no existe ya)
INSERT INTO "Privilegio" ("nombre", "descripcion", "porcentaje", "activo", "creado_por_id", "update_at")
SELECT 'Staff fitbul', NULL, 10.00, true, 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Privilegio" WHERE "nombre" = 'Staff fitbul');

COMMIT;
