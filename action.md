# ACTION — Fase 1 · Parte B: Servicios + Endpoints del Cajero (sin venta física)

> Plan: `docs/MODULO_CAJERO_CONTADOR.md` §3–4, `docs/BACKEND_IMPLEMENTACION.md`.
>
> **Pre-requisito:** Fase 1 · Parte A (schema de caja: CuentaFinanciera, CajaTurno,
> MovimientoCaja + cuentas sembradas). ✅
>
> **Objetivo:** la lógica de caja del cajero: abrir turno, registrar ingresos/gastos
> manuales, ver movimientos, cerrar caja (esperado vs real) e historial. Todo con
> autorización por rol y auditoría. **La venta física (POS) va en la Parte C.**
>
> Todos los archivos son NUEVOS. Usa `requireAuth`/`requireRole`/`logAudit` de la
> Fase 0. Ejecuta en orden; al final corre las pruebas del Paso 10.

---

## PASO 1 — Errores de API: `lib/server/errors.ts` (NUEVO)

```ts
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError, ForbiddenError } from '@/lib/server/auth/session';

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class ValidationError extends AppError { constructor(m = 'Datos inválidos') { super(422, m); } }
export class NotFoundError extends AppError { constructor(m = 'No encontrado') { super(404, m); } }
export class ConflictError extends AppError { constructor(m = 'Conflicto') { super(409, m); } }

export function handleApiError(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'Datos inválidos', code: 'VALIDATION', detalles: e.issues }, { status: 422 });
  }
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('API error:', e);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
```

---

## PASO 2 — DTOs (Zod): `lib/server/dto/caja.dto.ts` (NUEVO)

```ts
import { z } from 'zod';

export const metodoPagoSchema = z.enum(['EFECTIVO', 'QR', 'TARJETA']);

export const AperturaCajaDTO = z.object({
  apertura_efectivo: z.number().min(0),
  apertura_qr: z.number().min(0),
  observaciones: z.string().trim().max(500).optional(),
});

export const MovimientoManualDTO = z.object({
  concepto: z.string().trim().min(1).max(200),
  monto: z.number().positive(),
  metodo_pago: metodoPagoSchema,
  categoria: z.string().trim().max(100).optional(),
});

export const CierreCajaDTO = z.object({
  real_efectivo: z.number().min(0),
  real_qr: z.number().min(0),
  observaciones: z.string().trim().max(500).optional(),
});

export type AperturaCajaInput = z.infer<typeof AperturaCajaDTO>;
export type MovimientoManualInput = z.infer<typeof MovimientoManualDTO>;
export type CierreCajaInput = z.infer<typeof CierreCajaDTO>;
```

---

## PASO 3 — Servicio de caja: `lib/server/caja/caja.service.ts` (NUEVO)

```ts
import prisma from '@/lib/prisma';
import { Prisma, TipoMovimientoCaja, TipoCuenta } from '@prisma/client';
import type { Session } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/server/errors';
import type { AperturaCajaInput, MovimientoManualInput, CierreCajaInput } from '@/lib/server/dto/caja.dto';

interface Meta { ip?: string | null; userAgent?: string | null }

function sucursalDe(session: Session): number {
  if (session.sucursal_id == null) {
    throw new ValidationError('El usuario no tiene una sucursal asignada');
  }
  return session.sucursal_id;
}

export async function getTurnoActivo(session: Session) {
  const sucursal_id = sucursalDe(session);
  return prisma.cajaTurno.findFirst({
    where: { sucursal_id, estado: 'ABIERTO' },
    include: { movimientos: { orderBy: { created_at: 'desc' } } },
  });
}

export async function abrirTurno(session: Session, dto: AperturaCajaInput, meta: Meta = {}) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const existente = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (existente) throw new ConflictError('Ya existe un turno abierto en esta sucursal');

    const turno = await tx.cajaTurno.create({
      data: {
        sucursal_id,
        cajero_id: session.id,
        apertura_efectivo: dto.apertura_efectivo,
        apertura_qr: dto.apertura_qr,
        observaciones: dto.observaciones ?? null,
      },
    });
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'APERTURA_CAJA',
      entidad: 'CajaTurno', entidadId: turno.id,
      detalle: `Apertura efectivo ${dto.apertura_efectivo}, QR ${dto.apertura_qr}`,
      ip: meta.ip, userAgent: meta.userAgent,
    }, tx);
    return turno;
  });
}

async function getCuenta(tx: Prisma.TransactionClient, sucursal_id: number, tipo: TipoCuenta) {
  const cuenta = await tx.cuentaFinanciera.findUnique({
    where: { sucursal_id_tipo: { sucursal_id, tipo } },
  });
  if (!cuenta) throw new NotFoundError(`No existe la cuenta ${tipo} para la sucursal`);
  return cuenta;
}

export async function registrarMovimientoManual(
  session: Session,
  tipo: 'INGRESO_EXTRA' | 'GASTO_OPERATIVO',
  dto: MovimientoManualInput,
  meta: Meta = {},
) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const turno = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (!turno) throw new ConflictError('Abre caja antes de registrar movimientos');

    const cuenta = await getCuenta(tx, sucursal_id, dto.metodo_pago as TipoCuenta);
    const signed = tipo === 'GASTO_OPERATIVO' ? -Math.abs(dto.monto) : Math.abs(dto.monto);

    const mov = await tx.movimientoCaja.create({
      data: {
        turno_id: turno.id,
        cuenta_id: cuenta.id,
        tipo: tipo as TipoMovimientoCaja,
        metodo_pago: dto.metodo_pago as TipoCuenta,
        monto: signed,
        concepto: dto.concepto,
        categoria: dto.categoria ?? null,
        creado_por_id: session.id,
      },
    });
    await tx.cuentaFinanciera.update({
      where: { id: cuenta.id },
      data: { saldo: { increment: signed } },
    });
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'MovimientoCaja', entidadId: mov.id,
      detalle: `${tipo}: ${dto.concepto}`, monto: signed,
      ip: meta.ip, userAgent: meta.userAgent,
    }, tx);
    return mov;
  });
}

export async function getMovimientos(session: Session) {
  const sucursal_id = sucursalDe(session);
  const turno = await prisma.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
  if (!turno) return { turno: null, movimientos: [] };
  const movimientos = await prisma.movimientoCaja.findMany({
    where: { turno_id: turno.id },
    orderBy: { created_at: 'desc' },
  });
  return { turno, movimientos };
}

export async function cerrarTurno(session: Session, dto: CierreCajaInput, meta: Meta = {}) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const turno = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (!turno) throw new ConflictError('No hay un turno abierto para cerrar');

    const sumBy = async (where: Prisma.MovimientoCajaWhereInput) => {
      const r = await tx.movimientoCaja.aggregate({ _sum: { monto: true }, where: { turno_id: turno.id, ...where } });
      return r._sum.monto ?? new Prisma.Decimal(0);
    };

    const netEfectivo = await sumBy({ metodo_pago: 'EFECTIVO' });
    const netQr = await sumBy({ metodo_pago: 'QR' });
    const ventasEfectivo = await sumBy({ metodo_pago: 'EFECTIVO', tipo: 'VENTA' });
    const ventasQr = await sumBy({ metodo_pago: 'QR', tipo: 'VENTA' });

    const esperadoEfectivo = new Prisma.Decimal(turno.apertura_efectivo).plus(netEfectivo);
    const esperadoQr = new Prisma.Decimal(turno.apertura_qr).plus(netQr);
    const realEfectivo = new Prisma.Decimal(dto.real_efectivo);
    const realQr = new Prisma.Decimal(dto.real_qr);
    const difEfectivo = realEfectivo.minus(esperadoEfectivo);
    const difQr = realQr.minus(esperadoQr);

    const actualizado = await tx.cajaTurno.update({
      where: { id: turno.id },
      data: {
        estado: 'CERRADO',
        fecha_cierre: new Date(),
        ventas_efectivo: ventasEfectivo,
        ventas_qr: ventasQr,
        esperado_efectivo: esperadoEfectivo,
        esperado_qr: esperadoQr,
        real_efectivo: realEfectivo,
        real_qr: realQr,
        diferencia_efectivo: difEfectivo,
        diferencia_qr: difQr,
        observaciones: dto.observaciones ?? turno.observaciones,
      },
    });
    const difTotal = difEfectivo.plus(difQr);
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CIERRE_CAJA',
      entidad: 'CajaTurno', entidadId: turno.id,
      detalle: `Cierre. Diferencia efectivo ${difEfectivo}, QR ${difQr}`,
      monto: Number(difTotal), ip: meta.ip, userAgent: meta.userAgent,
    }, tx);
    return actualizado;
  });
}

export async function getHistorial(session: Session) {
  const sucursal_id = sucursalDe(session);
  return prisma.cajaTurno.findMany({
    where: { sucursal_id, cajero_id: session.id, estado: 'CERRADO' },
    orderBy: { fecha_apertura: 'desc' },
    take: 50,
  });
}
```

---

## PASO 4 — Endpoint `GET /api/caja/turno-activo` (NUEVO)

`app/api/caja/turno-activo/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import * as caja from '@/lib/server/caja/caja.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const turno = await caja.getTurnoActivo(session);
    return NextResponse.json(turno);
  } catch (e) { return handleApiError(e); }
}
```

---

## PASO 5 — Endpoint `POST /api/caja/apertura` (NUEVO)

`app/api/caja/apertura/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { AperturaCajaDTO } from '@/lib/server/dto/caja.dto';
import * as caja from '@/lib/server/caja/caja.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const dto = AperturaCajaDTO.parse(await req.json());
    const turno = await caja.abrirTurno(session, dto, { ip: getClientIp(req), userAgent: req.headers.get('user-agent') });
    return NextResponse.json(turno, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
```

---

## PASO 6 — Endpoints `POST /api/caja/ingreso` y `POST /api/caja/gasto` (NUEVOS)

`app/api/caja/ingreso/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { MovimientoManualDTO } from '@/lib/server/dto/caja.dto';
import * as caja from '@/lib/server/caja/caja.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const dto = MovimientoManualDTO.parse(await req.json());
    const mov = await caja.registrarMovimientoManual(session, 'INGRESO_EXTRA', dto, { ip: getClientIp(req), userAgent: req.headers.get('user-agent') });
    return NextResponse.json(mov, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
```

`app/api/caja/gasto/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { MovimientoManualDTO } from '@/lib/server/dto/caja.dto';
import * as caja from '@/lib/server/caja/caja.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const dto = MovimientoManualDTO.parse(await req.json());
    const mov = await caja.registrarMovimientoManual(session, 'GASTO_OPERATIVO', dto, { ip: getClientIp(req), userAgent: req.headers.get('user-agent') });
    return NextResponse.json(mov, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
```

---

## PASO 7 — Endpoint `GET /api/caja/movimientos` (NUEVO)

`app/api/caja/movimientos/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import * as caja from '@/lib/server/caja/caja.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const data = await caja.getMovimientos(session);
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
```

---

## PASO 8 — Endpoint `POST /api/caja/cierre` (NUEVO)

`app/api/caja/cierre/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { CierreCajaDTO } from '@/lib/server/dto/caja.dto';
import * as caja from '@/lib/server/caja/caja.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const dto = CierreCajaDTO.parse(await req.json());
    const turno = await caja.cerrarTurno(session, dto, { ip: getClientIp(req), userAgent: req.headers.get('user-agent') });
    return NextResponse.json(turno);
  } catch (e) { return handleApiError(e); }
}
```

---

## PASO 9 — Endpoint `GET /api/caja/historial` (NUEVO)

`app/api/caja/historial/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import * as caja from '@/lib/server/caja/caja.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const turnos = await caja.getHistorial(session);
    return NextResponse.json(turnos);
  } catch (e) { return handleApiError(e); }
}
```

---

## PASO 10 — Verificar (pruebas de la API)

Con `npm run dev` corriendo, primero **compila** sin errores de TypeScript. Luego
prueba el flujo. Necesitas el token del **cajero** (login `cajero@elevate.com` /
`cajero123`, copiar el token de localStorage o de la respuesta de `/api/auth/login`).

Reemplaza `TOKEN` abajo. (Puedes usar la consola del navegador, Postman, o `curl`.)

```bash
# 1. Turno activo (debe ser null al inicio)
curl -s http://localhost:3000/api/caja/turno-activo -H "Authorization: Bearer TOKEN"

# 2. Abrir caja
curl -s -X POST http://localhost:3000/api/caja/apertura -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"apertura_efectivo":100,"apertura_qr":0}'

# 3. Registrar un ingreso extra (efectivo +50)
curl -s -X POST http://localhost:3000/api/caja/ingreso -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"concepto":"Propina","monto":50,"metodo_pago":"EFECTIVO"}'

# 4. Registrar un gasto (efectivo -30)
curl -s -X POST http://localhost:3000/api/caja/gasto -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"concepto":"Servilletas","monto":30,"metodo_pago":"EFECTIVO","categoria":"Insumos"}'

# 5. Ver movimientos del turno
curl -s http://localhost:3000/api/caja/movimientos -H "Authorization: Bearer TOKEN"

# 6. Cerrar caja con conteo real (efectivo real = 120; esperado = 100+50-30 = 120 → cuadra)
curl -s -X POST http://localhost:3000/api/caja/cierre -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"real_efectivo":120,"real_qr":0,"observaciones":"Cierre de prueba"}'

# 7. Historial (debe mostrar el turno cerrado con diferencia 0)
curl -s http://localhost:3000/api/caja/historial -H "Authorization: Bearer TOKEN"
```

✅ Esperado:
- Apertura crea el turno (201).
- Ingreso/gasto crean movimientos (201) y actualizan la cuenta EFECTIVO.
- Cierre: `esperado_efectivo = 120`, `real_efectivo = 120`, `diferencia_efectivo = 0`.
- En `RegistroAuditoria` quedaron `APERTURA_CAJA`, dos `CREO` y un `CIERRE_CAJA`.

**Pruebas de seguridad (importantes):**
```bash
# Sin token → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/caja/turno-activo
# Con token de DUENO/ADMIN → 403 (no es CAJERO)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/caja/apertura -X POST -H "Authorization: Bearer TOKEN_ADMIN" -H "Content-Type: application/json" -d '{"apertura_efectivo":0,"apertura_qr":0}'
# Abrir dos veces → la segunda da 409
```

---

## Qué reportar de vuelta

1. ¿`npm run dev` compiló sin errores de TypeScript?
2. ¿El flujo apertura→ingreso→gasto→cierre funcionó? ¿El cierre dio diferencia 0?
3. ¿Las pruebas de seguridad dieron 401 (sin token), 403 (admin) y 409 (doble apertura)?
4. ¿Se ven los registros en `RegistroAuditoria`?
5. Cualquier error, tal cual.

> **Siguiente — Fase 1 · Parte C:** venta física (POS) — `POST /api/caja/venta`,
> transacción atómica (Transaccion + detalles + MovimientoCaja VENTA + actualización
> de caja + auditoría). El descuento de stock por receta se integra después con el
> módulo de inventario (Fase 5). Ver `docs/MODULO_CAJERO_CONTADOR.md` §3.2.
