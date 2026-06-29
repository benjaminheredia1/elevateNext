# CONTEXTO DEL PROYECTO — Elevate Admin (Next.js 16)

## Huecos críticos de integración real (pendiente para producción)

El admin y gran parte del frontend ya están conectados a APIs reales y BD, pero **no asumir que el flujo completo pedido → inventario → finanzas → clientes está 100% cerrado**. Antes de declarar producción, cerrar estos puntos:

### 1. Riesgo de doble descuento de insumos
- `POST /api/pedidos` actualmente crea la transacción y **descuenta stock inmediatamente** usando recetas, creando `MovimientoInterno` tipo `PRODUCCION`.
- `PUT /api/pedidos/[id]` también descuenta stock al cambiar estado a `EN_PREPARACION` o `ENTREGADO`, usando `descontarStockPorTransaccion()` y creando `MovimientoInterno` tipo `VENTA`.
- Resultado posible: si un pedido del menú se crea y luego admin lo pasa a preparación/entregado, puede descontar dos veces.
- Acción recomendada: dejar **un solo punto de descuento**, idealmente el servicio `lib/server/inventario/descuento-stock.service.ts` con anti-doble-descuento por `transaccion_id`. Quitar el descuento directo de `POST /api/pedidos` o hacer que use el mismo servicio y mismo tipo de movimiento.

### 2. Compras del menú no quedan vinculadas de forma confiable a `Cliente`
- `POST /api/pedidos` guarda `cliente_nombre`, `cliente_telefono`, `cliente_direccion`, etc., pero no garantiza crear/buscar `Cliente` ni asignar `cliente_id`.
- Las métricas nuevas de `/admin/clientes` se basan en `Cliente.transacciones`; si las compras públicas quedan sin `cliente_id`, no aparecerán en fidelización.
- Acción recomendada: en `POST /api/pedidos`, buscar cliente por teléfono/nombre, crear si no existe, y setear `cliente_id` en `Transaccion`.

### 3. Finanzas/caja no queda garantizada para pedidos online
- La compra pública crea `Transaccion`, pero no está garantizado que cree `MovimientoCaja` ni que se asocie a `CajaTurno`.
- Algunas vistas financieras leen `Transaccion`; otras leen `MovimientoCaja`, `CajaTurno` o gastos. Puede haber diferencias entre ventas reales, caja y flujo de caja.
- Acción recomendada: definir cuándo una venta entra a caja/finanzas (`PAGADO` o `ENTREGADO`) y crear/actualizar `MovimientoCaja` de forma idempotente en ese punto.

### 4. Estados de venta no están normalizados entre módulos
- Algunas métricas cuentan `PAGADO`/`ENTREGADO`; otras toman todo menos `CANCELADO`; pedidos nuevos nacen `PENDIENTE`.
- Esto puede hacer que dashboard, clientes, contabilidad y caja muestren cifras distintas.
- Acción recomendada: crear una regla única de negocio: por ejemplo, “solo `PAGADO` y `ENTREGADO` cuentan como venta consolidada”, y usarla en dashboard, clientes, contabilidad y flujo de caja.

### 5. Creación de productos desde pedidos por nombre
- `POST /api/pedidos` busca producto por nombre y, si no existe, lo crea.
- Esto puede duplicar catálogo por diferencias de texto y rompe receta/stock si el producto nuevo no tiene receta.
- Acción recomendada: el menú público debe enviar `producto_id`; el backend debe rechazar items sin producto válido en vez de crear productos automáticamente.

### 6. Fidelización de clientes ya tiene UI, pero depende del punto 2
- `/admin/clientes` ya muestra selector de mes, más comprador, más frecuente, producto favorito del mes y top clientes.
- Esas métricas solo serán confiables cuando las compras del menú queden asociadas a `cliente_id`.

### Fase 2 — Dashboard (`components/admin/AdminDashboard.tsx`)
- Header: "Dashboard" · "¿Cómo va el negocio?" + selector Hoy/Semana/Mes
- Grid de KPIs: pedidos de hoy, ingresos, margen bruto, insumos críticos
- Gráfico "Ventas — tendencia" 7 días (Recharts, ya instalado)
- Panel "⚠ Alertas de inventario" (link a `/admin/insumos`)
- "Más vendidos" + "Actividad tiempo real" + tabla "Pedidos recientes"
- API: `GET /api/dashboard` o derivar de `/api/admin/pedidos` + `/api/insumo`
- Empty states cuando no hay datos (NO mock data)

### Fase 2 — Pedidos (`components/admin/AdminOrders.tsx`)
- Flujo del ZIP: Pendiente → En Preparación → En Camino → Entregado/Cancelado/Pagado
- Filtros por estado, columnas: Pedido/Cliente/Total/Estado/Acciones
- API: `GET /api/admin/pedidos`, `PATCH /api/admin/pedidos/[id]` para cambiar estado

### Fase 2 — Deliverys (`components/admin/AdminDeliverys.tsx`)
- Mapa Leaflet de repartidores en ruta (`EN_CAMINO`)
- Fix: `invalidateSize()` después de mount, evitar doble-init
- Tiles: `light_all` de CartoDB
- Empty state cuando no hay repartidores activos

### Fase 3 — Categorías (`components/admin/AdminCategory.tsx`)
- CRUD simple: nombre, descripción, imagen
- API: `/api/categoria` (GET array directo, sin wrapper)

### Fase 3 — Inventario (`components/admin/AdminInventory.tsx`)
- 3 tabs del ZIP: Insumos · Movimientos · Recetas
- Alertas visuales crítico/advertencia cuando stock < mínimo
- Soporta insumos mixtos
- API: `/api/insumo`, `/api/movimiento-interno`, `/api/receta`

### Fase 4 — Analítica & Finanzas (`components/admin/AdminAnalytics.tsx`)
- Dashboard financiero: ventas por período, food cost global, top productos
- Recharts ya instalado

### Fase 4 — Configuración (`components/admin/AdminSettings.tsx`)
- Datos de sucursal, horarios, parámetros del sistema

### Fase 5 — Secciones extra (reconstruir front con Fresh Ops, backend intacto)
- Clientes, Caja-admin, Flujo de Caja, Contabilidad, Gastos Fijos, Activos Fijos, Cuentas por Cobrar/Pagar, Usuarios, Auditoría, Horarios

## Helpers de negocio importantes

```typescript
// Menu engineering (sales × margin matrix)
type MenuClass = 'Estrella' | 'Caballo' | 'Puzzle' | 'Perro'
// ⭐ Estrella = alta venta + alto margen
// 🐴 Caballo = alta venta + bajo margen
// 🧩 Puzzle = baja venta + alto margen
// 🐶 Perro = baja venta + bajo margen

// Food cost thresholds
// < 35% → verde (--fresh)
// 35-40% → amarillo (--amber)
// > 40% → rojo (--danger)

// buildablePortions: min(floor(stock/cantidad)) de todos los ingredientes
```

## `apiClient` — cómo usarlo

```typescript
import apiClient from '@/hooks/api';
// GET
const res = await apiClient.get('/api/admin/pedidos');
// POST/PUT/PATCH/DELETE igual
// Adjunta automáticamente Authorization: Bearer {token} desde localStorage
```

## Verificación rápida antes de empezar

```bash
cd c:\Users\alfre\Documents\Tarts\Trabajo\Elevate\elevateNext
npx tsc --noEmit  # debe salir exit 0
```

Si hay errores de TypeScript, corrígelos antes de seguir.

## Instrucción final

Trabaja sección por sección en el orden indicado. Cada sección: porta el diseño del ZIP → conecta APIs reales → empty states cuando no hay datos → verifica `tsc --noEmit` en exit 0 antes de pasar a la siguiente. No inventes datos mock.
