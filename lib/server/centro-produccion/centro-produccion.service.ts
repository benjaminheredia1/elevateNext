import prisma from '@/lib/prisma';
import { ConflictError, NotFoundError } from '@/lib/server/errors';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

export async function crearCentro(
  nombre: string,
  direccion: string | undefined,
  db: Db = prisma,
) {
  const repetido = await db.centroProduccion.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' } },
    select: { id: true },
  });
  if (repetido) throw new ConflictError('Ya existe un centro de producción con ese nombre');

  return db.centroProduccion.create({
    data: { nombre, direccion: direccion ?? null },
  });
}

export async function listarCentros(soloActivos = true, db: Db = prisma) {
  return db.centroProduccion.findMany({
    where: soloActivos ? { activo: true } : {},
    orderBy: { id: 'asc' },
  });
}

export async function obtenerCentro(centroId: number, db: Db = prisma) {
  const centro = await db.centroProduccion.findUnique({ where: { id: centroId } });
  if (!centro) throw new NotFoundError('Centro de producción no encontrado');
  return centro;
}

export async function editarCentro(
  centroId: number,
  data: { nombre?: string; direccion?: string; activo?: boolean },
  db: Db = prisma,
) {
  await obtenerCentro(centroId, db);
  return db.centroProduccion.update({ where: { id: centroId }, data });
}
