# FASE 2 · C — Venta física (POS UI), cierre de caja e historial

> Depende de 2B y de 1C (endpoint de venta). Ref: `docs/MODULO_CAJERO_CONTADOR.md`
> §3.2, §3.5–3.6; `docs/FRONTEND_IMPLEMENTACION.md` §9.2–9.3.

## PASO 1 — Venta física (POS): `app/caja/venta/page.tsx`
Pantalla optimizada para rapidez en mostrador:
- Buscador + grid de productos (consumir `/api/productos`; mostrar solo
  `disponible`/publicados). Click agrega al carrito.
- **Carrito** lateral: items con cantidad (+/−), subtotal por item, **total calculado
  para mostrar** (informativo; el real lo recalcula el servidor).
- Selector de **método de pago** (Efectivo/QR/Tarjeta) con `MethodPill`.
- Toggle **Cortesía** (es_cortesia) — avisar "no suma a ingresos".
- Botón **Cobrar** → `useRegistrarVenta()` con `{ items, metodo_pago, es_cortesia }`.
  Confirmación (`ConfirmDialog`) con el total antes de persistir. Bloquear doble submit.
- Si no hay turno (409) → redirigir a abrir caja.
- Al éxito → toast con #venta, limpiar carrito.

## PASO 2 — Cierre de caja: `app/caja/cierre/page.tsx`
- Mostrar **esperado** por método (traer del turno/movimientos; el backend lo
  recalcula al cerrar — aquí mostrar el estimado para guiar al cajero).
- Inputs de **conteo real** (`real_efectivo`, `real_qr`) + `observaciones`.
- **Diferencia en vivo** (real − esperado) con color y etiqueta: "Cuadra exacto" (0),
  "Sobrante" (>0), "Faltante" (<0) usando `StatusBadge`.
- `ConfirmDialog` con resumen antes de cerrar → `useCerrarCaja()`.
- Al éxito → mostrar resumen del cierre + botón a `/caja/historial` y a **Reporte**.

## PASO 3 — Reporte de cierre (printable)
Componente `components/caja/ReporteCierre.tsx` que renderiza un resumen imprimible
(apertura, ventas por método, ingresos, egresos, esperado, real, diferencia,
responsable, duración). Botón "Imprimir" (`window.print()` con CSS `@media print`).
El **envío** (correo/WhatsApp) se deja como modo demo (botón deshabilitado con
tooltip "próximamente" o que copie un resumen).

## PASO 4 — Historial: `app/caja/historial/page.tsx`
`useHistorial()`. Tabla de turnos propios cerrados (fecha apertura→cierre, duración,
ventas, diferencia con color). Solo lectura. `EmptyState` si no hay.

## Criterios de aceptación
- [ ] Ciclo completo desde la UI: abrir → vender (POS) → cerrar (con diferencia en
      vivo) → ver en historial.
- [ ] La cortesía no impacta el esperado.
- [ ] El total mostrado es informativo; el backend manda en el monto real.
- [ ] Reporte de cierre imprimible.
- [ ] Doble submit bloqueado en cobrar y cerrar.

> Con esto **cierra la Fase 2** (apartado del cajero funcional de punta a punta).
