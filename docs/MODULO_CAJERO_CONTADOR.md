# MÓDULO CAJERO / CONTADOR

> Rol: **CAJERO**. Apartado **independiente** del admin. Ruta base: `/caja/*`.
> Responsabilidad: el ciclo de caja del día. **Sin** acceso a `/admin/*`.

---

## 1. Objetivo y alcance

El cajero gestiona la operación presencial: abre caja al iniciar el día, registra
ventas físicas y cobros, anota ingresos/egresos manuales, revisa los movimientos del
turno y **cierra caja** comparando lo esperado con lo real, dejando todo auditado.

**Lo que NO puede hacer** (restricciones):
- Acceder a configuración del negocio, usuarios, contabilidad completa, activos,
  cuentas por cobrar/pagar, ni precios de productos.
- Editar/borrar movimientos pasados (solo agrega; correcciones vía ajuste).
- Abrir un segundo turno si ya hay uno abierto en su sucursal.
- Ver datos de otras sucursales.

---

## 2. Pantallas (frontend) — `/caja/*`

| Ruta | Pantalla | Descripción |
|------|----------|-------------|
| `/caja` | Dashboard de caja | Estado del turno, apertura/ventas/esperado por método, accesos rápidos |
| `/caja/apertura` | Apertura de caja | Form: monto inicial efectivo + QR, observaciones |
| `/caja/venta` | Venta física (POS) | Selección de productos, método de pago, cortesía, cobro |
| `/caja/movimientos` | Movimientos del día | Lista de ventas/ingresos/egresos del turno |
| `/caja/ingreso` | Ingreso extra | Concepto, monto, método |
| `/caja/gasto` | Gasto operativo | Concepto, categoría, monto, método |
| `/caja/cierre` | Cierre de caja | Esperado vs real, diferencias, observaciones |
| `/caja/historial` | Historial de turnos | Turnos propios con duración y diferencia |

Layout propio `CajaLayout` con guard `requireRole(['CAJERO'])` (y `ADMIN/DUENO`
pueden entrar para supervisar, pero el cajero NO puede salir a `/admin`).

---

## 3. Flujos detallados (reglas de negocio)

### 3.1 Apertura de caja
- **Precondición:** no existe turno `ABIERTO` para la sucursal del cajero.
- Inputs: `apertura_efectivo`, `apertura_qr`, `observaciones?`.
- Efecto: crea `CajaTurno(estado=ABIERTO)`, setea saldos de apertura,
  `RegistroAuditoria(APERTURA_CAJA)`.
- **Errores:** turno ya abierto → 409; montos negativos → 422.

### 3.2 Registro de venta física (POS)
- Selección de productos (cantidades), método de pago (Efectivo/QR/Tarjeta), flag
  **cortesía** (no suma a ingresos).
- Transacción atómica (ver `BASE_DE_DATOS.md` §9.2): crea `Transaccion(canal=SALON,
  turno_id)`, `MovimientoCaja(VENTA)`, actualiza `CuentaFinanciera`, descuenta stock,
  audita.
- Acumula `ventas_efectivo` / `ventas_qr` del turno.
- **Errores:** sin turno abierto → 409; stock insuficiente → 422 (configurable:
  permitir con advertencia); total ≤ 0 → 422.

### 3.3 Ingresos / Egresos manuales
- `IngresoExtra` (+) o `GastoOperativo` (−) ligados al turno y método de pago.
- Genera `MovimientoCaja` correspondiente y actualiza saldos. Auditado.

### 3.4 Movimientos del día
- Lista filtrable (todos/ingresos/egresos, efectivo/QR) del turno activo.
- Solo lectura para el cajero (no edita).

### 3.5 Cierre de caja  ⭐ operación crítica
- **Cálculo:**
  - `esperado_efectivo = apertura_efectivo + ventas_efectivo + ingresos_efectivo − egresos_efectivo`
  - `esperado_qr` análogo.
- El cajero ingresa `real_efectivo`, `real_qr` (conteo físico/arqueo) + observaciones.
- `diferencia_* = real_* − esperado_*` → etiqueta: **"Cuadra exacto"** (0),
  **"sobrante"** (>0), **"faltante"** (<0).
- Transacción atómica: persiste cierre, `estado=CERRADO`, `fecha_cierre`,
  `RegistroAuditoria(CIERRE_CAJA, monto=diferencia)`.
- **Reglas:** no se puede cerrar un turno ya cerrado (revalidar estado); tras cerrar,
  el cajero debe abrir uno nuevo para seguir operando.
- **Reporte de cierre:** genera PDF/printable (apertura, ventas por método, ingresos,
  egresos, esperado, real, diferencia, responsable, duración) y opción de envío
  (correo/WhatsApp — modo demo primero).

### 3.6 Historial de turnos
- Lista de turnos del cajero (fecha, duración, diferencia, responsable, sucursal).
- Solo lectura.

---

## 4. Backend (endpoints)

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| GET | `/api/caja/turno-activo` | Turno abierto del cajero (o null) | CAJERO |
| POST | `/api/caja/apertura` | Abrir turno | CAJERO |
| POST | `/api/caja/venta` | Registrar venta física (atómica) | CAJERO |
| POST | `/api/caja/ingreso` | Ingreso extra | CAJERO |
| POST | `/api/caja/gasto` | Gasto operativo | CAJERO |
| GET | `/api/caja/movimientos` | Movimientos del turno | CAJERO |
| POST | `/api/caja/cierre` | Cerrar turno (atómica) | CAJERO |
| GET | `/api/caja/historial` | Turnos propios | CAJERO |
| GET | `/api/caja/cierre/:id/reporte` | Reporte PDF | CAJERO |

> Todos validan que el recurso pertenezca a la **sucursal/turno del cajero**
> autenticado (no confiar en IDs del cliente). Ver `BACKEND_IMPLEMENTACION.md`.

---

## 5. DTOs y validaciones (Zod)
- `AperturaCajaDTO { apertura_efectivo>=0, apertura_qr>=0, observaciones? }`
- `VentaFisicaDTO { items:[{producto_id, cantidad>0}], metodo_pago, es_cortesia }`
- `MovimientoManualDTO { concepto, monto>0, metodo_pago, categoria? }`
- `CierreCajaDTO { real_efectivo>=0, real_qr>=0, observaciones? }`
- Validación de montos con 2 decimales; rechazar NaN/negativos.

---

## 6. Base de datos (referencia)
`CajaTurno`, `MovimientoCaja`, `CuentaFinanciera`, `IngresoExtra`, `GastoOperativo`,
`Transaccion(canal, turno_id, metodo_pago, es_cortesia, cajero_id)`. Detalle en
`BASE_DE_DATOS.md` §3–4.

---

## 7. Seguridad (crítico para caja)
- Autorización por rol server-side; el cajero solo opera su turno/sucursal.
- **Anti-manipulación de montos:** el servidor recalcula totales desde productos y
  precios de BD; NUNCA confía en el total enviado por el cliente.
- Esperado de caja se calcula en servidor; el cliente solo envía el conteo real.
- Idempotencia en apertura/cierre (evitar doble submit).
- Rate limiting en endpoints de venta/cierre.
- Toda operación auditada. Ver `SEGURIDAD_Y_AUDITORIA.md` §operaciones críticas.

---

## 8. UX/UI
- Flujo POS rápido (teclado numérico, búsqueda de producto, atajos).
- Indicadores claros del estado del turno (Abierto/Cerrado) y método de pago.
- Confirmaciones en cierre con resumen antes de persistir.
- Estados de carga y manejo de error inline. Responsive (tablet de caja).

---

## 9. Casos de error (resumen)
| Caso | Código | Mensaje |
|------|--------|---------|
| Abrir con turno ya abierto | 409 | "Ya existe un turno abierto" |
| Venta sin turno | 409 | "Abre caja antes de vender" |
| Stock insuficiente | 422 | "Stock insuficiente para X" |
| Cerrar turno ya cerrado | 409 | "El turno ya fue cerrado" |
| Monto inválido | 422 | "Monto inválido" |
| Sin permisos | 403 | "No autorizado" |

---

## 10. Criterios de aceptación
- [ ] El cajero NO puede entrar a `/admin/*` (redirect/403).
- [ ] La venta física descuenta stock y suma a caja en una sola transacción.
- [ ] El cierre calcula esperado vs real y guarda la diferencia con etiqueta.
- [ ] Toda acción del cajero aparece en Auditoría con su usuario y montos.
- [ ] El total de la venta lo calcula el servidor (no el cliente).
