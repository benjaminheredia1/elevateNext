import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { RangoFechas } from './rango';

function toNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value.toFixed(2));
}

export async function listarTurnos(rango: RangoFechas, sucursal?: number) {
  const turnos = await prisma.cajaTurno.findMany({
    where: {
      fecha_apertura: { gte: rango.desde, lte: rango.hasta },
      ...(sucursal ? { sucursal_id: sucursal } : {}),
    },
    include: {
      cajero: { select: { id: true, nombre: true, email: true } },
      sucursal: { select: { id: true, nombre: true } },
    },
    orderBy: { fecha_apertura: 'desc' },
  });

  return {
    rango,
    turnos: turnos.map(t => ({
      id: t.id,
      estado: t.estado,
      sucursal: t.sucursal,
      cajero: t.cajero,
      fecha_apertura: t.fecha_apertura,
      fecha_cierre: t.fecha_cierre,
      ventas_efectivo: toNumber(t.ventas_efectivo),
      ventas_qr: toNumber(t.ventas_qr),
      esperado_efectivo: toNumber(t.esperado_efectivo),
      esperado_qr: toNumber(t.esperado_qr),
      real_efectivo: toNumber(t.real_efectivo),
      real_qr: toNumber(t.real_qr),
      diferencia_efectivo: toNumber(t.diferencia_efectivo),
      diferencia_qr: toNumber(t.diferencia_qr),
      diferencia_total: toNumber((t.diferencia_efectivo ?? new Prisma.Decimal(0)).plus(t.diferencia_qr ?? new Prisma.Decimal(0))),
      observaciones: t.observaciones,
    })),
  };
}
