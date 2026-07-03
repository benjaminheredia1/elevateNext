import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { cobrarDeudaCaja } from '@/lib/server/caja/caja.service';

const cobroSchema = z.object({
  monto: z.coerce.number().positive(),
  metodo_pago: z.enum(['EFECTIVO', 'QR']),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { id } = await params;
    const cuentaId = Number(id);
    if (!Number.isInteger(cuentaId)) throw new ValidationError('Id de deuda inválido');
    const dto = cobroSchema.parse(await req.json());
    const data = await cobrarDeudaCaja(session, cuentaId, dto, { ip: getClientIp(req), userAgent: req.headers.get('user-agent') });
    return NextResponse.json(data, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
