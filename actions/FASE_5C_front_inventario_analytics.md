# FASE 5 · C — Front: Inventario completo + Analítica + Product Wizard + Settings de alertas

> Depende de 5B. Ref: `docs/MODULO_INVENTARIO.md` §D.5.2, `docs/FRONTEND_IMPLEMENTACION.md`.

## PASO 1 — Inventario completo: ampliar `components/admin/AdminInsumos.tsx`
- Tabla de insumos: stock, nivel %, mínimo, costo prom., estado (`StatusBadge`:
  crítico/bajo/ok/agotado), categoría; filtros por estado y categoría; búsqueda.
- Acciones por insumo: **Registrar compra** (modal: cantidad, costo unitario),
  **Merma** (modal), **Conteo físico** (modal). Consumir endpoints de 5B.
- Botón "+ Insumo" y "Registrar compra" global. Cobertura en días
  (stock/uso_diario) y porciones armables donde aplique. Export Excel.
- Sub-recetas (insumos mixtos) reutilizando `AdminInsumos`/insumos mixtos existente +
  `rendimiento`.

## PASO 2 — Recetas / ficha técnica
Pantalla producto→ingredientes (cantidad, costo por ingrediente), costo de receta,
precio de venta, **margen** y **food cost %** (como la captura "RECETAS" del zip).
Reutilizar `RecetasProducto` + el cálculo de 5B.

## PASO 3 — Analítica & Finanzas: `app/admin/analitica/page.tsx` (NUEVO)
Consumir `GET /api/admin/analitica`. Con Recharts (ya instalado):
- KPIs (ventas, utilidad, food cost, ticket promedio).
- Tendencia mensual (línea), mix por categoría/marca (dona), **matriz de ingeniería
  de menú** (scatter Estrella/Caballo/Puzzle/Perro), heatmap de horas pico.
- `RangeFilter`. Agregar item "Analítica" al grupo NEGOCIO/FINANZAS del sidebar.

## PASO 4 — Product Wizard: `components/admin/AdminProductWizard.tsx` (NUEVO)
Alta multi-paso: (1) datos básicos + tipo (Elaborado/Reventa), (2) marcas
(elevate/fitbull, multi-select), (3) receta/ficha técnica (agregar insumos/sub-recetas
con cantidades) o insumo de reventa, (4) publicación (Borrador/Publicado). Submit →
endpoint de creación de 5B. Integrar en `AdminProducts`.

## PASO 5 — Settings de alertas: ampliar `app/admin/settings`
Sección "Alertas de inventario (WhatsApp)": habilitar, destinatarios, horario
silencioso, intervalo, plantilla. Consumir `/api/admin/configuracion-alertas`.

## Criterios de aceptación
- [ ] Inventario permite compra/merma/conteo desde la UI y refleja stock/costo.
- [ ] Recetas muestra costo, margen y food cost.
- [ ] Analítica renderiza gráficos (aunque haya pocos datos).
- [ ] Wizard crea productos con receta + marcas + estado.
- [ ] Settings guarda la config de alertas.

> Con esto **cierra la Fase 5** (inventario avanzado + analítica, paridad con el zip).
