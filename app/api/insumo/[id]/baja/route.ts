import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { guard, ADMIN } from '@/lib/server/auth/guard';
import { darDeBajaInsumo } from '@/lib/server/insumos/insumos.service';
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
    const { motivo, sucursal_id } = await request.json();

    if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 3) {
      return NextResponse.json(
        { error: 'Motivo requerido (mínimo 3 caracteres)' },
        { status: 400 }
      );
    }

    // La baja es siempre de un local concreto: un insumo que sobra en Sur puede
    // ser imprescindible en Fitbull. Sin sucursal no hay baja que dar.
    const sucursalId = Number(sucursal_id);
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) {
      return NextResponse.json(
        { error: 'Elegí la sucursal en la que se da de baja el insumo.' },
        { status: 400 }
      );
    }
    // Un ADMIN solo puede dar de baja en su propia sucursal, mande lo que mande.
    const permitida = alcanceSucursal(session, sucursalId);
    if (permitida !== sucursalId) {
      return NextResponse.json(
        { error: 'Solo podés dar de baja insumos en tu propia sucursal' },
        { status: 422 }
      );
    }

    const resultado = await darDeBajaInsumo(Number(id), motivo.trim(), sucursalId);

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'Insumo',
      entidadId: Number(id),
      detalle: `Dio de baja insumo "${resultado.insumo.nombre}" en la sucursal #${sucursalId} (las demás no se tocan). Motivo: ${motivo}. Pasó ${resultado.productosEnRevision} producto(s) a revisión ahí.`,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
