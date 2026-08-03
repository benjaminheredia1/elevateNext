-- Baja de producto por sucursal.
--
-- Hasta ahora la baja lógica vivía en `Producto` (estado_publicacion = BAJA), o
-- sea que sacar un plato del menú de un local lo sacaba del de todos. Con estas
-- dos columnas la baja pasa a ser del local: cada sucursal retira lo suyo, con
-- su motivo y su fecha, y puede restaurarlo sin tocar a las demás.
--
-- Ambas nullable y sin backfill: NULL significa "nunca fue dado de baja acá",
-- que es el estado correcto de todo lo que existe hoy. Las bajas globales ya
-- registradas en `Producto` siguen valiendo como retiro del catálogo completo.

ALTER TABLE "ProductoSucursal" ADD COLUMN "fecha_baja" TIMESTAMP(3),
ADD COLUMN "motivo_baja" TEXT;
