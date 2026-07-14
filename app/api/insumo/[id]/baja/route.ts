import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { guard, ADMIN } from '@/lib/server/auth/guard';
import { darDeBajaInsumo } from '@/lib/server/insumos/insumos.service';
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
    const { motivo } = await request.json();

    if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 3) {
      return NextResponse.json(
        { error: 'Motivo requerido (mínimo 3 caracteres)' },
        { status: 400 }
      );
    }

    const resultado = await darDeBajaInsumo(Number(id), motivo.trim());

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'Insumo',
      entidadId: Number(id),
      detalle: `Dio de baja insumo "${resultado.insumo.nombre}". Motivo: ${motivo}. Pasó ${resultado.productosEnRevision} producto(s) a revisión.`,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
