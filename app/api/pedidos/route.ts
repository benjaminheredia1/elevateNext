import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TipoCuenta, TipoEntrega } from '@prisma/client';

function normalizeMetodoPago(value: unknown): TipoCuenta {
  if (value === 'EFECTIVO' || value === 'cash') return TipoCuenta.EFECTIVO;
  if (value === 'QR' || value === 'qr') return TipoCuenta.QR;
  if (value === 'BANCO' || value === 'transfer') return TipoCuenta.BANCO;
  if (value === 'TARJETA' || value === 'card') return TipoCuenta.TARJETA;
  return TipoCuenta.EFECTIVO;
}

function normalizeTipoEntrega(value: unknown): TipoEntrega | null {
  if (value === 'DELIVERY' || value === 'delivery') return TipoEntrega.DELIVERY;
  if (value === 'RECOJO' || value === 'recojo' || value === 'pickup') return TipoEntrega.RECOJO;
  return null;
}

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
    const { cliente_nombre, cliente_telefono, cliente_direccion, cliente_lat, cliente_lng, cliente_nit, cliente_email, tipo_entrega, codigo_descuento, metodo_pago, items, total } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'El pedido debe tener al menos un item' }, { status: 400 });
    }

    const tipoEntrega = normalizeTipoEntrega(tipo_entrega);

    // Create the transaction
    const transaccion = await prisma.transaccion.create({
      data: {
        cliente_nombre,
        cliente_telefono,
        cliente_direccion: tipoEntrega === 'DELIVERY' ? cliente_direccion : null,
        cliente_lat: tipoEntrega === 'DELIVERY' && cliente_lat ? Number(cliente_lat) : null,
        cliente_lng: tipoEntrega === 'DELIVERY' && cliente_lng ? Number(cliente_lng) : null,
        cliente_nit: cliente_nit || null,
        cliente_email: cliente_email || null,
        tipo_entrega: tipoEntrega,
        codigo_descuento: codigo_descuento || null,
        canal: tipoEntrega === 'RECOJO' ? 'PICKUP' : 'WEB',
        metodo_pago: normalizeMetodoPago(metodo_pago),
        total: Number(total),
        estado: 'PENDIENTE',
      },
    });



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
          descuentoAplicado: item.descuentoAplicado ? Number(item.descuentoAplicado) : 0,
          cantidad: Number(item.cantidad),
        },
      });

      // Transaccion detalle created (inventory deduction is handled in PUT /api/pedidos/[id] when state changes)
    }

    return NextResponse.json(
      {
        data: transaccion,
        message: 'Pedido creado exitosamente',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/pedidos error:', error);
    return NextResponse.json({ error: 'Error al crear pedido' }, { status: 500 });
  }
}
