import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { aplicarDescuentoDeuda } from '@/lib/server/caja/caja.service';

const descuentoSchema = z.object({
  privilegio_id: z.coerce.number().int().positive(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { id } = await params;
    const cuentaId = Number(id);
    if (!Number.isInteger(cuentaId)) throw new ValidationError('Id de deuda inválido');
    const dto = descuentoSchema.parse(await req.json());
    const data = await aplicarDescuentoDeuda(session, cuentaId, dto, {
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
