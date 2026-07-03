import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ValidationError } from '@/lib/server/errors';
import * as caja from '@/lib/server/caja/caja.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { id } = await params;
    const turnoId = Number(id);
    if (!Number.isInteger(turnoId)) throw new ValidationError('Id de turno inválido');
    const detalle = await caja.getTurnoDetalle(session, turnoId);
    return NextResponse.json(detalle);
  } catch (e) { return handleApiError(e); }
}
