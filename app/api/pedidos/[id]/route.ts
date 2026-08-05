import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { requireAuth, requireRole } from '@/lib/server/auth/session';

/**
 * Consulta y baja de una venta.
 *
 * El PUT que movía estados (EN_PREPARACION → EN_CAMINO → ENTREGADO…) y asignaba
 * repartidores se eliminó junto con el seguimiento de pedidos: la web ya no
 * registra pedidos y el cajero registra la venta cobrada, así que no hay ciclo
 * de vida que administrar. El descuento de stock ocurre al registrar la venta.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'ADMIN', 'DUENO']);
    const { id } = await params;
    const pedidoId = parseInt(id);
    if (!Number.isInteger(pedidoId)) throw new ValidationError('Id de pedido inválido');
    const pedido = await prisma.transaccion.findUnique({
      where: { id: pedidoId },
      include: {
        transaccionesDetalles_id: { include: { producto: true } },
        usuario: { select: { nombre: true, email: true } },
      },
    });
    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    return NextResponse.json({ data: pedido });
  } catch (error) {
    return handleApiError(error);
  }
}


export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(_req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const pedidoId = parseInt(id);
    if (!Number.isInteger(pedidoId)) throw new ValidationError('Id de pedido inválido');
    await prisma.transaccion.delete({ where: { id: pedidoId } });
    return NextResponse.json({ message: 'Pedido eliminado' });
  } catch (error) {
    return handleApiError(error);
  }
}
