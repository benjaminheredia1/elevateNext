import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { guard, ADMIN } from '@/lib/server/auth/guard';
import { resolverProductoEnRevision } from '@/lib/server/insumos/insumos.service';
import { logAudit } from '@/lib/server/audit/audit.service';

/**
 * Resolver un producto que estaba en revisión.
 * Se usa cuando el usuario editó la receta y la completó.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const session = await requireAuth(request);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;

    const producto = await resolverProductoEnRevision(Number(id));

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'Producto',
      entidadId: Number(id),
      detalle: `Resolvió producto "${producto.nombre}" que estaba en revisión.`,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(producto, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
