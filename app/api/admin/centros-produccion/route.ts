import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { CrearCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { crearCentro, listarCentros } from '@/lib/server/centro-produccion/centro-produccion.service';

/** Lista de centros de producción. Por defecto solo los activos. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const todos = new URL(req.url).searchParams.get('todos') === '1';

    return NextResponse.json({ items: await listarCentros(!todos) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = CrearCentroSchema.parse(await req.json());

    const centro = await crearCentro(input.nombre, input.direccion);

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'CentroProduccion', entidadId: centro.id,
      detalle: `Creó el centro de producción "${centro.nombre}"`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: centro }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
