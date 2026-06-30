import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import * as caja from '@/lib/server/caja/caja.service';

// Conciliación de repartidores del turno abierto
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const data = await caja.resumenRepartidoresTurno(session);
    return NextResponse.json({ data });
  } catch (e) { return handleApiError(e); }
}
