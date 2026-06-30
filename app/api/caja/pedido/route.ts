import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import * as caja from '@/lib/server/caja/caja.service';

// Buscar un pedido por su código de retiro (verificación en mostrador)
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const codigo = new URL(req.url).searchParams.get('codigo')?.trim();
    if (!codigo) throw new ValidationError('Indica el código del pedido');
    const pedido = await caja.buscarPedidoPorCodigo(session, codigo);
    return NextResponse.json({ data: pedido });
  } catch (e) { return handleApiError(e); }
}
