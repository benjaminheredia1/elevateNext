import prisma from '@/lib/prisma';
import { AppError, NotFoundError, ConflictError } from '@/lib/server/errors';
import type { Prisma, TipoCuentaCxCxP } from '@prisma/client';
import type { CuentaCorrienteInput, FiadoInput, PagoInput } from '@/lib/server/dto/cuentas-corrientes.dto';

function toNum(v: Prisma.Decimal) { return Number(v.toFixed(2)); }

function decorate<T extends { monto: Prisma.Decimal; monto_pagado: Prisma.Decimal; vencimiento?: Date | null }>(row: T) {
  const monto = toNum(row.monto);
  const monto_pagado = toNum(row.monto_pagado);
  const ahora = new Date();
  const vencido = row.vencimiento != null && row.vencimiento < ahora;
  return {
    ...row,
    monto,
    monto_pagado,
    saldo: Number((monto - monto_pagado).toFixed(2)),
    vencido,
  };
}

const clienteSelect = { select: { id: true, nombre: true, telefono: true } };

export async function listarCuentas(tipo?: TipoCuentaCxCxP, estado?: string) {
  const rows = await prisma.cuentaCorriente.findMany({
    where: {
      ...(tipo ? { tipo } : {}),
      ...(estado && estado !== 'TODAS' ? { estado: estado as 'PENDIENTE' | 'PARCIAL' | 'PAGADA' } : {}),
    },
    include: { cliente: clienteSelect },
    orderBy: [{ estado: 'asc' }, { vencimiento: 'asc' }, { created_at: 'desc' }],
  });
  const items = rows.map(decorate);

  const cobrar = items.filter(i => i.tipo === 'POR_COBRAR');
  const pagar  = items.filter(i => i.tipo === 'POR_PAGAR');
  const vencidas = items.filter(i => i.vencido && i.estado !== 'PAGADA');

  return {
    items,
    resumen: {
      por_cobrar: cobrar.reduce((s, i) => s + i.saldo, 0),
      cobrado: cobrar.reduce((s, i) => s + i.monto_pagado, 0),
      total_cobrar: cobrar.reduce((s, i) => s + i.monto, 0),
      por_pagar: pagar.reduce((s, i) => s + i.saldo, 0),
      pagado: pagar.reduce((s, i) => s + i.monto_pagado, 0),
      total_pagar: pagar.reduce((s, i) => s + i.monto, 0),
      vencidas: vencidas.length,
    },
  };
}

export async function crearCuenta(input: CuentaCorrienteInput, usuarioId: number) {
  const row = await prisma.cuentaCorriente.create({
    data: {
      tipo: input.tipo,
      contraparte: input.contraparte,
      concepto: input.concepto,
      monto: input.monto,
      vencimiento: input.vencimiento ?? null,
      creado_por_id: usuarioId,
      cliente_id: input.cliente_id ?? null,
      transaccion_id: input.transaccion_id ?? null,
    },
    include: { cliente: clienteSelect },
  });
  return decorate(row);
}

export async function crearFiado(input: FiadoInput, usuarioId: number) {
  const transaccion = await prisma.transaccion.findUnique({
    where: { id: input.transaccion_id },
    include: { transaccionesDetalles_id: { include: { producto: { select: { nombre: true } } } } },
  });
  if (!transaccion) throw new NotFoundError('Pedido no encontrado');

  const yaExiste = await prisma.cuentaCorriente.findUnique({
    where: { transaccion_id: input.transaccion_id },
  });
  if (yaExiste) throw new ConflictError('Este pedido ya tiene un fiado registrado');

  const clienteNombre = transaccion.cliente_nombre ?? 'Cliente sin nombre';
  const concepto = input.concepto
    ?? `Fiado pedido #${transaccion.id} — ${clienteNombre}`;

  const row = await prisma.cuentaCorriente.create({
    data: {
      tipo: 'POR_COBRAR',
      contraparte: clienteNombre,
      concepto,
      monto: transaccion.total,
      vencimiento: input.vencimiento ?? null,
      creado_por_id: usuarioId,
      transaccion_id: transaccion.id,
      cliente_id: transaccion.cliente_id ?? null,
    },
    include: { cliente: clienteSelect },
  });
  return decorate(row);
}

export async function registrarPago(id: number, input: PagoInput) {
  const cuenta = await prisma.cuentaCorriente.findUnique({ where: { id } });
  if (!cuenta) throw new NotFoundError('Cuenta no encontrada');

  const montoTotal = toNum(cuenta.monto);
  const pagadoActual = toNum(cuenta.monto_pagado);
  const nuevoPagado = Number((pagadoActual + input.monto).toFixed(2));

  if (nuevoPagado > montoTotal) {
    throw new AppError(422, `El pago (${nuevoPagado}) supera el monto total (${montoTotal})`);
  }

  const estado = nuevoPagado >= montoTotal ? 'PAGADA' : nuevoPagado > 0 ? 'PARCIAL' : 'PENDIENTE';

  const row = await prisma.cuentaCorriente.update({
    where: { id },
    data: { monto_pagado: nuevoPagado, estado },
    include: { cliente: clienteSelect },
  });
  return decorate(row);
}

export async function listarDeudasVencidas() {
  const ahora = new Date();
  return prisma.cuentaCorriente.findMany({
    where: {
      estado: { not: 'PAGADA' },
      vencimiento: { lt: ahora },
    },
    include: { cliente: clienteSelect },
    orderBy: { vencimiento: 'asc' },
  });
}
