import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { gastoFijoSchema, gastoFijoUpdateSchema, idSchema } from '@/lib/server/dto/gastos-fijos.dto';
import { actualizarGastoFijo, crearGastoFijo, eliminarGastoFijo, listarGastosFijos } from '@/lib/server/finanzas/gastos-fijos.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const data = await listarGastosFijos(searchParams.get('incluirInactivos') === 'true');
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = gastoFijoSchema.parse(await req.json());
    const data = await crearGastoFijo(input, session.id);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'CREO',
      entidad: 'GastoFijo',
      entidadId: data.id,
      detalle: `Creó gasto fijo ${data.concepto}`,
      monto: data.monto,
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
    const input = gastoFijoUpdateSchema.parse(await req.json());
    const data = await actualizarGastoFijo(input);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'GastoFijo',
      entidadId: data.id,
      detalle: `Modificó gasto fijo ${data.concepto}`,
      monto: data.monto,
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
    const data = await eliminarGastoFijo(input.id);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'ELIMINO',
      entidad: 'GastoFijo',
      entidadId: data.id,
      detalle: `Desactivó gasto fijo ${data.concepto}`,
      monto: data.monto,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
