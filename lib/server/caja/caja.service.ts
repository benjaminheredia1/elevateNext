import prisma from '@/lib/prisma';
import { Prisma, TipoMovimientoCaja, TipoCuenta } from '@prisma/client';
import type { Session } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/server/errors';
import type { AperturaCajaInput, MovimientoManualInput, CierreCajaInput, VentaFisicaInput } from '@/lib/server/dto/caja.dto';
import { descontarStockPorTransaccion } from '@/lib/server/inventario/descuento-stock.service';

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
    include: { movimientos: { orderBy: { created_at: 'desc' } } },
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
    const difEfectivo = realEfectivo.minus(esperadoEfectivo);
    const difQr = realQr.minus(esperadoQr);

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
  return prisma.cajaTurno.findMany({
    where: { sucursal_id, cajero_id: session.id, estado: 'CERRADO' },
    orderBy: { fecha_apertura: 'desc' },
    take: 50,
  });
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

    // Crear la transacción (venta presencial pagada)
    const venta = await tx.transaccion.create({
      data: {
        canal: 'SALON',
        metodo_pago: dto.metodo_pago as TipoCuenta,
        es_cortesia: dto.es_cortesia,
        total: Number(total),
        estado: 'PAGADO',
        turno_id: turno.id,
        cajero_id: session.id,
        cliente_nombre: dto.cliente_nombre ?? 'Cliente mostrador',
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
