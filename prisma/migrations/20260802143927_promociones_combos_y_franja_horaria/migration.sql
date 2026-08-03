-- CreateEnum
CREATE TYPE "TipoPromocion" AS ENUM ('DESCUENTO', 'COMBO');

-- CreateEnum
CREATE TYPE "ModoPrecio" AS ENUM ('PORCENTAJE', 'MONTO_DESCUENTO', 'PRECIO_FIJO');

-- DropForeignKey
ALTER TABLE "ReglasHorarias" DROP CONSTRAINT "ReglasHorarias_promocionesDescuentos_id_fkey";

-- AlterTable
ALTER TABLE "PromocionesDescuentos" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "imagen_url" TEXT,
ADD COLUMN     "modo_precio" "ModoPrecio" NOT NULL DEFAULT 'PORCENTAJE',
ADD COLUMN     "monto" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tipo" "TipoPromocion" NOT NULL DEFAULT 'DESCUENTO',
ADD COLUMN     "update_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ReglasHorarias" ADD COLUMN     "dias_semana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "hora_fin" TEXT,
ADD COLUMN     "hora_inicio" TEXT;

-- AlterTable
ALTER TABLE "TransaccionesDetalles" ADD COLUMN     "combo_id" INTEGER;

-- CreateTable
CREATE TABLE "ComboItem" (
    "id" SERIAL NOT NULL,
    "promocion_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "ComboItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromocionSucursal" (
    "id" SERIAL NOT NULL,
    "promocion_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "monto" DECIMAL(12,2),
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromocionSucursal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComboItem_producto_id_idx" ON "ComboItem"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComboItem_promocion_id_producto_id_key" ON "ComboItem"("promocion_id", "producto_id");

-- CreateIndex
CREATE INDEX "PromocionSucursal_sucursal_id_disponible_idx" ON "PromocionSucursal"("sucursal_id", "disponible");

-- CreateIndex
CREATE UNIQUE INDEX "PromocionSucursal_promocion_id_sucursal_id_key" ON "PromocionSucursal"("promocion_id", "sucursal_id");

-- CreateIndex
CREATE INDEX "PromocionesDescuentos_tipo_activo_idx" ON "PromocionesDescuentos"("tipo", "activo");

-- CreateIndex
CREATE INDEX "ReglasHorarias_promocionesDescuentos_id_idx" ON "ReglasHorarias"("promocionesDescuentos_id");

-- CreateIndex
CREATE INDEX "TransaccionesDetalles_combo_id_idx" ON "TransaccionesDetalles"("combo_id");

-- AddForeignKey
ALTER TABLE "TransaccionesDetalles" ADD CONSTRAINT "TransaccionesDetalles_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "PromocionesDescuentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "PromocionesDescuentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocionSucursal" ADD CONSTRAINT "PromocionSucursal_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "PromocionesDescuentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocionSucursal" ADD CONSTRAINT "PromocionSucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglasHorarias" ADD CONSTRAINT "ReglasHorarias_promocionesDescuentos_id_fkey" FOREIGN KEY ("promocionesDescuentos_id") REFERENCES "PromocionesDescuentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: `valor` era texto y se parseaba a mano en cada cálculo ("20%" =
-- 20 por ciento; "5" = restar Bs 5). Se traduce a los campos tipados para que
-- las promociones que ya existen sigan cobrando EXACTAMENTE lo mismo.
UPDATE "PromocionesDescuentos"
   SET "modo_precio" = 'PORCENTAJE',
       "monto" = COALESCE(NULLIF(regexp_replace("valor", '[^0-9.]', '', 'g'), '')::numeric, 0)
 WHERE "valor" LIKE '%\%%';

UPDATE "PromocionesDescuentos"
   SET "modo_precio" = 'MONTO_DESCUENTO',
       "monto" = COALESCE(NULLIF(regexp_replace("valor", '[^0-9.]', '', 'g'), '')::numeric, 0)
 WHERE "valor" NOT LIKE '%\%%';
