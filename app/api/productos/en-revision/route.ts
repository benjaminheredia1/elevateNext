import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { listarProductosEnRevision } from '@/lib/server/insumos/insumos.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    // Las revisiones son del local: un ADMIN ve solo las suyas.
    const sucursal = alcanceSucursal(session, parseSucursal(new URL(req.url).searchParams));
    const productos = await listarProductosEnRevision(sucursal);

    return NextResponse.json({
      data: productos,
      total: productos.length,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
