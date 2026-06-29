import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { VentaFisicaDTO } from '@/lib/server/dto/caja.dto';
import * as caja from '@/lib/server/caja/caja.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const dto = VentaFisicaDTO.parse(await req.json());
    const venta = await caja.registrarVentaFisica(session, dto, { ip: getClientIp(req), userAgent: req.headers.get('user-agent') });
    return NextResponse.json(venta, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
