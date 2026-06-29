import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { balanceGeneral } from '@/lib/server/finanzas/contabilidad.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const data = await balanceGeneral(parseSucursal(searchParams));
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
