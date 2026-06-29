# SECTION SPECS — Admin Elevate

> Especificación sección por sección. Acompaña a [`ACTION_PLAN.md`](ACTION_PLAN.md) y
> [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md). **Solo planificación.**
>
> Convención:
> - **Paridad** = clonar diseño + textos + lógica del archivo zip indicado. Fuente de verdad = ese archivo.
> - **Rehacer** = mantener backend/funciones, rehacer el front en el sistema "Fresh Ops".
> - **Datos:** reales (APIs). Sin datos ⇒ **empty state** (nunca mock).

---

## SHELL — Sidebar / Topbar / Tema  *(paridad)*

- **Archivos:** `components/admin/AdminPanel.tsx`, `app/admin.css`.
- **Bug:** `o .admin-nav-link` → `.admin-nav-link`; faltan `.admin-nav-group(-label)`.
- **Sidebar:** verde kale `#14342A` (ver DESIGN_SYSTEM §8). Item activo = pill naranja.
- **Nav:** conservar nuestros grupos extra (Finanzas, Administración, Clientes) pero con el estilo del zip.
- **Topbar/tema:** ya en claro; verificar `:root` con paleta Fresh Ops.
- **Aceptación:** idéntico a la imagen 2 (icono+label en línea, grupos en mayúsculas, barra verde).

---

## 1. Productos  *(paridad + 1 endpoint backend)*

- **Zip:** `AdminProducts.tsx` + `AdminProductWizard.tsx`. **Nuestros:** `components/admin/AdminProducts.tsx`,
  `AdminProductWizard.tsx`. **API:** `GET/POST /api/admin/productos` (ya devuelve `costo_calculado`,
  `food_cost_pct`, `tipo`, `estado_publicacion`, `ventas_acumuladas`, `marcas`, receta+insumo.stock).
- **Header:** "Productos" · "{n} productos · {m} publicados" + `+ Nuevo Producto`.
- **Filtros:** búsqueda + estado de publicación (`Todos|Publicado|Borrador|Archivado`) + chips de categoría.
- **Tabla:** `Producto · Tipo · Precio · Costo · Food Cost · Clase · Rinde · Estado · Acciones`.
  - Tipo→`cat-badge` (Elaborado/Reventa). Food Cost→`margin-badge` (color `foodCostColor`).
    Clase→`menu-class-badge` (`classifyMenu`). Rinde→`buildablePortions`. Estado→`pub-badge`.
  - Acciones: editar · publicar/despublicar (▶/⏸) · eliminar con confirmación. Badge "sin ficha" si
    ELABORADO sin receta.
- **Wizard (4 pasos del zip):** Básicos · Precio & Foto · Receta · **Revisar**.
  - "Menú(s)" del zip = **Marcas reales** (`Marca`/`ProductoMarca`): el paso 1 es un multiselect de Marcas.
  - Foto (`imagen_url`): **URL pegada / base64** (sin Vercel Blob por ahora).
  - Paso 4 con `review-stats` (Food Cost, Margen, Clasificación, Rinde) + `gate-warning` (precio, foto,
    **≥1 marca**, receta/insumo). Botones "Guardar borrador" / "Publicar al menú".
  - Sustituir el wizard actual (estilos inline oscuros, paso "Marcas") por clases CSS del sistema.
- **Frontend nuevo:** `components/admin/inventoryData.ts` (`computeProductCost`, `buildablePortions`,
  `classifyMenu`, `menuClassMeta`, `foodCostColor`) adaptado a claves en español (`costo_promedio`,
  `unidad_medida`, `stock`). Tipos extendidos en `adminData.ts` (`PublishStatus`, `ProductType`,
  `RecipeItem`, campos en `AdminProduct`).
- **Backend (único pendiente):** crear `app/api/admin/productos/[id]/route.ts`:
  - `GET` detalle (precargar wizard) · `PUT` editar (reemplazo transaccional de categorías/marcas/receta) ·
    `PATCH` cambiar `estado_publicacion` (publicar/despublicar/archivar) · `DELETE` con auditoría.
    Auth `requireRole(['DUENO','ADMIN'])` + `logAudit`, estilo de `route.ts`.
- **BD:** sin cambios.
- **Empty:** `empty-state` "Sin productos / Ajusta filtros o crea uno nuevo".

---

## 2. Dashboard  *(paridad)*

- **Zip:** `AdminDashboard.tsx`. **Nuestro:** `components/admin/AdminDashboard.tsx`.
- **Header:** "Dashboard" · "¿Cómo va el negocio?" + selector de periodo (`Hoy` / semana / mes).
- **Bloques:** fila de **KPIs** (incl. "Margen bruto" con `kpi-change`), y cards:
  - "Ventas — tendencia" (Últimos 7 días, gráfico) · "⚠ Alertas de inventario" (link "Ver →") ·
    "Más vendidos" (por unidades) · "Actividad (tiempo real)" · "Pedidos recientes" (link "Ver todos →",
    cabecera Pedido/Cliente/Total/Estado).
- **Datos:** KPIs y listas desde nuestras APIs (pedidos, alertas, productos). **Sin datos ⇒** KPIs en 0 y
  cards con empty state ("Aún no hay ventas hoy", "Sin alertas", "Sin pedidos recientes").
- **Gráficos:** reusar `components/admin/charts/` (portar de `elevate/src/admin/charts/index.tsx`).

---

## 3. Pedidos  *(paridad)*

- **Zip:** `AdminOrders.tsx`. **Nuestro:** `components/admin/AdminOrders.tsx`. **API:** `/api/pedidos`.
- **Header:** "Pedidos".
- **Filtros de estado** (`osb-btn`): Todos + por estado (cada estado con su color en `borderColor`).
- **Tarjetas de pedido expandibles** (`order-card` / `ocd-*`): al expandir muestran "Items del pedido",
  meta Cliente / Teléfono / Dirección / Repartidor, y botones de cambio de estado
  (Pendiente→En preparación→En camino→Entregado/Cancelado/Pagado).
- **Empty:** "Aún no hay pedidos" por filtro.

---

## 4. Deliverys  *(paridad — incluye ARREGLO DEL MAPA)*

- **Zip:** `AdminDeliverys.tsx`. **Nuestro:** `components/admin/AdminDeliverys.tsx`. **API:**
  `/api/pedidos?estado=EN_CAMINO` (flota = pedidos en camino con `driver_*`).
- **Layout:** header con stats (En ruta / Disponibles) + `delivery-grid`: "Flota Activa" (lista de
  `driver-card` con avatar, nombre, teléfono, badge de estado, rating) + "Mapa en tiempo real" (`● LIVE`).

### Por qué el mapa "no se ve" — diagnóstico
El contenedor **sí** tiene altura (`.delivery-grid { height: calc(100vh - 200px) }` + `.admin-leaflet-container { flex:1 }`), así que el problema es otro:

1. **Falta `map.invalidateSize()`** tras montar (y al abrir/cerrar el sidebar o redimensionar). Leaflet
   calcula tamaño 0 si el contenedor aún no tiene layout estable → tiles grises/incompletas o mapa en blanco.
   **Fix:** llamar `map.invalidateSize()` en un `setTimeout(…,0)`/`requestAnimationFrame` tras `initMap`, y
   en un listener de `resize`.
2. **Doble init en React Strict Mode (dev):** el `useEffect([])` crea el mapa, el cleanup lo destruye y se
   vuelve a crear; la carga `async` de Leaflet genera una carrera ("Map container is already initialized").
   **Fix:** guard robusto (ya resetea `_leaflet_id`) + asegurar que `initMap` no corra dos veces (flag de
   "initializing"), o usar `dynamic(() => …, { ssr:false })` para el componente de mapa.
3. **Faltan estilos de marcador:** en `admin.css` solo existe `.marker-core`; faltan `.admin-map-marker` y
   `.marker-pulse` (el JS los usa). Sin ellos, aunque el mapa cargue, **los pins no se ven**.
   **Fix:** portar `.admin-map-marker`/`.marker-pulse` del zip (con variantes `.route`/`.available`).
4. **Tiles oscuros sobre tema claro:** usa `basemaps.cartocdn.com/dark_all`. La imagen del zip es **mapa
   claro**. **Fix:** cambiar a `light_all` (o `voyager`) para coherencia con Fresh Ops.
5. **Sin pedidos EN_CAMINO ⇒ flota vacía y sin pins** (el mapa base igual debe verse). **Fix:** empty state
   en "Flota Activa" ("No hay repartidores en ruta") y centrar el mapa en la sucursal.

### Aceptación
Mapa claro visible a tamaño completo, con pins de repartidor (pulse + iniciales) y empty state cuando no
hay flota. Sin errores de Leaflet en consola.

---

## 5. Inventario  *(paridad)*  + Recetas

- **Zip:** `AdminInventory.tsx`. **Nuestros:** `/admin/insumos` y `/admin/recetas`. **API:** `/api/alertas`
  (resumen de insumos), endpoints de insumos/movimientos.
- **Header:** "Inventario" + `+ Insumo`. Stat cards: "Valor total", "Bajo umbral", (críticos).
- **Tabs:** **Insumos** / **Movimientos** / **Recetas / Fichas técnicas**.
  - *Insumos:* tabla `Insumo · Categoría · Nivel · Stock · Reorden · Cobertura · Costo unit. · Valor ·
    Proveedor · Estado · Acciones`. Acciones por fila: Registrar compra (↥), Registrar merma (⌫),
    Conteo físico (✓). Botón "📲 Enviar alerta WhatsApp".
  - *Movimientos:* tabla `Fecha · Insumo · Tipo · Cantidad · Costo · Referencia · Usuario`. Empty:
    "Sin movimientos aún / Las compras, ventas, mermas y ajustes aparecerán aquí".
  - *Recetas:* fichas técnicas por producto (nuestra `/admin/recetas` sigue este diseño/lógica).
- **Modales** (`edit`/`purchase`/`waste`/`count`): título `{acción} · {insumo}`, `form-grid`,
  campos Motivo/Varianza/Nota según tipo.
- **Empty (sin insumos):** estado vacío con CTA "+ Insumo".

---

## 6. Categorías  *(paridad)*

- **Zip:** `AdminCategory.tsx` (vista simple). **Nuestro:** `components/admin/AdminCategory.tsx`.
  **API:** `/api/categorias`.
- **Contenido:** header "Categorías" + grid/tabla de categorías con crear/editar/eliminar (modal `form-grid`).
- **Empty:** "Aún no hay categorías / Crea la primera".

---

## 7. Analítica & Finanzas  *(paridad)*

- **Zip:** `AdminAnalytics.tsx`. **Nuestro:** `/admin/analitica`.
- **Header:** "Analítica & Finanzas" · "Rentabilidad, tendencias e ingeniería de menú".
- **Cards/gráficos:** "Tendencia de ventas y utilidad (Mensual)" · "Mix por menú" · "★ Ingeniería de menú"
  (select Todos/Elevate/…) · "Mix por categoría" · "Horas pico (pedidos hora × día)" · tabla
  "Rentabilidad por plato" (`Plato · Precio · Costo · Food Cost · Clase`).
- **Datos:** desde nuestras APIs/queries. **Sin datos ⇒** gráficos vacíos con leyenda "Sin datos del periodo".
- **Reusar** `charts/` + `inventoryData` (clase/food cost).

---

## 8. Configuración  *(paridad)*

- **Zip:** `AdminSettings.tsx`. **Nuestro:** `/admin/settings`.
- **Header:** "Configuración" · "Alertas de inventario por WhatsApp y datos del negocio".
- **Bloques:**
  - "Alertas de WhatsApp": destinatarios (`+591…, +591…`), umbrales, plantilla del mensaje; botones
    "Guardar configuración" / "Enviar prueba".
  - "Datos del negocio": Nombre (Elevate), Moneda (Bs.), Zona horaria (America/La_Paz).
  - "Registro de alertas": tabla o empty "Aún no se han disparado alertas…".

---

# SECCIONES A REHACER (front nuevo, back intacto)

> Mismo sistema "Fresh Ops". Mantener endpoints/servicios actuales; rehacer solo la UI con frontend-design.
> Patrón base por defecto: **header consistente + stat-cards + `.admin-table` + filtros + empty-state +
> modal de alta/edición**. Ver DESIGN_SYSTEM §7. Confirmar la forma de cada API antes de implementar.

| Sección | Ruta / API aprox. | Brief de UI (Fresh Ops) | Estado vacío |
|---|---|---|---|
| **Clientes** | `/admin/clientes` · `/api/clientes` | Stat-cards (total, nuevos, recurrentes) + tabla (Cliente, Contacto, Pedidos, Total gastado, Última compra) + buscador + ficha en modal. | "Aún no hay clientes registrados." |
| **Caja** | `/admin/caja` · `/api/caja` | Tabs (Apertura · Movimientos · Cierre) o cards de turno; KPI de saldo actual; acciones "Abrir caja"/"Cerrar caja" (`primary`). | "Caja cerrada — Abre la caja para registrar movimientos." |
| **Flujo de Caja** | `/admin/flujo-caja` · `/api/contabilidad` | Cards de resumen (entradas/salidas/neto, color semántico) + gráfico (`charts/`) + tabla de movimientos. | "Sin movimientos en el periodo." |
| **Contabilidad** | `/admin/contabilidad` · `/api/contabilidad` | Resumen (ingresos/egresos/utilidad) + tabla de asientos/movimientos + filtro de periodo. | "Sin registros contables todavía." |
| **Gastos Fijos** | `/admin/gastos-fijos` · `/api/gastos` | Tabla (Concepto, Monto, Frecuencia, Próximo cargo, Estado) + `+ Gasto fijo`. | "No hay gastos fijos definidos." |
| **Activos Fijos** | `/admin/activos-fijos` | Tabla (Activo, Valor, Adquisición, Depreciación, Estado) + alta. | "Sin activos registrados." |
| **Cuentas por Cobrar** | `/admin/cuentas-cobrar` | Stat-cards (total por cobrar, vencido) + tabla (Cliente, Monto, Vence, Estado: vigente/por-vencer/vencido con badges amber/danger). | "Nada por cobrar." |
| **Cuentas por Pagar** | `/admin/cuentas-pagar` | Igual que cobrar, orientado a proveedores. | "Nada por pagar." |
| **Usuarios** | `/admin/usuarios` · `/api/usuarios` | Tabla (Usuario, Rol, Estado, Último acceso) + alta/edición con select de rol (RBAC) + toggle activo. | "Solo existe tu usuario — invita a tu equipo." |
| **Auditoría** | `/admin/auditoria` · `/api/auditoria` | Timeline o tabla (Fecha, Usuario, Rol, Acción, Entidad, Detalle) + filtros por acción/entidad. Solo lectura. | "Sin eventos de auditoría aún." |
| **Horarios** | `/admin/reglasHorarias` | Cards/tabla de reglas (rango de fechas/horas, descuento, estado activa/inactiva con badge) + modal de edición. | "No hay reglas horarias — crea una promoción." |

**Resuelto:** **libertad de diseño dentro de Fresh Ops** (no se calca un patrón fijo del zip), priorizando
consistencia con las secciones de paridad. El patrón base de la tabla de arriba es una sugerencia, no una obligación.

---

## Notas transversales
- Eliminar de las secciones rehechas todo estilo inline oscuro heredado (`#888`, `rgba(255,255,255,…)`,
  fondos `#12121f`, etc.) — caso típico: `AdminProductWizard.tsx` actual.
- Cada sección termina con `npm run build` limpio y revisión visual contra el zip / contra las secciones
  de paridad ya hechas (consistencia).
- No agregar columnas/migraciones salvo el endpoint `[id]` de Productos.
