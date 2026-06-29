/*
  Warnings:

  - The `metodo_pago` column on the `Transaccion` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('EFECTIVO', 'QR', 'TARJETA', 'BANCO');

-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('VENTA', 'INGRESO_EXTRA', 'GASTO_OPERATIVO', 'COMPRA_INSUMO', 'AJUSTE', 'RETIRO');

-- CreateEnum
CREATE TYPE "CanalVenta" AS ENUM ('WEB', 'PICKUP', 'SALON');

-- AlterTable
ALTER TABLE "Transaccion" ADD COLUMN     "cajero_id" INTEGER,
ADD COLUMN     "canal" "CanalVenta",
ADD COLUMN     "es_cortesia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "turno_id" INTEGER,
DROP COLUMN "metodo_pago",
ADD COLUMN     "metodo_pago" "TipoCuenta";

-- CreateTable
CREATE TABLE "CuentaFinanciera" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "tipo" "TipoCuenta" NOT NULL,
    "nombre" TEXT NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaFinanciera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CajaTurno" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "cajero_id" INTEGER NOT NULL,
    "estado" "EstadoTurno" NOT NULL DEFAULT 'ABIERTO',
    "apertura_efectivo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "apertura_qr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ventas_efectivo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ventas_qr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "esperado_efectivo" DECIMAL(12,2),
    "esperado_qr" DECIMAL(12,2),
    "real_efectivo" DECIMAL(12,2),
    "real_qr" DECIMAL(12,2),
    "diferencia_efectivo" DECIMAL(12,2),
    "diferencia_qr" DECIMAL(12,2),
    "observaciones" TEXT,
    "fecha_cierre" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CajaTurno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" SERIAL NOT NULL,
    "turno_id" INTEGER,
    "cuenta_id" INTEGER NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "metodo_pago" "TipoCuenta" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT,
    "transaccion_id" INTEGER,
    "es_cortesia" BOOLEAN NOT NULL DEFAULT false,
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentaFinanciera_sucursal_id_tipo_key" ON "CuentaFinanciera"("sucursal_id", "tipo");

-- CreateIndex
CREATE INDEX "CajaTurno_sucursal_id_estado_idx" ON "CajaTurno"("sucursal_id", "estado");

-- CreateIndex
CREATE INDEX "CajaTurno_fecha_apertura_idx" ON "CajaTurno"("fecha_apertura");

-- CreateIndex
CREATE INDEX "MovimientoCaja_turno_id_idx" ON "MovimientoCaja"("turno_id");

-- CreateIndex
CREATE INDEX "MovimientoCaja_created_at_idx" ON "MovimientoCaja"("created_at");

-- CreateIndex
CREATE INDEX "MovimientoCaja_tipo_metodo_pago_idx" ON "MovimientoCaja"("tipo", "metodo_pago");

-- AddForeignKey
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "CajaTurno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaFinanciera" ADD CONSTRAINT "CuentaFinanciera_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CajaTurno" ADD CONSTRAINT "CajaTurno_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CajaTurno" ADD CONSTRAINT "CajaTurno_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "CajaTurno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "CuentaFinanciera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_transaccion_id_fkey" FOREIGN KEY ("transaccion_id") REFERENCES "Transaccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
