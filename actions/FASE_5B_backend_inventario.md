# FASE 5 · B — Backend de inventario (movimientos, descuento de stock, analítica, alertas)

> Depende de 5A. Ref: `docs/MODULO_INVENTARIO.md` §C, §D.5.1. Rol DUENO/ADMIN
> (descuento de stock lo dispara el flujo de pedidos/ventas).

## PASO 1 — Servicio de inventario: `lib/server/inventario/inventario.service.ts`
- **Estado de insumo** (derivado): `ok | bajo | critico | agotado` según
  `stock_actual`, `stock_minimo` (reorden) y `punto_critico`.
- **Registrar compra** (`registrarCompra(insumoId, cantidad, costoUnitario, nota?)`):
  costo **promedio ponderado** → `nuevoCosto = (stock*costoActual + cantidad*costoU) /
  (stock+cantidad)`; sube `stock_actual`; crea `MovimientoInterno` tipo `INGRESO`
  (con `costo_unitario`). Transaccional + auditoría.
- **Registrar merma** (`MovimientoInterno` tipo `MERMA`, −cantidad).
- **Registrar conteo físico** (`MovimientoInterno` tipo `AJUSTE` con varianza =
  nuevoStock − actual).
- **Costo de ficha técnica** y **food cost %** de un producto (Σ insumos resueltos,
  con cascada de insumos mixtos vía `InsumoMixtoDetalle` y `rendimiento`).
- **Porciones armables** = min(stock_insumo / cantidad_receta).

## PASO 2 — Descuento automático de stock por pedido/venta
`descontarStockPorTransaccion(tx, transaccionId)`:
- Para cada `TransaccionesDetalles` → resolver receta (`RecetasProducto`), con cascada
  de insumos mixtos, calcular consumo de insumos crudos × cantidad.
- Restar de `Insumo.stock_actual`; crear `MovimientoInterno` tipo `VENTA`
  (con `transaccion_id`). Marca anti-doble-descuento (no descontar si ya se hizo).
- **Integrar** en: (a) `caja.service.registrarVentaFisica` (quitar el TODO de 1C), y
  (b) el cambio de estado de pedido a `EN_PREPARACION`/`ENTREGADO` en
  `app/api/pedidos/[id]`.
- Evaluar alertas tras descontar (insumos que cruzan umbral).

## PASO 3 — Analítica / KPIs: `lib/server/inventario/analitica.service.ts`
Calcular desde `Transaccion`/`TransaccionesDetalles`/`Producto`/`Insumo`:
- Ventas por día/mes, food cost %, **ingeniería de menú** (Estrella/Caballo/Puzzle/
  Perro por ventas×margen), heatmap hora×día, mix por categoría/marca.
- Endpoint `GET /api/admin/analitica?rango=`.

## PASO 4 — Alertas de inventario
- CRUD `GET/PUT /api/admin/configuracion-alertas` (singleton id=1) y
  `GET /api/admin/alertas` (insumos bajo umbral + historial `RegistroAlerta`).
- Envío real se hace en Fase 6 (aquí solo persistir/simular: estado `simulated`).

## PASO 5 — Crear producto con ficha técnica (para el wizard)
`POST /api/productos` (o `/api/admin/productos`) que acepte: datos del producto +
`tipo` + `marcas[]` + `receta[]` (insumos/sub-recetas con cantidades) +
`estado_publicacion`. Transaccional. Calcular costo desde la receta.

## Criterios de aceptación
- [ ] Compra aplica costo promedio ponderado correcto.
- [ ] Merma y conteo generan los movimientos correctos.
- [ ] La venta/pedido descuenta stock en cascada (recetas→insumos), sin doble descuento.
- [ ] Food cost, márgenes e ingeniería de menú calculan bien.
- [ ] Endpoints validan rol; mutaciones auditadas.
