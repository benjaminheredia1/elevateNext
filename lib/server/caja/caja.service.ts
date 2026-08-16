import prisma from '@/lib/prisma';
import { Prisma, TipoMovimientoCaja, TipoCuenta, EstadoTransaccion, EstadoPago } from '@prisma/client';
import type { Session } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/server/errors';
import type { AperturaCajaInput, MovimientoManualInput, CierreCajaInput, VentaFisicaInput } from '@/lib/server/dto/caja.dto';
import { descontarStockPorTransaccion } from '@/lib/server/inventario/descuento-stock.service';
import { lineasDeCombo } from '@/lib/server/promociones/combos.service';
import { resolverCliente, getClienteAnonimo } from '@/lib/server/clientes/clientes.service';
import { rangoDiaNegocio, hoyISO } from '@/lib/server/fechas';
import { siguienteNumeroSucursal } from '@/lib/server/ventas/numeracion';

interface Meta { ip?: string | null; userAgent?: string | null }

function sucursalDe(session: Session): number {
  if (session.sucursal_id == null) {
    throw new ValidationError('El usuario no tiene una sucursal asignada');
  }
  return session.sucursal_id;
}

/**
 * Pedidos del turno que NO dejaron rastro en el libro de caja: fiados (la plata
 * entra después, como cobro de deuda) y cortesías (no entra nunca).
 *
 * Se listan aparte porque igual consumen número de pedido del turno: sin ellos
 * el libro se ve saltado —"#7, #9"— y el cajero cree que se perdió una venta.
 */
async function pedidosSinCobroDelTurno(turnoId: number) {
  return prisma.transaccion.findMany({
    where: { turno_id: turnoId, movimientos: { none: {} } },
    orderBy: { created_at: 'desc' },
    select: {
      id: true, numero_turno: true, total: true, es_cortesia: true,
      cliente_nombre: true, created_at: true,
      cuenta_corriente: { select: { id: true } },
    },
  });
}

/** Cuántos pedidos lleva el turno, cobrados o no. Es "por cuál va la caja". */
function contarPedidosDelTurno(turnoId: number) {
  return prisma.transaccion.count({ where: { turno_id: turnoId } });
}

export async function getTurnoActivo(session: Session) {
  const sucursal_id = sucursalDe(session);
  const turno = await prisma.cajaTurno.findFirst({
    where: { sucursal_id, estado: 'ABIERTO' },
    include: {
      // La venta se guarda en el concepto con su id global ("Venta #2393"); el
      // número que el cajero canta es el del turno, y sale de acá.
      movimientos: {
        orderBy: { created_at: 'desc' },
        include: { transaccion: { select: { id: true, numero_turno: true } } },
      },
      sucursal: { select: { nombre: true } },
    },
  });
  if (!turno) return null;

  const [pedidos_sin_cobro, pedidos_count] = await Promise.all([
    pedidosSinCobroDelTurno(turno.id),
    contarPedidosDelTurno(turno.id),
  ]);
  return { ...turno, pedidos_sin_cobro, pedidos_count };
}

export async function abrirTurno(session: Session, dto: AperturaCajaInput, meta: Meta = {}) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const existente = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (existente) throw new ConflictError('Ya existe un turno abierto en esta sucursal');

    const turno = await tx.cajaTurno.create({
      data: {
        sucursal_id,
        cajero_id: session.id,
        apertura_efectivo: dto.apertura_efectivo,
        apertura_qr: dto.apertura_qr,
        observaciones: dto.observaciones ?? null,
      },
    });
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'APERTURA_CAJA',
      entidad: 'CajaTurno', entidadId: turno.id,
      detalle: `Apertura efectivo ${dto.apertura_efectivo}, QR ${dto.apertura_qr}`,
      ip: meta.ip, userAgent: meta.userAgent,
    }, tx);
    return turno;
  }, { maxWait: 10000, timeout: 20000 });
}

/**
 * Siguiente número de pedido del turno (#1..#n desde la apertura). El índice
 * único (turno_id, numero_turno) garantiza que no se repita ni con dos cajeros
 * vendiendo a la vez: ante colisión la transacción falla y se reintenta.
 */
async function siguienteNumeroTurno(tx: Prisma.TransactionClient, turnoId: number) {
  const max = await tx.transaccion.aggregate({
    _max: { numero_turno: true },
    where: { turno_id: turnoId },
  });
  return (max._max.numero_turno ?? 0) + 1;
}

async function getCuenta(tx: Prisma.TransactionClient, sucursal_id: number, tipo: TipoCuenta) {
  const cuenta = await tx.cuentaFinanciera.findUnique({
    where: { sucursal_id_tipo: { sucursal_id, tipo } },
  });
  if (!cuenta) throw new NotFoundError(`No existe la cuenta ${tipo} para la sucursal`);
  return cuenta;
}

export async function registrarMovimientoManual(
  session: Session,
  tipo: 'INGRESO_EXTRA' | 'GASTO_OPERATIVO',
  dto: MovimientoManualInput,
  meta: Meta = {},
) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const turno = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (!turno) throw new ConflictError('Abre caja antes de registrar movimientos');

    const cuenta = await getCuenta(tx, sucursal_id, dto.metodo_pago as TipoCuenta);
    const signed = tipo === 'GASTO_OPERATIVO' ? -Math.abs(dto.monto) : Math.abs(dto.monto);

    // El efectivo físico no puede quedar negativo: si falta plata para el gasto,
    // primero hay que registrar de dónde salió (Ingreso extra). Otras cuentas
    // (QR/banco/tarjeta) sí pueden ir en negativo por desfases de conciliación.
    if (
      tipo === 'GASTO_OPERATIVO' &&
      dto.metodo_pago === TipoCuenta.EFECTIVO &&
      cuenta.saldo.plus(signed).lessThan(0)
    ) {
      throw new ValidationError(
        `Saldo insuficiente en EFECTIVO (Bs ${cuenta.saldo.toFixed(2)}). ` +
          `Si recibiste dinero para este pago, regístralo primero como Ingreso extra.`,
      );
    }

    const mov = await tx.movimientoCaja.create({
      data: {
        sucursal_id,
        turno_id: turno.id,
        cuenta_id: cuenta.id,
        tipo: tipo as TipoMovimientoCaja,
        metodo_pago: dto.metodo_pago as TipoCuenta,
        monto: signed,
        concepto: dto.concepto,
        categoria: dto.categoria ?? null,
        creado_por_id: session.id,
      },
    });
    await tx.cuentaFinanciera.update({
      where: { id: cuenta.id },
      data: { saldo: { increment: signed } },
    });
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'MovimientoCaja', entidadId: mov.id,
      detalle: `${tipo}: ${dto.concepto}`, monto: signed,
      ip: meta.ip, userAgent: meta.userAgent,
    }, tx);
    return mov;
  }, { maxWait: 10000, timeout: 20000 });
}

export async function getMovimientos(session: Session) {
  const sucursal_id = sucursalDe(session);
  const turno = await prisma.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
  if (!turno) return { turno: null, movimientos: [] };
  const movimientos = await prisma.movimientoCaja.findMany({
    where: { turno_id: turno.id },
    orderBy: { created_at: 'desc' },
    include: {
      transaccion: {
        select: {
          // Para mostrar el número de pedido del turno junto al id global
          id: true, numero_turno: true,
          // Detalle que se despliega al abrir la fila.
          total: true, cliente_nombre: true, codigo_descuento: true,
          // El resto lo consume el recibo que se reimprime desde esta pantalla,
          // que solo se ofrece en los movimientos de tipo VENTA.
          numero_sucursal: true, turno_id: true, created_at: true,
          metodo_pago: true, payment_status: true, es_cortesia: true,
          cajero: { select: { nombre: true } },
          cuenta_corriente: { select: { monto: true, monto_pagado: true, vencimiento: true } },
          movimientos: { where: { tipo: 'VENTA' }, select: { metodo_pago: true, monto: true } },
          transaccionesDetalles_id: {
            select: {
              cantidad: true, precio_unitario: true, descuentoAplicado: true,
              producto: { select: { nombre: true } },
              combo: { select: { id: true, nombre: true } },
            },
          },
        },
      },
    },
  });

  const [pedidos_sin_cobro, pedidos_count] = await Promise.all([
    pedidosSinCobroDelTurno(turno.id),
    contarPedidosDelTurno(turno.id),
  ]);
  return { turno, movimientos, pedidos_sin_cobro, pedidos_count };
}

/**
 * Ventas de la caja: todas las del turno abierto, pagadas o no.
 *
 * Es distinto del libro de movimientos, que solo registra plata que entró o
 * salió: los fiados y las cortesías NO generan movimiento de caja, así que ahí
 * no aparecen nunca. Acá se ven todas, con su forma de cierre.
 *
 * Sin turno abierto (caja cerrada) cae al día de negocio en curso de la misma
 * sucursal, para poder revisar lo vendido después de cerrar.
 */
export async function getVentasDeCaja(session: Session, fechaISO?: string | null) {
  const sucursal_id = sucursalDe(session);
  const turno = await prisma.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });

  // Con fecha explícita manda la fecha; si no, el turno abierto; y si no hay
  // turno, el día de negocio de hoy en esa sucursal.
  const porFecha = fechaISO || !turno;
  const rango = porFecha ? rangoDiaNegocio(fechaISO) : null;

  const ventas = await prisma.transaccion.findMany({
    where: {
      sucursal_id,
      ...(rango ? { created_at: { gte: rango.desde, lte: rango.hasta } } : { turno_id: turno!.id }),
    },
    orderBy: { created_at: 'desc' },
    include: {
      transaccionesDetalles_id: {
        include: {
          producto: { select: { id: true, nombre: true } },
          combo: { select: { id: true, nombre: true } },
        },
      },
      cliente: { select: { id: true, nombre: true, telefono: true } },
      cajero: { select: { id: true, nombre: true } },
      // La deuda explica un fiado: cuánto queda y cuándo vence.
      cuenta_corriente: { select: { id: true, monto: true, monto_pagado: true, estado: true, vencimiento: true } },
      // Desglose del pago mixto para reimprimir el recibo: cuánto entró por
      // efectivo y cuánto por QR solo existe acá, la venta guarda "MIXTO" y
      // nada más. Se filtran los de VENTA porque un abono a deuda cobrado en
      // la misma operación también cuelga de esta transacción.
      movimientos: { where: { tipo: 'VENTA' }, select: { metodo_pago: true, monto: true } },
    },
  });

  return {
    turno,
    // Ámbito de lo que se está viendo, para que la pantalla pueda decirlo.
    ambito: porFecha ? 'DIA' : 'TURNO',
    fecha: rango ? hoyISO() : null,
    ventas: ventas.map(v => {
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
    }),
  };
}

export async function cerrarTurno(session: Session, dto: CierreCajaInput, meta: Meta = {}) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const turno = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (!turno) throw new ConflictError('No hay un turno abierto para cerrar');

    const sumBy = async (where: Prisma.MovimientoCajaWhereInput) => {
      const r = await tx.movimientoCaja.aggregate({ _sum: { monto: true }, where: { turno_id: turno.id, ...where } });
      return r._sum.monto ?? new Prisma.Decimal(0);
    };

    const netEfectivo = await sumBy({ metodo_pago: 'EFECTIVO' });
    const netQr = await sumBy({ metodo_pago: 'QR' });
    const ventasEfectivo = await sumBy({ metodo_pago: 'EFECTIVO', tipo: 'VENTA' });
    const ventasQr = await sumBy({ metodo_pago: 'QR', tipo: 'VENTA' });

    const esperadoEfectivo = new Prisma.Decimal(turno.apertura_efectivo).plus(netEfectivo);
    const esperadoQr = new Prisma.Decimal(turno.apertura_qr).plus(netQr);
    const realEfectivo = new Prisma.Decimal(dto.real_efectivo);
    const realQr = new Prisma.Decimal(dto.real_qr);
    // Si el esperado quedó negativo (se gastó más efectivo del que había en caja), el cajón
    // físico nunca puede bajar de 0, así que esa diferencia es deuda, no un falso sobrante.
    const difEfectivo = esperadoEfectivo.isNegative()
      ? esperadoEfectivo.plus(realEfectivo)
      : realEfectivo.minus(esperadoEfectivo);
    const difQr = esperadoQr.isNegative()
      ? esperadoQr.plus(realQr)
      : realQr.minus(esperadoQr);

    const actualizado = await tx.cajaTurno.update({
      where: { id: turno.id },
      data: {
        estado: 'CERRADO',
        fecha_cierre: new Date(),
        ventas_efectivo: ventasEfectivo,
        ventas_qr: ventasQr,
        esperado_efectivo: esperadoEfectivo,
        esperado_qr: esperadoQr,
        real_efectivo: realEfectivo,
        real_qr: realQr,
        diferencia_efectivo: difEfectivo,
        diferencia_qr: difQr,
        observaciones: dto.observaciones ?? turno.observaciones,
      },
    });
    const difTotal = difEfectivo.plus(difQr);
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CIERRE_CAJA',
      entidad: 'CajaTurno', entidadId: turno.id,
      detalle: `Cierre. Diferencia efectivo ${difEfectivo}, QR ${difQr}`,
      monto: Number(difTotal), ip: meta.ip, userAgent: meta.userAgent,
    }, tx);
    return actualizado;
  }, { maxWait: 10000, timeout: 20000 });
}

export async function getHistorial(session: Session) {
  const sucursal_id = sucursalDe(session);
  const turnos = await prisma.cajaTurno.findMany({
    where: { sucursal_id, cajero_id: session.id, estado: 'CERRADO' },
    orderBy: { fecha_apertura: 'desc' },
    take: 50,
    include: {
      sucursal: { select: { nombre: true } },
      cajero: { select: { nombre: true, apellido_paterno: true } },
      _count: { select: { ventas: true } },
    },
  });
  return turnos.map(t => ({ ...t, pedidos_count: t._count.ventas }));
}

export async function getTurnoDetalle(session: Session, turnoId: number) {
  const sucursal_id = sucursalDe(session);
  const turno = await prisma.cajaTurno.findFirst({
    where: { id: turnoId, sucursal_id, cajero_id: session.id },
    include: {
      sucursal: { select: { nombre: true } },
      cajero: { select: { nombre: true, apellido_paterno: true } },
    },
  });
  if (!turno) throw new NotFoundError('Turno no encontrado');

  const pedidos = await prisma.transaccion.findMany({
    where: { turno_id: turnoId },
    orderBy: { created_at: 'asc' },
    include: {
      transaccionesDetalles_id: {
        include: {
          producto: { select: { nombre: true } },
          // El combo se agrupa al reimprimir el recibo: el cliente compró una
          // sola cosa y así tiene que verla en el papel.
          combo: { select: { id: true, nombre: true } },
        },
      },
      cajero: { select: { nombre: true, apellido_paterno: true } },
      cuenta_corriente: { select: { id: true, estado: true, monto: true, monto_pagado: true, vencimiento: true } },
      // Desglose del pago mixto, que la venta no guarda: solo para el recibo.
      movimientos: { where: { tipo: 'VENTA' }, select: { metodo_pago: true, monto: true } },
    },
  });

  return { turno, pedidos };
}

/**
 * Aplica un abono FIFO (deuda más antigua primero) a los fiados abiertos de un
 * cliente: actualiza cuentas por cobrar, genera un MovimientoCaja "Cobro fiado"
 * por cada (deuda, método) tocado, deja cada pago en el ledger
 * (CuentaCorrientePago) y suma el ingreso a la cuenta financiera del método.
 * Acepta varios métodos en un mismo cobro (pago mixto) y, opcionalmente,
 * limitarse a deudas concretas (`cuenta_ids`) para pagar solo ciertas cosas.
 */
async function aplicarAbonoDeudaFifo(tx: Prisma.TransactionClient, args: {
  sucursal_id: number;
  turno_id: number;
  cliente_id: number;
  pagos: { metodo_pago: TipoCuenta; monto: number }[];
  cuenta_ids?: number[];
  creado_por_id: number;
  venta_id?: number;
}) {
  const deudas = await tx.cuentaCorriente.findMany({
    where: {
      tipo: 'POR_COBRAR', cliente_id: args.cliente_id, estado: { not: 'PAGADA' },
      ...(args.cuenta_ids?.length ? { id: { in: args.cuenta_ids } } : {}),
    },
    orderBy: { created_at: 'asc' },
  });
  if (args.cuenta_ids?.length && deudas.length !== new Set(args.cuenta_ids).size) {
    throw new ValidationError('Alguna deuda seleccionada no existe, no es de este cliente o ya está pagada');
  }
  const montoAbono = Number(args.pagos.reduce((s, p) => s + p.monto, 0).toFixed(2));
  if (montoAbono <= 0) throw new ValidationError('El monto a cobrar debe ser mayor a 0');
  const saldoTotal = Number(deudas.reduce((s, d) => s + Number(d.monto) - Number(d.monto_pagado), 0).toFixed(2));
  if (saldoTotal <= 0) throw new ValidationError('El cliente no tiene deudas pendientes');
  if (montoAbono > saldoTotal) {
    throw new ValidationError(`El abono (Bs ${montoAbono.toFixed(2)}) supera la deuda seleccionada (Bs ${saldoTotal.toFixed(2)})`);
  }

  // Las cuentas financieras de los métodos cobrados, en una sola consulta.
  const metodos = [...new Set(args.pagos.map(p => p.metodo_pago))];
  const cuentasFin = await tx.cuentaFinanciera.findMany({
    where: { sucursal_id: args.sucursal_id, tipo: { in: metodos } },
  });
  const cuentaDe = new Map(cuentasFin.map(c => [c.tipo, c]));
  for (const metodo of metodos) {
    if (!cuentaDe.has(metodo)) throw new NotFoundError(`No existe la cuenta ${metodo} para la sucursal`);
  }

  // El reparto FIFO se resuelve entero en memoria y recién después se escribe.
  // Con una escritura por deuda, saldar una cuenta de 70 fiados eran ~280 idas
  // y vueltas a la BD (~0,43 s por deuda medidos en producción): la transacción
  // se pasaba de sus 20 s y se caía. Agrupadas, el costo deja de depender de
  // cuántas deudas tenga el cliente.
  const saldos = new Map(deudas.map(d => [d.id, Number((Number(d.monto) - Number(d.monto_pagado)).toFixed(2))]));
  const pagadoAcum = new Map(deudas.map(d => [d.id, Number(d.monto_pagado.toFixed(2))]));
  const aplicaciones: {
    deuda: (typeof deudas)[number];
    metodo_pago: TipoCuenta;
    cuenta_fin_id: number;
    aplicar: number;
  }[] = [];
  const estadoFinal = new Map<number, { monto_pagado: number; estado: 'PAGADA' | 'PARCIAL' }>();
  const ventasSaldadas = new Set<number>();

  for (const pago of args.pagos) {
    const cuentaFin = cuentaDe.get(pago.metodo_pago)!;
    let restante = pago.monto;
    for (const deuda of deudas) {
      if (restante <= 0) break;
      const saldo = saldos.get(deuda.id)!;
      if (saldo <= 0) continue;
      const aplicar = Math.min(saldo, restante);
      const nuevoPagado = Number((pagadoAcum.get(deuda.id)! + aplicar).toFixed(2));
      const quedaPagada = nuevoPagado >= Number(deuda.monto.toFixed(2));
      aplicaciones.push({ deuda, metodo_pago: pago.metodo_pago, cuenta_fin_id: cuentaFin.id, aplicar });
      estadoFinal.set(deuda.id, { monto_pagado: nuevoPagado, estado: quedaPagada ? 'PAGADA' : 'PARCIAL' });
      // Deuda saldada: la venta fiada que la originó deja de estar "pago pendiente"
      if (quedaPagada && deuda.transaccion_id != null) ventasSaldadas.add(deuda.transaccion_id);
      saldos.set(deuda.id, Number((saldo - aplicar).toFixed(2)));
      pagadoAcum.set(deuda.id, nuevoPagado);
      restante = Number((restante - aplicar).toFixed(2));
    }
  }

  if (aplicaciones.length > 0) {
    const movimientos = await tx.movimientoCaja.createManyAndReturn({
      data: aplicaciones.map(a => ({
        sucursal_id: args.sucursal_id, turno_id: args.turno_id, cuenta_id: a.cuenta_fin_id, tipo: 'INGRESO_EXTRA' as const,
        metodo_pago: a.metodo_pago, monto: a.aplicar,
        concepto: `Cobro fiado — ${a.deuda.contraparte}: ${a.deuda.concepto}${args.venta_id ? ` (junto a venta #${args.venta_id})` : ''}`,
        categoria: 'Cobro fiado',
        transaccion_id: a.deuda.transaccion_id, creado_por_id: args.creado_por_id,
      })),
      select: { id: true },
    });
    // Un INSERT toma los ids de la secuencia en el orden de las filas enviadas,
    // así que ordenarlos reconstruye ese orden sin depender de cómo los devuelva
    // el driver, y cada pago del ledger queda atado a su propio movimiento.
    const movIds = movimientos.map(m => m.id).sort((a, b) => a - b);
    // Ledger: cada aplicación queda como pago individual de esa deuda
    await tx.cuentaCorrientePago.createMany({
      data: aplicaciones.map((a, i) => ({
        cuenta_id: a.deuda.id, monto: a.aplicar, metodo_pago: a.metodo_pago,
        movimiento_caja_id: movIds[i], creado_por_id: args.creado_por_id,
      })),
    });

    // Un solo UPDATE para todos los saldos. `update_at` va explícito porque
    // @updatedAt lo resuelve Prisma, y este UPDATE no pasa por Prisma.
    const filas = [...estadoFinal.entries()].map(([id, e]) =>
      Prisma.sql`(${id}::int, ${e.monto_pagado}::numeric, ${e.estado}::"EstadoCuenta")`);
    await tx.$executeRaw`
      UPDATE "CuentaCorriente" AS cc
      SET monto_pagado = v.monto_pagado, estado = v.estado, update_at = NOW()
      FROM (VALUES ${Prisma.join(filas)}) AS v(id, monto_pagado, estado)
      WHERE cc.id = v.id`;

    if (ventasSaldadas.size > 0) {
      await tx.transaccion.updateMany({
        where: { id: { in: [...ventasSaldadas] } },
        data: { payment_status: 'PAGADO' },
      });
    }
  }

  for (const pago of args.pagos) {
    await tx.cuentaFinanciera.update({
      where: { id: cuentaDe.get(pago.metodo_pago)!.id },
      data: { saldo: { increment: pago.monto } },
    });
  }
  return { saldo_anterior: saldoTotal, saldo_restante: Number((saldoTotal - montoAbono).toFixed(2)) };
}

/**
 * Cobro de deuda SIN compra (el cliente viene solo a pagar): mismo FIFO y los
 * mismos movimientos de caja que el abono junto a una venta, con auditoría.
 * Soporta pago mixto (varios métodos) y cobrar solo deudas concretas
 * (`cuenta_ids`); lo no seleccionado queda como deuda pendiente.
 */
export async function abonarDeudaClienteCaja(
  session: Session,
  clienteId: number,
  dto: { pagos: PagoDeudaItem[]; cuenta_ids?: number[] },
  meta: Meta = {},
) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const turno = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (!turno) throw new ConflictError('Abre caja antes de cobrar una deuda');

    const cliente = await tx.cliente.findFirst({
      where: { id: clienteId, es_anonimo: false },
      select: { id: true, nombre: true },
    });
    if (!cliente) throw new NotFoundError('Cliente no encontrado');

    const resultado = await aplicarAbonoDeudaFifo(tx, {
      sucursal_id, turno_id: turno.id, cliente_id: clienteId,
      pagos: dto.pagos.map(p => ({ metodo_pago: p.metodo_pago as TipoCuenta, monto: p.monto })),
      cuenta_ids: dto.cuenta_ids,
      creado_por_id: session.id,
    });

    const abonado = Number(dto.pagos.reduce((s, p) => s + p.monto, 0).toFixed(2));
    const desglose = dto.pagos.map(p => `${p.metodo_pago} Bs ${p.monto.toFixed(2)}`).join(' + ');
    const alcance = dto.cuenta_ids?.length ? ` sobre ${dto.cuenta_ids.length} deuda(s) seleccionada(s)` : '';
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'CuentaCorriente', entidadId: clienteId,
      detalle: `Cobro de deuda: Bs ${abonado.toFixed(2)} (${desglose})${alcance} — cliente "${cliente.nombre}" (#${clienteId}). Saldo restante: Bs ${resultado.saldo_restante.toFixed(2)}`,
      monto: abonado, ip: meta.ip, userAgent: meta.userAgent,
    }, tx);

    return { cliente_id: clienteId, abonado, ...resultado };
  }, { maxWait: 10000, timeout: 20000 });
}

export async function registrarVentaFisica(session: Session, dto: VentaFisicaInput, meta: Meta = {}) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const turno = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (!turno) throw new ConflictError('Abre caja antes de registrar una venta');

    // Cargar productos y validar
    const ids = dto.items.map(i => i.producto_id);
    const productos = await tx.producto.findMany({ where: { id: { in: ids } } });
    if (productos.length !== ids.length) throw new NotFoundError('Algún producto no existe');

    // Precios de ESTA sucursal: el mismo plato puede costar distinto en cada local.
    const habilitaciones = await tx.productoSucursal.findMany({
      where: { producto_id: { in: ids }, sucursal_id },
    });
    const precioDeSucursal = new Map(habilitaciones.map(h => [h.producto_id, h]));

    // Calcular total EN EL SERVIDOR
    let total = new Prisma.Decimal(0);
    const detalles: { producto_id: number; precio_unitario: number; cantidad: number; combo_id?: number }[] =
      dto.items.map(item => {
        const p = productos.find(x => x.id === item.producto_id)!;
        if (p.disponible === false) throw new ValidationError(`Producto no disponible: ${p.nombre}`);
        const enSucursal = precioDeSucursal.get(p.id);
        if (!enSucursal || !enSucursal.disponible) {
          throw new ValidationError(`Producto no disponible en esta sucursal: ${p.nombre}`);
        }
        const precio = new Prisma.Decimal(enSucursal.precio);
        total = total.plus(precio.times(item.cantidad));
        return { producto_id: p.id, precio_unitario: Number(precio), cantidad: item.cantidad };
      });

    // Combos: el servidor los valoriza y los descompone en una línea por
    // producto. Se revalida la ventana horaria acá aunque el POS ya haya
    // filtrado: un combo de 7:00 a 12:00 no se cobra 12:05 porque la pantalla
    // quedó abierta.
    for (const pedido of dto.combos) {
      const { combo, lineas } = await lineasDeCombo(pedido.combo_id, pedido.cantidad, sucursal_id, new Date(), tx);
      for (const linea of lineas) {
        total = total.plus(new Prisma.Decimal(linea.precio_unitario).times(linea.cantidad));
        detalles.push(linea);
      }
      if (lineas.length === 0) throw new ValidationError(`El combo "${combo.nombre}" no tiene productos`);
    }

    if (total.lte(0)) throw new ValidationError('El total debe ser mayor a 0');

    // Un fiado no puede ser cortesía ni anónimo: la deuda debe quedar a nombre
    // de un cliente registrado para poder cobrársela después.
    if (dto.es_fiado && dto.es_cortesia) {
      throw new ValidationError('Un fiado no puede ser cortesía');
    }

    // Resolver el cliente: registrado (base única) o anónimo centinela
    const tieneDatos = Boolean(dto.cliente_nombre?.trim() || dto.cliente_telefono?.trim() || dto.cliente_email?.trim() || dto.cliente_nit?.trim());
    let clienteId: number | null;
    let esAnonimo = false;
    if (dto.cliente_id) {
      const existe = await tx.cliente.findFirst({ where: { id: dto.cliente_id, es_anonimo: false }, select: { id: true } });
      if (!existe) throw new NotFoundError('Cliente no encontrado');
      clienteId = existe.id;
    } else if (dto.cliente_anonimo || !tieneDatos) {
      clienteId = await getClienteAnonimo(tx);
      esAnonimo = true;
    } else {
      clienteId = await resolverCliente({
        nombre: dto.cliente_nombre,
        telefono: dto.cliente_telefono,
        email: dto.cliente_email,
        nit: dto.cliente_nit,
      }, tx);
    }

    if (dto.es_fiado && !clienteId) {
      throw new ValidationError('El fiado requiere un cliente registrado');
    }

    const abono = dto.abono_deuda ?? 0;
    if (abono > 0 && (!clienteId || esAnonimo)) {
      throw new ValidationError('El abono a deuda requiere un cliente registrado');
    }

    // Descuento por privilegio elegido por el cajero para ESTA venta (uno solo).
    // Impacta el total cobrado, por lo que también reduce el monto del fiado.
    let codigoDescuento: string | null = null;
    if (dto.privilegio_id) {
      if (!clienteId || esAnonimo) {
        throw new ValidationError('El privilegio requiere un cliente registrado');
      }
      // El privilegio tiene que valer en ESTE local: `sucursal_id` nulo es del
      // negocio (vale en todos), con valor solo descuenta en el suyo. Sin este
      // filtro, un "Staff Fitbull" descontaría también comprando en Sur.
      const privilegio = await tx.privilegio.findFirst({
        where: {
          id: dto.privilegio_id,
          activo: true,
          OR: [{ sucursal_id: null }, { sucursal_id }],
        },
      });
      if (!privilegio) {
        throw new ValidationError('El privilegio no existe, no está activo o no aplica en esta sucursal');
      }
      const pct = Number(privilegio.porcentaje);
      if (pct > 0) {
        total = total.times(100 - pct).dividedBy(100);
        total = new Prisma.Decimal(total.toFixed(2));
        codigoDescuento = `Privilegio: ${privilegio.nombre} (-${pct}%)`;
      }
    }

    // Pago mixto: solo venta pagada normal, y el desglose debe cuadrar
    // exactamente con el total calculado por el servidor (descuento incluido).
    if (dto.metodo_pago === 'MIXTO') {
      if (dto.es_fiado || dto.es_cortesia) {
        throw new ValidationError('El pago mixto no aplica a fiados ni cortesías');
      }
      const suma = new Prisma.Decimal(dto.pago_mixto!.efectivo).plus(dto.pago_mixto!.qr);
      if (!suma.equals(total)) {
        throw new ValidationError(
          `El desglose del pago mixto (Bs ${suma.toFixed(2)}) no coincide con el total a cobrar (Bs ${total.toFixed(2)})`
        );
      }
    }

    // Fiado: producto entregado pero pago pendiente (queda como deuda por cobrar).
    const nombreCliente = dto.cliente_nombre?.trim() || 'Cliente mostrador';
    const venta = await tx.transaccion.create({
      data: {
        // WEB cuando el pedido llegó por WhatsApp desde la carta: es la única
        // forma de medir cuánto se pide por la web, porque la web ya no registra
        // pedidos. SALON es la venta de mostrador.
        canal: dto.es_pedido_web ? 'WEB' : 'SALON',
        tipo_entrega: dto.tipo_entrega ?? null,
        // `costo_envio` queda en 0: el envío no pasa por la venta. Es plata del
        // repartidor y entra como Ingreso extra del turno cuando rinde cuentas.
        metodo_pago: dto.metodo_pago as TipoCuenta,
        es_cortesia: dto.es_cortesia,
        total: Number(total),
        codigo_descuento: codigoDescuento,
        estado: dto.es_fiado ? 'ENTREGADO' : 'PAGADO',
        payment_status: dto.es_fiado ? 'PENDIENTE' : 'PAGADO',
        turno_id: turno.id,
        // La venta de salón pertenece a la sucursal del turno abierto.
        sucursal_id: turno.sucursal_id,
        numero_turno: await siguienteNumeroTurno(tx, turno.id),
        // El correlativo del local: es el que se le canta al cliente.
        numero_sucursal: await siguienteNumeroSucursal(tx, turno.sucursal_id),
        cajero_id: session.id,
        cliente_id: clienteId,
        cliente_nombre: nombreCliente,
        cliente_telefono: dto.cliente_telefono?.trim() || null,
        cliente_email: dto.cliente_email?.trim() || null,
        cliente_nit: dto.cliente_nit?.trim() || null,
        transaccionesDetalles_id: { create: detalles },
      },
    });

    // Descontar stock automáticamente vía recetas (FASE 5B)
    await descontarStockPorTransaccion(tx, venta.id);

    if (dto.es_fiado) {
      // No entra dinero a caja: se registra como cuenta por cobrar (deuda).
      await tx.cuentaCorriente.create({
        data: {
          tipo: 'POR_COBRAR',
          contraparte: nombreCliente,
          concepto: `Fiado venta #${venta.id}`,
          monto: Number(total),
          vencimiento: dto.fiado_vencimiento ?? null,
          creado_por_id: session.id,
          transaccion_id: venta.id,
          cliente_id: clienteId,
        },
      });
    } else if (!dto.es_cortesia) {
      // Venta pagada normal: impacta caja. El pago mixto genera un movimiento
      // por cada método; el desglose contable real vive en MovimientoCaja.
      const partes: { metodo: TipoCuenta; monto: number }[] = dto.metodo_pago === 'MIXTO'
        ? [
            { metodo: 'EFECTIVO', monto: dto.pago_mixto!.efectivo },
            { metodo: 'QR', monto: dto.pago_mixto!.qr },
          ]
        : [{ metodo: dto.metodo_pago as TipoCuenta, monto: Number(total) }];

      for (const parte of partes) {
        const cuenta = await getCuenta(tx, sucursal_id, parte.metodo);
        await tx.movimientoCaja.create({
          data: {
            sucursal_id: turno.sucursal_id, turno_id: turno.id, cuenta_id: cuenta.id, tipo: 'VENTA',
            metodo_pago: parte.metodo, monto: parte.monto,
            concepto: partes.length > 1 ? `Venta #${venta.id} (mixto, ${parte.metodo.toLowerCase()})` : `Venta #${venta.id}`,
            transaccion_id: venta.id, creado_por_id: session.id,
          },
        });
        await tx.cuentaFinanciera.update({ where: { id: cuenta.id }, data: { saldo: { increment: parte.monto } } });
        const campo = parte.metodo === 'EFECTIVO' ? 'ventas_efectivo' : 'ventas_qr';
        await tx.cajaTurno.update({ where: { id: turno.id }, data: { [campo]: { increment: parte.monto } } });
      }
    }

    // Abono a deuda cobrado junto con la venta: FIFO sobre las deudas del cliente.
    if (abono > 0) {
      await aplicarAbonoDeudaFifo(tx, {
        sucursal_id, turno_id: turno.id, cliente_id: clienteId!,
        pagos: [{ metodo_pago: dto.metodo_pago as TipoCuenta, monto: abono }],
        creado_por_id: session.id, venta_id: venta.id,
      });
    }

    const marca = dto.es_fiado ? ' (fiado)' : dto.es_cortesia ? ' (cortesía)' : '';
    const marcaAbono = abono > 0 ? ` + abono deuda Bs ${abono.toFixed(2)}` : '';
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'Transaccion', entidadId: venta.id,
      detalle: `Venta física #${venta.id}${marca}${marcaAbono}`,
      monto: Number(total) + abono, ip: meta.ip, userAgent: meta.userAgent,
    }, tx);

    // El POS imprime el recibo con lo que devuelve esta llamada, así que la
    // venta vuelve con sus líneas, su cajero y sus movimientos: el ticket tiene
    // que salir con los precios y el desglose que calculó el servidor, no con
    // los del carrito del navegador.
    const impresa = await tx.transaccion.findUniqueOrThrow({
      where: { id: venta.id },
      include: {
        cajero: { select: { nombre: true } },
        cuenta_corriente: { select: { monto: true, monto_pagado: true, vencimiento: true } },
        movimientos: { where: { tipo: 'VENTA' }, select: { metodo_pago: true, monto: true } },
        transaccionesDetalles_id: {
          select: {
            cantidad: true, precio_unitario: true, descuentoAplicado: true,
            producto: { select: { nombre: true } },
            combo: { select: { id: true, nombre: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    return { ...impresa, abono_deuda: abono > 0 ? abono : undefined };
  }, { maxWait: 10000, timeout: 20000 });
}

/** Deudas por cobrar pendientes (fiados) — visible para el cajero. */
export async function listarDeudoresCaja() {
  const rows = await prisma.cuentaCorriente.findMany({
    where: { tipo: 'POR_COBRAR', estado: { not: 'PAGADA' } },
    include: {
      cliente: { select: { id: true, nombre: true, telefono: true } },
      transaccion: {
        select: {
          id: true,
          created_at: true,
          transaccionesDetalles_id: { select: { cantidad: true, precio_unitario: true, producto: { select: { nombre: true } } } },
        },
      },
      pagos: {
        orderBy: { created_at: 'asc' },
        select: {
          id: true, monto: true, metodo_pago: true, created_at: true,
          creado_por: { select: { nombre: true, apellido_paterno: true } },
        },
      },
    },
    orderBy: [{ vencimiento: 'asc' }, { created_at: 'desc' }],
  });
  const ahora = new Date();
  const items = rows.map(r => {
    const monto = Number(r.monto.toFixed(2));
    const pagado = Number(r.monto_pagado.toFixed(2));
    return {
      id: r.id,
      contraparte: r.contraparte,
      concepto: r.concepto,
      cliente: r.cliente,
      monto,
      monto_pagado: pagado,
      saldo: Number((monto - pagado).toFixed(2)),
      estado: r.estado,
      descuento: Number(r.descuento.toFixed(2)),
      motivo_descuento: r.motivo_descuento,
      fecha_fiado: r.created_at,
      vencimiento: r.vencimiento,
      vencido: r.vencimiento != null && r.vencimiento < ahora,
      // De qué venta nació la deuda (null si el fiado se creó a mano desde admin)
      origen: r.transaccion
        ? {
            venta_id: r.transaccion.id,
            fecha: r.transaccion.created_at,
            items: r.transaccion.transaccionesDetalles_id.map(d => ({
              nombre: d.producto?.nombre ?? 'Producto',
              cantidad: d.cantidad,
              precio_unitario: Number(d.precio_unitario.toFixed(2)),
              subtotal: Number((Number(d.precio_unitario) * d.cantidad).toFixed(2)),
            })),
          }
        : null,
      // Historial de pagos ya realizados sobre esta deuda
      pagos: r.pagos.map(p => ({
        id: p.id,
        monto: Number(p.monto.toFixed(2)),
        metodo_pago: p.metodo_pago,
        fecha: p.created_at,
        cobrado_por: `${p.creado_por.nombre} ${p.creado_por.apellido_paterno}`.trim(),
      })),
    };
  });
  return {
    items,
    resumen: {
      total_saldo: Number(items.reduce((s, i) => s + i.saldo, 0).toFixed(2)),
      cuentas: items.length,
      vencidas: items.filter(i => i.vencido).length,
    },
  };
}

export type PagoDeudaItem = { metodo_pago: 'EFECTIVO' | 'QR' | 'TARJETA'; monto: number };

/**
 * Cobro de una deuda (fiado) desde caja: registra el pago sobre la cuenta por
 * cobrar y, como sí entra dinero real, lo asienta como ingreso en el turno abierto
 * para que impacte el cuadre. Acepta varios métodos en un mismo cobro (pago
 * mixto): cada parte genera su propio movimiento de caja y su fila en el
 * historial de pagos (CuentaCorrientePago).
 */
export async function cobrarDeudaCaja(
  session: Session,
  cuentaId: number,
  dto: { pagos: PagoDeudaItem[] },
  meta: Meta = {},
) {
  const sucursal_id = sucursalDe(session);
  return prisma.$transaction(async (tx) => {
    const turno = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
    if (!turno) throw new ConflictError('Abre caja antes de cobrar una deuda');

    const cuenta = await tx.cuentaCorriente.findUnique({ where: { id: cuentaId } });
    if (!cuenta || cuenta.tipo !== 'POR_COBRAR') throw new NotFoundError('Deuda no encontrada');

    const montoCobro = Number(dto.pagos.reduce((s, p) => s + p.monto, 0).toFixed(2));
    if (montoCobro <= 0) throw new ValidationError('El monto a cobrar debe ser mayor a 0');

    const montoTotal = Number(cuenta.monto.toFixed(2));
    const pagadoActual = Number(cuenta.monto_pagado.toFixed(2));
    const nuevoPagado = Number((pagadoActual + montoCobro).toFixed(2));
    if (nuevoPagado > montoTotal) {
      throw new ValidationError(`El pago (${nuevoPagado}) supera el saldo pendiente`);
    }
    const estado = nuevoPagado >= montoTotal ? 'PAGADA' : 'PARCIAL';

    const cuentaActualizada = await tx.cuentaCorriente.update({
      where: { id: cuentaId },
      data: { monto_pagado: nuevoPagado, estado },
    });

    // Deuda saldada: la venta fiada que la originó deja de estar "pago pendiente"
    if (estado === 'PAGADA' && cuenta.transaccion_id != null) {
      await tx.transaccion.update({ where: { id: cuenta.transaccion_id }, data: { payment_status: 'PAGADO' } });
    }

    // Entra dinero real → un ingreso al turno por cada método (impacta cuadre)
    for (const pago of dto.pagos) {
      const cuentaFin = await getCuenta(tx, sucursal_id, pago.metodo_pago as TipoCuenta);
      const mov = await tx.movimientoCaja.create({
        data: {
          sucursal_id: turno.sucursal_id, turno_id: turno.id, cuenta_id: cuentaFin.id, tipo: 'INGRESO_EXTRA',
          metodo_pago: pago.metodo_pago as TipoCuenta, monto: pago.monto,
          concepto: `Cobro fiado — ${cuenta.contraparte}: ${cuenta.concepto}`, categoria: 'Cobro fiado',
          transaccion_id: cuenta.transaccion_id, creado_por_id: session.id,
        },
      });
      await tx.cuentaFinanciera.update({ where: { id: cuentaFin.id }, data: { saldo: { increment: pago.monto } } });
      await tx.cuentaCorrientePago.create({
        data: {
          cuenta_id: cuentaId, monto: pago.monto, metodo_pago: pago.metodo_pago as TipoCuenta,
          movimiento_caja_id: mov.id, creado_por_id: session.id,
        },
      });
    }

    const desglose = dto.pagos.map(p => `${p.metodo_pago} Bs ${p.monto.toFixed(2)}`).join(' + ');
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'CuentaCorriente', entidadId: cuentaId,
      detalle: `Cobro fiado ${cuenta.contraparte}: Bs ${montoCobro.toFixed(2)} (${desglose}) — ${estado}`,
      monto: montoCobro, ip: meta.ip, userAgent: meta.userAgent,
    }, tx);

    return { id: cuentaActualizada.id, estado, monto_pagado: nuevoPagado, saldo: Number((montoTotal - nuevoPagado).toFixed(2)) };
  }, { maxWait: 10000, timeout: 20000 });
}

/**
 * Privilegio posterior sobre una deuda (fiado): para cuando al vender se olvidó
 * aplicarlo. El servidor calcula el descuento con el % del privilegio (mismo
 * cálculo que en venta), reduce el monto total de la deuda — no registra pago
 * ni toca la caja — y deja registrado qué privilegio se aplicó. Si el nuevo
 * total queda igual a lo ya cobrado, la deuda se salda.
 */
export async function aplicarDescuentoDeuda(
  session: Session,
  cuentaId: number,
  dto: { privilegio_id: number },
  meta: Meta = {},
) {
  return prisma.$transaction(async (tx) => {
    const cuenta = await tx.cuentaCorriente.findUnique({ where: { id: cuentaId } });
    if (!cuenta || cuenta.tipo !== 'POR_COBRAR') throw new NotFoundError('Deuda no encontrada');
    if (cuenta.estado === 'PAGADA') throw new ConflictError('La deuda ya está pagada; no admite descuento');
    if (cuenta.cliente_id == null) {
      throw new ValidationError('El privilegio requiere un cliente registrado');
    }
    // Igual que en venta: un solo privilegio por deuda
    if (Number(cuenta.descuento) > 0) {
      throw new ConflictError('La deuda ya tiene un privilegio aplicado');
    }

    // Mismo criterio que en la venta: el privilegio debe valer en el local donde
    // se está aplicando el descuento.
    const privilegio = await tx.privilegio.findFirst({
      where: {
        id: dto.privilegio_id,
        activo: true,
        OR: [{ sucursal_id: null }, { sucursal_id: sucursalDe(session) }],
      },
    });
    if (!privilegio) {
      throw new ValidationError('El privilegio no existe, no está activo o no aplica en esta sucursal');
    }
    const pct = Number(privilegio.porcentaje);
    if (pct <= 0) throw new ValidationError('El privilegio no genera descuento');

    const montoActual = Number(cuenta.monto.toFixed(2));
    const pagado = Number(cuenta.monto_pagado.toFixed(2));
    // Mismo cálculo que en venta: el % se aplica sobre el total de la deuda
    const descuento = Number((montoActual * pct / 100).toFixed(2));
    const nuevoMonto = Number((montoActual - descuento).toFixed(2));
    if (nuevoMonto < pagado) {
      throw new ValidationError(
        `El descuento deja el total (Bs ${nuevoMonto.toFixed(2)}) por debajo de lo ya cobrado (Bs ${pagado.toFixed(2)})`,
      );
    }

    const estado = nuevoMonto <= pagado ? 'PAGADA' : pagado > 0 ? 'PARCIAL' : 'PENDIENTE';
    const motivo = `Privilegio: ${privilegio.nombre} (-${pct}%)`;
    const actualizada = await tx.cuentaCorriente.update({
      where: { id: cuentaId },
      data: {
        monto: nuevoMonto,
        descuento,
        motivo_descuento: motivo,
        estado,
      },
    });

    // Si el descuento salda la deuda, la venta fiada deja de estar "pago pendiente"
    if (estado === 'PAGADA' && cuenta.transaccion_id != null) {
      await tx.transaccion.update({ where: { id: cuenta.transaccion_id }, data: { payment_status: 'PAGADO' } });
    }

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'CuentaCorriente', entidadId: cuentaId,
      detalle: `Privilegio sobre fiado ${cuenta.contraparte}: ${privilegio.nombre} (-${pct}%) = Bs ${descuento.toFixed(2)} (total Bs ${montoActual.toFixed(2)} → Bs ${nuevoMonto.toFixed(2)})`,
      monto: descuento, ip: meta.ip, userAgent: meta.userAgent,
    }, tx);

    return {
      id: actualizada.id,
      estado,
      monto: nuevoMonto,
      monto_pagado: pagado,
      descuento: Number(actualizada.descuento.toFixed(2)),
      saldo: Number((nuevoMonto - pagado).toFixed(2)),
    };
  });
}
