import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { parseRango } from '@/lib/server/finanzas/rango';
import { consolidadoPorSucursal } from '@/lib/server/finanzas/consolidado.service';

/**
 * Vista consolidada del negocio con el desglose de cada sucursal.
 * Solo para quien tiene alcance global: un cajero no ve las demás sucursales.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    return NextResponse.json(await consolidadoPorSucursal(await parseRango(searchParams)));
  } catch (e) {
    return handleApiError(e);
  }
}
