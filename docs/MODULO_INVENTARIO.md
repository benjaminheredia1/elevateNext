# MÓDULO INVENTARIO Y PRODUCTOS (paridad con el zip original)

> Detalle del módulo de **Inventario avanzado, Productos/Recetas y Analítica** que
> corresponde a la **Fase 5** del `ROADMAP_PRIORIZADO.md`. Fuente de verdad funcional:
> la app original en `elevate.zip` (mock/hardcoded) — replicar secciones y lógica de
> negocio con backend real, aunque hoy no haya datos.
>
> (Este documento absorbe el antiguo `PARITY_PLAN.md`.)

---

## A. Gap analysis — Secciones del admin (zip vs Next)

| Sección | Original (zip) | Next actual | Acción |
|---------|:---:|:---:|--------|
| Dashboard | ✅ rico (KPIs ejecutivos) | ✅ básico | Enriquecer |
| **Analítica & Finanzas** | ✅ | ❌ | **Crear** (charts, food cost, ingeniería de menú) |
| Pedidos | ✅ | ✅ | Ajustes (canal, menú, descuento stock) |
| Productos | ✅ + **Wizard** alta | ✅ simple | Agregar wizard + ficha técnica |
| **Inventario** | ✅ rico (sub-recetas, mermas, conteos, alertas) | ⚠️ "Insumos" básico | **Ampliar** a Inventario completo |
| Deliverys | ✅ | ✅ | Ajustes (GPS real) |
| Categorías | ✅ | ✅ | OK |
| **Configuración** | ✅ alertas WhatsApp + negocio | ⚠️ solo ubicación sucursal | **Ampliar** |
| Horarios/Promos | — | ✅ (extra de Next) | Mantener |
| Caja / Gastos | (en negocio) | ⚠️ API sin UI | Cubierto por `MODULO_CAJERO_CONTADOR.md` |

---

## B. Gap analysis — Modelo de datos (Prisma vs dominio del zip)

| Entidad | Falta en el schema actual |
|---------|----------------------------|
| **Insumo** | `punto_critico` (2º umbral, hoy solo `stock_minimo`=reorder), `proveedor`, `proveedor_telefono`, `uso_diario_promedio`, `rendimiento` (yield de insumos mixtos/sub-recetas), `categoria_insumo` |
| **MovimientoInterno** | tipos `VENTA`, `MERMA`, `AJUSTE` (hoy solo INGRESO/EGRESO/PRODUCCION); campos `costo_unitario`, `transaccion_id`, `responsable` |
| **Producto** | `tipo` (ELABORADO/REVENTA), `estado_publicacion` (BORRADOR/PUBLICADO/ARCHIVADO), `insumo_reventa_id`, `ventas_acumuladas`, `calorias`, `proteina` |
| **Marca/Menú** | No existe. Falta `Marca` (elevate/fitbull) + `ProductoMarca` (multi-menú) |
| **Alertas** | No existe. Falta `ConfiguracionAlertas` (WhatsApp) + `RegistroAlerta` (log) |

> **Sub-recetas:** el zip usa "sub-recetas" (preparaciones intermedias con `yield`).
> En Next ya existe el concepto vía `Insumo.es_mixto` + `InsumoMixtoDetalle`. Se
> **reutiliza** ese modelo añadiendo `rendimiento` (yield) al insumo mixto. No se crea
> tabla nueva de sub-recetas. ✅ buena práctica (no duplicar conceptos).
>
> Estas extensiones de schema se integran con `BASE_DE_DATOS.md` (no las repite; este
> documento es la referencia funcional del dominio de inventario).

---

## C. Lógica de negocio a implementar (del store del zip)

1. **Costo promedio ponderado** al registrar compra de insumo.
2. **Descuento automático de stock** al pasar pedido a EN_PREPARACION/ENTREGADO,
   resolviendo recetas → insumos mixtos en cascada, generando `MovimientoInterno`
   tipo VENTA. Marca anti-doble-descuento.
3. **Estados derivados de insumo**: ok / bajo / crítico / agotado (según
   `stock_minimo` y `punto_critico`).
4. **Costo de ficha técnica** del producto (Σ insumos resueltos) y **food cost %**.
5. **Porciones armables** (buildable) = stock / receta.
6. **Ingeniería de menú** (Estrella/Caballo/Puzzle/Perro) por ventas × margen.
7. **Movimientos**: compra, merma, conteo físico (ajuste con varianza).
8. **Alertas WhatsApp** con anti-spam, horario silencioso, plantilla (modo demo
   primero, envío real después).

---

## D. Sub-fases (dentro de la Fase 5 del roadmap maestro)

### 5.0 — Extensión del schema de inventario
Extender Prisma (Insumo, MovimientoInterno, Producto, Marca/ProductoMarca,
ConfiguracionAlertas, RegistroAlerta) + migración + seed de marcas.
> Esta sub-fase puede adelantarse junto con la Fase 0 fundacional si conviene
> agrupar migraciones (ver `ROADMAP_PRIORIZADO.md`).

### 5.1 — Backend (APIs y lógica)
- Movimientos de inventario: compra (costo promedio), merma, conteo.
- Descuento de stock automático en cambio de estado de pedido (cascada recetas).
- Endpoint de KPIs/Analítica (ventas día/mes, food cost, ingeniería de menú, heatmap)
  calculados desde `Transaccion`/`TransaccionesDetalles`.
- CRUD de ConfiguracionAlertas + RegistroAlerta.
- Crear producto con ficha técnica + marcas + tipo (para el wizard).

### 5.2 — Front (secciones)
- Navegación agrupada (ya contemplada en `FRONTEND_IMPLEMENTACION.md`).
- `AdminAnalytics` (recharts — ya es dependencia).
- Ampliar `AdminInsumos` → Inventario completo (sub-recetas, movimientos, acciones,
  cobertura, porciones armables, estados).
- `AdminProductWizard` (alta multi-paso).
- Ampliar `AdminSettings` (alertas WhatsApp + negocio).

---

## E. Decisiones de diseño

- ✅ Reutilizar `Insumo.es_mixto` como sub-receta (no tabla nueva).
- ✅ Multi-menú vía tabla `ProductoMarca` (un producto puede estar en varias marcas).
- ✅ `ConfiguracionAlertas` como singleton (como `Configuracion`).
- ✅ Logout persistente actual se conserva (el del zip falla).
- ⬜ Datos: el front se conecta a backend real; sin datos muestra estados vacíos.

---

## F. Progreso (trabajo ya realizado en sesiones previas)

- [x] BD local en Docker
- [x] Variables de entorno (JWT)
- [x] Fix Framer Motion (agregar producto)
- [ ] 5.0 — schema de inventario
- [ ] 5.1 — backend
- [ ] 5.2 — front

> El progreso global del programa se lleva en `ROADMAP_PRIORIZADO.md`.
