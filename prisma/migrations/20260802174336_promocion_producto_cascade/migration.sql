-- DropForeignKey
ALTER TABLE "PromocionProducto" DROP CONSTRAINT "PromocionProducto_promocion_descuentos_id_fkey";

-- CreateIndex
CREATE INDEX "PromocionProducto_promocion_descuentos_id_idx" ON "PromocionProducto"("promocion_descuentos_id");

-- AddForeignKey
ALTER TABLE "PromocionProducto" ADD CONSTRAINT "PromocionProducto_promocion_descuentos_id_fkey" FOREIGN KEY ("promocion_descuentos_id") REFERENCES "PromocionesDescuentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
