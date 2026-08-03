import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import * as caja from '@/lib/server/caja/caja.service';

/**
 * Ventas de la caja: todas las del turno abierto, con su detalle y su forma de
 * cierre (pagada, fiado, cortesía).
 *
 * A diferencia de /api/caja/movimientos —que es el libro de plata que entró y
 * salió— acá aparecen también las que no tocaron caja. La sucursal sale de la
 * sesión: un cajero nunca ve las de otro local.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const fecha = new URL(req.url).searchParams.get('fecha');
    return NextResponse.json(await caja.getVentasDeCaja(session, fecha));
  } catch (e) { return handleApiError(e); }
}
