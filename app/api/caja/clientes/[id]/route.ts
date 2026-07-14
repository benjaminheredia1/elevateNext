import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError, NotFoundError, ConflictError } from '@/lib/server/errors';
import { editarClienteSchema } from '@/lib/server/dto/clientes.dto';

/**
 * Edición de datos de contacto del cliente desde caja (completar NIT/celular
 * faltantes, corregir nombre). Cada cambio queda en auditoría con el antes→después.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isInteger(clienteId)) throw new ValidationError('Id de cliente inválido');
    const input = editarClienteSchema.parse(await req.json());

    const actual = await prisma.cliente.findFirst({ where: { id: clienteId, es_anonimo: false } });
    if (!actual) throw new NotFoundError('Cliente no encontrado');

    // Detalle antes→después solo de lo que cambió (para la auditoría)
    const cambios: string[] = [];
    const campos = ['nombre', 'telefono', 'email', 'nit'] as const;
    for (const campo of campos) {
      const antes = actual[campo] ?? null;
      const despues = input[campo] ?? null;
      if (antes !== despues) cambios.push(`${campo}: "${antes ?? '—'}" → "${despues ?? '—'}"`);
    }
    if (cambios.length === 0) return NextResponse.json({ data: actual });

    let cliente;
    try {
      cliente = await prisma.cliente.update({
        where: { id: clienteId },
        data: { nombre: input.nombre, telefono: input.telefono, email: input.email, nit: input.nit },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictError('Ese celular ya pertenece a otro cliente');
      }
      throw e;
    }

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Cliente', entidadId: clienteId,
      detalle: `Editó datos del cliente "${cliente.nombre}" (#${clienteId}): ${cambios.join(', ')}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: cliente });
  } catch (e) { return handleApiError(e); }
}
