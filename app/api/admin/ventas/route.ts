import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { parseRango, parseSucursal } from '@/lib/server/finanzas/rango';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { listarVentas } from '@/lib/server/ventas/ventas.service';

/**
 * Ventas del período, con su detalle y su forma de cierre.
 *
 * Es la misma lista que ve el cajero de su turno, pero por período y con el
 * alcance de sucursales del usuario: fiados y cortesías incluidos, que en el
 * flujo de caja no aparecen porque no movieron plata.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const data = await listarVentas(
      await parseRango(searchParams),
      alcanceSucursal(session, parseSucursal(searchParams)),
    );
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
