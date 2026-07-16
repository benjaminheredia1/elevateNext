import prisma from '@/lib/prisma';
import { NotFoundError } from '@/lib/server/errors';
import type { Prisma } from '@prisma/client';
import type { PrivilegioInput, PrivilegioUpdateInput } from '@/lib/server/dto/privilegios.dto';

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

function decorate<T extends { porcentaje: Prisma.Decimal }>(row: T) {
  return { ...row, porcentaje: toNumber(row.porcentaje) };
}

export async function listarPrivilegios(incluirInactivos = false) {
  const rows = await prisma.privilegio.findMany({
    where: incluirInactivos ? {} : { activo: true },
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
  });
  return rows.map(decorate);
}

export async function crearPrivilegio(input: PrivilegioInput, usuarioId: number) {
  const row = await prisma.privilegio.create({
    data: {
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
      porcentaje: input.porcentaje,
      activo: input.activo ?? true,
      creado_por_id: usuarioId,
    },
  });
  return decorate(row);
}

export async function actualizarPrivilegio(input: PrivilegioUpdateInput) {
  await ensurePrivilegio(input.id);
  const row = await prisma.privilegio.update({
    where: { id: input.id },
    data: {
      nombre: input.nombre,
      descripcion: input.descripcion,
      porcentaje: input.porcentaje,
      activo: input.activo,
    },
  });
  return decorate(row);
}

export async function eliminarPrivilegio(id: number) {
  await ensurePrivilegio(id);
  const row = await prisma.privilegio.update({ where: { id }, data: { activo: false } });
  return decorate(row);
}

async function ensurePrivilegio(id: number) {
  const exists = await prisma.privilegio.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Privilegio no encontrado');
}
