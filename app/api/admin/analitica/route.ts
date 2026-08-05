import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { getAnalitica } from '@/lib/server/inventario/analitica.service';
import { RangoSchema } from '@/lib/server/dto/inventario.dto';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const rango = RangoSchema.parse(
      req.nextUrl.searchParams.get('rango') ?? '30d',
    );

    const data = await getAnalitica(
      rango,
      {
        desde: req.nextUrl.searchParams.get('desde'),
        hasta: req.nextUrl.searchParams.get('hasta'),
      },
      alcanceSucursal(session, parseSucursal(req.nextUrl.searchParams)),
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
