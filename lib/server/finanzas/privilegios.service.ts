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
    include: { _count: { select: { clientes: true } } },
  });
  return rows.map(r => ({ ...decorate(r), clientes_count: r._count.clientes }));
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

export async function getPrivilegiosDeCliente(clienteId: number) {
  const rows = await prisma.clientePrivilegio.findMany({
    where: { cliente_id: clienteId },
    include: { privilegio: true },
  });
  return rows.map(r => decorate(r.privilegio));
}

export async function setPrivilegiosDeCliente(clienteId: number, privilegioIds: number[]) {
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
  if (!cliente) throw new NotFoundError('Cliente no encontrado');

  const unicos = Array.from(new Set(privilegioIds));
  await prisma.$transaction([
    prisma.clientePrivilegio.deleteMany({ where: { cliente_id: clienteId } }),
    ...(unicos.length > 0
      ? [prisma.clientePrivilegio.createMany({
          data: unicos.map(pid => ({ cliente_id: clienteId, privilegio_id: pid })),
          skipDuplicates: true,
        })]
      : []),
  ]);
  return getPrivilegiosDeCliente(clienteId);
}

async function ensurePrivilegio(id: number) {
  const exists = await prisma.privilegio.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Privilegio no encontrado');
}
