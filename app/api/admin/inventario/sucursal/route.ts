import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { alcanceSucursal, resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { inventarioDeSucursal } from '@/lib/server/inventario/stock-sucursal.service';

/** Stock de un local: cuánto tiene, a qué costo y sus niveles de alerta. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN', 'CAJERO']);

    const { searchParams } = new URL(req.url);
    // El cajero solo puede ver el inventario de su propia sucursal.
    const pedida = alcanceSucursal(session, parseSucursal(searchParams));
    const sucursalId = await resolverSucursal(pedida);

    return NextResponse.json({
      sucursal_id: sucursalId,
      items: await inventarioDeSucursal(sucursalId),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
