# FASE 3 · A — Backend de Finanzas (Contabilidad, Flujo de Caja, Caja consolidada)

> Endpoints de lectura para el admin, calculados desde `MovimientoCaja` /
> `Transaccion` / `GastoOperativo`. Depende de Fase 1. Rol: `DUENO`/`ADMIN`.
> Ref: `docs/MODULO_ADMINISTRADOR.md` §3.3–3.5, `docs/BACKEND_IMPLEMENTACION.md`.

## Convención
- Todos bajo `/api/admin/*`, protegidos con `requireRole(session, ['DUENO','ADMIN'])`.
- Filtro temporal por query `?rango=hoy|7d|mes|custom&desde=&hasta=&sucursal=`.
  Helper `lib/server/finanzas/rango.ts` que convierte el query en `{ gte, lte }`.
- Servicios en `lib/server/finanzas/*.service.ts`. Aritmética con `Prisma.Decimal`.

## PASO 1 — Helper de rango: `lib/server/finanzas/rango.ts`
`parseRango(searchParams): { desde: Date; hasta: Date }` (hoy / 7d / mes / custom).

## PASO 2 — Contabilidad: `lib/server/finanzas/contabilidad.service.ts`
- `estadoResultados(rango, sucursal?)`:
  - Ingresos = Σ `MovimientoCaja.monto` tipo `VENTA` (separar EFECTIVO/QR);
    **excluir** ventas cuya transacción sea `es_cortesia` (las cortesías no son ingreso).
  - CMV = Σ compras de insumo (`MovimientoCaja` tipo `COMPRA_INSUMO`, o
    `GastoOperativo` categoría "Insumos").
  - Utilidad bruta = Ingresos − CMV; margen = bruta/ingresos.
  - Gastos operativos = Σ `GASTO_OPERATIVO` (no CMV) + (opcional) prorrateo de
    `GastoFijo`.
  - Utilidad neta = bruta − gastos operativos.
  - Devolver también desglose por categoría y ticket promedio (ingresos / #ventas).
- `balanceGeneral(sucursal?)`:
  - Activos: saldos de `CuentaFinanciera` + valor de `ActivoFijo` (Fase 4A si existe)
    + inventario valorizado (Σ stock×costo, Fase 5 si existe; si no, 0).
  - Pasivos: `CuentaCorriente` POR_PAGAR pendientes (Fase 4B si existe; si no, 0).
  - Patrimonio = Activos − Pasivos.
  > Las partes aún no construidas (activos/inventario/cuentas) se suman como 0 con un
  > comentario `// TODO(Fase X)` para no romper.

## PASO 3 — Flujo de caja: `lib/server/finanzas/flujo.service.ts`
`flujoCaja(rango, sucursal?)`: entradas (Σ montos +), salidas (Σ montos −), flujo
neto; desglose **por método de pago** (EFECTIVO/QR) y **por categoría**. Lista de
movimientos del rango.

## PASO 4 — Caja consolidada: `lib/server/finanzas/turnos.service.ts`
`listarTurnos(rango, sucursal?)`: todos los `CajaTurno` (de todas las sucursales)
con cajero, ventas, esperado, real, diferencia. Solo lectura.

## PASO 5 — Endpoints
```
GET /api/admin/contabilidad/estado-resultados
GET /api/admin/contabilidad/balance
GET /api/admin/flujo-caja
GET /api/admin/caja/turnos
```
Patrón estándar: `requireAuth` → `requireRole(['DUENO','ADMIN'])` → parse rango →
service → JSON. Errores con `handleApiError`.

## Criterios de aceptación
- [ ] ER cuadra: Utilidad = Ingresos − CMV − Gastos; cortesías excluidas de ingresos.
- [ ] Flujo neto = entradas − salidas; desglose por método y categoría correcto.
- [ ] Turnos consolidados muestran diferencias por cajero.
- [ ] Un CAJERO recibe 403 en estos endpoints.
- [ ] Filtros Hoy/7d/Mes/Rango funcionan.
