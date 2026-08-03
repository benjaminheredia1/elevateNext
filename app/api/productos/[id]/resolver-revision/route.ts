import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { guard, ADMIN } from '@/lib/server/auth/guard';
import { resolverProductoEnRevision } from '@/lib/server/insumos/insumos.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
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
    // La revisión es del local: se resuelve donde se abrió, sin tocar a las
    // demás sucursales, que pueden seguir con el mismo insumo de baja.
    const { sucursal_id } = await request.json().catch(() => ({}));
    const sucursalId = Number(sucursal_id);
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) {
      return NextResponse.json(
        { error: 'Elegí la sucursal en la que se resuelve la revisión.' },
        { status: 400 }
      );
    }
    const permitida = alcanceSucursal(session, sucursalId);
    if (permitida !== sucursalId) {
      return NextResponse.json(
        { error: 'Solo podés resolver revisiones de tu propia sucursal' },
        { status: 422 }
      );
    }

    const producto = await resolverProductoEnRevision(Number(id), sucursalId);

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'Producto',
      entidadId: Number(id),
      detalle: `Resolvió el producto #${id} que estaba en revisión en la sucursal #${sucursalId}.`,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(producto, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
