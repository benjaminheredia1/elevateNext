import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { RangoFechas } from './rango';
import { NotFoundError } from '@/lib/server/errors';

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

/**
 * Detalle de un turno para el panel admin: sin restringir por cajero_id,
 * ya que ADMIN/DUENO supervisan turnos de cualquier cajero/sucursal.
 */
export async function getTurnoDetalleAdmin(turnoId: number) {
  const turno = await prisma.cajaTurno.findUnique({
    where: { id: turnoId },
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
      cuenta_corriente: { select: { id: true, estado: true, monto: true, monto_pagado: true } },
    },
  });

  return { turno: { ...turno, pedidos_count: pedidos.length }, pedidos };
}
