import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { CierreCajaDTO } from '@/lib/server/dto/caja.dto';
import * as caja from '@/lib/server/caja/caja.service';
import { isRateLimited } from '@/lib/server/rate-limit';

export async function POST(req: NextRequest) {
  if (isRateLimited(req, 10000, 2)) { // Max 2 cierres en 10 segundos
    return NextResponse.json({ error: 'Demasiadas peticiones. Por favor intente más tarde.' }, { status: 429 });
  }

  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const dto = CierreCajaDTO.parse(await req.json());
    const turno = await caja.cerrarTurno(session, dto, { ip: getClientIp(req), userAgent: req.headers.get('user-agent') });
    return NextResponse.json(turno);
  } catch (e) { return handleApiError(e); }
}
