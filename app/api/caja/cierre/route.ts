import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { CierreCajaDTO } from '@/lib/server/dto/caja.dto';
import * as caja from '@/lib/server/caja/caja.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const dto = CierreCajaDTO.parse(await req.json());
    const turno = await caja.cerrarTurno(session, dto, { ip: getClientIp(req), userAgent: req.headers.get('user-agent') });
    return NextResponse.json(turno);
  } catch (e) { return handleApiError(e); }
}
