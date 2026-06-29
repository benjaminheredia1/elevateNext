# FASE 2 · B — Pantallas de operación del cajero (dashboard, apertura, movimientos, ingreso/gasto)

> Depende de 2A (layout + hooks + componentes). Ref: `docs/MODULO_CAJERO_CONTADOR.md` §2–3,
> `docs/FRONTEND_IMPLEMENTACION.md` §9.1–9.2.

## PASO 1 — Dashboard de caja: `app/caja/page.tsx`
Reemplaza el placeholder. Usa `useTurnoActivo()`.
- Si NO hay turno: tarjeta grande "Caja cerrada" + botón **Abrir caja** → `/caja/apertura`.
- Si hay turno: banner "Caja abierta · {sucursal} · turno iniciado {fecha}" +
  KpiCards: Apertura efectivo/QR, Ventas efectivo/QR (del turno), Esperado en
  caja/QR (calcular en cliente = apertura + neto de movimientos por método, o mostrar
  "—" hasta cierre). Botón **Cerrar caja** → `/caja/cierre`. Accesos rápidos (Venta,
  Ingreso, Gasto, Movimientos).
- Estados de carga (skeleton) y error.

## PASO 2 — Apertura: `app/caja/apertura/page.tsx`
Form (React Hook Form o controlado) con `apertura_efectivo`, `apertura_qr`,
`observaciones?`. Validación espejo del DTO (≥0, montos con 2 decimales). Submit →
`useAbrirCaja()`. Bloquear doble submit. Al éxito → redirigir a `/caja` con toast.
Si ya hay turno abierto (409) → mostrar mensaje y redirigir a `/caja`.

## PASO 3 — Movimientos del día: `app/caja/movimientos/page.tsx`
`useMovimientos()`. Tabla (concepto, tipo, método [`MethodPill`], monto [`MoneyText`
con signo], hora). Filtros: Todos / Ingresos / Egresos / Efectivo / QR (en cliente).
`EmptyState` si no hay. Solo lectura.

## PASO 4 — Ingreso extra: `app/caja/ingreso/page.tsx`
Form: `concepto`, `monto` (>0), `metodo_pago` (Efectivo/QR/Tarjeta), `categoria?`.
Submit → `useRegistrarIngreso()`. Requiere turno abierto (si 409 → avisar "abre caja").
Al éxito → toast + limpiar form o volver a `/caja/movimientos`.

## PASO 5 — Gasto operativo: `app/caja/gasto/page.tsx`
Igual que ingreso pero → `useRegistrarGasto()`. Categoría sugerida (Insumos,
Servicios, Otros).

## UX / detalles
- Inputs de dinero con máscara y 2 decimales; rechazar negativos.
- Estados loading/error/empty en todas.
- Responsive (uso en tablet de mostrador).
- Mostrar el método con color consistente (`MethodPill`).

## Criterios de aceptación
- [ ] Flujo completo desde la UI: abrir caja → ver dashboard con turno → registrar
      ingreso y gasto → verlos en Movimientos.
- [ ] Sin turno, las pantallas de ingreso/gasto avisan que hay que abrir caja.
- [ ] Doble submit bloqueado; validaciones visuales activas.
- [ ] Nada de lógica de negocio en el cliente (solo consume la API).
