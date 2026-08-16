/**
 * Datos que consume el recibo impreso.
 *
 * Es una forma propia, desacoplada de Prisma y de los payloads de cada
 * endpoint: al ticket lo alimentan cuatro pantallas distintas (POS, ventas del
 * turno, historial de turnos y pedidos) y cada una trae la venta con una forma
 * diferente. Los adaptadores de `adaptadores.ts` las traducen a esto.
 */

/** Una línea del ticket. Un combo es UNA línea, con su contenido en `detalle`. */
export interface LineaRecibo {
  cantidad: number;
  nombre: string;
  /** Lo que se cobró por la línea entera, ya con su descuento aplicado. */
  importe: number;
  /** Contenido del combo: "1× Pollo Entero + 2× Papas". Null en sueltos. */
  detalle?: string | null;
}

/**
 * Cómo se pagó. `partes` solo viene en MIXTO: el desglose real vive en los
 * MovimientoCaja hijos, no en la venta, así que puede faltar en una reimpresión
 * vieja. Sin él se imprime el método sin números, que es preferible a inventar
 * un reparto.
 */
export interface PagoRecibo {
  metodo: string;
  partes?: { metodo: string; monto: number }[];
}

/**
 * Sello de una venta que NO entró plata a caja. Se imprime destacado y reemplaza
 * al bloque de pago: un fiado con pinta de cobrado es un problema de dinero.
 *
 * `COD` es el contra-entrega del delivery web y se separa del fiado a propósito:
 * no es una deuda del cliente, es plata que el repartidor todavía no rindió, y
 * el papel que viaja con el pedido tiene que decirle eso a quien lo entrega.
 */
export interface MarcaRecibo {
  tipo: 'FIADO' | 'CORTESIA' | 'COD';
  /** Saldo pendiente del fiado, o lo que hay que cobrar en el contra-entrega. */
  saldo?: number | null;
  vencimiento?: string | Date | null;
}

export interface LocalRecibo {
  nombre: string;
  direccion?: string | null;
  telefono?: string | null;
}

export interface DatosRecibo {
  local: LocalRecibo;
  /**
   * El número grande: el correlativo de la sucursal, que es el que se le canta
   * al cliente. Cae al id global solo si la venta no lo tiene.
   */
  numero: number;
  fecha: string | Date;
  cajero?: string | null;
  /**
   * Turno y posición de la venta dentro de él. Es lo que cuadra contra el
   * arqueo. Los pedidos web no tienen turno: la línea se omite sola.
   */
  turno?: { id: number; venta?: number | null } | null;
  cliente?: string | null;
  lineas: LineaRecibo[];
  subtotal: number;
  /** Privilegio o promoción aplicada a la venta entera. */
  descuento?: { etiqueta: string; monto: number } | null;
  /**
   * Hoy siempre 0: el envío no es ingreso del negocio, es plata del repartidor.
   * La línea solo se dibuja si es mayor a 0, por si algún día se cobra dentro
   * de la venta.
   */
  envio?: number | null;
  total: number;
  pago?: PagoRecibo | null;
  marca?: MarcaRecibo | null;
  /** Id global de la venta: la referencia para buscarla en el panel. */
  referencia: number;
}
