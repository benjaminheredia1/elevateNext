import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { EditarCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { editarCentro, obtenerCentro } from '@/lib/server/centro-produccion/centro-produccion.service';
import { inventarioDeCentro } from '@/lib/server/centro-produccion/stock-centro.service';

type Ctx = { params: Promise<{ id: string }> };

function parseCentroId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError('Id de centro inválido');
  return n;
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const centroId = parseCentroId((await params).id);

    const centro = await obtenerCentro(centroId);
    const items = await inventarioDeCentro(centroId);

    return NextResponse.json({ data: { ...centro, items } });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const centroId = parseCentroId((await params).id);
    const input = EditarCentroSchema.parse(await req.json());

    const centro = await editarCentro(centroId, input);

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'CentroProduccion', entidadId: centro.id,
      detalle: `Editó el centro de producción "${centro.nombre}"`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: centro });
  } catch (e) {
    return handleApiError(e);
  }
}
