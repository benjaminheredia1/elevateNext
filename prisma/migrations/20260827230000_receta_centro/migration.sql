-- Fase 2 del Centro de Producción: BOM de producción.
-- Solo SQL aditivo: tabla nueva, sin tocar nada existente.

CREATE TABLE "RecetaCentro" (
    "id" SERIAL NOT NULL,
    "centro_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "cantidad_utilizada" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecetaCentro_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecetaCentro_centro_id_producto_id_insumo_id_key" ON "RecetaCentro"("centro_id", "producto_id", "insumo_id");
CREATE INDEX "RecetaCentro_centro_id_producto_id_idx" ON "RecetaCentro"("centro_id", "producto_id");

ALTER TABLE "RecetaCentro" ADD CONSTRAINT "RecetaCentro_centro_id_fkey" FOREIGN KEY ("centro_id") REFERENCES "CentroProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecetaCentro" ADD CONSTRAINT "RecetaCentro_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecetaCentro" ADD CONSTRAINT "RecetaCentro_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
