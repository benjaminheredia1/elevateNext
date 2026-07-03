import prisma from '@/lib/prisma';
import { Prisma, TipoMovimientoCaja, TipoCuenta, EstadoTransaccion, EstadoPago } from '@prisma/client';
import type { Session } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/server/errors';
import type { AperturaCajaInput, MovimientoManualInput, CierreCajaInput, VentaFisicaInput } from '@/lib/server/dto/caja.dto';
import { descontarStockPorTransaccion } from '@/lib/server/inventario/descuento-stock.service';
import { resolverCliente, getClienteAnonimo } from '@/lib/server/clientes/clientes.service';

interface Meta { ip?: string | null; userAgent?: string | null }

function sucursalDe(session: Session): number {
  if (session.sucursal_id == null) {
    throw new ValidationError('El usuario no tiene una sucursal asignada');
  }
  return session.sucursal_id;
}

export async function getTurnoActivo(session: Session) {
  const sucursal_id = sucursalDe(session);
  return prisma.cajaTurno.findFirst({
    where: { sucursal_id, estado: 'ABIERTO' },
    include: {
      movimientos: { orderBy: { created_at: 'desc' } },
      sucursal: { select: { nombre: true } },
    },
  });
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
  });
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

    const mov = await tx.movimientoCaja.create({
      data: {
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
  });
}

export async function getMovimientos(session: Session) {
  const sucursal_id = sucursalDe(session);
  const turno = await prisma.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
  if (!turno) return { turno: null, movimientos: [] };
  const movimientos = await prisma.movimientoCaja.findMany({
    where: { turno_id: turno.id },
    orderBy: { created_at: 'desc' },
  });
  return { turno, movimientos };
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
  });
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
      transaccionesDetalles_id: { include: { producto: { select: { nombre: true } } } },
      cajero: { select: { nombre: true, apellido_paterno: true } },
    },
  });

  return { turno, pedidos };
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

    // Calcular total EN EL SERVIDOR
    let total = new Prisma.Decimal(0);
    const detalles = dto.items.map(item => {
      const p = productos.find(x => x.id === item.producto_id)!;
      if (p.disponible === false) throw new ValidationError(`Producto no disponible: ${p.nombre}`);
      const precio = new Prisma.Decimal(p.precio);
      total = total.plus(precio.times(item.cantidad));
      return { producto_id: p.id, precio_unitario: Number(precio), cantidad: item.cantidad };
    });
    if (total.lte(0)) throw new ValidationError('El total debe ser mayor a 0');

    // Resolver el cliente: registrado (base única) o anónimo centinela
    const tieneDatos = Boolean(dto.cliente_nombre?.trim() || dto.cliente_telefono?.trim() || dto.cliente_email?.trim() || dto.cliente_nit?.trim());
    let clienteId: number | null;
    if (dto.cliente_anonimo || !tieneDatos) {
      clienteId = await getClienteAnonimo(tx);
    } else {
      clienteId = await resolverCliente({
        nombre: dto.cliente_nombre,
        telefono: dto.cliente_telefono,
        email: dto.cliente_email,
        nit: dto.cliente_nit,
      }, tx);
    }

    // Crear la transacción (venta presencial pagada)
    const venta = await tx.transaccion.create({
      data: {
        canal: 'SALON',
        metodo_pago: dto.metodo_pago as TipoCuenta,
        es_cortesia: dto.es_cortesia,
        total: Number(total),
        estado: 'PAGADO',
        payment_status: 'PAGADO',
        turno_id: turno.id,
        cajero_id: session.id,
        cliente_id: clienteId,
        cliente_nombre: dto.cliente_nombre?.trim() || 'Cliente mostrador',
        cliente_telefono: dto.cliente_telefono?.trim() || null,
        cliente_email: dto.cliente_email?.trim() || null,
        cliente_nit: dto.cliente_nit?.trim() || null,
        transaccionesDetalles_id: { create: detalles },
      },
    });

    // Descontar stock automáticamente vía recetas (FASE 5B)
    await descontarStockPorTransaccion(tx, venta.id);

    // Si NO es cortesía: impacta caja
    if (!dto.es_cortesia) {
      const cuenta = await getCuenta(tx, sucursal_id, dto.metodo_pago as TipoCuenta);
      await tx.movimientoCaja.create({
        data: {
          turno_id: turno.id, cuenta_id: cuenta.id, tipo: 'VENTA',
          metodo_pago: dto.metodo_pago as TipoCuenta, monto: Number(total),
          concepto: `Venta #${venta.id}`, transaccion_id: venta.id, creado_por_id: session.id,
        },
      });
      await tx.cuentaFinanciera.update({ where: { id: cuenta.id }, data: { saldo: { increment: Number(total) } } });
      const campo = dto.metodo_pago === 'EFECTIVO' ? 'ventas_efectivo' : 'ventas_qr';
      await tx.cajaTurno.update({ where: { id: turno.id }, data: { [campo]: { increment: Number(total) } } });
    }

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'Transaccion', entidadId: venta.id,
      detalle: `Venta física #${venta.id}${dto.es_cortesia ? ' (cortesía)' : ''}`,
      monto: Number(total), ip: meta.ip, userAgent: meta.userAgent,
    }, tx);

    return venta;
  });
}

/**
 * Conciliación por repartidor del turno abierto: cuántos pedidos llevó cada uno,
 * cuántos entregó y cuánto efectivo adelantó a caja (Caso 2).
 */
export async function resumenRepartidoresTurno(session: Session) {
  const sucursal_id = sucursalDe(session);
  const turno = await prisma.cajaTurno.findFirst({
    where: { sucursal_id, estado: 'ABIERTO' },
    orderBy: { fecha_apertura: 'desc' },
  });
  if (!turno) return { turno: null, repartidores: [] as RepartidorResumen[] };

  const pedidos = await prisma.transaccion.findMany({
    where: {
      tipo_entrega: 'DELIVERY',
      driver_nombre: { not: null },
      update_at: { gte: turno.fecha_apertura },
    },
    select: { driver_nombre: true, total: true, estado: true, payment_status: true, metodo_pago: true },
  });

  const map = new Map<string, RepartidorResumen>();
  for (const p of pedidos) {
    const key = p.driver_nombre as string;
    const cur = map.get(key) ?? { repartidor: key, pedidos: 0, en_curso: 0, entregados: 0, efectivo_adelantado: 0, total: 0 };
    cur.pedidos += 1;
    cur.total += p.total;
    if (p.estado === 'ENTREGADO') cur.entregados += 1; else cur.en_curso += 1;
    if (p.metodo_pago === 'EFECTIVO' && p.payment_status === 'PAGADO') cur.efectivo_adelantado += p.total;
    map.set(key, cur);
  }

  return {
    turno: { id: turno.id, fecha_apertura: turno.fecha_apertura },
    repartidores: Array.from(map.values()).sort((a, b) => b.total - a.total),
  };
}

interface RepartidorResumen {
  repartidor: string;
  pedidos: number;
  en_curso: number;
  entregados: number;
  efectivo_adelantado: number;
  total: number;
}

// ─────────────────────────────────────────────────────────────
// Entrega de pedidos web (handoff) — Fase 3
// ─────────────────────────────────────────────────────────────

/** Busca un pedido por su código de retiro para verificarlo en el mostrador. */
export async function buscarPedidoPorCodigo(_session: Session, codigo: string) {
  const pedido = await prisma.transaccion.findUnique({
    where: { codigo: codigo.trim().toUpperCase() },
    include: { transaccionesDetalles_id: { include: { producto: { select: { nombre: true } } } } },
  });
  if (!pedido) throw new NotFoundError('No existe un pedido con ese código');
  return pedido;
}

/**
 * Confirma la entrega/salida de un pedido desde el mostrador.
 * - Pickup: cobra en efectivo si falta pago y marca ENTREGADO.
 * - Delivery: el repartidor adelanta el producto (efectivo a caja) si era COD,
 *   se marca PAGADO y pasa a EN_CAMINO con el repartidor asignado.
 * Todo cobro en efectivo exige caja abierta e impacta el turno.
 */
export async function entregarPedido(
  session: Session,
  dto: { codigo: string; driver_nombre?: string },
  meta: Meta = {},
) {
  const sucursal_id = sucursalDe(session);
  const codigo = dto.codigo.trim().toUpperCase();

  return prisma.$transaction(async (tx) => {
    const pedido = await tx.transaccion.findUnique({ where: { codigo } });
    if (!pedido) throw new NotFoundError('No existe un pedido con ese código');
    if (['ENTREGADO', 'CANCELADO', 'PAGADO'].includes(pedido.estado)) {
      throw new ValidationError('El pedido ya fue cerrado o entregado');
    }

    const esDelivery = pedido.tipo_entrega === 'DELIVERY';
    let nuevoPago: EstadoPago = pedido.payment_status;
    let nuevoEstado: EstadoTransaccion = pedido.estado;
    let cobroEfectivo = 0;

    if (esDelivery) {
      if (!dto.driver_nombre?.trim()) throw new ValidationError('Indica el repartidor que retira el pedido');
      if (pedido.payment_status === 'COD_PENDIENTE') {
        cobroEfectivo = pedido.total; // el repartidor adelanta el efectivo a caja
        nuevoPago = 'PAGADO';
      }
      nuevoEstado = 'EN_LOCAL'; // driver está retirando del local
    } else {
      if (pedido.payment_status !== 'PAGADO') {
        cobroEfectivo = pedido.total; // cobro en mostrador al recoger
        nuevoPago = 'PAGADO';
      }
      nuevoEstado = 'ENTREGADO'; // pickup: se entrega directamente
    }

    let turnoId = pedido.turno_id;
    if (cobroEfectivo > 0) {
      const turno = await tx.cajaTurno.findFirst({ where: { sucursal_id, estado: 'ABIERTO' } });
      if (!turno) throw new ConflictError('Abre caja antes de registrar el cobro en efectivo');
      turnoId = turno.id;
      const cuenta = await getCuenta(tx, sucursal_id, 'EFECTIVO');
      await tx.movimientoCaja.create({
        data: {
          turno_id: turno.id, cuenta_id: cuenta.id, tipo: 'VENTA',
          metodo_pago: 'EFECTIVO', monto: cobroEfectivo,
          concepto: esDelivery
            ? `Adelanto repartidor ${dto.driver_nombre?.trim()} · pedido #${pedido.id}`
            : `Cobro pickup · pedido #${pedido.id}`,
          transaccion_id: pedido.id, creado_por_id: session.id,
        },
      });
      await tx.cuentaFinanciera.update({ where: { id: cuenta.id }, data: { saldo: { increment: cobroEfectivo } } });
      await tx.cajaTurno.update({ where: { id: turno.id }, data: { ventas_efectivo: { increment: cobroEfectivo } } });
    }

    // Asegurar descuento de stock (idempotente) por si no se descontó antes
    await descontarStockPorTransaccion(tx, pedido.id);

    const actualizado = await tx.transaccion.update({
      where: { id: pedido.id },
      data: {
        estado: nuevoEstado,
        payment_status: nuevoPago,
        cajero_id: session.id,
        turno_id: turnoId,
        ...(esDelivery ? { driver_nombre: dto.driver_nombre?.trim() } : {}),
      },
      include: { transaccionesDetalles_id: { include: { producto: { select: { nombre: true } } } } },
    });

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Transaccion', entidadId: pedido.id,
      detalle: esDelivery
        ? `Salida delivery #${pedido.id} con repartidor ${dto.driver_nombre?.trim()} (${pedido.payment_status}→${nuevoPago})`
        : `Entrega pickup #${pedido.id} (${pedido.payment_status}→${nuevoPago})`,
      monto: cobroEfectivo || undefined, ip: meta.ip, userAgent: meta.userAgent,
    }, tx);

    return actualizado;
  });
}
