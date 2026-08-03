import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { listarPrivilegios } from '@/lib/server/finanzas/privilegios.service';

/**
 * Privilegios asignables desde caja: SOLO los activos (publicados por el admin)
 * y SOLO los que valen en la sucursal del cajero — los suyos más los del
 * negocio (`sucursal_id` nulo). Ofrecer los de otro local no sirve de nada: al
 * cobrar, la venta los rechaza por no aplicar en esta sucursal.
 *
 * Un usuario sin sucursal asignada (dueño en consolidado) ve la lista completa,
 * igual que en el resto del sistema.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const data = await listarPrivilegios(false, session.sucursal_id ?? undefined);
    return NextResponse.json({ data });
  } catch (e) { return handleApiError(e); }
}
