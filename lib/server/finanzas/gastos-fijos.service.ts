import prisma from '@/lib/prisma';
import { NotFoundError } from '@/lib/server/errors';
import type { Frecuencia, Prisma } from '@prisma/client';
import type { GastoFijoInput, GastoFijoUpdateInput } from '@/lib/server/dto/gastos-fijos.dto';

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

export function equivalenteMensual(monto: number, frecuencia: Frecuencia): number {
  if (frecuencia === 'SEMANAL') return Number((monto * 4.33).toFixed(2));
  if (frecuencia === 'QUINCENAL') return Number((monto * 2).toFixed(2));
  if (frecuencia === 'ANUAL') return Number((monto / 12).toFixed(2));
  return Number(monto.toFixed(2));
}

function decorate<T extends { monto: Prisma.Decimal; frecuencia: Frecuencia }>(row: T) {
  const monto = toNumber(row.monto);
  const mensual = equivalenteMensual(monto, row.frecuencia);
  return {
    ...row,
    monto,
    equivalente_mensual: mensual,
    equivalente_diario: Number((mensual / 30).toFixed(2)),
  };
}

export async function listarGastosFijos(incluirInactivos = false) {
  const gastos = await prisma.gastoFijo.findMany({
    where: incluirInactivos ? {} : { activo: true },
    orderBy: [{ activo: 'desc' }, { categoria: 'asc' }, { concepto: 'asc' }],
  });
  const items = gastos.map(decorate);
  const totalMensual = items.filter(i => i.activo).reduce((sum, item) => sum + item.equivalente_mensual, 0);

  return {
    items,
    resumen: {
      total_mensual: Number(totalMensual.toFixed(2)),
      equivalente_diario: Number((totalMensual / 30).toFixed(2)),
      activos: items.filter(i => i.activo).length,
    },
  };
}

export async function crearGastoFijo(input: GastoFijoInput, usuarioId: number) {
  const gasto = await prisma.gastoFijo.create({
    data: {
      concepto: input.concepto,
      categoria: input.categoria,
      monto: input.monto,
      frecuencia: input.frecuencia,
      activo: input.activo ?? true,
      creado_por_id: usuarioId,
    },
  });
  return decorate(gasto);
}

export async function actualizarGastoFijo(input: GastoFijoUpdateInput) {
  await ensureGastoFijo(input.id);
  const gasto = await prisma.gastoFijo.update({
    where: { id: input.id },
    data: {
      concepto: input.concepto,
      categoria: input.categoria,
      monto: input.monto,
      frecuencia: input.frecuencia,
      activo: input.activo,
    },
  });
  return decorate(gasto);
}

export async function eliminarGastoFijo(id: number) {
  await ensureGastoFijo(id);
  const gasto = await prisma.gastoFijo.update({ where: { id }, data: { activo: false } });
  return decorate(gasto);
}

async function ensureGastoFijo(id: number) {
  const exists = await prisma.gastoFijo.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Gasto fijo no encontrado');
}
