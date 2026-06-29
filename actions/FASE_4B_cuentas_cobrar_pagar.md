# FASE 4 · B — Cuentas por Cobrar / Pagar

> Módulo independiente (paralelizable). Depende solo de Fase 0. Rol DUENO/ADMIN.
> Ref: `docs/MODULO_ADMINISTRADOR.md` §3.8, `docs/BASE_DE_DATOS.md` §4.5.

## PASO 1 — Schema
Agregar (si no existe) y migrar `npx prisma migrate dev --name fase4_cuentas_corrientes`:
```prisma
enum EstadoCuenta { PENDIENTE PARCIAL PAGADA }
enum TipoCuentaCxCxP { POR_COBRAR POR_PAGAR }

model CuentaCorriente {
  id            Int             @id @default(autoincrement())
  tipo          TipoCuentaCxCxP
  contraparte   String          // deudor o acreedor
  concepto      String
  monto         Decimal         @db.Decimal(12, 2)
  monto_pagado  Decimal         @db.Decimal(12, 2) @default(0)
  vencimiento   DateTime?
  estado        EstadoCuenta    @default(PENDIENTE)
  creado_por_id Int
  created_at    DateTime        @default(now())
  update_at     DateTime        @updatedAt
  @@index([tipo, estado])
}
```

## PASO 2 — Backend
- `lib/server/admin/cuentas-corrientes.service.ts`:
  - CRUD + **registrar pago** (`registrarPago(id, monto)`): incrementa `monto_pagado`,
    recalcula `estado` (PAGADA si `monto_pagado>=monto`, PARCIAL si >0, si no
    PENDIENTE). Transaccional. Validar que `monto_pagado` no supere `monto`.
  - Agregados: por_cobrar/cobrado/total y por_pagar/pagado/total.
- DTO Zod (crear: `tipo`, `contraparte`, `concepto`, `monto>0`, `vencimiento?`;
  pago: `monto>0`).
- Endpoints `GET/POST /api/admin/cuentas-corrientes`, `PUT /api/admin/cuentas-corrientes/[id]/pago`.
  Rol DUENO/ADMIN. Auditar create/pago.

## PASO 3 — Front
Dos páginas que comparten componentes:
- `app/admin/cuentas-cobrar/page.tsx` (tipo POR_COBRAR)
- `app/admin/cuentas-pagar/page.tsx` (tipo POR_PAGAR)
Cada una: KpiCards (Por cobrar/pagar [destacado], Cobrado/Pagado, Total registrado);
filtros (Todas/Pendientes/Cobradas|Pagadas); tabla (contraparte/concepto, vencimiento,
estado [`StatusBadge`], monto); modal "Nueva cuenta" y acción "Registrar pago".
Agregar ambos items al grupo ADMINISTRACIÓN del sidebar.

## Criterios de aceptación
- [ ] CRUD + pagos parciales actualizan `estado` correctamente.
- [ ] `monto_pagado` nunca supera `monto` (validado en servidor).
- [ ] Totales (por cobrar/pagar/pagado) correctos; auditoría en mutaciones.
