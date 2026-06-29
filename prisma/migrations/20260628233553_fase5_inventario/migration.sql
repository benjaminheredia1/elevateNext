-- CreateEnum
CREATE TYPE "ProductoTipo" AS ENUM ('ELABORADO', 'REVENTA');

-- CreateEnum
CREATE TYPE "EstadoPublicacion" AS ENUM ('BORRADOR', 'PUBLICADO', 'ARCHIVADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Tipo_movimiento" ADD VALUE 'VENTA';
ALTER TYPE "Tipo_movimiento" ADD VALUE 'MERMA';
ALTER TYPE "Tipo_movimiento" ADD VALUE 'AJUSTE';

-- AlterTable
ALTER TABLE "Insumo" ADD COLUMN     "categoria_insumo" TEXT,
ADD COLUMN     "proveedor" TEXT,
ADD COLUMN     "proveedor_telefono" TEXT,
ADD COLUMN     "punto_critico" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "rendimiento" DOUBLE PRECISION,
ADD COLUMN     "uso_diario_promedio" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MovimientoInterno" ADD COLUMN     "costo_unitario" DOUBLE PRECISION,
ADD COLUMN     "responsable" TEXT,
ADD COLUMN     "transaccion_id" INTEGER;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "calorias" INTEGER,
ADD COLUMN     "estado_publicacion" "EstadoPublicacion" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN     "insumo_reventa_id" INTEGER,
ADD COLUMN     "proteina" TEXT,
ADD COLUMN     "tipo" "ProductoTipo" NOT NULL DEFAULT 'ELABORADO',
ADD COLUMN     "ventas_acumuladas" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Marca" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Marca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoMarca" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "marca_id" INTEGER NOT NULL,

    CONSTRAINT "ProductoMarca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionAlertas" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "whatsapp_habilitado" BOOLEAN NOT NULL DEFAULT false,
    "destinatarios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hora_silencio_desde" TEXT NOT NULL DEFAULT '22:00',
    "hora_silencio_hasta" TEXT NOT NULL DEFAULT '07:00',
    "intervalo_minimo_min" INTEGER NOT NULL DEFAULT 60,
    "plantilla_mensaje" TEXT NOT NULL DEFAULT 'Elevate - Alerta de inventario: {count} insumos bajo umbral.
{list}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionAlertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAlerta" (
    "id" SERIAL NOT NULL,
    "enviado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "insumo_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "estado" TEXT NOT NULL,
    "preview" TEXT NOT NULL,

    CONSTRAINT "RegistroAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Marca_key_key" ON "Marca"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoMarca_producto_id_marca_id_key" ON "ProductoMarca"("producto_id", "marca_id");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_insumo_reventa_id_fkey" FOREIGN KEY ("insumo_reventa_id") REFERENCES "Insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInterno" ADD CONSTRAINT "MovimientoInterno_transaccion_id_fkey" FOREIGN KEY ("transaccion_id") REFERENCES "Transaccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoMarca" ADD CONSTRAINT "ProductoMarca_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoMarca" ADD CONSTRAINT "ProductoMarca_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "Marca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
