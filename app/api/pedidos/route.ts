import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get('estado');
    const desde = searchParams.get('desde');
    const hoy = searchParams.get('hoy');
    const limit = searchParams.get('limit');

    const where: Record<string, unknown> = {};
    if (estado) where.estado = estado;
    if (desde) where.created_at = { gt: new Date(desde) };
    if (hoy === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.created_at = { gte: today };
    }

    const pedidos = await prisma.transaccion.findMany({
      where,
      include: {
        transaccionesDetalles_id: {
          include: { producto: true },
        },
        usuario: { select: { nombre: true, email: true } },
      },
      orderBy: { created_at: 'desc' },
      ...(limit ? { take: parseInt(limit) } : {}),
    });

    return NextResponse.json({ data: pedidos, total: pedidos.length });
  } catch (error) {
    console.error('GET /api/pedidos error:', error);
    return NextResponse.json({ error: 'Error al obtener pedidos' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cliente_nombre, cliente_telefono, cliente_direccion, cliente_lat, cliente_lng, metodo_pago, items, total } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'El pedido debe tener al menos un item' }, { status: 400 });
    }

    // Create the transaction
    const transaccion = await prisma.transaccion.create({
      data: {
        cliente_nombre,
        cliente_telefono,
        cliente_direccion,
        cliente_lat: cliente_lat ? Number(cliente_lat) : null,
        cliente_lng: cliente_lng ? Number(cliente_lng) : null,
        metodo_pago: metodo_pago ?? 'cash',
        total: Number(total),
        estado: 'PENDIENTE',
      },
    });

    const alertas: { nombre: string; stock_actual: number; stock_minimo: number; unidad_medida: string }[] = [];

    for (const item of items) {
      // Find or create product
      let producto = await prisma.producto.findFirst({
        where: { nombre: { equals: item.nombre, mode: 'insensitive' } },
      });

      if (!producto) {
        producto = await prisma.producto.create({
          data: {
            nombre: item.nombre,
            descripcion: item.nombre,
            precio: Number(item.precio),
          },
        });
      }

      // Create transaction detail
      await prisma.transaccionesDetalles.create({
        data: {
          transaccion_id: transaccion.id,
          producto_id: producto.id,
          precio_unitario: Number(item.precio),
          descuentoAplicado: 0,
          cantidad: Number(item.cantidad),
        },
      });

      // Consume insumos based on recipes
      const recetas = await prisma.recetasProducto.findMany({
        where: { producto_id: producto.id },
        include: { insumo: true },
      });

      for (const receta of recetas) {
        const consumido = receta.cantidad_utilizada * Number(item.cantidad);
        const nuevoStock = receta.insumo.stock_actual - consumido;
        const stockFinal = Math.max(0, nuevoStock);

        await prisma.insumo.update({
          where: { id: receta.insumo_id },
          data: { stock_actual: stockFinal },
        });

        await prisma.movimientoInterno.create({
          data: {
            insumo_id: receta.insumo_id,
            tipo_movimiento: 'PRODUCCION',
            cantidad: consumido,
            descripcion: `Pedido #${transaccion.id} — ${item.nombre} x${item.cantidad}`,
          },
        });

        if (stockFinal <= receta.insumo.stock_minimo) {
          alertas.push({
            nombre: receta.insumo.nombre,
            stock_actual: stockFinal,
            stock_minimo: receta.insumo.stock_minimo,
            unidad_medida: receta.insumo.unidad_medida,
          });
        }
      }
    }

    return NextResponse.json(
      {
        data: transaccion,
        alertas,
        message: 'Pedido creado exitosamente',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/pedidos error:', error);
    return NextResponse.json({ error: 'Error al crear pedido' }, { status: 500 });
  }
}
