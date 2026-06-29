import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { parseRango, parseSucursal } from '@/lib/server/finanzas/rango';
import { listarTurnos } from '@/lib/server/finanzas/turnos.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const data = await listarTurnos(parseRango(searchParams), parseSucursal(searchParams));
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
