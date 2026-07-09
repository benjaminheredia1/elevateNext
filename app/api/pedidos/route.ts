import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TipoCuenta, TipoEntrega, EstadoPago } from '@prisma/client';
import { calcularRinde } from '@/lib/server/inventario/disponibilidad';
import { resolverCliente } from '@/lib/server/clientes/clientes.service';
import { calcularPrecioFinal, includePromos } from '@/lib/server/productos/precio';
import { customAlphabet } from 'nanoid';
import { guard, STAFF } from '@/lib/server/auth/guard';

// Código de retiro/handoff legible (sin caracteres ambiguos)
const genCodigo = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);
async function generarCodigoUnico(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const c = genCodigo();
    const existe = await prisma.transaccion.findUnique({ where: { codigo: c }, select: { id: true } });
    if (!existe) return c;
  }
  return genCodigo() + Date.now().toString(36).slice(-2).toUpperCase();
}

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

/**
 * Estado de pago inicial del pedido web.
 * - QR / tarjeta: PAGADO (provisional hasta integrar pasarela real).
 * - Efectivo + delivery: COD_PENDIENTE (el repartidor cobra al entregar).
 * - Efectivo + pickup: PENDIENTE (paga al recoger en mostrador).
 */
function estadoPagoInicial(metodo: TipoCuenta, tipo: TipoEntrega | null): EstadoPago {
  if (metodo === TipoCuenta.QR || metodo === TipoCuenta.TARJETA) return EstadoPago.PAGADO;
  if (tipo === TipoEntrega.DELIVERY) return EstadoPago.COD_PENDIENTE;
  return EstadoPago.PENDIENTE;
}

export async function GET(req: NextRequest) {
  const auth = await guard(req, STAFF);
  if (auth instanceof NextResponse) return auth;

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
    // NOTA: total y precios enviados por el cliente se IGNORAN; se recalculan desde la BD.
    const { cliente_nombre, cliente_telefono, cliente_direccion, cliente_lat, cliente_lng, cliente_nit, cliente_email, tipo_entrega, codigo_descuento, metodo_pago, items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'El pedido debe tener al menos un item' }, { status: 400 });
    }

    // Resolver cada item contra el catálogo y calcular precio server-side
    const now = new Date();
    const lineas: { producto_id: number; precio_unitario: number; descuento: number; cantidad: number }[] = [];
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) {
        return NextResponse.json({ error: `Cantidad inválida para "${item.nombre ?? '?'}"` }, { status: 400 });
      }
      let producto = item.id
        ? await prisma.producto.findFirst({
            where: { id: Number(item.id), estado_publicacion: 'PUBLICADO', disponible: true },
            include: includePromos,
          })
        : null;
      if (!producto && item.nombre) {
        producto = await prisma.producto.findFirst({
          where: { nombre: { equals: String(item.nombre), mode: 'insensitive' }, estado_publicacion: 'PUBLICADO', disponible: true },
          include: includePromos,
        });
      }
      if (!producto) {
        return NextResponse.json({ error: `Producto no disponible: ${item.nombre ?? item.id}` }, { status: 400 });
      }
      const { precioFinal, descuento } = calcularPrecioFinal(producto, now);
      lineas.push({ producto_id: producto.id, precio_unitario: precioFinal, descuento, cantidad });
    }
    const totalCalculado = Math.round(lineas.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0) * 100) / 100;

    // Bloqueo duro por stock: rechazar items agotados o con cantidad mayor al RINDE.
    const sinStock: string[] = [];
    for (const item of items) {
      const prod = await prisma.producto.findFirst({
        where: { nombre: { equals: item.nombre, mode: 'insensitive' } },
        include: {
          recetaProducto_id: { include: { insumo: { select: { stock_actual: true } } } },
          insumo_reventa: { select: { stock_actual: true } },
        },
      });
      if (!prod) continue; // producto no rastreado en inventario
      const { stockTracked, rinde } = calcularRinde(prod);
      if (stockTracked && (rinde ?? 0) < Number(item.cantidad)) {
        sinStock.push(item.nombre);
      }
    }
    if (sinStock.length > 0) {
      return NextResponse.json(
        { error: `Sin stock suficiente para: ${sinStock.join(', ')}. Estos productos se agotaron, intenta más tarde.` },
        { status: 409 },
      );
    }

    const tipoEntrega = normalizeTipoEntrega(tipo_entrega);
    const metodoPago = normalizeMetodoPago(metodo_pago);
    const codigo = await generarCodigoUnico();

    // Crear o vincular el Cliente (dedup por teléfono / email / NIT) para la sección Clientes
    const dirEntrega = tipoEntrega === 'DELIVERY' ? (cliente_direccion ?? null) : null;
    const clienteId = await resolverCliente({
      nombre: cliente_nombre,
      telefono: cliente_telefono,
      email: cliente_email,
      nit: cliente_nit,
      direccion: dirEntrega,
    });

    // Create the transaction
    const transaccion = await prisma.transaccion.create({
      data: {
        cliente_id: clienteId,
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
        metodo_pago: metodoPago,
        payment_status: estadoPagoInicial(metodoPago, tipoEntrega),
        codigo,
        total: totalCalculado,
        estado: 'PENDIENTE',
      },
    });

    // Detalles con precios calculados en servidor
    // (el descuento de inventario se maneja en PUT /api/pedidos/[id] al cambiar de estado)
    await prisma.transaccionesDetalles.createMany({
      data: lineas.map((l) => ({
        transaccion_id: transaccion.id,
        producto_id: l.producto_id,
        precio_unitario: l.precio_unitario,
        descuentoAplicado: l.descuento,
        cantidad: l.cantidad,
      })),
    });

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
