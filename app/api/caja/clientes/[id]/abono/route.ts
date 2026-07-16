import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { abonarDeudaClienteCaja } from '@/lib/server/caja/caja.service';

const pagoItemSchema = z.object({
  metodo_pago: z.enum(['EFECTIVO', 'QR', 'TARJETA']),
  monto: z.coerce.number().positive().multipleOf(0.01),
});

// Formato nuevo: desglose por método (pago mixto) y deudas concretas a cobrar
// (cuenta_ids; sin él aplica FIFO sobre todas). Se mantiene el formato viejo
// { monto, metodo_pago } para clientes con la UI anterior abierta.
const abonoSchema = z.union([
  z.object({
    pagos: z.array(pagoItemSchema).min(1).max(3),
    cuenta_ids: z.array(z.coerce.number().int().positive()).min(1).max(50).optional(),
  }),
  z.object({
    monto: z.coerce.number().positive().multipleOf(0.01),
    metodo_pago: z.enum(['EFECTIVO', 'QR', 'TARJETA']),
  }).transform(v => ({ pagos: [{ metodo_pago: v.metodo_pago, monto: v.monto }], cuenta_ids: undefined })),
]);

/** Cobro de deuda sin compra: el cliente viene solo a pagar su fiado. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isInteger(clienteId)) throw new ValidationError('Id de cliente inválido');
    const dto = abonoSchema.parse(await req.json());
    const data = await abonarDeudaClienteCaja(session, clienteId, dto, {
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
