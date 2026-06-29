# FASE 3 · B — Front Admin: navegación agrupada + Contabilidad + Flujo de Caja + Caja consolidada

> Depende de 3A. Ref: `docs/MODULO_ADMINISTRADOR.md`, `docs/FRONTEND_IMPLEMENTACION.md`
> §4, §9.4.

## PASO 1 — Navegación agrupada del admin
Reestructurar el sidebar de `components/admin/AdminPanel.tsx` a grupos con
`.admin-nav-group-label` (estilo ya existe en `admin.css`):
```
OPERACIÓN   : Dashboard, Pedidos, Deliverys
CLIENTES    : Clientes
CATÁLOGO    : Productos, Categorías, Insumos, Recetas
FINANZAS    : Contabilidad, Flujo de Caja, Caja
ADMINISTRACIÓN: (se completa en Fase 4: Activos, Cuentas C/P, Usuarios, Auditoría) + Configuración
```
Conservar badges (pedidos/insumos), el logout persistente y el footer con rol.
Mismo patrón `NAV_GROUPS` que se describió antes (lista plana → grupos).

## PASO 2 — Hooks admin: `hooks/finanzas.ts`
TanStack Query: `useEstadoResultados(rango)`, `useBalance()`, `useFlujoCaja(rango)`,
`useTurnos(rango)`. Componente `RangeFilter` (Hoy/7d/Mes/Rango) reutilizable.

## PASO 3 — Contabilidad: `app/admin/contabilidad/page.tsx`
- Tabs **Estado de Resultados** / **Balance General**. `RangeFilter`.
- ER: KpiCards (Utilidad neta [destacada], Utilidad bruta, Total ingresos, Ticket
  promedio) + panel "Estado de resultados" (Ingresos efectivo/QR, cortesías "no es
  ingreso", CMV, utilidad bruta + margen, gastos operativos, utilidad neta) + gastos
  por categoría (barras). Lista de movimientos del periodo.
- Balance: activos / pasivos / patrimonio.
- Export Excel del periodo.

## PASO 4 — Flujo de Caja: `app/admin/flujo-caja/page.tsx`
KpiCards (Flujo neto [destacado], Entradas, Salidas) + movimientos + paneles "Por
método de pago" (Efectivo/QR) y "Por categoría". `RangeFilter`.

## PASO 5 — Caja consolidada: `app/admin/caja/page.tsx`
Tabla de todos los turnos (sucursal, cajero, apertura, ventas, esperado, real,
diferencia con color). Solo lectura. Filtro por rango/sucursal.

## Componentes reutilizables
Usar `KpiCard`, `MoneyText`, `MethodPill`, `StatusBadge`, `RangeFilter`,
`DataTable`, `ChartCard` (Recharts). No duplicar.

## Criterios de aceptación
- [ ] Sidebar agrupado (OPERACIÓN/CLIENTES/CATÁLOGO/FINANZAS) sin romper lo existente.
- [ ] Contabilidad muestra ER y Balance con el filtro temporal.
- [ ] Flujo de caja desglosa por método y categoría.
- [ ] Caja consolidada lista turnos con diferencias.
- [ ] Estados loading/error/empty en todo.
