# FASE 1 · C — Venta física (POS) backend

> Cierra la Fase 1. Endpoint `POST /api/caja/venta`: registra una venta presencial de
> forma **atómica** (Transaccion + detalles + MovimientoCaja VENTA + actualización de
> caja + auditoría). Depende de 1A/1B.
>
> Ref: `docs/MODULO_CAJERO_CONTADOR.md` §3.2 y §7 (anti-manipulación de montos).

## Regla de oro
El **total lo calcula el servidor** desde `Producto.precio` en BD. NUNCA confiar en
un total enviado por el cliente. El cliente solo manda `{ producto_id, cantidad }`.

---

## PASO 1 — DTO

Agregar a `lib/server/dto/caja.dto.ts`:
```ts
export const VentaFisicaDTO = z.object({
  items: z.array(z.object({
    producto_id: z.number().int().positive(),
    cantidad: z.number().positive(),
  })).min(1),
  metodo_pago: metodoPagoSchema, // EFECTIVO | QR | TARJETA
  es_cortesia: z.boolean().optional().default(false),
  cliente_nombre: z.string().trim().max(120).optional(),
});
export type VentaFisicaInput = z.infer<typeof VentaFisicaDTO>;
```

## PASO 2 — Servicio

Agregar a `lib/server/caja/caja.service.ts`:
```ts
import type { VentaFisicaInput } from '@/lib/server/dto/caja.dto';

export async function registrarVentaFisica(session: Session, dto: VentaFisicaInput, meta: Meta = {}) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const turno = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (!turno) throw new ConflictError('Abre caja antes de registrar una venta');

    // Cargar productos y validar
    const ids = dto.items.map(i => i.producto_id);
    const productos = await tx.producto.findMany({ where: { id: { in: ids } } });
    if (productos.length !== ids.length) throw new NotFoundError('Algún producto no existe');

    // Calcular total EN EL SERVIDOR
    let total = new Prisma.Decimal(0);
    const detalles = dto.items.map(item => {
      const p = productos.find(x => x.id === item.producto_id)!;
      if (p.disponible === false) throw new ValidationError(`Producto no disponible: ${p.nombre}`);
      const precio = new Prisma.Decimal(p.precio);
      total = total.plus(precio.times(item.cantidad));
      return { producto_id: p.id, precio_unitario: Number(precio), cantidad: item.cantidad };
    });
    if (total.lte(0)) throw new ValidationError('El total debe ser mayor a 0');

    // Crear la transacción (venta presencial pagada)
    const venta = await tx.transaccion.create({
      data: {
        canal: 'SALON',
        metodo_pago: dto.metodo_pago as TipoCuenta,
        es_cortesia: dto.es_cortesia,
        total: Number(total),
        estado: 'PAGADO',
        turno_id: turno.id,
        cajero_id: session.id,
        cliente_nombre: dto.cliente_nombre ?? 'Cliente mostrador',
        transaccionesDetalles_id: { create: detalles },
      },
    });

    // Si NO es cortesía: impacta caja
    if (!dto.es_cortesia) {
      const cuenta = await getCuenta(tx, sucursal_id, dto.metodo_pago as TipoCuenta);
      await tx.movimientoCaja.create({
        data: {
          turno_id: turno.id, cuenta_id: cuenta.id, tipo: 'VENTA',
          metodo_pago: dto.metodo_pago as TipoCuenta, monto: Number(total),
          concepto: `Venta #${venta.id}`, transaccion_id: venta.id, creado_por_id: session.id,
        },
      });
      await tx.cuentaFinanciera.update({ where: { id: cuenta.id }, data: { saldo: { increment: Number(total) } } });
      const campo = dto.metodo_pago === 'EFECTIVO' ? 'ventas_efectivo' : 'ventas_qr';
      await tx.cajaTurno.update({ where: { id: turno.id }, data: { [campo]: { increment: Number(total) } } });
    }

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'Transaccion', entidadId: venta.id,
      detalle: `Venta física #${venta.id}${dto.es_cortesia ? ' (cortesía)' : ''}`,
      monto: Number(total), ip: meta.ip, userAgent: meta.userAgent,
    }, tx);

    return venta;
  });
}
```

> **Stock:** el descuento automático de insumos por receta se integra en la **Fase 5**
> (cascada recetas→insumos). En 1C la venta NO descuenta stock todavía. Dejar comentario
> `// TODO(Fase 5): descontar stock vía recetas` donde se crea la venta.

## PASO 3 — Endpoint

`app/api/caja/venta/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { VentaFisicaDTO } from '@/lib/server/dto/caja.dto';
import * as caja from '@/lib/server/caja/caja.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const dto = VentaFisicaDTO.parse(await req.json());
    const venta = await caja.registrarVentaFisica(session, dto, { ip: getClientIp(req), userAgent: req.headers.get('user-agent') });
    return NextResponse.json(venta, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
```

## PASO 4 — Verificar
Con un turno abierto y un token de CAJERO, y al menos 1 producto en BD (crear uno por
`/api/productos` o Studio si no hay):
```bash
curl -s -X POST http://localhost:3000/api/caja/venta -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"producto_id":1,"cantidad":2}],"metodo_pago":"EFECTIVO"}'
```

## Criterios de aceptación
- [ ] El total se calcula en el servidor (probar mandando un total falso → se ignora).
- [ ] La venta crea Transaccion + detalles + MovimientoCaja(VENTA) + sube saldo y `ventas_efectivo`.
- [ ] Una venta `es_cortesia:true` crea la Transaccion pero NO impacta caja.
- [ ] Sin turno abierto → 409. Producto inexistente → 404.
- [ ] Queda auditada (`CREO` / `Transaccion`).

> Con esto **cierra la Fase 1**. Sigue Fase 2 (frontend del cajero).
