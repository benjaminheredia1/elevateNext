-- Producto independiente por sucursal.
--
-- Un producto sigue siendo uno solo en el catálogo (no se duplican filas, y las
-- ventas de todos los locales se comparan contra el mismo producto), pero cada
-- sucursal puede sobrescribir su ficha. Las columnas nuevas son NULL = "hereda
-- del catálogo", así que todo lo que ya existe sigue funcionando igual.

-- Overrides de la ficha en cada local (nombre e imagen ya existían).
ALTER TABLE "ProductoSucursal" ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "calorias" INTEGER,
ADD COLUMN     "proteina" TEXT,
ADD COLUMN     "estado_publicacion" "EstadoPublicacion";

-- Categorías y marcas: sucursal_id NULL son las del catálogo, que heredan todos
-- los locales; con filas propias, el local usa las suyas.
ALTER TABLE "CategoriasProducto" ADD COLUMN     "sucursal_id" INTEGER;
ALTER TABLE "ProductoMarca" ADD COLUMN     "sucursal_id" INTEGER;

-- Los índices únicos nuevos incluyen la sucursal. Antes de crearlos se limpian
-- los duplicados que pudieran existir (la tabla de categorías no tenía único),
-- conservando la fila más antigua de cada par.
DELETE FROM "CategoriasProducto" a
  USING "CategoriasProducto" b
  WHERE a.id > b.id
    AND a."producto_id" = b."producto_id"
    AND a."categoria_id" = b."categoria_id"
    AND a."sucursal_id" IS NOT DISTINCT FROM b."sucursal_id";

DELETE FROM "ProductoMarca" a
  USING "ProductoMarca" b
  WHERE a.id > b.id
    AND a."producto_id" = b."producto_id"
    AND a."marca_id" = b."marca_id"
    AND a."sucursal_id" IS NOT DISTINCT FROM b."sucursal_id";

DROP INDEX "ProductoMarca_producto_id_marca_id_key";

CREATE INDEX "CategoriasProducto_producto_id_sucursal_id_idx" ON "CategoriasProducto"("producto_id", "sucursal_id");
CREATE UNIQUE INDEX "CategoriasProducto_producto_id_categoria_id_sucursal_id_key" ON "CategoriasProducto"("producto_id", "categoria_id", "sucursal_id");

CREATE INDEX "ProductoMarca_producto_id_sucursal_id_idx" ON "ProductoMarca"("producto_id", "sucursal_id");
CREATE UNIQUE INDEX "ProductoMarca_producto_id_marca_id_sucursal_id_key" ON "ProductoMarca"("producto_id", "marca_id", "sucursal_id");

ALTER TABLE "CategoriasProducto" ADD CONSTRAINT "CategoriasProducto_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductoMarca" ADD CONSTRAINT "ProductoMarca_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
