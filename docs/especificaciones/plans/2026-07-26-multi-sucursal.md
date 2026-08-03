# Multi-sucursal — implementación y guía de despliegue

Fecha: 2026-07-26
Estado: **implementado y verificado en local. NO desplegado a producción.**

---

## Diseño acordado

| Compartido entre sucursales | Propio de cada sucursal |
|---|---|
| Producto (identidad, descripción, categoría) | Precio, disponibilidad, nombre y foto propios |
| Insumo (nombre, unidad de medida) | Stock, costo promedio, mínimos |
| Clientes | Receta (cantidades por plato) |
| Marcas / menús | Caja, turnos, cuentas financieras |
| | Ventas y toda la contabilidad |
| | Gastos fijos, operativos y activos fijos |

**Por qué el catálogo es compartido:** si cada local tuviera su copia del producto,
"Hamburguesa clásica" existiría dos veces con ids distintos y la analítica las
contaría como platos diferentes. Con un `producto_id` único se puede preguntar
"¿cómo se vende este plato en A vs B?" — que es justo lo que el consolidado hace.

---

## Migraciones (en orden)

| # | Migración | Qué hace | Backfill |
|---|---|---|---|
| 1 | `20260726000000_add_transaccion_sucursal` | `Transaccion.sucursal_id` **nullable** + índice + FK | Del turno si lo tiene; si no, sucursal principal |
| 2 | `20260726001000_transaccion_sucursal_not_null` | Pasa la columna a `NOT NULL`, FK a `RESTRICT` | — |
| 3 | `20260726002000_add_movimiento_caja_sucursal` | `MovimientoCaja.sucursal_id` | Turno → venta → cuenta → principal |
| 4 | `20260726003000_producto_y_receta_por_sucursal` | Tabla `ProductoSucursal` + `RecetasProducto.sucursal_id` | Catálogo actual → principal, con su precio |
| 5 | `20260726004000_stock_por_sucursal` | Tabla `StockSucursal` + `MovimientoInterno.sucursal_id` | Stock actual → principal |
| 6 | `20260726005000_gastos_y_activos_por_sucursal` | `sucursal_id` en `GastoFijo`, `GastoOperativo`, `ActivoFijo` | Todo → principal |

**Todas son aditivas.** No hay `DROP`, no hay borrado de filas y ninguna columna
existente cambia de tipo. Las ventas históricas no se tocan: solo se les completa
una columna que antes no existía.

**El único paso no reversible con un rollback simple** es la migración 2
(`NOT NULL`). Va deliberadamente separada del backfill para poder verificar antes
que no quedan nulos. Si en producción quedara alguna fila sin sucursal, esa
migración falla limpiamente sin dejar la tabla a medias.

---

## Antes de desplegar (las dos precauciones acordadas)

### 1. Backup de la base de datos

Obligatorio antes de aplicar las migraciones. Con datos de ventas, es lo que
convierte un error en un susto en lugar de una pérdida.

### 2. Quitar `prisma db push` del Build Command de Vercel

**Verificar en el dashboard de Vercel → Settings → Build & Development Settings.**

El script `build` del repo es seguro (`prisma generate && next build`), pero si el
Build Command del proyecto está sobrescrito con algo que incluya `prisma db push`,
hay que quitarlo antes de cualquier otra cosa. `db push` sincroniza por diferencia
y, ante un desajuste, ofrece resolverlo borrando — es exactamente lo que provocó
la pérdida de las tablas de fiado el 5 de julio.

Es el único punto de todo este trabajo donde se pueden perder datos.

---

## Secuencia de despliegue sugerida

```bash
# 1. Backup
# 2. Verificar el Build Command en Vercel

# 3. Aplicar migraciones (NUNCA `migrate dev`, que resetea por drift)
npx prisma migrate deploy

# 4. Verificar que no quedaron nulos antes de confiar en el NOT NULL
#    (la migración 2 ya lo garantiza, pero conviene mirar)
SELECT COUNT(*) FROM "Transaccion" WHERE "sucursal_id" IS NULL;   -- debe dar 0
SELECT COUNT(*) FROM "MovimientoCaja" WHERE "sucursal_id" IS NULL; -- debe dar 0
```

Tras el despliegue el sistema se comporta **igual que antes**: hay una sola
sucursal ("Elevate Fitbull") y todo le pertenece. Los cambios solo se notan al
crear la segunda sucursal.

---

## Cómo dar de alta la Sucursal B

1. **Admin → Gestión → Sucursales → + Nueva sucursal.**
   Se crean automáticamente sus cuentas de caja (Efectivo y QR); sin ellas no se
   puede abrir turno.
2. **Asignar usuarios** (Admin → Usuarios): el cajero queda amarrado a su sucursal
   y solo ve y opera lo suyo.
3. **Habilitar productos**: en Productos, el botón 🏬 de cada fila abre "por
   sucursal". Al habilitarlo en B se **copia la receta** de la sucursal que ya la
   tenga, y se le pone su propio precio. Desde ese momento la receta de B es
   independiente: editarla no afecta a A.
4. **Cargar inventario**: Admin → Inventario → Stock por Sucursal. B arranca en
   cero. Se puede cargar con movimientos normales o traer mercadería de A con
   **Transferir stock**.
5. **Gastos fijos** de B (alquiler, servicios) se registran con su sucursal.

---

## Qué quedó fuera (deuda técnica consciente)

**Solo queda un punto abierto**, y es deliberado:

- **`Insumo.stock_actual` y `costo_promedio` siguen existiendo como agregado**
  del negocio (suma / referencia de todas las sucursales). El stock y el costo
  reales por local viven en `StockSucursal`, y `stock-sucursal.service.ts` es el
  punto único que escribe ambos para que no se desincronicen.

  **Ninguna decisión operativa los usa ya**: disponibilidad, bloqueo de pedidos,
  costo de receta, CMV, food cost, alertas, rinde, inventario valorizado y
  reportes leen por sucursal. Lo único que queda leyendo el agregado son dos
  usos donde no hay sucursal en contexto y el valor es solo una referencia
  inicial: el precargado del insumo de reventa en el wizard de producto
  (`AdminProductWizard`) y el fallback de costo cuando un local todavía no
  maneja ese insumo.

  Retirar las columnas requiere una migración destructiva y su beneficio es
  puramente cosmético, así que se deja indefinidamente pendiente: mientras el
  doble escritura viva en un solo lugar y esté cubierto por tests, el agregado
  no molesta y sirve de red.

### Resuelto después de la implementación inicial

- **Alertas por local** (antes evaluaban el total): `evaluarAlertas`,
  `/api/alertas`, `/api/admin/alertas`, el envío por WhatsApp y las alertas del
  dashboard ahora recorren `StockSucursal`. Un local en cero ya no queda tapado
  por el stock del otro, y el aviso dice de qué sucursal se trata.
- **Inventario por local**: `/api/insumo?sucursal=` devuelve stock, costo y
  mínimos de ese local con la misma forma de antes; la pantalla de Inventario
  tiene selector de sucursal y sus movimientos (compra, merma, conteo) se
  registran en el local seleccionado.
- **Elección de local en la tienda**: `GET /api/sucursales` (público),
  `useSucursalTienda` (recuerda la elección en `localStorage`) y `SucursalPicker`
  en la home y el menú. El checkout manda `sucursal_id`. Con una sola sucursal el
  selector no se muestra.
- **`DataTable` con filas selectivamente clickeables** vía `isRowClickable`.
- **Disponibilidad y bloqueo de pedidos por local** (`calcularRinde`): un plato
  sin stock en su sucursal sale agotado aunque otra tenga de sobra. Antes el
  agregado permitía vender lo que el local no tenía.
- **Costo de receta con el costo del local** (`costoFichaTecnica`): CMV y food
  cost por sucursal reflejan lo que ese local paga por sus insumos.
- **Inventario valorizado, `porcionesArmables`, `/api/stats` y el rinde de la
  lista de Productos** (con selector de sucursal) leen por local.

---

## Verificación hecha

- `npx tsc --noEmit` limpio.
- Suite completa: **25 archivos, 164 tests, todos pasan** (148 previos + 16
  nuevos de multi-sucursal).
- Los tests nuevos (`lib/server/sucursales/multi-sucursal.test.ts`) cubren lo que
  ningún test previo notaría si se rompe: alcance por rol, que la receta de una
  sucursal no contamine a la otra, que el precio sea independiente, y que la
  transferencia mueva stock entre locales sin alterar el total del negocio.
