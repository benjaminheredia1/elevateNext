import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isRateLimited } from '@/lib/server/rate-limit';

/**
 * Seguimiento público del pedido para la tienda (sin sesión): expone SOLO los
 * campos necesarios para la barra de progreso y el mapa del repartidor.
 * Nada de datos personales, montos ni detalle de productos — eso queda en el
 * GET staff de /api/pedidos/[id].
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // El tracker legítimo consulta cada 5s (12/min); esto solo frena enumeración masiva.
  if (isRateLimited(req, 60000, 60)) {
    return NextResponse.json({ error: 'Demasiadas consultas. Intenta en un minuto.' }, { status: 429 });
  }
  try {
    const { id } = await params;
    const pedidoId = Number(id);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return NextResponse.json({ error: 'Id de pedido inválido' }, { status: 400 });
    }
    const pedido = await prisma.transaccion.findUnique({
      where: { id: pedidoId },
      select: {
        id: true,
        estado: true,
        tipo_entrega: true,
        codigo: true,
        driver_lat: true,
        driver_lng: true,
      },
    });
    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    return NextResponse.json({ data: pedido });
  } catch (error) {
    console.error('GET /api/pedidos/[id]/tracking error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
