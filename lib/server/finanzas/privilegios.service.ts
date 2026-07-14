import prisma from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/server/errors';
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

/**
 * Asignación de privilegios por CAJERO: solo puede otorgar/quitar privilegios
 * ACTIVOS (los "publicados" por el administrador). Trabaja por diferencias:
 * los vínculos a privilegios inactivos que el cliente ya tuviera no se tocan.
 * Devuelve el detalle de lo agregado/quitado para dejarlo en auditoría.
 */
export async function setPrivilegiosActivosDeCliente(clienteId: number, privilegioIds: number[]) {
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, es_anonimo: false },
    select: { id: true, nombre: true },
  });
  if (!cliente) throw new NotFoundError('Cliente no encontrado');

  const deseados = Array.from(new Set(privilegioIds));

  // Todos los ids pedidos deben ser privilegios activos: un cajero no puede
  // otorgar privilegios despublicados aunque conozca su id.
  const activos = await prisma.privilegio.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, porcentaje: true },
  });
  const activosById = new Map(activos.map(p => [p.id, p]));
  const invalidos = deseados.filter(id => !activosById.has(id));
  if (invalidos.length > 0) {
    throw new ValidationError('Solo se pueden asignar privilegios activos publicados por el administrador');
  }

  const actuales = await prisma.clientePrivilegio.findMany({
    where: { cliente_id: clienteId, privilegio: { activo: true } },
    select: { privilegio_id: true },
  });
  const actualesIds = new Set(actuales.map(a => a.privilegio_id));

  const agregar = deseados.filter(id => !actualesIds.has(id));
  const quitar = Array.from(actualesIds).filter(id => !deseados.includes(id));

  await prisma.$transaction([
    ...(quitar.length > 0
      ? [prisma.clientePrivilegio.deleteMany({ where: { cliente_id: clienteId, privilegio_id: { in: quitar } } })]
      : []),
    ...(agregar.length > 0
      ? [prisma.clientePrivilegio.createMany({
          data: agregar.map(pid => ({ cliente_id: clienteId, privilegio_id: pid })),
          skipDuplicates: true,
        })]
      : []),
  ]);

  const nombre = (id: number) => {
    const p = activosById.get(id)!;
    return `${p.nombre} (${toNumber(p.porcentaje)}%)`;
  };
  return {
    cliente,
    agregados: agregar.map(nombre),
    quitados: quitar.map(nombre),
    privilegios: await getPrivilegiosDeCliente(clienteId),
  };
}

async function ensurePrivilegio(id: number) {
  const exists = await prisma.privilegio.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Privilegio no encontrado');
}
