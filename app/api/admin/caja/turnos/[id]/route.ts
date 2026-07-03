import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { getTurnoDetalleAdmin } from '@/lib/server/finanzas/turnos.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const turnoId = Number(id);
    if (!Number.isInteger(turnoId)) throw new ValidationError('Id de turno inválido');
    const detalle = await getTurnoDetalleAdmin(turnoId);
    return NextResponse.json(detalle);
  } catch (e) { return handleApiError(e); }
}
