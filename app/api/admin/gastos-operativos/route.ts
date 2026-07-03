import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { gastoOperativoSchema, idSchema } from '@/lib/server/dto/gastos-operativos.dto';
import { crearGastoOperativo, eliminarGastoOperativo, listarGastosOperativos } from '@/lib/server/finanzas/gastos-operativos.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const metodo = searchParams.get('metodo_pago');
    const q = searchParams.get('q') ?? undefined;
    const data = await listarGastosOperativos(metodo === 'EFECTIVO' || metodo === 'QR' ? metodo : undefined, q);
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = gastoOperativoSchema.parse(await req.json());
    const data = await crearGastoOperativo(input, session.id);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'CREO',
      entidad: 'GastoOperativo',
      entidadId: data.id,
      detalle: `Registró gasto operativo ${data.concepto}`,
      monto: data.monto,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) { return handleApiError(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const input = idSchema.parse({ id: searchParams.get('id') ?? (await req.json().catch(() => ({}))).id });
    const data = await eliminarGastoOperativo(input.id);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'ELIMINO',
      entidad: 'GastoOperativo',
      entidadId: data.id,
      detalle: `Eliminó gasto operativo ${data.concepto}`,
      monto: data.monto,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
