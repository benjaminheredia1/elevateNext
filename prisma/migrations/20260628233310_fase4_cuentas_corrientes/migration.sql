-- CreateEnum
CREATE TYPE "EstadoCuenta" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA');

-- CreateEnum
CREATE TYPE "TipoCuentaCxCxP" AS ENUM ('POR_COBRAR', 'POR_PAGAR');

-- CreateTable
CREATE TABLE "CuentaCorriente" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoCuentaCxCxP" NOT NULL,
    "contraparte" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "monto_pagado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vencimiento" TIMESTAMP(3),
    "estado" "EstadoCuenta" NOT NULL DEFAULT 'PENDIENTE',
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaCorriente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CuentaCorriente_tipo_estado_idx" ON "CuentaCorriente"("tipo", "estado");
