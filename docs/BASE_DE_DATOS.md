# BASE DE DATOS — Modelo de datos propuesto

> Diseño de datos para los nuevos módulos (caja/turnos, finanzas, administración,
> RBAC, auditoría). Stack: **Prisma 7 + PostgreSQL**. Convención: snake_case en
> campos, español, igual que el schema actual.
>
> Relacionado: `MODULO_INVENTARIO.md` (extensiones de inventario/producto).

---

## 1. Principios de diseño

- **Integridad referencial** con FKs explícitas; `onDelete` consciente (Restrict en
  finanzas para no perder historial; Cascade solo en puentes).
- **Campos de auditoría** en toda tabla transaccional: `created_at`, `update_at`,
  `creado_por_id` (FK Usuario).
- **Soft delete** donde se requiere historial: `activo Boolean @default(true)` o
  `deleted_at DateTime?` (NO borrar usuarios, turnos, movimientos, ventas).
- **Dinero:** usar `Decimal @db.Decimal(12,2)` (Prisma `Decimal`) en montos para
  evitar errores de float. (Hoy el schema usa `Float`; ver §10 migración de tipos.)
- **Historial inmutable:** los movimientos de caja y la auditoría no se editan; se
  corrigen con contra-movimientos.
- **Índices** en columnas de filtro frecuente (fechas, FKs, estado, método de pago).

---

## 2. RBAC y organización

### 2.1 Enum de roles
```prisma
enum Rol {
  DUENO      // control total (incl. usuarios y config sensible)
  ADMIN      // gestión operativa y financiera, sin tocar dueños
  CAJERO     // apartado de caja; sin acceso a /admin
  CLIENTE    // tienda online
}
```

### 2.2 Cambios a `Usuario` (tabla existente)
| Campo nuevo | Tipo | Notas |
|-------------|------|-------|
| `rol` | `Rol @default(CLIENTE)` | Migrar de `String`. Requiere data-migration de valores actuales |
| `username` | `String? @unique` | Login alterno al email (las imágenes usan username) |
| `activo` | `Boolean @default(true)` | Soft delete / desactivar acceso |
| `ultimo_acceso` | `DateTime?` | Telemetría de sesión |
| `sucursal_id` | `Int?` (FK Sucursal) | Cajero asignado a una sucursal |

### 2.3 `Sucursal` (generaliza `Configuracion`)
```prisma
model Sucursal {
  id            Int      @id @default(autoincrement())
  nombre        String
  direccion     String?
  lat           Float?
  lng           Float?
  activa        Boolean  @default(true)
  usuarios      Usuario[]
  turnos        CajaTurno[]
  created_at    DateTime @default(now())
  update_at     DateTime @updatedAt
}
```
> `Configuracion` (singleton) se conserva para parámetros globales; los datos de
> ubicación migran a `Sucursal` (al menos una por defecto en el seed).

---

## 3. Núcleo de caja (transaccional)

### 3.1 `CuentaFinanciera` (Caja Efectivo / Caja QR / Banco)
Saldo por método/cuenta para "Cuentas" y arqueo.
```prisma
enum TipoCuenta { EFECTIVO QR TARJETA BANCO }

model CuentaFinanciera {
  id           Int            @id @default(autoincrement())
  sucursal_id  Int
  tipo         TipoCuenta
  nombre       String
  saldo        Decimal        @db.Decimal(12,2) @default(0)
  sucursal     Sucursal       @relation(fields: [sucursal_id], references: [id])
  movimientos  MovimientoCaja[]
  @@unique([sucursal_id, tipo])
}
```

### 3.2 `CajaTurno` (apertura/cierre — reemplaza/extiende `Caja`)
```prisma
enum EstadoTurno { ABIERTO CERRADO }

model CajaTurno {
  id                  Int          @id @default(autoincrement())
  sucursal_id         Int
  cajero_id           Int          // Usuario que abre el turno
  estado              EstadoTurno  @default(ABIERTO)
  // Apertura
  apertura_efectivo   Decimal      @db.Decimal(12,2) @default(0)
  apertura_qr         Decimal      @db.Decimal(12,2) @default(0)
  fecha_apertura      DateTime     @default(now())
  // Cierre (esperado vs real)
  ventas_efectivo     Decimal      @db.Decimal(12,2) @default(0)
  ventas_qr           Decimal      @db.Decimal(12,2) @default(0)
  esperado_efectivo   Decimal?     @db.Decimal(12,2)
  esperado_qr         Decimal?     @db.Decimal(12,2)
  real_efectivo       Decimal?     @db.Decimal(12,2)
  real_qr             Decimal?     @db.Decimal(12,2)
  diferencia_efectivo Decimal?     @db.Decimal(12,2)  // real - esperado
  diferencia_qr       Decimal?     @db.Decimal(12,2)
  observaciones       String?
  fecha_cierre        DateTime?
  // Relaciones
  sucursal            Sucursal     @relation(fields: [sucursal_id], references: [id])
  cajero              Usuario      @relation(fields: [cajero_id], references: [id])
  movimientos         MovimientoCaja[]
  created_at          DateTime     @default(now())
  update_at           DateTime     @updatedAt

  @@index([sucursal_id, estado])
  @@index([fecha_apertura])
}
```
> Regla: **solo un turno ABIERTO por (sucursal)** a la vez (validar en servicio +
> índice parcial recomendado vía migración SQL: `WHERE estado='ABIERTO'`).

### 3.3 `MovimientoCaja` (libro de caja del turno)
```prisma
enum TipoMovimientoCaja {
  VENTA            // ingreso por venta (física u online cobrada en caja)
  INGRESO_EXTRA    // ingreso no operativo
  GASTO_OPERATIVO  // egreso operativo
  COMPRA_INSUMO    // egreso por compra de inventario
  AJUSTE           // arqueo / corrección (+/-)
  RETIRO           // retiro de efectivo
}

model MovimientoCaja {
  id              Int                @id @default(autoincrement())
  turno_id        Int?
  cuenta_id       Int                // EFECTIVO/QR afectada
  tipo            TipoMovimientoCaja
  metodo_pago     TipoCuenta         // EFECTIVO | QR | TARJETA
  monto           Decimal            @db.Decimal(12,2) // + entra, − sale
  concepto        String
  categoria       String?            // Insumos, Ventas, Servicios, ...
  transaccion_id  Int?               // si proviene de una venta
  es_cortesia     Boolean            @default(false) // "no es ingreso"
  creado_por_id   Int
  created_at      DateTime           @default(now())

  turno           CajaTurno?         @relation(fields: [turno_id], references: [id])
  cuenta          CuentaFinanciera   @relation(fields: [cuenta_id], references: [id])
  transaccion     Transaccion?       @relation(fields: [transaccion_id], references: [id])
  creado_por      Usuario            @relation(fields: [creado_por_id], references: [id])

  @@index([turno_id])
  @@index([created_at])
  @@index([tipo, metodo_pago])
}
```

### 3.4 Cambios a `Transaccion` (ventas)
| Campo nuevo | Tipo | Notas |
|-------------|------|-------|
| `canal` | `enum CanalVenta { WEB PICKUP SALON }` | Distinguir online vs presencial |
| `metodo_pago` | `enum TipoCuenta` | Migrar de `String?` |
| `turno_id` | `Int?` (FK CajaTurno) | Venta física asociada a un turno |
| `es_cortesia` | `Boolean @default(false)` | No suma a ingresos |
| `cajero_id` | `Int?` (FK Usuario) | Quién registró la venta presencial |
| `movimientos` | `MovimientoCaja[]` | Relación inversa |

---

## 4. Finanzas

### 4.1 `IngresoExtra`
```prisma
model IngresoExtra {
  id            Int        @id @default(autoincrement())
  sucursal_id   Int
  concepto      String
  monto         Decimal    @db.Decimal(12,2)
  metodo_pago   TipoCuenta
  fecha         DateTime   @default(now())
  turno_id      Int?
  creado_por_id Int
  created_at    DateTime   @default(now())
}
```

### 4.2 `GastoOperativo` (extiende el `Gasto` actual)
```prisma
model GastoOperativo {
  id            Int        @id @default(autoincrement())
  sucursal_id   Int
  concepto      String
  categoria     String     // Insumos, Servicios, Sueldos, ...
  monto         Decimal    @db.Decimal(12,2)
  metodo_pago   TipoCuenta
  fecha         DateTime   @default(now())
  turno_id      Int?
  creado_por_id Int
  created_at    DateTime   @default(now())
}
```

### 4.3 `GastoFijo` (recurrente)
```prisma
enum Frecuencia { MENSUAL QUINCENAL SEMANAL ANUAL }

model GastoFijo {
  id            Int        @id @default(autoincrement())
  concepto      String
  categoria     String     // Alquiler, Sueldos, Servicios
  monto         Decimal    @db.Decimal(12,2)
  frecuencia    Frecuencia @default(MENSUAL)
  activo        Boolean    @default(true)
  creado_por_id Int
  created_at    DateTime   @default(now())
  update_at     DateTime   @updatedAt
}
```

### 4.4 `ActivoFijo`
```prisma
model ActivoFijo {
  id               Int       @id @default(autoincrement())
  nombre           String
  categoria        String    // Refrigeración, Mobiliario, Tecnología, Vehículos...
  fecha_compra     DateTime
  valor_original   Decimal   @db.Decimal(12,2)
  valor_actual     Decimal   @db.Decimal(12,2)
  depreciacion_pct Decimal?  @db.Decimal(5,2)
  notas            String?
  activo           Boolean   @default(true)
  creado_por_id    Int
  created_at       DateTime  @default(now())
  update_at        DateTime  @updatedAt
}
```

### 4.5 Cuentas por Cobrar / Pagar
```prisma
enum EstadoCuenta { PENDIENTE PARCIAL PAGADA }
enum TipoCuentaCxCxP { POR_COBRAR POR_PAGAR }

model CuentaCorriente {
  id            Int             @id @default(autoincrement())
  tipo          TipoCuentaCxCxP
  contraparte   String          // deudor o acreedor
  concepto      String
  monto         Decimal         @db.Decimal(12,2)
  monto_pagado  Decimal         @db.Decimal(12,2) @default(0)
  vencimiento   DateTime?
  estado        EstadoCuenta    @default(PENDIENTE)
  creado_por_id Int
  created_at    DateTime        @default(now())
  update_at     DateTime        @updatedAt
  @@index([tipo, estado])
}
```

---

## 5. Auditoría

```prisma
enum AccionAuditoria { CREO MODIFICO ELIMINO LOGIN LOGOUT APERTURA_CAJA CIERRE_CAJA }

model RegistroAuditoria {
  id          Int             @id @default(autoincrement())
  usuario_id  Int
  rol         Rol
  accion      AccionAuditoria
  entidad     String          // "Caja", "Pedido", "Usuario", "Movimiento", ...
  entidad_id  String?
  detalle     String
  monto       Decimal?        @db.Decimal(12,2)
  ip          String?
  user_agent  String?
  created_at  DateTime        @default(now())

  usuario     Usuario         @relation(fields: [usuario_id], references: [id])
  @@index([usuario_id])
  @@index([created_at])
  @@index([entidad])
}
```

---

## 6. Resumen de tablas

| Acción | Tablas |
|--------|--------|
| **Nuevas** | Sucursal, CuentaFinanciera, CajaTurno, MovimientoCaja, IngresoExtra, GastoOperativo, GastoFijo, ActivoFijo, CuentaCorriente, RegistroAuditoria |
| **Modificadas** | Usuario (rol/username/activo/sucursal), Transaccion (canal/metodo_pago/turno/cajero/cortesía), Insumo + Producto + MovimientoInterno (ver MODULO_INVENTARIO) |
| **Conservadas** | Categoria, CategoriasProducto, RecetasProducto, InsumoMixtoDetalle, Promociones, ReglasHorarias, Configuracion |
| **Deprecar gradualmente** | `Caja`/`Gasto` simples → migrar a `CajaTurno`/`GastoOperativo` |

---

## 7. Relaciones clave (diagrama textual)

```
Sucursal 1───* Usuario (cajeros)
Sucursal 1───* CajaTurno 1───* MovimientoCaja *───1 CuentaFinanciera
CajaTurno  1───* Transaccion (ventas físicas)
Transaccion 1──* MovimientoCaja
Usuario   1───* RegistroAuditoria
Usuario   1───* (creado_por) en todas las tablas financieras
```

---

## 8. Índices y restricciones recomendados

- `@@unique([sucursal_id, tipo])` en CuentaFinanciera.
- Índice parcial SQL: un solo `CajaTurno` ABIERTO por sucursal.
- `@@index` en `created_at` de movimientos/auditoría (consultas por rango).
- `CHECK (monto >= 0)` donde aplique (vía migración SQL para apertura/montos).
- FK `onDelete: Restrict` en movimientos/turnos/ventas (no borrar historial).

---

## 9. Consideraciones transaccionales (críticas)

1. **Cierre de caja** = transacción atómica (`prisma.$transaction`):
   - Calcular `esperado_* = apertura_* + ventas_* + ingresos − egresos`.
   - Registrar `real_*`, `diferencia_*`, `observaciones`, `fecha_cierre`, `estado=CERRADO`.
   - Insertar `RegistroAuditoria(CIERRE_CAJA)`.
   - Bloqueo optimista para evitar doble cierre (revalidar `estado=ABIERTO`).
2. **Venta física** = transacción atómica:
   - Crear `Transaccion` + `TransaccionesDetalles`.
   - Crear `MovimientoCaja(VENTA)` y actualizar `CuentaFinanciera.saldo`.
   - Descontar stock (recetas) + `MovimientoInterno`.
   - Auditar. Todo o nada.
3. **Arqueo/ajuste** genera `MovimientoCaja(AJUSTE)` con monto +/- y auditoría;
   nunca edita movimientos pasados.

---

## 10. Migraciones recomendadas (orden)

1. `add_rbac` — enum `Rol`, campos en `Usuario`, data-migration de `rol` string→enum.
2. `add_sucursal` — tabla `Sucursal` + seed sucursal por defecto + FK en Usuario.
3. `add_caja_turnos` — `CuentaFinanciera`, `CajaTurno`, `MovimientoCaja`, enums.
4. `extend_transaccion` — canal, metodo_pago(enum), turno, cajero, cortesía.
5. `add_finanzas` — IngresoExtra, GastoOperativo, GastoFijo, ActivoFijo, CuentaCorriente.
6. `add_auditoria` — RegistroAuditoria.
7. `money_to_decimal` — (opcional, recomendado) Float→Decimal en montos.

> Usar `prisma migrate dev` (con historial) a partir de aquí, no `db push`, para
> tener migraciones reproducibles en producción.

---

## 11. Seed mínimo requerido

- Roles implícitos (enum) + 1 usuario `DUENO`, 1 `ADMIN`, 1 `CAJERO` de prueba.
- 1 `Sucursal` por defecto (migrando datos de `Configuracion`).
- `CuentaFinanciera` EFECTIVO y QR para la sucursal.
