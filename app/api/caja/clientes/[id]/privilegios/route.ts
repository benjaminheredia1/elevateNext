import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { asignarPrivilegiosSchema } from '@/lib/server/dto/privilegios.dto';
import { getPrivilegiosDeCliente, setPrivilegiosActivosDeCliente } from '@/lib/server/finanzas/privilegios.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isInteger(clienteId)) throw new ValidationError('Id de cliente inválido');
    const data = await getPrivilegiosDeCliente(clienteId);
    return NextResponse.json({ data });
  } catch (e) { return handleApiError(e); }
}

/**
 * Asignación de privilegios desde caja. El servicio garantiza que solo se
 * otorguen privilegios activos; cada cambio queda en auditoría con el detalle
 * de quién otorgó/quitó qué privilegio a qué cliente.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isInteger(clienteId)) throw new ValidationError('Id de cliente inválido');
    const input = asignarPrivilegiosSchema.parse(await req.json());

    const resultado = await setPrivilegiosActivosDeCliente(clienteId, input.privilegio_ids);

    if (resultado.agregados.length > 0 || resultado.quitados.length > 0) {
      const partes = [
        resultado.agregados.length > 0 ? `otorgó ${resultado.agregados.join(', ')}` : null,
        resultado.quitados.length > 0 ? `quitó ${resultado.quitados.join(', ')}` : null,
      ].filter(Boolean).join(' y ');
      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
        entidad: 'ClientePrivilegio', entidadId: clienteId,
        detalle: `Privilegios: ${partes} — cliente "${resultado.cliente.nombre}" (#${clienteId})`,
        ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
      });
    }

    return NextResponse.json({ data: resultado.privilegios });
  } catch (e) { return handleApiError(e); }
}
