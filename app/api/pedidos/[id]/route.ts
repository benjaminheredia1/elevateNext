import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError, ConflictError, NotFoundError, ValidationError } from '@/lib/server/errors';
import { descontarStockPorTransaccion } from '@/lib/server/inventario/descuento-stock.service';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';

// Estados que disparan el descuento de stock (idempotente — no descuenta dos veces)
const ESTADOS_DESCUENTO = new Set(['EN_PREPARACION', 'LISTO', 'ENTREGADO']);

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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // El cajero opera el ciclo de vida; admin/dueño pueden intervenir por excepción.
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'ADMIN', 'DUENO']);

    const { id } = await params;
    const pedidoId = parseInt(id);
    if (!Number.isInteger(pedidoId)) throw new ValidationError('Id de pedido inválido');
    const body   = await req.json();

    // Whitelist de campos permitidos para evitar mass assignment. Los campos
    // contables (metodo_pago, es_cortesia, turno_id, cajero_id) NO se editan
    // por aquí: los fija el flujo de caja al cobrar/entregar.
    const CAMPOS_PERMITIDOS = ['estado', 'payment_status', 'driver_nombre', 'driver_lat', 'driver_lng'] as const;

    const { pedido, previo } = await prisma.$transaction(async (tx) => {
      const existing = await tx.transaccion.findUnique({ where: { id: pedidoId } });
      if (!existing) throw new NotFoundError('Pedido no encontrado');

      // Un fiado con deuda pendiente no se puede marcar "pagado" a mano: el
      // cobro debe pasar por Deudores, que sí registra el dinero en caja.
      if (body.payment_status === 'PAGADO' && existing.payment_status !== 'PAGADO') {
        const deudaPendiente = await tx.cuentaCorriente.findFirst({
          where: { transaccion_id: pedidoId, tipo: 'POR_COBRAR', estado: { not: 'PAGADA' } },
          select: { id: true },
        });
        if (deudaPendiente) {
          throw new ConflictError('Este pedido es un fiado con deuda pendiente: cóbralo desde Deudores para que el pago quede registrado en caja');
        }
      }

      const updateData: Record<string, unknown> = {};
      for (const campo of CAMPOS_PERMITIDOS) {
        if (body[campo] !== undefined) updateData[campo] = body[campo];
      }

      // Generar driver_link_id si se solicita (UUID completo: un prefijo corto
      // era enumerable por fuerza bruta)
      if (body.generar_driver_link && !existing.driver_link_id) {
        updateData.driver_link_id = crypto.randomUUID();
      }

      const actualizado = await tx.transaccion.update({
        where: { id: pedidoId },
        data:  updateData,
        include: {
          transaccionesDetalles_id: { include: { producto: true } },
        },
      });

      // Descuento automático de stock al cambiar a EN_PREPARACION o ENTREGADO
      if (body.estado && ESTADOS_DESCUENTO.has(body.estado)) {
        await descontarStockPorTransaccion(tx, actualizado.id);
      }

      return { pedido: actualizado, previo: existing };
    });

    // Auditoría: registrar cada transición de estado / pago
    const cambios: string[] = [];
    if (body.estado && body.estado !== previo.estado) cambios.push(`estado ${previo.estado}→${body.estado}`);
    if (body.payment_status && body.payment_status !== previo.payment_status) cambios.push(`pago ${previo.payment_status}→${body.payment_status}`);
    if (body.generar_driver_link) cambios.push('generó link de repartidor');
    if (cambios.length > 0) {
      await logAudit({
        usuarioId: session.id,
        rol: session.rol,
        accion: 'MODIFICO',
        entidad: 'Transaccion',
        entidadId: pedidoId,
        detalle: `Pedido #${pedidoId}: ${cambios.join(', ')}`,
        ip: getClientIp(req),
        userAgent: req.headers.get('user-agent'),
      });
    }

    return NextResponse.json({ data: pedido });
  } catch (error: unknown) {
    console.error('PUT /api/pedidos/[id] error:', error);
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
