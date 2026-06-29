# FASE 2 · A — Layout del cajero + componentes base + hooks

> Apartado `/caja/*` con su propio layout, sidebar reducido y los componentes/hook de
> datos que reutilizarán las pantallas (2B/2C). Ref: `docs/FRONTEND_IMPLEMENTACION.md`.
>
> El layout `/caja` ya existe (placeholder de Fase 0B). Aquí se le pone sidebar y base.

## PASO 1 — Hook de datos del cajero: `hooks/caja.ts` (NUEVO)
Usar TanStack Query (ya instalado) + el `apiClient` con header `Authorization` (ver
`hooks/api.ts`, que ya inyecta el token desde localStorage). Exponer:
```ts
// queries
useTurnoActivo()        // GET /api/caja/turno-activo
useMovimientos()        // GET /api/caja/movimientos
useHistorial()          // GET /api/caja/historial
// mutations (invalida turno-activo + movimientos al éxito)
useAbrirCaja()          // POST /api/caja/apertura
useRegistrarIngreso()   // POST /api/caja/ingreso
useRegistrarGasto()     // POST /api/caja/gasto
useRegistrarVenta()     // POST /api/caja/venta
useCerrarCaja()         // POST /api/caja/cierre
```
Cada mutation hace `queryClient.invalidateQueries({ queryKey: ['caja'] })`.

## PASO 2 — Componentes reutilizables (NUEVOS, en `components/ui/`)
Crear con el design system "Fresh Ops" (paleta de `app/admin.css`). Mínimos:
- `KpiCard.tsx` — `{ label, value, highlight?, accent? }` (tarjeta métrica, la
  destacada en negro).
- `MoneyText.tsx` — `{ value, signed? }` → formato `Bs 1.234,56`, verde/rojo según signo.
- `MethodPill.tsx` — `{ metodo: 'EFECTIVO'|'QR'|'TARJETA' }` chip de color.
- `StatusBadge.tsx` — `{ status, label }` (abierto/cerrado, cuadra/faltante/sobrante).
- `EmptyState.tsx` — `{ title, hint? }` estado vacío.
> Reutilizar `FormModal`, `ConfirmDialog`, `AlertPopup` existentes; NO duplicarlos.

## PASO 3 — Sidebar del cajero: `components/caja/CajaSidebar.tsx` (NUEVO)
Sidebar reducido con nav (usar patrón de `AdminPanel.tsx`, grupos opcionales):
```
CAJA
 ├ Dashboard      /caja
 ├ Venta          /caja/venta
 ├ Movimientos    /caja/movimientos
 ├ Ingreso        /caja/ingreso
 ├ Gasto          /caja/gasto
 ├ Cierre         /caja/cierre
 └ Historial      /caja/historial
```
Footer: avatar + nombre + rol "Cajero" + botón Cerrar sesión (usar
`useAuth.logout()` + `router.push('/login')`). Banner superior con estado del turno.

## PASO 4 — Actualizar `app/caja/layout.tsx`
Mantener el `ProtectedRoute roles={['CAJERO','ADMIN','DUENO']}` (ya está) y envolver
los children con un shell que renderice `<CajaSidebar/>` + `<main>{children}</main>`.
Reutilizar estilos de `app/admin.css` (o crear `app/caja/caja.css` mínimo).

## Criterios de aceptación
- [ ] `/caja` muestra el shell con sidebar (placeholder de contenido por ahora).
- [ ] Los hooks compilan y `useTurnoActivo()` trae el turno (o null).
- [ ] Componentes base reutilizables creados y tipados.
- [ ] El cajero sigue sin poder entrar a `/admin`.
