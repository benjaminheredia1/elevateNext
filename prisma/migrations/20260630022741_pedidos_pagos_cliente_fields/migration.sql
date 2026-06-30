/*
  Warnings:

  - A unique constraint covering the columns `[telefono]` on the table `Cliente` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[codigo]` on the table `Transaccion` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('PENDIENTE', 'PAGADO', 'REEMBOLSADO', 'COD_PENDIENTE');

-- CreateEnum
CREATE TYPE "TipoEntrega" AS ENUM ('RECOJO', 'DELIVERY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EstadoTransaccion" ADD VALUE 'LISTO';
ALTER TYPE "EstadoTransaccion" ADD VALUE 'EN_LOCAL';
ALTER TYPE "EstadoTransaccion" ADD VALUE 'LLEGO';

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "email" TEXT,
ADD COLUMN     "es_anonimo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nit" TEXT;

-- AlterTable
ALTER TABLE "Transaccion" ADD COLUMN     "cliente_email" TEXT,
ADD COLUMN     "cliente_nit" TEXT,
ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "codigo_descuento" TEXT,
ADD COLUMN     "payment_status" "EstadoPago" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "tipo_entrega" "TipoEntrega";

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_telefono_key" ON "Cliente"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "Transaccion_codigo_key" ON "Transaccion"("codigo");
