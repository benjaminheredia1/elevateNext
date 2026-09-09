import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { parseRango } from '@/lib/server/finanzas/rango';
import * as caja from '@/lib/server/caja/caja.service';

/**
 * Ventas de la caja: todas las del turno abierto, con su detalle y su forma de
 * cierre (pagada, fiado, cortesía).
 *
 * A diferencia de /api/caja/movimientos —que es el libro de plata que entró y
 * salió— acá aparecen también las que no tocaron caja. La sucursal sale de la
 * sesión: un cajero nunca ve las de otro local.
 *
 * `rango` acepta el mismo vocabulario que los reportes de admin (hoy, 7d, mes,
 * todo, custom). `turno` —o ningún rango— deja el comportamiento de siempre:
 * lo del turno abierto.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const rango = searchParams.get('rango');
    const periodo = rango && rango !== 'turno' ? await parseRango(searchParams) : null;
    return NextResponse.json(await caja.getVentasDeCaja(session, {
      fecha: searchParams.get('fecha'),
      periodo,
    }));
  } catch (e) { return handleApiError(e); }
}
