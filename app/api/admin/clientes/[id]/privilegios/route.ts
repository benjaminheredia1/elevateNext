import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { asignarPrivilegiosSchema } from '@/lib/server/dto/privilegios.dto';
import { getPrivilegiosDeCliente, setPrivilegiosDeCliente } from '@/lib/server/finanzas/privilegios.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isInteger(clienteId)) throw new ValidationError('Id de cliente inválido');
    const data = await getPrivilegiosDeCliente(clienteId);
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isInteger(clienteId)) throw new ValidationError('Id de cliente inválido');
    const input = asignarPrivilegiosSchema.parse(await req.json());
    const data = await setPrivilegiosDeCliente(clienteId, input.privilegio_ids);
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Cliente', entidadId: clienteId,
      detalle: `Actualizó privilegios del cliente #${clienteId} (${data.length} asignados)`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
