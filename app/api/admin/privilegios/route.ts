import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { privilegioSchema, privilegioUpdateSchema, idSchema } from '@/lib/server/dto/privilegios.dto';
import { actualizarPrivilegio, crearPrivilegio, eliminarPrivilegio, listarPrivilegios } from '@/lib/server/finanzas/privilegios.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const data = await listarPrivilegios(searchParams.get('incluirInactivos') === 'true');
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = privilegioSchema.parse(await req.json());
    const data = await crearPrivilegio(input, session.id);
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'Privilegio', entidadId: data.id,
      detalle: `Creó privilegio ${data.nombre} (${data.porcentaje}%)`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = privilegioUpdateSchema.parse(await req.json());
    const data = await actualizarPrivilegio(input);
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Privilegio', entidadId: data.id,
      detalle: `Modificó privilegio ${data.nombre}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const input = idSchema.parse({ id: searchParams.get('id') ?? (await req.json().catch(() => ({}))).id });
    const data = await eliminarPrivilegio(input.id);
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'ELIMINO',
      entidad: 'Privilegio', entidadId: data.id,
      detalle: `Desactivó privilegio ${data.nombre}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
