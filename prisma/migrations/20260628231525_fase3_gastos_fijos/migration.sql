-- CreateEnum
CREATE TYPE "Frecuencia" AS ENUM ('MENSUAL', 'QUINCENAL', 'SEMANAL', 'ANUAL');

-- CreateTable
CREATE TABLE "GastoFijo" (
    "id" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "frecuencia" "Frecuencia" NOT NULL DEFAULT 'MENSUAL',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GastoFijo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GastoFijo_activo_idx" ON "GastoFijo"("activo");

-- CreateIndex
CREATE INDEX "GastoFijo_categoria_idx" ON "GastoFijo"("categoria");
