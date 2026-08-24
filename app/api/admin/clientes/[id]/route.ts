import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { NotFoundError } from '@/lib/server/errors';
import { editarClienteSchema } from '@/lib/server/dto/clientes.dto';
import { editarCliente } from '@/lib/server/clientes/clientes.service';
import prisma from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { id } = await params;
    const clienteId = parseInt(id);
    if (!Number.isInteger(clienteId)) {
      return NextResponse.json({ error: 'Id de cliente inválido' }, { status: 400 });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      include: {
        transacciones: {
          include: {
            transaccionesDetalles_id: {
              include: { producto: { select: { nombre: true, precio: true } } },
            },
          },
          orderBy: { created_at: 'desc' },
          take: 20,
        },
      },
    });

    if (!cliente) throw new NotFoundError('Cliente no encontrado');

    const txs = cliente.transacciones;
    const total_gastado = txs.reduce((s, t) => s + Number(t.total), 0);
    const primer_pedido = txs.length > 0
      ? txs.reduce((min, t) => t.created_at < min ? t.created_at : min, txs[0].created_at)
      : null;

    return NextResponse.json({
      data: {
        id: cliente.id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        email: cliente.email,
        nit: cliente.nit,
        direccion: cliente.direccion,
        created_at: cliente.created_at,
        pedidos: txs.length,
        total_gastado: Number(total_gastado.toFixed(2)),
        gasto_promedio: txs.length > 0 ? Number((total_gastado / txs.length).toFixed(2)) : 0,
        primer_pedido,
        transacciones: txs.map(t => ({
          id: t.id,
          total: t.total,
          estado: t.estado,
          metodo_pago: t.metodo_pago,
          created_at: t.created_at,
          items: t.transaccionesDetalles_id.map(d => ({
            producto: d.producto.nombre,
            cantidad: d.cantidad,
            precio: d.precio_unitario,
          })),
        })),
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Edición de la ficha del cliente desde admin. Mismo service que caja, pero
 * acá sí se corrige la dirección: es el único lugar donde se muestra y hasta
 * ahora solo podía cargarse al dar de alta al cliente, nunca arreglarse.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
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
