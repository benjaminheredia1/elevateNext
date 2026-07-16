import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { descontarStockPorTransaccion } from '@/lib/server/inventario/descuento-stock.service';
import { isRateLimited } from '@/lib/server/rate-limit';

// El repartidor legítimo consulta/actualiza cada pocos segundos; este límite
// solo frena la enumeración de tokens por fuerza bruta.
const LIMITE = { ventanaMs: 60000, max: 60 };

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (isRateLimited(req, LIMITE.ventanaMs, LIMITE.max)) {
    return NextResponse.json({ error: 'Demasiadas consultas. Intenta en un minuto.' }, { status: 429 });
  }
  try {
    const { token } = await params;
    const pedido = await prisma.transaccion.findUnique({
      where: { driver_link_id: token },
      include: {
        transaccionesDetalles_id: {
          include: { producto: true },
        },
      },
    });

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido no encontrado o link inválido' }, { status: 404 });
    }

    return NextResponse.json({ data: pedido });
  } catch (error) {
    console.error('GET driver token error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (isRateLimited(req, LIMITE.ventanaMs, LIMITE.max)) {
    return NextResponse.json({ error: 'Demasiadas consultas. Intenta en un minuto.' }, { status: 429 });
  }
  try {
    const { token } = await params;
    const body = await req.json();
    const { driver_nombre, estado } = body;

    const ESTADOS_VALIDOS = new Set(['EN_LOCAL', 'EN_CAMINO', 'LLEGO', 'ENTREGADO', 'CANCELADO']);
    const data: Record<string, unknown> = {};
    if (driver_nombre) data.driver_nombre = driver_nombre;
    if (estado && ESTADOS_VALIDOS.has(estado)) data.estado = estado;

    const pedido = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.transaccion.update({
        where: { driver_link_id: token },
        data,
      });

      // Descuento de stock al entregar (anti-doble-descuento incluido en el servicio)
      if (estado === 'ENTREGADO') {
        await descontarStockPorTransaccion(tx, actualizado.id);
      }

      return actualizado;
    });

    return NextResponse.json({ data: pedido, message: 'Pedido actualizado' });
  } catch (error) {
    console.error('POST driver token error:', error);
    return NextResponse.json({ error: 'Error al actualizar el pedido' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (isRateLimited(req, LIMITE.ventanaMs, LIMITE.max)) {
    return NextResponse.json({ error: 'Demasiadas consultas. Intenta en un minuto.' }, { status: 429 });
  }
  try {
    const { token } = await params;
    const body = await req.json();
    const { lat, lng } = body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 });
    }

    const pedido = await prisma.transaccion.update({
      where: { driver_link_id: token },
      data: {
        driver_lat: lat,
        driver_lng: lng,
      },
      select: { id: true, estado: true } // Return only essential data
    });

    return NextResponse.json({ data: pedido });
  } catch (error) {
    console.error('PUT driver token error:', error);
    return NextResponse.json({ error: 'Error al actualizar ubicación' }, { status: 500 });
  }
}
