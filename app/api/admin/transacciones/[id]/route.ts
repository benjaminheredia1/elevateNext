import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, NotFoundError, ValidationError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';

/** Detalle completo de una venta, para el modal de flujo de caja. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Id de venta inválido');

    const venta = await prisma.transaccion.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true, nit: true, email: true, direccion: true } },
        cajero: { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombre: true } },
        transaccionesDetalles_id: {
          include: {
            producto: { select: { id: true, nombre: true } },
            // El combo se agrupa al imprimir: en el papel es una línea con su
            // contenido, no una por producto componente.
            combo: { select: { id: true, nombre: true } },
          },
          orderBy: { id: 'asc' },
        },
        // La deuda y el desglose del pago mixto solo los consume el recibo: el
        // método "MIXTO" no dice cuánto entró por cada lado, eso vive en los
        // MovimientoCaja hijos.
        cuenta_corriente: { select: { monto: true, monto_pagado: true, vencimiento: true } },
        movimientos: { where: { tipo: 'VENTA' }, select: { metodo_pago: true, monto: true } },
      },
    });
    if (!venta) throw new NotFoundError('Venta no encontrada');

    const items = venta.transaccionesDetalles_id.map(d => {
      const precio = Number(d.precio_unitario);
      const descuento = Number(d.descuentoAplicado);
      return {
        id: d.id,
        producto_id: d.producto_id,
        nombre: d.producto?.nombre ?? 'Producto',
        cantidad: Number(d.cantidad),
        precio_unitario: precio,
        descuento: descuento,
        subtotal: Number((precio * Number(d.cantidad) - descuento).toFixed(2)),
        combo: d.combo ? { id: d.combo.id, nombre: d.combo.nombre } : null,
      };
    });

    const subtotal = items.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0);
    const descuentoTotal = items.reduce((acc, i) => acc + i.descuento, 0);

    return NextResponse.json({
      id: venta.id,
      codigo: venta.codigo,
      numero_turno: venta.numero_turno,
      // El correlativo del local es el número que ve el cliente y el que manda
      // en el recibo; `id` queda como referencia interna.
      numero_sucursal: venta.numero_sucursal,
      sucursal_id: venta.sucursal_id,
      created_at: venta.created_at,
      canal: venta.canal,
      tipo_entrega: venta.tipo_entrega,
      estado: venta.estado,
      payment_status: venta.payment_status,
      metodo_pago: venta.metodo_pago,
      es_cortesia: venta.es_cortesia,
      codigo_descuento: venta.codigo_descuento,
      turno_id: venta.turno_id,
      // El cajero puede no estar seteado en pedidos web: caemos al usuario que la creó.
      atendio: venta.cajero?.nombre ?? venta.usuario?.nombre ?? null,
      cliente: {
        id: venta.cliente?.id ?? null,
        // Los campos snapshot guardan los datos tal como se tomaron en la venta.
        nombre: venta.cliente?.nombre ?? venta.cliente_nombre ?? null,
        telefono: venta.cliente?.telefono ?? venta.cliente_telefono ?? null,
        nit: venta.cliente?.nit ?? venta.cliente_nit ?? null,
        email: venta.cliente?.email ?? venta.cliente_email ?? null,
        direccion: venta.cliente?.direccion ?? venta.cliente_direccion ?? null,
      },
      items,
      subtotal: Number(subtotal.toFixed(2)),
      descuento_total: Number(descuentoTotal.toFixed(2)),
      total: Number(venta.total),
      // Solo para reimprimir el recibo desde el panel.
      cuenta_corriente: venta.cuenta_corriente
        ? {
            monto: Number(venta.cuenta_corriente.monto),
            monto_pagado: Number(venta.cuenta_corriente.monto_pagado),
            vencimiento: venta.cuenta_corriente.vencimiento,
          }
        : null,
      movimientos: venta.movimientos.map(m => ({ metodo_pago: m.metodo_pago, monto: Number(m.monto) })),
    });
  } catch (e) { return handleApiError(e); }
}
