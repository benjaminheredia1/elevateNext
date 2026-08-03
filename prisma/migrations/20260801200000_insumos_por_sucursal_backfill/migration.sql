-- Insumos por sucursal: red de seguridad antes de filtrar el inventario.
--
-- A partir de ahora el panel de inventario lista SOLO los insumos que el local
-- maneja, y "manejar un insumo" es tener su fila en StockSucursal. Los insumos
-- anteriores a multi-sucursal pueden no tener ninguna: sin esto desaparecerían
-- de la pantalla.
--
-- No borra ni modifica nada: solo AGREGA la fila faltante en la sucursal
-- principal (la activa más antigua) con stock en cero y los niveles de alerta
-- del catálogo. Es idempotente — volver a correrla no inserta duplicados.

INSERT INTO "StockSucursal" (
  "insumo_id", "sucursal_id", "stock_actual", "costo_promedio",
  "stock_minimo", "punto_critico", "created_at", "update_at"
)
SELECT
  i."id",
  (SELECT s."id" FROM "Sucursal" s WHERE s."activa" = true ORDER BY s."id" ASC LIMIT 1),
  -- El stock del catálogo es el agregado del negocio. Si el insumo no tiene
  -- ninguna sucursal, ese total está entero en la principal: llevarlo a cero
  -- haría desaparecer existencias reales del inventario.
  COALESCE(i."stock_actual", 0),
  COALESCE(i."costo_promedio", 0),
  COALESCE(i."stock_minimo", 0),
  COALESCE(i."punto_critico", 0),
  NOW(),
  NOW()
FROM "Insumo" i
WHERE NOT EXISTS (SELECT 1 FROM "StockSucursal" ss WHERE ss."insumo_id" = i."id")
  AND EXISTS (SELECT 1 FROM "Sucursal" s WHERE s."activa" = true);
