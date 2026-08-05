import prisma from '@/lib/prisma';
import { resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { NotFoundError } from '@/lib/server/errors';
import type { Prisma } from '@prisma/client';
import type { GastoOperativoInput } from '@/lib/server/dto/gastos-operativos.dto';

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

function decorate<T extends { monto: Prisma.Decimal }>(row: T) {
  return { ...row, monto: toNumber(row.monto) };
}

export async function listarGastosOperativos(metodoPago?: 'EFECTIVO' | 'QR', q?: string, sucursal?: number) {
  const gastos = await prisma.gastoOperativo.findMany({
    where: {
      ...(metodoPago ? { metodo_pago: metodoPago } : {}),
      ...(q ? { concepto: { contains: q, mode: 'insensitive' } } : {}),
      // Gasto del local donde se hizo. Sin sucursal (solo el dueño), todos.
      ...(sucursal ? { sucursal_id: sucursal } : {}),
    },
    orderBy: { fecha: 'desc' },
  });
  const items = gastos.map(decorate);
  const total = items.reduce((sum, item) => sum + item.monto, 0);
  const totalEfectivo = items.filter(i => i.metodo_pago === 'EFECTIVO').reduce((sum, item) => sum + item.monto, 0);
  const totalQr = items.filter(i => i.metodo_pago === 'QR').reduce((sum, item) => sum + item.monto, 0);
  const porCategoria = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.categoria] = (acc[item.categoria] ?? 0) + item.monto;
    return acc;
  }, {});

  return {
    items,
    resumen: {
      total: Number(total.toFixed(2)),
      efectivo: Number(totalEfectivo.toFixed(2)),
      qr: Number(totalQr.toFixed(2)),
      por_categoria: porCategoria,
    },
  };
}

export async function crearGastoOperativo(input: GastoOperativoInput, usuarioId: number) {
  const gasto = await prisma.gastoOperativo.create({
    data: {
      concepto: input.concepto,
      categoria: input.categoria,
      monto: input.monto,
      metodo_pago: input.metodo_pago,
      fecha: input.fecha,
      notas: input.notas ?? null,
      // Todo gasto pertenece a un local; sin indicarlo va a la principal.
      sucursal_id: await resolverSucursal(input.sucursal_id),
      creado_por_id: usuarioId,
    },
  });
  return decorate(gasto);
}

export async function eliminarGastoOperativo(id: number) {
  const exists = await prisma.gastoOperativo.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Gasto operativo no encontrado');
  const gasto = await prisma.gastoOperativo.delete({ where: { id } });
  return decorate(gasto);
}
