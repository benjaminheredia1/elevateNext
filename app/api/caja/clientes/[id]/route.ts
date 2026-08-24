import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { editarClienteSchema } from '@/lib/server/dto/clientes.dto';
import { editarCliente } from '@/lib/server/clientes/clientes.service';

/**
 * Edición de datos de contacto del cliente desde caja (completar NIT/celular
 * faltantes, corregir nombre). Cada cambio queda en auditoría con el antes→después.
 * La dirección no se edita desde acá: la maneja la pantalla de admin.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isInteger(clienteId)) throw new ValidationError('Id de cliente inválido');
    const input = editarClienteSchema.parse(await req.json());

    const { cliente, cambios } = await editarCliente(clienteId, input);
    if (cambios.length === 0) return NextResponse.json({ data: cliente });

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Cliente', entidadId: clienteId,
      detalle: `Editó datos del cliente "${cliente.nombre}" (#${clienteId}): ${cambios.join(', ')}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: cliente });
  } catch (e) { return handleApiError(e); }
}
