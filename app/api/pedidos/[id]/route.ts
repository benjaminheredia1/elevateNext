import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/server/errors';
import { descontarStockPorTransaccion } from '@/lib/server/inventario/descuento-stock.service';

// Estados que disparan el descuento de stock
const ESTADOS_DESCUENTO = new Set(['EN_PREPARACION', 'ENTREGADO']);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pedido = await prisma.transaccion.findUnique({
      where: { id: parseInt(id) },
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
    const { id } = await params;
    const body   = await req.json();

    // Whitelist de campos permitidos para evitar mass assignment
    const CAMPOS_PERMITIDOS = ['estado', 'driver_nombre', 'driver_lat', 'driver_lng', 'metodo_pago', 'es_cortesia', 'cajero_id', 'turno_id'] as const;

    const pedido = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {};

      // Solo copiar campos permitidos
      for (const campo of CAMPOS_PERMITIDOS) {
        if (body[campo] !== undefined) updateData[campo] = body[campo];
      }

      // Generar driver_link_id si se solicita
      if (body.generar_driver_link) {
        const existing = await tx.transaccion.findUnique({ where: { id: parseInt(id) } });
        if (!existing?.driver_link_id) {
          updateData.driver_link_id = crypto.randomUUID().split('-')[0];
        }
      }

      const actualizado = await tx.transaccion.update({
        where: { id: parseInt(id) },
        data:  updateData,
        include: {
          transaccionesDetalles_id: { include: { producto: true } },
        },
      });

      // Descuento automático de stock al cambiar a EN_PREPARACION o ENTREGADO
      if (body.estado && ESTADOS_DESCUENTO.has(body.estado)) {
        await descontarStockPorTransaccion(tx, actualizado.id);
      }

      return actualizado;
    });

    return NextResponse.json({ data: pedido });
  } catch (error: unknown) {
    console.error('PUT /api/pedidos/[id] error:', error);
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.transaccion.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ message: 'Pedido eliminado' });
  } catch (error) {
    return handleApiError(error);
  }
}
