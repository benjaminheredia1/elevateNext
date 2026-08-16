/**
 * Traducen cada forma en la que una venta llega al navegador a los `DatosRecibo`
 * que consume el generador.
 *
 * Son cuatro pantallas y dos formas distintas: la venta cruda de Prisma (POS,
 * historial de turnos y pedidos) y la venta ya mapeada de las ventas del turno.
 * Todo el criterio de negocio del ticket —qué es un descuento, cuándo es fiado,
 * cómo se agrupa un combo— vive acá y no repetido en cada pantalla.
 */

import type { DatosRecibo, LineaRecibo, LocalRecibo, MarcaRecibo, PagoRecibo } from './tipos';

/** Nombre que guarda la venta cuando el cliente es el anónimo del mostrador. */
const CLIENTE_MOSTRADOR = 'Cliente mostrador';

const num = (valor: unknown): number => Number(valor ?? 0) || 0;

/** Un local vacío igual imprime: el ticket omite las líneas que no tiene. */
function normalizarLocal(local?: LocalRecibo | null, nombreAlternativo?: string | null): LocalRecibo {
  return {
    nombre: local?.nombre ?? nombreAlternativo ?? '',
    direccion: local?.direccion ?? null,
    telefono: local?.telefono ?? null,
  };
}

function nombreCliente(valor?: string | null): string | null {
  const nombre = valor?.trim();
  if (!nombre || nombre === CLIENTE_MOSTRADOR) return null;
  return nombre;
}

interface DetalleCrudo {
  cantidad: number;
  precio_unitario: number | string;
  descuentoAplicado?: number | string | null;
  producto?: { nombre: string } | null;
  combo?: { id: number; nombre: string } | null;
}

/**
 * Arma las líneas del ticket agrupando los combos.
 *
 * Un combo se guarda como una línea por producto componente con el precio
 * prorrateado; el cliente compró UNA cosa y así tiene que verla, con el
 * contenido debajo para que pueda comprobar que se lo llevó completo.
 *
 * La cantidad del combo queda en 1: las líneas hijas traen la cantidad ya
 * multiplicada por cuántos combos se vendieron, así que no hay forma de
 * recuperar el número de combos sin volver a la receta. El contenido del
 * detalle sí refleja lo que realmente se entrega.
 */
export function lineasDeDetalles(detalles: DetalleCrudo[]): LineaRecibo[] {
  const lineas: LineaRecibo[] = [];
  // El combo ocupa el lugar de su primer componente: el ticket respeta el orden
  // en que se cargó la venta, que es el orden en que el cajero la cantó.
  const posicion = new Map<number, number>();
  const partes = new Map<number, string[]>();

  for (const d of detalles) {
    const importe = num(d.precio_unitario) * num(d.cantidad) - num(d.descuentoAplicado);
    const nombre = d.producto?.nombre ?? 'Producto';

    if (!d.combo) {
      lineas.push({ cantidad: num(d.cantidad), nombre, importe });
      continue;
    }

    const componente = `${num(d.cantidad)}× ${nombre}`;
    const indice = posicion.get(d.combo.id);
    if (indice == null) {
      posicion.set(d.combo.id, lineas.length);
      partes.set(d.combo.id, [componente]);
      lineas.push({ cantidad: 1, nombre: d.combo.nombre, importe, detalle: componente });
      continue;
    }

    const acumuladas = partes.get(d.combo.id)!;
    acumuladas.push(componente);
    lineas[indice].importe += importe;
    lineas[indice].detalle = acumuladas.join(' + ');
  }

  return lineas;
}

/**
 * Cierra los totales contra el total que guardó el servidor.
 *
 * El descuento no se recalcula: se toma la diferencia entre lo que suman las
 * líneas y el total real de la venta. Así el ticket siempre cuadra —
 * subtotal - descuento = TOTAL— aunque el privilegio se haya aplicado sobre el
 * total y no línea por línea, que es como lo hace el POS.
 */
function totales(lineas: LineaRecibo[], total: number, etiqueta?: string | null) {
  const subtotal = lineas.reduce((suma, l) => suma + l.importe, 0);
  const diferencia = Number((subtotal - total).toFixed(2));
  return {
    subtotal: Number(subtotal.toFixed(2)),
    descuento: diferencia > 0
      ? { etiqueta: etiqueta?.trim() || 'Descuento', monto: diferencia }
      : null,
  };
}

interface MovimientoCrudo {
  metodo_pago?: string | null;
  monto: number | string;
}

/**
 * Desglose del pago mixto. Vive en los MovimientoCaja hijos y no en la venta,
 * así que puede no venir: en ese caso se imprime el método sin números, que es
 * preferible a inventar un reparto.
 */
function pagoDe(metodo?: string | null, movimientos?: MovimientoCrudo[] | null): PagoRecibo | null {
  if (!metodo) return null;
  const partes = (movimientos ?? [])
    .filter(m => m.metodo_pago)
    .map(m => ({ metodo: String(m.metodo_pago), monto: num(m.monto) }));
  return partes.length > 1 ? { metodo, partes } : { metodo };
}

interface CuentaCruda {
  monto: number | string;
  monto_pagado?: number | string | null;
  vencimiento?: string | Date | null;
}

/**
 * Sello de la venta que no movió plata. El fiado de salón queda en PENDIENTE y
 * el saldo sale de su cuenta corriente cuando la pantalla la trae; el
 * contra-entrega del delivery web queda en COD_PENDIENTE y lleva su propio
 * sello.
 */
function marcaDe(args: {
  es_cortesia?: boolean | null;
  payment_status?: string | null;
  cuenta?: CuentaCruda | null;
  total: number;
}): MarcaRecibo | null {
  if (args.es_cortesia) return { tipo: 'CORTESIA' };
  // El contra-entrega del delivery web no es una deuda del cliente: es plata
  // que el repartidor cobra al llegar. Sellarlo como fiado mandaría a cobrarla
  // a Deudores, donde no está.
  if (args.payment_status === 'COD_PENDIENTE') return { tipo: 'COD', saldo: args.total };
  if (args.payment_status !== 'PENDIENTE') return null;
  return {
    tipo: 'FIADO',
    saldo: args.cuenta ? num(args.cuenta.monto) - num(args.cuenta.monto_pagado) : null,
    vencimiento: args.cuenta?.vencimiento ?? null,
  };
}

/** La venta tal como la devuelven el POS, el historial de turnos y los pedidos. */
export interface TransaccionRecibo {
  id: number;
  numero_sucursal?: number | null;
  numero_turno?: number | null;
  turno_id?: number | null;
  created_at: string | Date;
  total: number | string;
  costo_envio?: number | string | null;
  metodo_pago?: string | null;
  payment_status?: string | null;
  es_cortesia?: boolean | null;
  codigo_descuento?: string | null;
  cliente_nombre?: string | null;
  cajero?: { nombre: string } | null;
  cuenta_corriente?: CuentaCruda | null;
  movimientos?: MovimientoCrudo[] | null;
  transaccionesDetalles_id: DetalleCrudo[];
}

export function desdeTransaccion(
  venta: TransaccionRecibo,
  local?: LocalRecibo | null,
  opciones?: { cajero?: string | null; nombreLocal?: string | null },
): DatosRecibo {
  const lineas = lineasDeDetalles(venta.transaccionesDetalles_id ?? []);
  const total = num(venta.total);
  const { subtotal, descuento } = totales(lineas, total, venta.codigo_descuento);
  const marca = marcaDe({
    es_cortesia: venta.es_cortesia,
    payment_status: venta.payment_status,
    cuenta: venta.cuenta_corriente,
    total,
  });

  return {
    local: normalizarLocal(local, opciones?.nombreLocal),
    numero: venta.numero_sucursal ?? venta.id,
    fecha: venta.created_at,
    cajero: opciones?.cajero ?? venta.cajero?.nombre ?? null,
    // Los pedidos web no pasan por un turno: la línea se omite sola.
    turno: venta.turno_id ? { id: venta.turno_id, venta: venta.numero_turno ?? null } : null,
    cliente: nombreCliente(venta.cliente_nombre),
    lineas,
    subtotal,
    descuento,
    envio: num(venta.costo_envio),
    total,
    pago: marca ? null : pagoDe(venta.metodo_pago, venta.movimientos),
    marca,
    referencia: venta.id,
  };
}

/**
 * El detalle de venta del panel (`GET /api/admin/transacciones/:id`), que
 * alimenta el modal de flujo de caja. Ya viene con los ítems mapeados y con el
 * cajero resuelto en `atendio`, así que se traduce a la forma cruda y se
 * delega: el criterio del ticket es uno solo.
 */
export interface DetalleAdminRecibo {
  id: number;
  numero_sucursal?: number | null;
  numero_turno?: number | null;
  turno_id?: number | null;
  created_at: string;
  total: number;
  metodo_pago?: string | null;
  payment_status?: string | null;
  es_cortesia?: boolean;
  codigo_descuento?: string | null;
  atendio?: string | null;
  cliente?: { nombre: string | null } | null;
  cuenta_corriente?: CuentaCruda | null;
  movimientos?: MovimientoCrudo[] | null;
  items: {
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    descuento: number;
    combo?: { id: number; nombre: string } | null;
  }[];
}

export function desdeDetalleAdmin(venta: DetalleAdminRecibo, local?: LocalRecibo | null): DatosRecibo {
  return desdeTransaccion(
    {
      ...venta,
      cliente_nombre: venta.cliente?.nombre ?? null,
      transaccionesDetalles_id: venta.items.map(i => ({
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        descuentoAplicado: i.descuento,
        producto: { nombre: i.nombre },
        combo: i.combo ?? null,
      })),
    },
    local,
    { cajero: venta.atendio ?? null },
  );
}

/** La venta ya mapeada que devuelve la pantalla de ventas del turno. */
export interface VentaCajaRecibo {
  id: number;
  numero_sucursal?: number | null;
  numero_turno?: number | null;
  created_at: string;
  total: number;
  metodo_pago?: string | null;
  forma: 'PAGADA' | 'FIADO' | 'CORTESIA';
  descuento?: string | null;
  cliente_nombre?: string | null;
  cajero?: string | null;
  deuda?: { saldo: number; vencimiento: string | null } | null;
  movimientos?: MovimientoCrudo[] | null;
  items: {
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    descuento: number;
    combo: { id: number; nombre: string } | null;
  }[];
}

export function desdeVentaCaja(
  venta: VentaCajaRecibo,
  local?: LocalRecibo | null,
  opciones?: { turnoId?: number | null; nombreLocal?: string | null },
): DatosRecibo {
  const lineas = lineasDeDetalles(
    venta.items.map(i => ({
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      descuentoAplicado: i.descuento,
      producto: { nombre: i.nombre },
      combo: i.combo,
    })),
  );
  const { subtotal, descuento } = totales(lineas, venta.total, venta.descuento);
  const marca: MarcaRecibo | null =
    venta.forma === 'CORTESIA' ? { tipo: 'CORTESIA' }
    : venta.forma === 'FIADO' ? {
        tipo: 'FIADO',
        saldo: venta.deuda?.saldo ?? null,
        vencimiento: venta.deuda?.vencimiento ?? null,
      }
    : null;

  return {
    local: normalizarLocal(local, opciones?.nombreLocal),
    numero: venta.numero_sucursal ?? venta.id,
    fecha: venta.created_at,
    cajero: venta.cajero ?? null,
    turno: opciones?.turnoId ? { id: opciones.turnoId, venta: venta.numero_turno ?? null } : null,
    cliente: nombreCliente(venta.cliente_nombre),
    lineas,
    subtotal,
    descuento,
    envio: 0,
    total: venta.total,
    pago: marca ? null : pagoDe(venta.metodo_pago, venta.movimientos),
    marca,
    referencia: venta.id,
  };
}
