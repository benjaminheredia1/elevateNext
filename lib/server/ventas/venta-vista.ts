import { Prisma } from '@prisma/client';

/**
 * Forma en que caja y admin miran una venta.
 *
 * Vive acá y no en cada servicio porque las dos pantallas muestran lo mismo
 * —qué se llevó, cómo se cerró, cuánto quedó debiendo— y cuando el criterio
 * estaba duplicado una cortesía podía contarse como cobrada de un lado y no
 * del otro. El `include` y el mapeo van juntos: cambiar uno sin el otro rompe.
 */
export const ventaVistaInclude = {
  transaccionesDetalles_id: {
    include: {
      producto: { select: { id: true, nombre: true } },
      combo: { select: { id: true, nombre: true } },
    },
  },
  cliente: { select: { id: true, nombre: true, telefono: true } },
  cajero: { select: { id: true, nombre: true } },
  sucursal: { select: { id: true, nombre: true } },
  // La deuda explica un fiado: cuánto queda y cuándo vence.
  cuenta_corriente: { select: { id: true, monto: true, monto_pagado: true, estado: true, vencimiento: true } },
  // Desglose del pago mixto para reimprimir el recibo: cuánto entró por
  // efectivo y cuánto por QR solo existe acá, la venta guarda "MIXTO" y nada
  // más. Se filtran los de VENTA porque un abono a deuda cobrado en la misma
  // operación también cuelga de esta transacción.
  movimientos: { where: { tipo: 'VENTA' as const }, select: { metodo_pago: true, monto: true } },
} satisfies Prisma.TransaccionInclude;

type VentaConVista = Prisma.TransaccionGetPayload<{ include: typeof ventaVistaInclude }>;

export function mapearVenta(v: VentaConVista) {
  // Pendiente de cobro: el fiado de salón y el contra-entrega del delivery.
  const esFiado = v.payment_status === 'PENDIENTE' || v.payment_status === 'COD_PENDIENTE';
  const deuda = v.cuenta_corriente;
  return {
    id: v.id,
    numero_turno: v.numero_turno,
    // El que se le dice al cliente; `id` queda como referencia interna.
    numero_sucursal: v.numero_sucursal,
    codigo: v.codigo,
    canal: v.canal,
    created_at: v.created_at,
    total: Number(v.total),
    metodo_pago: v.metodo_pago,
    estado: v.estado,
    payment_status: v.payment_status,
    // Cómo se cerró la venta: es el eje por el que se filtra la pantalla.
    forma: v.es_cortesia ? 'CORTESIA' : esFiado ? 'FIADO' : 'PAGADA',
    es_cortesia: v.es_cortesia,
    // `codigo_descuento` guarda el privilegio o la promo aplicada.
    descuento: v.codigo_descuento,
    cliente: v.cliente ? { id: v.cliente.id, nombre: v.cliente.nombre, telefono: v.cliente.telefono } : null,
    cliente_nombre: v.cliente?.nombre ?? v.cliente_nombre,
    cajero: v.cajero?.nombre ?? null,
    sucursal_id: v.sucursal_id,
    sucursal: v.sucursal?.nombre ?? null,
    deuda: deuda
      ? {
          saldo: Number(deuda.monto) - Number(deuda.monto_pagado),
          estado: deuda.estado,
          vencimiento: deuda.vencimiento,
        }
      : null,
    items: v.transaccionesDetalles_id.map(d => ({
      producto_id: d.producto_id,
      nombre: d.producto.nombre,
      cantidad: d.cantidad,
      precio_unitario: Number(d.precio_unitario),
      descuento: Number(d.descuentoAplicado),
      // Las líneas de un combo comparten combo_id: la pantalla las agrupa.
      combo: d.combo ? { id: d.combo.id, nombre: d.combo.nombre } : null,
    })),
    // Solo se usa para reimprimir el recibo de un pago mixto.
    movimientos: v.movimientos.map(m => ({ metodo_pago: m.metodo_pago, monto: Number(m.monto) })),
  };
}
