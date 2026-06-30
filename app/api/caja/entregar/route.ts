import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import * as caja from '@/lib/server/caja/caja.service';

const EntregarSchema = z.object({
  codigo: z.string().min(1),
  driver_nombre: z.string().optional(),
});

// Confirmar la entrega/salida de un pedido desde el mostrador (handoff)
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const dto = EntregarSchema.parse(await req.json());
    const pedido = await caja.entregarPedido(session, dto, {
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json({ data: pedido });
  } catch (e) { return handleApiError(e); }
}
