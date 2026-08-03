import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { guard, ADMIN } from '@/lib/server/auth/guard';
import { reactivarInsumo } from '@/lib/server/insumos/insumos.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { logAudit } from '@/lib/server/audit/audit.service';

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
    // Espejo de la baja: se reactiva en un local, no en todo el negocio.
    const { sucursal_id } = await request.json().catch(() => ({}));
    const sucursalId = Number(sucursal_id);
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) {
      return NextResponse.json(
        { error: 'Elegí la sucursal en la que se reactiva el insumo.' },
        { status: 400 }
      );
    }
    const permitida = alcanceSucursal(session, sucursalId);
    if (permitida !== sucursalId) {
      return NextResponse.json(
        { error: 'Solo podés reactivar insumos en tu propia sucursal' },
        { status: 422 }
      );
    }

    const resultado = await reactivarInsumo(Number(id), sucursalId);

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'Insumo',
      entidadId: Number(id),
      detalle: `Reactivó insumo "${resultado.insumo.nombre}" en la sucursal #${sucursalId}. Resolvió ${resultado.productosResueltos} producto(s) que estaban en revisión ahí.`,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
