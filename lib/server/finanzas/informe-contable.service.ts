/**
 * informe-contable.service.ts — el informe que contabilidad venía armando a mano.
 *
 * Reemplaza la planilla "VENTAS SNACK": tres hojas que antes eran dos tablas
 * pegadas en una hoja de Excel y una conciliación que no existía.
 *
 * El problema que resuelve: la contadora comparaba sus ventas por producto
 * (devengado) contra el "esperado / contado" del turno, que es el ARQUEO DE
 * CAJA. Nunca pueden coincidir, porque son dos criterios distintos:
 *
 *   - Devengado: la venta cuenta el día que se entregó, cobrada o no.
 *     Incluye los fiados otorgados; no incluye la plata que entra hoy por
 *     fiados viejos.
 *   - Percibido: cuenta la plata que tocó la caja. Al revés en los dos puntos,
 *     y además suma ingresos extra y resta gastos y retiros.
 *
 * La hoja 3 hace explícito el puente entre los dos, que es lo que faltaba:
 *
 *   ventas del día − fiados otorgados + cobros de fiados anteriores
 *   + otros ingresos − egresos = movimiento neto de caja del día
 *
 * Las cortesías van aparte en las tres hojas: descuentan stock (generan costo)
 * y nunca generan ingreso, así que sumadas a las ventas mienten y omitidas
 * esconden el costo.
 */
import prisma from '@/lib/prisma';
import type { RangoFechas } from './rango';
import { whereVentasNetas, diaNegocioDe, resolverCostoUnitario } from './metricas.service';

/** Una línea de producto vendida, valorizada. Es la fila de la hoja 1. */
export interface LineaInforme {
  fecha: Date;
  mes: number;
  venta_id: number;
  numero_sucursal: number | null;
  producto: string;
  cantidad: number;
  /** Precio de lista × cantidad, antes de cualquier descuento. */
  valor_total: number;
  costo: number;
  /** `valor_total − costo`: lo que dejaría sin descuentos. */
  ganancia: number;
  /** Proporción del precio de lista efectivamente cobrada (1 = sin descuento). */
  dctos: number;
  /** Lo realmente cobrado. Cero en una cortesía. */
  valor_de_venta: number;
  /** `valor_de_venta − costo`. Negativo en una cortesía: el costo sin ingreso. */
  ganancia_real: number;
  observaciones: string;
}

/** Un turno con su plata abierta en componentes. Es la fila de la hoja 2. */
export interface TurnoInforme {
  fecha: Date;
  turno_id: number;
  cajero: string;
  ventas_efectivo: number;
  ventas_qr: number;
  ventas_total: number;
  cobros_fiado: number;
  otros_ingresos: number;
  egresos: number;
  esperado: number;
  contado: number | null;
  diferencia: number | null;
}

/** Un día con el puente devengado → percibido. Es la fila de la hoja 3. */
export interface DiaInforme {
  fecha: string;
  ventas_devengadas: number;
  fiados_otorgados: number;
  cobros_fiado: number;
  otros_ingresos: number;
  egresos: number;
  movimiento_neto_caja: number;
  cortesias: number;
  costo_cortesias: number;
}

export interface InformeContable {
  rango: RangoFechas;
  lineas: LineaInforme[];
  turnos: TurnoInforme[];
  dias: DiaInforme[];
}

/** Suma redondeada a centavos, para no arrastrar float en los totales. */
function redondear(valor: number): number {
  return Number(valor.toFixed(2));
}

/**
 * Acumulador por día de negocio. Se usa un objeto plano y no `Prisma.Decimal`
 * porque acá ya se está presentando, no calculando saldos.
 */
type Acumulador = Record<keyof Omit<DiaInforme, 'fecha' | 'movimiento_neto_caja'>, number>;

function acumuladorVacio(): Acumulador {
  return {
    ventas_devengadas: 0, fiados_otorgados: 0, cobros_fiado: 0,
    otros_ingresos: 0, egresos: 0, cortesias: 0, costo_cortesias: 0,
  };
}

/**
 * Hoja 1: una fila por línea de venta, valorizada.
 *
 * El descuento por privilegio es el detalle fino. Al vender, el sistema lo
 * aplica sobre el TOTAL de la venta y deja los precios de línea intactos
 * (`caja.service.ts`, "Descuento por privilegio"). Si acá se sumaran las líneas
 * tal cual, el informe cobraría de más justo en las ventas con descuento. Por
 * eso se reparte proporcionalmente con `factor = total / suma de las líneas`:
 * sale del total realmente guardado, así que también absorbe los redondeos y
 * funciona igual para cualquier descuento futuro.
 */
async function lineasDelPeriodo(rango: RangoFechas, sucursal?: number): Promise<LineaInforme[]> {
  // Se parte de la definición canónica de ventas netas pero SIN su filtro de
  // cortesías: en este informe las cortesías son fila, marcadas y en Bs 0 de
  // venta. El resto (estados válidos, rango, sucursal) tiene que seguir siendo
  // el mismo que usa el estado de resultados, o los dos dejan de cuadrar.
  // `es_cortesia: undefined` es "sin filtro" para Prisma: se conserva todo lo
  // demás de la definición canónica (estados válidos, rango, sucursal) y solo se
  // levanta la exclusión de cortesías, que en este informe son fila.
  const whereVentas = { ...whereVentasNetas(rango, sucursal), es_cortesia: undefined };

  const detalles = await prisma.transaccionesDetalles.findMany({
    where: { transaccion: whereVentas },
    select: {
      producto_id: true, cantidad: true, precio_unitario: true,
      descuentoAplicado: true, costo_unitario: true,
      producto: { select: { nombre: true } },
      transaccion: {
        select: {
          id: true, created_at: true, total: true, es_cortesia: true,
          payment_status: true, numero_sucursal: true, sucursal_id: true,
          cuenta_corriente: {
            select: {
              estado: true,
              pagos: { select: { created_at: true }, orderBy: { created_at: 'desc' }, take: 1 },
            },
          },
          transaccionesDetalles_id: {
            select: { precio_unitario: true, cantidad: true, descuentoAplicado: true },
          },
        },
      },
    },
    orderBy: [{ transaccion: { created_at: 'asc' } }, { id: 'asc' }],
  });

  const costoDe = await resolverCostoUnitario(detalles);

  return detalles.map((detalle): LineaInforme => {
    const venta = detalle.transaccion;
    const cantidad = Number(detalle.cantidad);
    const precioUnitario = Number(detalle.precio_unitario);

    const valorTotal = precioUnitario * cantidad;
    const descuentoLinea = Number(detalle.descuentoAplicado);
    const subtotal = valorTotal - descuentoLinea;

    // Reparto del descuento aplicado sobre el total de la venta.
    const bruto = venta.transaccionesDetalles_id.reduce(
      (suma, l) => suma + Number(l.precio_unitario) * Number(l.cantidad) - Number(l.descuentoAplicado),
      0,
    );
    const factor = bruto > 0 ? Number(venta.total) / bruto : 1;

    const costo = redondear(costoDe(detalle) * cantidad);
    // La cortesía se entrega sin cobrar: su ingreso es cero, pero el costo se
    // conserva. Es exactamente el "me genera un costo pero no un ingreso".
    const valorDeVenta = venta.es_cortesia ? 0 : redondear(subtotal * factor);

    return {
      fecha: venta.created_at,
      mes: Number(diaNegocioDe(venta.created_at).slice(5, 7)),
      venta_id: venta.id,
      numero_sucursal: venta.numero_sucursal,
      producto: detalle.producto.nombre,
      cantidad,
      valor_total: redondear(valorTotal),
      costo,
      ganancia: redondear(valorTotal - costo),
      dctos: valorTotal > 0 ? Number((valorDeVenta / valorTotal).toFixed(4)) : 0,
      valor_de_venta: valorDeVenta,
      ganancia_real: redondear(valorDeVenta - costo),
      observaciones: observacionDe(venta),
    };
  });
}

type VentaParaObservacion = {
  es_cortesia: boolean;
  payment_status: string;
  cuenta_corriente: { estado: string; pagos: { created_at: Date }[] } | null;
};

/**
 * La columna que contabilidad leía para entender por qué una venta no estaba en
 * la caja. Antes la escribía a mano ("FIADO ANTERIOR — Venta #2098") y ahí se le
 * duplicaban las líneas; ahora la escribe el sistema.
 */
function observacionDe(venta: VentaParaObservacion): string {
  if (venta.es_cortesia) return 'Cortesía — sin ingreso, con costo';

  const deuda = venta.cuenta_corriente;
  if (deuda) {
    if (deuda.estado === 'PAGADA') {
      const cobro = deuda.pagos[0]?.created_at;
      return cobro ? `Fiado cobrado el ${diaNegocioDe(cobro)}` : 'Fiado cobrado';
    }
    return deuda.estado === 'PARCIAL' ? 'Fiado cobrado en parte' : 'Fiado pendiente de cobro';
  }

  // Sin cuenta corriente detrás pero tampoco pagada: es el contra-entrega del
  // delivery (COD_PENDIENTE), que se entregó y todavía no se cobró. Sin este
  // caso salía con la observación vacía, indistinguible de una venta cobrada,
  // que es exactamente el problema que este informe viene a resolver.
  return venta.payment_status === 'PAGADO' ? '' : 'Pendiente de cobro';
}

/**
 * Hoja 2: la tabla de turnos, con la plata abierta en sus componentes.
 *
 * `ventas_efectivo` / `ventas_qr` son solo los movimientos de tipo VENTA; el
 * resto son las otras entradas y salidas que también viven en el turno. La UI
 * de `/admin/caja` nunca mostró las ventas abiertas por método —solo apertura,
 * esperado y contado—, y por eso contabilidad terminaba copiando el arqueo
 * creyendo que eran ventas.
 */
async function turnosDelPeriodo(rango: RangoFechas, sucursal?: number): Promise<TurnoInforme[]> {
  const turnos = await prisma.cajaTurno.findMany({
    where: {
      fecha_apertura: { gte: rango.desde, lte: rango.hasta },
      ...(sucursal ? { sucursal_id: sucursal } : {}),
    },
    orderBy: { fecha_apertura: 'asc' },
    include: {
      cajero: { select: { nombre: true, apellido_paterno: true } },
      movimientos: { select: { tipo: true, categoria: true, monto: true } },
    },
  });

  return turnos.map((turno): TurnoInforme => {
    const suma = (predicado: (m: (typeof turno.movimientos)[number]) => boolean) =>
      redondear(turno.movimientos.filter(predicado).reduce((s, m) => s + Number(m.monto), 0));

    const ventasEfectivo = Number(turno.ventas_efectivo);
    const ventasQr = Number(turno.ventas_qr);
    const cobrosFiado = suma(m => m.categoria === 'Cobro fiado');
    const otrosIngresos = suma(m => m.tipo === 'INGRESO_EXTRA' && m.categoria !== 'Cobro fiado');
    // Los egresos se guardan en negativo; se muestran en positivo y se restan.
    const egresos = Math.abs(suma(m => Number(m.monto) < 0));
    const contado = turno.real_efectivo == null && turno.real_qr == null
      ? null
      : redondear(Number(turno.real_efectivo ?? 0) + Number(turno.real_qr ?? 0));
    const esperado = redondear(
      Number(turno.apertura_efectivo) + Number(turno.apertura_qr)
      + ventasEfectivo + ventasQr + cobrosFiado + otrosIngresos - egresos,
    );

    return {
      fecha: turno.fecha_apertura,
      turno_id: turno.id,
      cajero: [turno.cajero.nombre, turno.cajero.apellido_paterno].filter(Boolean).join(' '),
      ventas_efectivo: redondear(ventasEfectivo),
      ventas_qr: redondear(ventasQr),
      ventas_total: redondear(ventasEfectivo + ventasQr),
      cobros_fiado: cobrosFiado,
      otros_ingresos: otrosIngresos,
      egresos,
      esperado,
      contado,
      diferencia: contado == null ? null : redondear(contado - esperado),
    };
  });
}

/**
 * Hoja 3: la conciliación diaria. Es la hoja que no existía y la que explica el
 * descuadre que contabilidad no podía cerrar.
 */
async function diasDelPeriodo(rango: RangoFechas, sucursal?: number): Promise<DiaInforme[]> {
  const whereVentas = { ...whereVentasNetas(rango, sucursal), es_cortesia: undefined };

  const [ventas, movimientos, cortesias] = await Promise.all([
    prisma.transaccion.findMany({
      where: whereVentasNetas(rango, sucursal),
      select: {
        created_at: true, total: true,
        // Solo hace falta saber SI hubo cobro en caja por esta venta, no cuánto:
        // `take: 1` evita traer las dos filas de cada pago mixto.
        movimientos: { where: { tipo: 'VENTA' }, select: { id: true }, take: 1 },
      },
    }),
    prisma.movimientoCaja.findMany({
      where: {
        created_at: { gte: rango.desde, lte: rango.hasta },
        ...(sucursal ? { sucursal_id: sucursal } : {}),
      },
      select: { created_at: true, tipo: true, categoria: true, monto: true },
    }),
    prisma.transaccionesDetalles.findMany({
      where: { transaccion: { ...whereVentas, es_cortesia: true } },
      select: {
        producto_id: true, cantidad: true, costo_unitario: true,
        transaccion: { select: { id: true, created_at: true, total: true, sucursal_id: true } },
      },
    }),
  ]);

  const porDia = new Map<string, Acumulador>();
  const dia = (fecha: Date) => {
    const clave = diaNegocioDe(fecha);
    const actual = porDia.get(clave) ?? acumuladorVacio();
    porDia.set(clave, actual);
    return actual;
  };

  for (const venta of ventas) {
    const acumulado = dia(venta.created_at);
    acumulado.ventas_devengadas += Number(venta.total);
    // Fiado otorgado: la venta salió del local sin que entrara plata ESE día.
    //
    // Se mide por la ausencia de MovimientoCaja de tipo VENTA y NO por
    // `payment_status`, que es el estado de hoy: al cobrar una deuda, la venta
    // pasa a PAGADO (`caja.service.ts`, `ventasSaldadas`). Midiéndolo así, un
    // fiado de agosto cobrado en septiembre desaparecía de los fiados de
    // agosto, y la conciliación de un mes ya cerrado cambiaba sola cada vez que
    // alguien pagaba una deuda vieja. Los movimientos, en cambio, no se borran:
    // que ese día no haya habido ninguno es un hecho histórico y firme.
    //
    // Además hace que la ecuación cierre por construcción: el movimiento de
    // caja de una venta se crea por su total exacto, así que
    // `ventas_devengadas − fiados_otorgados` es la suma de los VENTA del día.
    if (venta.movimientos.length === 0) acumulado.fiados_otorgados += Number(venta.total);
  }

  for (const movimiento of movimientos) {
    const acumulado = dia(movimiento.created_at);
    const monto = Number(movimiento.monto);
    if (monto < 0) acumulado.egresos += Math.abs(monto);
    else if (movimiento.categoria === 'Cobro fiado') acumulado.cobros_fiado += monto;
    else if (movimiento.tipo !== 'VENTA') acumulado.otros_ingresos += monto;
  }

  // Las cortesías se cuentan una sola vez por venta (el total), pero su costo se
  // suma línea por línea.
  const costoDe = await resolverCostoUnitario(cortesias);
  const ventasContadas = new Set<number>();
  for (const linea of cortesias) {
    const acumulado = dia(linea.transaccion.created_at);
    acumulado.costo_cortesias += costoDe(linea) * Number(linea.cantidad);
    if (!ventasContadas.has(linea.transaccion.id)) {
      ventasContadas.add(linea.transaccion.id);
      acumulado.cortesias += Number(linea.transaccion.total);
    }
  }

  return Array.from(porDia.entries())
    .map(([fecha, a]): DiaInforme => ({
      fecha,
      ventas_devengadas: redondear(a.ventas_devengadas),
      fiados_otorgados: redondear(a.fiados_otorgados),
      cobros_fiado: redondear(a.cobros_fiado),
      otros_ingresos: redondear(a.otros_ingresos),
      egresos: redondear(a.egresos),
      movimiento_neto_caja: redondear(
        a.ventas_devengadas - a.fiados_otorgados + a.cobros_fiado + a.otros_ingresos - a.egresos,
      ),
      cortesias: redondear(a.cortesias),
      costo_cortesias: redondear(a.costo_cortesias),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Las tres hojas del informe, en una sola pasada. */
export async function informeContable(rango: RangoFechas, sucursal?: number): Promise<InformeContable> {
  const [lineas, turnos, dias] = await Promise.all([
    lineasDelPeriodo(rango, sucursal),
    turnosDelPeriodo(rango, sucursal),
    diasDelPeriodo(rango, sucursal),
  ]);
  return { rango, lineas, turnos, dias };
}
