import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { guard, ADMIN } from '@/lib/server/auth/guard';
import { reactivarInsumo } from '@/lib/server/insumos/insumos.service';
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

    const resultado = await reactivarInsumo(Number(id));

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'Insumo',
      entidadId: Number(id),
      detalle: `Reactivó insumo "${resultado.insumo.nombre}". Resolvió ${resultado.productosResueltos} producto(s) que estaban en revisión.`,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
