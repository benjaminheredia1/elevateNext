import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { listarPrivilegios } from '@/lib/server/finanzas/privilegios.service';

/** Privilegios asignables desde caja: SOLO los activos (publicados por el admin). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const data = await listarPrivilegios(false);
    return NextResponse.json({ data });
  } catch (e) { return handleApiError(e); }
}
