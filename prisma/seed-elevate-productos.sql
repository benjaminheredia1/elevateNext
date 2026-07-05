-- =============================================================================
-- Seed: Productos Elevate Snack
-- Ejecutar en la consola SQL de Prisma Postgres (o cualquier cliente SQL)
-- Es IDEMPOTENTE: no duplica si ya existen los registros
-- =============================================================================

DO $$
DECLARE
  -- Categorías
  cat_snack    INT;
  cat_bolitas  INT;
  cat_terciad  INT;

  -- Marca
  marca_elevate INT;

  -- Insumos elaborados
  i_tortilla       INT;
  i_lomito         INT;
  i_ceb_blanca     INT;
  i_mozza          INT;
  i_pechuga        INT;
  i_pico_gallo     INT;
  i_pan_ciabata    INT;
  i_champinones    INT;
  i_ceb_caramel    INT;
  i_pesto          INT;
  i_tomate         INT;
  i_avena          INT;
  i_proteina       INT;
  i_banana         INT;
  i_huevo          INT;
  i_polvo_hornear  INT;
  i_vainilla       INT;
  i_frutilla       INT;
  i_miel           INT;
  i_mant_mani      INT;
  i_clara          INT;
  i_agua           INT;
  i_manzana        INT;
  i_canela         INT;
  i_coco           INT;
  i_sesamo         INT;
  i_chocolate      INT;
  i_yogurt         INT;
  i_aceite_coco    INT;
  i_cocoa          INT;
  i_mani           INT;

  -- Insumos terciados (stock de reventa)
  i_protein_crisp  INT;
  i_darkbar        INT;
  i_c4             INT;
  i_b4             INT;
  i_powerade       INT;
  i_cocacola       INT;
  i_agua_vital     INT;
  i_agua_gas       INT;
  i_sante_sport    INT;
  i_sante_zero     INT;
  i_alfajor        INT;
  i_alfajor_bono   INT;

  -- Productos
  p_id INT;

BEGIN

-- =============================================================================
-- 1. CATEGORÍAS
-- =============================================================================

  INSERT INTO "Categoria" (nombre, detalles, created_at, update_at)
    VALUES ('Snack Elevate', 'Snack Elevate', NOW(), NOW())
    ON CONFLICT DO NOTHING;
  SELECT id INTO cat_snack FROM "Categoria" WHERE nombre = 'Snack Elevate';

  INSERT INTO "Categoria" (nombre, detalles, created_at, update_at)
    VALUES ('Bolitas Proteicas', 'Bolitas Proteicas', NOW(), NOW())
    ON CONFLICT DO NOTHING;
  SELECT id INTO cat_bolitas FROM "Categoria" WHERE nombre = 'Bolitas Proteicas';

  INSERT INTO "Categoria" (nombre, detalles, created_at, update_at)
    VALUES ('Terciados', 'Terciados', NOW(), NOW())
    ON CONFLICT DO NOTHING;
  SELECT id INTO cat_terciad FROM "Categoria" WHERE nombre = 'Terciados';

-- =============================================================================
-- 2. MARCA ELEVATE
-- =============================================================================

  SELECT id INTO marca_elevate FROM "Marca" WHERE key = 'elevate';

-- =============================================================================
-- 3. INSUMOS (ingredientes elaborados)
-- =============================================================================

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Tortilla de maíz', 0, 0, 'UNIDAD', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_tortilla FROM "Insumo" WHERE nombre = 'Tortilla de maíz';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Lomito', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_lomito FROM "Insumo" WHERE nombre = 'Lomito';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Cebolla blanca', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_ceb_blanca FROM "Insumo" WHERE nombre = 'Cebolla blanca';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Mozzarella (lonja)', 0, 0, 'UNIDAD', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_mozza FROM "Insumo" WHERE nombre = 'Mozzarella (lonja)';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Pechuga de pollo', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_pechuga FROM "Insumo" WHERE nombre = 'Pechuga de pollo';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Pico de gallo', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_pico_gallo FROM "Insumo" WHERE nombre = 'Pico de gallo';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Pan ciabata', 0, 0, 'UNIDAD', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_pan_ciabata FROM "Insumo" WHERE nombre = 'Pan ciabata';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Champiñones', 0, 0, 'UNIDAD', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_champinones FROM "Insumo" WHERE nombre = 'Champiñones';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Cebolla caramelizada', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_ceb_caramel FROM "Insumo" WHERE nombre = 'Cebolla caramelizada';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Salsa pesto', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_pesto FROM "Insumo" WHERE nombre = 'Salsa pesto';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Tomate', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_tomate FROM "Insumo" WHERE nombre = 'Tomate';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Avena', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_avena FROM "Insumo" WHERE nombre = 'Avena';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Proteína en polvo', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_proteina FROM "Insumo" WHERE nombre = 'Proteína en polvo';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Banana', 0, 0, 'UNIDAD', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_banana FROM "Insumo" WHERE nombre = 'Banana';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Huevo entero', 0, 0, 'UNIDAD', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_huevo FROM "Insumo" WHERE nombre = 'Huevo entero';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Polvo de hornear', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_polvo_hornear FROM "Insumo" WHERE nombre = 'Polvo de hornear';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Vainilla', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_vainilla FROM "Insumo" WHERE nombre = 'Vainilla';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Frutilla', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_frutilla FROM "Insumo" WHERE nombre = 'Frutilla';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Miel', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_miel FROM "Insumo" WHERE nombre = 'Miel';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Mantequilla de maní', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_mant_mani FROM "Insumo" WHERE nombre = 'Mantequilla de maní';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Clara de huevo', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_clara FROM "Insumo" WHERE nombre = 'Clara de huevo';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Agua', 0, 0, 'ML', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_agua FROM "Insumo" WHERE nombre = 'Agua';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Manzana roja', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_manzana FROM "Insumo" WHERE nombre = 'Manzana roja';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Canela', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_canela FROM "Insumo" WHERE nombre = 'Canela';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Coco rallado', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_coco FROM "Insumo" WHERE nombre = 'Coco rallado';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Sésamo', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_sesamo FROM "Insumo" WHERE nombre = 'Sésamo';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Chocolate cobertura', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_chocolate FROM "Insumo" WHERE nombre = 'Chocolate cobertura';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Yogurt griego', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_yogurt FROM "Insumo" WHERE nombre = 'Yogurt griego';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Aceite de coco', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_aceite_coco FROM "Insumo" WHERE nombre = 'Aceite de coco';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Cocoa amarga', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_cocoa FROM "Insumo" WHERE nombre = 'Cocoa amarga';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Maní triturado', 0, 0, 'GR', 0, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_mani FROM "Insumo" WHERE nombre = 'Maní triturado';

-- =============================================================================
-- 4. INSUMOS DE STOCK para productos TERCIADOS
-- =============================================================================

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Protein Crisp Bar', 0, 0, 'UNIDAD', 12.80, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_protein_crisp FROM "Insumo" WHERE nombre = 'Protein Crisp Bar';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('DarkBar', 0, 0, 'UNIDAD', 20, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_darkbar FROM "Insumo" WHERE nombre = 'DarkBar';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('C4', 0, 0, 'UNIDAD', 28, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_c4 FROM "Insumo" WHERE nombre = 'C4';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('B4', 0, 0, 'UNIDAD', 20, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_b4 FROM "Insumo" WHERE nombre = 'B4';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Powerade 473ml', 0, 0, 'UNIDAD', 4.5, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_powerade FROM "Insumo" WHERE nombre = 'Powerade 473ml';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Coca Cola Zero', 0, 0, 'UNIDAD', 4.5, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_cocacola FROM "Insumo" WHERE nombre = 'Coca Cola Zero';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Agua Vital 600ml', 0, 0, 'UNIDAD', 4.5, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_agua_vital FROM "Insumo" WHERE nombre = 'Agua Vital 600ml';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Agua Vital 600ml (con gas)', 0, 0, 'UNIDAD', 4.5, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_agua_gas FROM "Insumo" WHERE nombre = 'Agua Vital 600ml (con gas)';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Santé Sport', 0, 0, 'UNIDAD', 6.3, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_sante_sport FROM "Insumo" WHERE nombre = 'Santé Sport';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Santé Zero', 0, 0, 'UNIDAD', 6.5, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_sante_zero FROM "Insumo" WHERE nombre = 'Santé Zero';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Alfajor Nené Rice', 0, 0, 'UNIDAD', 17.5, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_alfajor FROM "Insumo" WHERE nombre = 'Alfajor Nené Rice';

  INSERT INTO "Insumo" (nombre, stock_actual, stock_minimo, unidad_medida, costo_promedio, es_mixto, punto_critico, created_at, update_at)
    VALUES ('Alfajor Nené Rice (Bonobom)', 0, 0, 'UNIDAD', 18, false, 0, NOW(), NOW()) ON CONFLICT DO NOTHING;
  SELECT id INTO i_alfajor_bono FROM "Insumo" WHERE nombre = 'Alfajor Nené Rice (Bonobom)';

-- =============================================================================
-- 5. PRODUCTOS ELABORADOS + RECETAS
-- =============================================================================

  -- Beef Quesadilla
  INSERT INTO "Producto" (nombre, descripcion, precio, calorias, proteina, tipo, estado_publicacion, disponible, ventas_acumuladas, created_at, update_at)
    SELECT 'Beef Quesadilla', '295kcal · 32P / 16C / 11G', 35, 295, '32P/16C/11G', 'ELABORADO', 'PUBLICADO', true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Beef Quesadilla');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Beef Quesadilla';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_snack, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_snack AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_tortilla,   1,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_tortilla);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_lomito,     120, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_lomito);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_ceb_blanca, 50,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_ceb_blanca);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_mozza,      1,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_mozza);

  -- Chicken Quesadilla
  INSERT INTO "Producto" (nombre, descripcion, precio, calorias, proteina, tipo, estado_publicacion, disponible, ventas_acumuladas, created_at, update_at)
    SELECT 'Chicken Quesadilla', '271kcal · 34P / 13C / 8G', 25, 271, '34P/13C/8G', 'ELABORADO', 'PUBLICADO', true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Chicken Quesadilla');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Chicken Quesadilla';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_snack, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_snack AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_tortilla,   1,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_tortilla);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_pechuga,    120, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_pechuga);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_pico_gallo, 20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_pico_gallo);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_mozza,      1,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_mozza);

  -- Steak & Mozzarella Panini
  INSERT INTO "Producto" (nombre, descripcion, precio, calorias, proteina, tipo, estado_publicacion, disponible, ventas_acumuladas, created_at, update_at)
    SELECT 'Steak & Mozzarella Panini', '510kcal · 37P / 43C / 20G', 35, 510, '37P/43C/20G', 'ELABORADO', 'PUBLICADO', true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Steak & Mozzarella Panini');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Steak & Mozzarella Panini';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_snack, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_snack AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_pan_ciabata,  1,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_pan_ciabata);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_lomito,       120, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_lomito);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_champinones,  15,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_champinones);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_ceb_caramel,  15,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_ceb_caramel);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_mozza,        1,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_mozza);

  -- Panini Pesto Pollo
  INSERT INTO "Producto" (nombre, descripcion, precio, calorias, proteina, tipo, estado_publicacion, disponible, ventas_acumuladas, created_at, update_at)
    SELECT 'Panini Pesto Pollo', '526kcal · 41P / 39C / 22G', 25, 526, '41P/39C/22G', 'ELABORADO', 'PUBLICADO', true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Panini Pesto Pollo');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Panini Pesto Pollo';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_snack, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_snack AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_pan_ciabata, 1,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_pan_ciabata);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_pesto,       20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_pesto);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_pechuga,     120, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_pechuga);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_tomate,      20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_tomate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_mozza,       1,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_mozza);

  -- Pancakes
  INSERT INTO "Producto" (nombre, descripcion, precio, calorias, proteina, tipo, estado_publicacion, disponible, ventas_acumuladas, created_at, update_at)
    SELECT 'Pancakes', '567kcal · 29P / 61C / 23G · Porción: 3 unidades', 25, 567, '29P/61C/23G', 'ELABORADO', 'PUBLICADO', true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Pancakes');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Pancakes';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_snack, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_snack AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_avena,         50,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_avena);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_proteina,      10,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_proteina);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_banana,        1,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_banana);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_huevo,         2,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_huevo);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_polvo_hornear, 5,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_polvo_hornear);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_vainilla,      5,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_vainilla);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_frutilla,      20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_frutilla);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_miel,          15,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_miel);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_mant_mani,     15,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_mant_mani);

  -- Crepes
  INSERT INTO "Producto" (nombre, descripcion, precio, calorias, proteina, tipo, estado_publicacion, disponible, ventas_acumuladas, created_at, update_at)
    SELECT 'Crepes', '173kcal · 20P / 22C / 1G · Porción: 2 unidades', 25, 173, '20P/22C/1G', 'ELABORADO', 'PUBLICADO', true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Crepes');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Crepes';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_snack, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_snack AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_clara,    120, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_clara);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_proteina, 10,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_proteina);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_agua,     85,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_agua);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_vainilla, 6,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_vainilla);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_manzana,  60,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_manzana);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_canela,   2,   NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_canela);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_miel,     15,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_miel);

-- =============================================================================
-- 6. BOLITAS PROTEICAS
-- =============================================================================

  -- Chocolate Protein Truffles
  INSERT INTO "Producto" (nombre, descripcion, precio, calorias, proteina, tipo, estado_publicacion, disponible, ventas_acumuladas, created_at, update_at)
    SELECT 'Chocolate Protein Truffles', '156kcal · 6P / 16C / 7G · Precio por unidad', 8, 156, '6P/16C/7G', 'ELABORADO', 'PUBLICADO', true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Chocolate Protein Truffles');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Chocolate Protein Truffles';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_bolitas, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_bolitas AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_avena,     150, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_avena);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_coco,      10,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_coco);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_sesamo,    10,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_sesamo);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_mant_mani, 40,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_mant_mani);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_proteina,  20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_proteina);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_miel,      20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_miel);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_chocolate, 80,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_chocolate);

  -- Coconut Protein Truffles
  INSERT INTO "Producto" (nombre, descripcion, precio, calorias, proteina, tipo, estado_publicacion, disponible, ventas_acumuladas, created_at, update_at)
    SELECT 'Coconut Protein Truffles', '120kcal · 3P / 5C / 10G · Precio por unidad', 8, 120, '3P/5C/10G', 'ELABORADO', 'PUBLICADO', true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Coconut Protein Truffles');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Coconut Protein Truffles';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_bolitas, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_bolitas AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_coco,       120, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_coco);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_proteina,   20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_proteina);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_yogurt,     60,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_yogurt);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_miel,       20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_miel);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_aceite_coco,20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_aceite_coco);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_mant_mani,  10,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_mant_mani);

  -- Brownie Protein Truffles
  INSERT INTO "Producto" (nombre, descripcion, precio, calorias, proteina, tipo, estado_publicacion, disponible, ventas_acumuladas, created_at, update_at)
    SELECT 'Brownie Protein Truffles', '104kcal · 6P / 13C / 4G · Precio por unidad', 8, 104, '6P/13C/4G', 'ELABORADO', 'PUBLICADO', true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Brownie Protein Truffles');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Brownie Protein Truffles';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_bolitas, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_bolitas AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_avena,     120, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_avena);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_cocoa,     40,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_cocoa);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_mant_mani, 40,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_mant_mani);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_yogurt,    30,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_yogurt);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_proteina,  20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_proteina);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_miel,      20,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_miel);
  INSERT INTO "RecetasProducto" (producto_id, insumo_id, cantidad_utilizada, created_at, update_at)
    SELECT p_id, i_mani,      15,  NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "RecetasProducto" WHERE producto_id = p_id AND insumo_id = i_mani);

-- =============================================================================
-- 7. PRODUCTOS TERCIADOS (REVENTA)
-- =============================================================================

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'Protein Crisp Bar', 'Protein Crisp Bar', 20, 'REVENTA', 'PUBLICADO', true, 0, i_protein_crisp, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Protein Crisp Bar');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Protein Crisp Bar';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'DarkBar', 'DarkBar', 30, 'REVENTA', 'PUBLICADO', true, 0, i_darkbar, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'DarkBar');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'DarkBar';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'C4', 'C4', 32, 'REVENTA', 'PUBLICADO', true, 0, i_c4, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'C4');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'C4';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'B4', 'B4', 28, 'REVENTA', 'PUBLICADO', true, 0, i_b4, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'B4');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'B4';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'Powerade 473ml', 'Powerade 473ml', 10, 'REVENTA', 'PUBLICADO', true, 0, i_powerade, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Powerade 473ml');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Powerade 473ml';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'Coca Cola Zero', 'Coca Cola Zero', 10, 'REVENTA', 'PUBLICADO', true, 0, i_cocacola, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Coca Cola Zero');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Coca Cola Zero';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'Agua Vital 600ml', 'Agua Vital 600ml', 10, 'REVENTA', 'PUBLICADO', true, 0, i_agua_vital, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Agua Vital 600ml');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Agua Vital 600ml';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'Agua Vital 600ml (con gas)', 'Agua Vital 600ml (con gas)', 10, 'REVENTA', 'PUBLICADO', true, 0, i_agua_gas, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Agua Vital 600ml (con gas)');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Agua Vital 600ml (con gas)';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'Santé Sport', 'Santé Sport', 10, 'REVENTA', 'PUBLICADO', true, 0, i_sante_sport, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Santé Sport');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Santé Sport';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'Santé Zero', 'Santé Zero', 10, 'REVENTA', 'PUBLICADO', true, 0, i_sante_zero, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Santé Zero');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Santé Zero';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'Alfajor Nené Rice', 'Alfajor Nené Rice', 25, 'REVENTA', 'PUBLICADO', true, 0, i_alfajor, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Alfajor Nené Rice');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Alfajor Nené Rice';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

  INSERT INTO "Producto" (nombre, descripcion, precio, tipo, estado_publicacion, disponible, ventas_acumuladas, insumo_reventa_id, created_at, update_at)
    SELECT 'Alfajor Nené Rice (Bonobom)', 'Alfajor Nené Rice (Bonobom)', 25, 'REVENTA', 'PUBLICADO', true, 0, i_alfajor_bono, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM "Producto" WHERE nombre = 'Alfajor Nené Rice (Bonobom)');
  SELECT id INTO p_id FROM "Producto" WHERE nombre = 'Alfajor Nené Rice (Bonobom)';
  INSERT INTO "CategoriasProducto" (categoria_id, producto_id, created_at, update_at)
    SELECT cat_terciad, p_id, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "CategoriasProducto" WHERE categoria_id = cat_terciad AND producto_id = p_id);
  INSERT INTO "ProductoMarca" (producto_id, marca_id)
    SELECT p_id, marca_elevate WHERE marca_elevate IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductoMarca" WHERE producto_id = p_id AND marca_id = marca_elevate);

END $$;
