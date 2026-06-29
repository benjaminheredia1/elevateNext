# FRONTEND — Arquitectura e implementación

> Stack: **Next.js 16 App Router + React 19 + Tailwind v4 + PrimeReact + Framer
> Motion + Recharts + Leaflet + TanStack Query**. Design system: "Fresh Ops".

---

## 1. Layouts por rol (separación de apartados)

```
app/
  (tienda)/            → Cliente (público): /, /menu/[brand], pedido
  admin/               → DUENO/ADMIN  (layout.tsx con ProtectedRoute rol admin)
  caja/                → CAJERO       (layout.tsx con ProtectedRoute rol cajero)
  login/
```

- Cada layout valida el rol (cliente: `ProtectedRoute`; server-side recomendado).
- Tras login, **redirección por rol:** ADMIN/DUENO→`/admin`, CAJERO→`/caja`,
  CLIENTE→`/`.
- El cajero **no** ve enlaces a `/admin`; el admin puede entrar a `/caja` para
  supervisar.

---

## 2. Protección de rutas
- `ProtectedRoute` (existe) ampliado para aceptar `roles` permitidos.
- Validación doble: cliente (UX) + servidor (datos). El cliente nunca es la única
  barrera. Idealmente, verificación de rol en Server Component/layout antes de render.

---

## 3. Estructura de rutas (nuevas)

| Apartado | Rutas |
|----------|-------|
| Admin | `/admin`, `/admin/clientes`, `/admin/contabilidad`, `/admin/flujo-caja`, `/admin/caja`, `/admin/gastos-fijos`, `/admin/activos-fijos`, `/admin/cuentas-cobrar`, `/admin/cuentas-pagar`, `/admin/usuarios`, `/admin/auditoria`, `/admin/settings` |
| Caja | `/caja`, `/caja/apertura`, `/caja/venta`, `/caja/movimientos`, `/caja/ingreso`, `/caja/gasto`, `/caja/cierre`, `/caja/historial` |

---

## 4. Sidebar agrupado (adoptar patrón de referencia)
Grupos con sub-encabezados, reutilizando `.admin-nav-group-label` existente:
- **Admin:** OPERACIÓN (Dashboard, Pedidos, Deliverys) · CLIENTES (Clientes) ·
  CATÁLOGO (Productos, Categorías, Inventario, Recetas) · FINANZAS (Contabilidad,
  Flujo de Caja, Caja, Gastos Fijos) · ADMINISTRACIÓN (Activos Fijos, Cuentas por
  Cobrar, Cuentas por Pagar, Usuarios, Auditoría, Configuración).
- **Caja:** un sidebar reducido (Dashboard, Apertura, Venta, Movimientos, Ingreso,
  Gasto, Cierre, Historial).
- Footer con avatar + nombre + **rol** + logout (patrón de la referencia, con la
  implementación de logout actual que sí funciona).

---

## 5. Componentes reutilizables (design system)

| Componente | Uso |
|-----------|-----|
| `KpiCard` | Tarjeta de métrica (una destacada en negro) |
| `DataTable` | Tabla con búsqueda, orden, paginación, export Excel |
| `RangeFilter` | Hoy / 7 días / Este mes / Rango |
| `MoneyText` | Formato Bs con signo y color (verde/rojo) |
| `StatusBadge` | Estados (crítico/bajo/ok, abierto/cerrado, cuadra/faltante) |
| `FormModal` | (existe) modales de alta/edición |
| `ConfirmDialog` | (existe) confirmaciones |
| `EmptyState` | Estados vacíos explicativos |
| `MethodPill` | Efectivo/QR/Tarjeta |
| `ExportExcelButton` | Export de listados |
| `ChartCard` | Wrapper Recharts (línea, dona, barras, heatmap) |

> Reutilizar lo existente (`FormModal`, `ConfirmDialog`, `AlertPopup`) antes de crear.

---

## 6. Formularios y validación visual
- React Hook Form (o estado controlado) + validación espejo de los DTOs Zod.
- Mensajes inline por campo; deshabilitar submit mientras procesa; prevenir doble
  submit (clave en apertura/cierre/venta).
- Inputs de dinero con máscara y 2 decimales.

---

## 7. Estados de carga y error
- `loading` con skeletons en tablas/tarjetas.
- Errores de API mostrados con toast + inline; reintento donde aplique.
- Optimistic UI solo en acciones seguras (no en caja/dinero).

---

## 8. Data fetching
- TanStack Query (ya instalado) para listados/dashboards (cache + refetch).
- Mutaciones con invalidación de queries afectadas (ej. tras venta, invalidar
  movimientos + turno + dashboard).
- Polling existente (`useOrderPolling`, `useAlertasPolling`) se conserva.

---

## 9. Pantallas clave (especificación breve)

### 9.1 Caja — Dashboard (`/caja`)
- Banner estado del turno (Abierto/Cerrado + sucursal + inicio + # ventas).
- KPIs: Apertura efectivo/QR, Ventas efectivo/QR, Esperado en caja/QR.
- Botón "Cerrar caja" (si abierto) / "Abrir caja" (si cerrado).

### 9.2 Caja — Venta física (`/caja/venta`)
- Buscador de productos + grid; carrito lateral; selector de método de pago; toggle
  cortesía; botón cobrar (confirma y persiste).

### 9.3 Caja — Cierre (`/caja/cierre`)
- Resumen esperado por método; inputs de conteo real; muestra diferencia en vivo con
  color; observaciones; confirmación final; genera reporte.

### 9.4 Admin — Contabilidad (`/admin/contabilidad`)
- Tabs ER / Balance; `RangeFilter`; KPIs; lista de movimientos; ER detallado.

### 9.5 Admin — Auditoría (`/admin/auditoria`)
- Tabla (fecha, usuario+rol, acción, detalle, monto); filtros por rol + búsqueda.

---

## 10. Responsive
- Sidebar colapsable (overlay en móvil; ya existe el patrón).
- Caja optimizada para **tablet** (uso en mostrador).
- Tablas con scroll horizontal y columnas prioritarias en móvil.

---

## 11. Accesibilidad y movimiento
- `useReducedMotion` (ya usado) para respetar preferencias.
- Foco visible, labels en formularios, contraste suficiente.

---

## 12. Criterios de aceptación
- [ ] Layouts separados por rol; cajero sin acceso visual ni real a admin.
- [ ] Sidebars agrupados y footer con rol.
- [ ] Componentes reutilizables (no duplicar tablas/KPIs por pantalla).
- [ ] Formularios de dinero validados; doble submit bloqueado.
- [ ] Estados de carga/error/vacío en todas las pantallas nuevas.
