-- Fase 3 multi-sucursal: catalogo compartido, precio y receta por sucursal.
--
-- El producto sigue siendo uno solo (identidad, categoria, foto) para poder
-- comparar su rendimiento entre locales. Lo que pasa a ser de cada sucursal es
-- el precio, la disponibilidad y la ficha tecnica.
--
-- Nada se borra: el precio y la disponibilidad actuales de Producto se copian a
-- la sucursal principal, y las recetas existentes se le asignan a ella.

-- ── 1. Habilitacion por sucursal ────────────────────────────────────────
CREATE TABLE "ProductoSucursal" (
  "id"          SERIAL       NOT NULL,
  "producto_id" INTEGER      NOT NULL,
  "sucursal_id" INTEGER      NOT NULL,
  "precio"      DECIMAL(12,2) NOT NULL,
  "disponible"  BOOLEAN      NOT NULL DEFAULT true,
  "nombre"      TEXT,
  "imagen_url"  TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductoSucursal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductoSucursal_producto_id_sucursal_id_key"
  ON "ProductoSucursal"("producto_id", "sucursal_id");
CREATE INDEX "ProductoSucursal_sucursal_id_disponible_idx"
  ON "ProductoSucursal"("sucursal_id", "disponible");

ALTER TABLE "ProductoSucursal" ADD CONSTRAINT "ProductoSucursal_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductoSucursal" ADD CONSTRAINT "ProductoSucursal_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: todo el catalogo actual queda habilitado en la sucursal principal,
-- con el precio y la disponibilidad que ya tenia.
INSERT INTO "ProductoSucursal" ("producto_id", "sucursal_id", "precio", "disponible", "update_at")
SELECT p."id",
       (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1),
       p."precio",
       p."disponible",
       CURRENT_TIMESTAMP
FROM "Producto" p
WHERE EXISTS (SELECT 1 FROM "Sucursal");

-- ── 2. Receta por sucursal ──────────────────────────────────────────────
ALTER TABLE "RecetasProducto" ADD COLUMN "sucursal_id" INTEGER;

UPDATE "RecetasProducto"
SET "sucursal_id" = (SELECT "id" FROM "Sucursal" ORDER BY "id" ASC LIMIT 1)
WHERE "sucursal_id" IS NULL;

ALTER TABLE "RecetasProducto" ALTER COLUMN "sucursal_id" SET NOT NULL;

-- Una sola fila por (producto, insumo, sucursal): evita duplicar un insumo en
-- la misma ficha tecnica al copiar recetas entre sucursales.
CREATE UNIQUE INDEX "RecetasProducto_producto_id_insumo_id_sucursal_id_key"
  ON "RecetasProducto"("producto_id", "insumo_id", "sucursal_id");
CREATE INDEX "RecetasProducto_sucursal_id_idx" ON "RecetasProducto"("sucursal_id");

ALTER TABLE "RecetasProducto" ADD CONSTRAINT "RecetasProducto_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
