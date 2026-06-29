import prisma from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/server/errors';
import type { Prisma, TipoCuentaCxCxP } from '@prisma/client';
import type { CuentaCorrienteInput, PagoInput } from '@/lib/server/dto/cuentas-corrientes.dto';

function toNum(v: Prisma.Decimal) { return Number(v.toFixed(2)); }

function decorate<T extends { monto: Prisma.Decimal; monto_pagado: Prisma.Decimal }>(row: T) {
  return {
    ...row,
    monto: toNum(row.monto),
    monto_pagado: toNum(row.monto_pagado),
    saldo: Number((toNum(row.monto) - toNum(row.monto_pagado)).toFixed(2)),
  };
}

export async function listarCuentas(tipo?: TipoCuentaCxCxP, estado?: string) {
  const rows = await prisma.cuentaCorriente.findMany({
    where: {
      ...(tipo ? { tipo } : {}),
      ...(estado && estado !== 'TODAS' ? { estado: estado as 'PENDIENTE' | 'PARCIAL' | 'PAGADA' } : {}),
    },
    orderBy: [{ estado: 'asc' }, { vencimiento: 'asc' }, { created_at: 'desc' }],
  });
  const items = rows.map(decorate);

  const cobrar = items.filter(i => i.tipo === 'POR_COBRAR');
  const pagar = items.filter(i => i.tipo === 'POR_PAGAR');

  return {
    items,
    resumen: {
      por_cobrar: cobrar.reduce((s, i) => s + i.saldo, 0),
      cobrado: cobrar.reduce((s, i) => s + i.monto_pagado, 0),
      total_cobrar: cobrar.reduce((s, i) => s + i.monto, 0),
      por_pagar: pagar.reduce((s, i) => s + i.saldo, 0),
      pagado: pagar.reduce((s, i) => s + i.monto_pagado, 0),
      total_pagar: pagar.reduce((s, i) => s + i.monto, 0),
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
    },
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
  });
  return decorate(row);
}
