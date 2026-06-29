import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { activoFijoSchema, activoFijoUpdateSchema, idSchema } from '@/lib/server/dto/activos-fijos.dto';
import {
  listarActivosFijos,
  crearActivoFijo,
  actualizarActivoFijo,
  eliminarActivoFijo,
} from '@/lib/server/admin/activos.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const data = await listarActivosFijos(searchParams.get('incluirInactivos') === 'true');
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = activoFijoSchema.parse(await req.json());
    const data = await crearActivoFijo(input, session.id);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'CREO',
      entidad: 'ActivoFijo',
      entidadId: data.id,
      detalle: `Creó activo fijo ${data.nombre}`,
      monto: data.valor_original,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = activoFijoUpdateSchema.parse(await req.json());
    const data = await actualizarActivoFijo(input);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'ActivoFijo',
      entidadId: data.id,
      detalle: `Modificó activo fijo ${data.nombre}`,
      monto: data.valor_actual,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
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
    const data = await eliminarActivoFijo(input.id);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'ELIMINO',
      entidad: 'ActivoFijo',
      entidadId: data.id,
      detalle: `Desactivó activo fijo ${data.nombre}`,
      monto: data.valor_original,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
