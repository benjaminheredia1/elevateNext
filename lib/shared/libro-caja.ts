/**
 * libro-caja.ts — armado del libro del turno para mostrarlo al cajero.
 *
 * Dos problemas que resuelve, los dos sobre el mismo síntoma ("los números
 * saltan"):
 *
 * 1. El concepto se guarda con el id global ("Venta #2393"), que es un contador
 *    compartido por todo el negocio. El cajero cuenta pedidos de SU turno, así
 *    que se reescribe con `numero_turno`: "Venta #12 (global #2393)".
 *
 * 2. Fiados y cortesías consumen número de pedido pero no generan movimiento de
 *    caja (no entra plata), así que el libro pasaba de #7 a #9. Se intercalan
 *    como entradas informativas, en Bs 0, para que la secuencia sea continua.
 */

export type MetodoPago = 'EFECTIVO' | 'QR' | 'TARJETA';

export interface MovimientoLibro {
  id: number;
  concepto: string;
  tipo: string;
  metodo_pago: MetodoPago;
  monto: string | number;
  created_at: string;
  transaccion?: { id: number; numero_turno: number | null } | null;
}

export interface PedidoSinCobro {
  id: number;
  numero_turno: number | null;
  total: string | number;
  es_cortesia: boolean;
  cliente_nombre: string | null;
  created_at: string;
  cuenta_corriente?: { id: number } | null;
}

/**
 * Fila del libro: un movimiento real de plata o un pedido sin cobro.
 *
 * Es genérica en el movimiento para que cada pantalla conserve los campos que
 * pidió de más (el detalle de la venta en /caja/movimientos, por ejemplo).
 */
export type EntradaLibro<M extends MovimientoLibro = MovimientoLibro> =
  | { clase: 'MOVIMIENTO'; key: string; created_at: string; movimiento: M; concepto: string }
  | { clase: 'SIN_COBRO'; key: string; created_at: string; pedido: PedidoSinCobro; concepto: string; etiqueta: 'Fiado' | 'Cortesía' };

/**
 * Reemplaza el id global por el número del turno dentro del concepto guardado.
 * Sin transacción asociada (ingresos y gastos manuales) queda tal cual.
 */
export function conceptoConNumeroTurno(m: MovimientoLibro): string {
  const numero = m.transaccion?.numero_turno;
  if (m.transaccion == null || numero == null) return m.concepto;
  return m.concepto.replaceAll(`#${m.transaccion.id}`, `#${numero} (global #${m.transaccion.id})`);
}

/** Un fiado tiene cuenta por cobrar detrás; la cortesía no se cobra nunca. */
export function etiquetaSinCobro(p: PedidoSinCobro): 'Fiado' | 'Cortesía' {
  return p.es_cortesia ? 'Cortesía' : 'Fiado';
}

export function conceptoSinCobro(p: PedidoSinCobro): string {
  const numero = p.numero_turno != null ? `#${p.numero_turno} (global #${p.id})` : `#${p.id}`;
  const cliente = p.cliente_nombre?.trim();
  return `${etiquetaSinCobro(p)} ${numero}${cliente ? ` · ${cliente}` : ''}`;
}

/**
 * Mezcla movimientos y pedidos sin cobro en una sola lista ordenada por hora
 * (más reciente primero), que es como el cajero lee el libro.
 */
export function armarLibro<M extends MovimientoLibro>(
  movimientos: M[],
  pedidosSinCobro: PedidoSinCobro[] = [],
): EntradaLibro<M>[] {
  const entradas: EntradaLibro<M>[] = [
    ...movimientos.map((m): EntradaLibro<M> => ({
      clase: 'MOVIMIENTO',
      key: `mov-${m.id}`,
      created_at: m.created_at,
      movimiento: m,
      concepto: conceptoConNumeroTurno(m),
    })),
    ...pedidosSinCobro.map((p): EntradaLibro<M> => ({
      clase: 'SIN_COBRO',
      key: `ped-${p.id}`,
      created_at: p.created_at,
      pedido: p,
      concepto: conceptoSinCobro(p),
      etiqueta: etiquetaSinCobro(p),
    })),
  ];

  return entradas.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
