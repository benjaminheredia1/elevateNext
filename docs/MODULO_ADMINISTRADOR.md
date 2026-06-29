# MÓDULO ADMINISTRADOR

> Rol: **DUENO / ADMIN**. Control general del sistema. Ruta base: `/admin/*`.
> Referencia visual: sidebar "Paladar" (grupos OPERACIÓN / CLIENTES / FINANZAS /
> ADMINISTRACIÓN). Diseño: "Fresh Ops" de Elevate.

---

## 1. Objetivo

Dar al dueño/administrador visibilidad y control total: operación (pedidos,
inventario), clientes, finanzas (contabilidad, flujo, caja consolidada), gestión
(activos, cuentas por cobrar/pagar, usuarios) y **auditoría** de lo que hace cada
cajero.

## 2. Matriz de capacidades del Administrador

| Entidad | Ver | Crear | Editar | Eliminar | Notas |
|---------|:--:|:--:|:--:|:--:|------|
| Cajeros (usuarios) | ✅ | ✅ | ✅ | ✅(soft) | Solo DUENO crea/edita ADMIN/DUENO |
| Aperturas de caja | ✅ | — | — | — | Solo lectura (las hace el cajero) |
| Cierres de caja | ✅ | — | ✅* | — | *Solo ajuste supervisado + auditoría |
| Movimientos de caja | ✅ | ✅ | — | — | Puede registrar ajustes |
| Ventas físicas | ✅ | ✅ | ✅ | — | Auditado |
| Pedidos online | ✅ | ✅ | ✅ | — | Cambios de estado |
| Productos / recetas | ✅ | ✅ | ✅ | ✅(soft) | Ficha técnica |
| Inventario / insumos | ✅ | ✅ | ✅ | ✅(soft) | Ver MODULO_INVENTARIO |
| Clientes | ✅ | ✅ | ✅ | ✅(soft) | Métricas |
| Reportes | ✅ | — | — | — | Export Excel/PDF |
| Auditoría | ✅ | — | — | — | Inmutable |
| Configuración negocio | ✅ | ✅ | ✅ | — | DUENO para config sensible |
| Roles y permisos | ✅ | ✅ | ✅ | — | Solo DUENO |

> "Auditar lo que hace el cajero": el admin ve en **Auditoría** y en **Caja
> (historial de turnos)** cada apertura, venta, ajuste y cierre con responsable,
> montos y diferencias.

---

## 3. Submódulos

### 3.1 Dashboard ejecutivo (`/admin`)
- **KPIs del día:** Ganancia, Ventas, Pedidos, Ticket promedio.
- Más vendidos hoy, Alertas de inventario (crítico/bajo), Contabilidad de hoy
  (Ingresos, CMV, Otros gastos, Utilidad).
- Estado del negocio (Abierto/Cerrado), turno de caja activo.
- **Frontend:** tarjetas KPI + listas + gráfico (Recharts).
- **Endpoints:** `GET /api/admin/dashboard?sucursal=&fecha=`.
- **Reglas:** todo filtrado por sucursal y rango temporal.

### 3.2 Clientes (`/admin/clientes`)
- Total clientes, ingresos, gasto promedio; tabla (cliente, primer pedido, # pedidos,
  total gastado); búsqueda; export Excel.
- **Endpoints:** `GET /api/admin/clientes`, `GET /api/admin/clientes/:id`.
- **DB:** deriva de `Cliente` + agregaciones sobre `Transaccion`.

### 3.3 Contabilidad (`/admin/contabilidad`)  — *M7*
- Pestañas **Estado de Resultados** y **Balance General**.
- Filtros Hoy / 7 días / Este mes / Rango.
- ER: Ingresos (ventas efectivo/QR, cortesías marcadas "no es ingreso"), CMV
  (insumos/compras), Utilidad bruta + margen, Gastos operativos, Utilidad
  operativa/neta, Gastos por categoría.
- Balance: Activos (caja, cuentas, activos fijos, inventario valorizado), Pasivos
  (cuentas por pagar), Patrimonio.
- **Endpoints:** `GET /api/admin/contabilidad/estado-resultados`,
  `GET /api/admin/contabilidad/balance`.
- **Reglas:** cortesías NO suman a ingresos; CMV = costo de insumos consumidos.

### 3.4 Flujo de Caja (`/admin/flujo-caja`) — *M8*
- Flujo neto, Entradas, Salidas; movimientos; **por método de pago** (Efectivo/QR);
  **por categoría**.
- **Endpoints:** `GET /api/admin/flujo-caja?rango=`.
- **DB:** agregaciones sobre `MovimientoCaja`.

### 3.5 Caja consolidada (`/admin/caja`)
- Vista de **todos los turnos** de todas las sucursales (lectura), con diferencias.
- **Endpoints:** `GET /api/admin/caja/turnos`.

### 3.6 Gastos Fijos (`/admin/gastos-fijos`) — *M9*
- Total mensual, equivalente diario; CRUD de gastos recurrentes (concepto,
  categoría, frecuencia, monto). Cálculo equiv./mes.
- **Endpoints:** `GET/POST/PUT/DELETE /api/admin/gastos-fijos`.

### 3.7 Activos Fijos (`/admin/activos-fijos`) — *M10*
- Valor original/actual total + por categoría; tabla con depreciación.
- **Endpoints:** `GET/POST/PUT/DELETE /api/admin/activos-fijos`.

### 3.8 Cuentas por Cobrar / Pagar (`/admin/cuentas-cobrar`, `/cuentas-pagar`) — *M11*
- Tarjetas (por cobrar/cobrado/total); filtros (todas/pendientes/cobradas/pagadas);
  registro de pagos parciales (cambia estado).
- **Endpoints:** `GET/POST/PUT /api/admin/cuentas-corrientes`.

### 3.9 Usuarios y roles (`/admin/usuarios`) — *M1*
- Lista (usuario, nombre, rol), contadores por rol, crear/editar/eliminar(soft).
- **Reglas:** solo `DUENO` puede crear/editar `ADMIN`/`DUENO`; `ADMIN` solo gestiona
  `CAJERO`. Password hasheado (bcrypt). No exponer hash.
- **Regla de `activo`:** los usuarios internos (ADMIN/CAJERO) se crean con
  `activo: true` (coincide con el `@default(true)` del schema). La **desactivación es
  explícita** desde la UI (soft-disable, nunca delete — preserva auditoría). El login
  bloquea usuarios inactivos (`if (!activo) → 401`). ⚠️ La **reactivación** debe ser
  una acción deliberada del admin, NO un efecto secundario de un upsert (eso solo es
  válido en el seed/fixtures de desarrollo, no en la lógica de negocio real).
- **Endpoints:** `GET/POST/PUT/DELETE /api/admin/usuarios` (autorización estricta).

### 3.10 Auditoría (`/admin/auditoria`) — *M2*
- Registro de toda acción (fecha, usuario, rol, acción, detalle, monto); filtros por
  rol y búsqueda. Solo lectura. Ver `SEGURIDAD_Y_AUDITORIA.md`.
- **Endpoints:** `GET /api/admin/auditoria?rol=&q=&rango=`.

### 3.11 Configuración del negocio (`/admin/settings`)
- Sucursales (nombre, ubicación), parámetros globales, alertas (WhatsApp — ver
  MODULO_INVENTARIO), métodos de pago habilitados.
- **Endpoints:** `GET/PUT /api/admin/configuracion`, `GET/POST/PUT /api/admin/sucursales`.

---

## 4. Frontend (resumen)
- Layout `/admin/*` con sidebar agrupado y guard de rol (`DUENO`/`ADMIN`).
- Componentes reutilizables: `KpiCard`, `DataTable`, `RangeFilter`, `MoneyText`,
  `StatusBadge`, `ExportExcelButton`, `EmptyState`. Ver `FRONTEND_IMPLEMENTACION.md`.

## 5. Backend (resumen)
- Rutas bajo `/api/admin/*` protegidas por middleware `requireRole(['DUENO','ADMIN'])`.
- Servicios por dominio (contabilidad, caja, usuarios). Ver `BACKEND_IMPLEMENTACION.md`.

## 6. Seguridad
- Autorización server-side por rol en cada endpoint.
- Acciones sensibles (crear usuario, ajustar caja, cambiar precios) → auditoría
  obligatoria. Ver `SEGURIDAD_Y_AUDITORIA.md`.

## 7. Reportes
- Export Excel (listados) y PDF (cierres, ER). Generación server-side.
- Reportes: ventas por periodo, ER, flujo de caja, diferencias de caja por cajero,
  inventario valorizado, top productos/clientes.

## 8. Criterios de aceptación
- [ ] Admin ve todos los turnos y diferencias por cajero.
- [ ] ER cuadra: Utilidad = Ingresos − CMV − Gastos; cortesías excluidas de ingresos.
- [ ] Solo DUENO gestiona roles altos.
- [ ] Todo cambio sensible aparece en Auditoría.
