-- Baja de insumo y revisión de producto POR SUCURSAL.
--
-- La receta es de cada local, así que la baja de un insumo y la revisión que
-- dispara también tienen que serlo: que en Sur se caiga un insumo no dice nada
-- de la ficha de Fitbull. `Insumo.activo` y `Producto.en_revision` quedan como
-- agregados del negocio para los reportes que todavía los leen, pero la verdad
-- para operar pasa a ser la fila del local.

-- Baja del insumo en el local.
ALTER TABLE "StockSucursal" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fecha_baja" TIMESTAMP(3),
ADD COLUMN     "motivo_baja" TEXT;

-- Revisión del producto en el local.
ALTER TABLE "ProductoSucursal" ADD COLUMN     "en_revision" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revision_desde" TIMESTAMP(3),
ADD COLUMN     "motivo_revision" TEXT,
ADD COLUMN     "insumo_causa_revision_id" INTEGER;

-- Backfill: lo que hoy está de baja o en revisión sigue estándolo, en todas las
-- sucursales donde exista. Marcar solo la principal dejaría el insumo utilizable
-- en las demás, y el deploy no debe reactivar nada por su cuenta: si un local
-- quiere volver a usarlo, se reactiva a mano desde su inventario.
UPDATE "StockSucursal" ss
   SET "activo" = false,
       "fecha_baja" = i."fecha_baja",
       "motivo_baja" = i."motivo_baja"
  FROM "Insumo" i
 WHERE ss."insumo_id" = i."id"
   AND i."activo" = false;

UPDATE "ProductoSucursal" ps
   SET "en_revision" = true,
       "revision_desde" = p."revision_desde",
       "motivo_revision" = p."motivo_revision",
       "insumo_causa_revision_id" = p."insumo_causa_revision_id"
  FROM "Producto" p
 WHERE ps."producto_id" = p."id"
   AND p."en_revision" = true;
