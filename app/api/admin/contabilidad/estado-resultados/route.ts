import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { parseRango, parseSucursal } from '@/lib/server/finanzas/rango';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { estadoResultados } from '@/lib/server/finanzas/contabilidad.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const data = await estadoResultados(await parseRango(searchParams), alcanceSucursal(session, parseSucursal(searchParams)));
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
