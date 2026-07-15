/**
 * clientes.service.ts
 * Resolución de identidad de clientes para el checkout de invitado.
 * Normaliza los datos y deduplica por teléfono / email / NIT, fusionando
 * en un único registro para minimizar clientes duplicados.
 */
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { ConflictError, ValidationError } from '@/lib/server/errors';

type Db = Prisma.TransactionClient | typeof prisma;

export function normTelefono(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d || null;
}
export function normEmail(v: unknown): string | null {
  const e = String(v ?? '').trim().toLowerCase();
  return e || null;
}
export function normNit(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d || null;
}

export interface ClienteInput {
  nombre?: string | null;
  telefono?: string | null;
  email?: string | null;
  nit?: string | null;
  direccion?: string | null;
}

/**
 * Devuelve el id del Cliente que corresponde a estos datos: lo encuentra por
 * teléfono, email o NIT (en ese orden de confianza) y completa los campos que
 * le falten, o lo crea si no existe. Seguro ante condiciones de carrera gracias
 * al índice único en `telefono`.
 */
export async function resolverCliente(input: ClienteInput, db: Db = prisma): Promise<number | null> {
  const tel = normTelefono(input.telefono);
  const email = normEmail(input.email);
  const nit = normNit(input.nit);
  const nombre = (input.nombre ?? '').trim();
  const direccion = input.direccion ?? null;

  // Solo claves suficientemente fuertes para identificar (NIT genérico corto se ignora)
  const or: Prisma.ClienteWhereInput[] = [];
  if (tel) or.push({ telefono: tel });
  if (email) or.push({ email });
  if (nit && nit.length >= 6) or.push({ nit });

  if (or.length === 0 && !nombre) return null;

  const existente = or.length > 0 ? await db.cliente.findFirst({ where: { OR: or } }) : null;

  if (existente) {
    await db.cliente.update({
      where: { id: existente.id },
      data: {
        nombre: existente.nombre || nombre || 'Cliente',
        telefono: existente.telefono ?? tel,
        email: existente.email ?? email,
        nit: existente.nit ?? nit,
        direccion: direccion ?? existente.direccion,
      },
    });
    return existente.id;
  }

  try {
    const creado = await db.cliente.create({
      data: { nombre: nombre || 'Cliente', telefono: tel, email, nit, direccion },
    });
    return creado.id;
  } catch {
    // Posible carrera: otro request creó el mismo teléfono. Reintentar la búsqueda.
    if (tel) {
      const again = await db.cliente.findFirst({ where: { telefono: tel } });
      if (again) return again.id;
    }
    return null;
  }
}

export interface CrearClienteCajaData {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  nit?: string | null;
  privilegio_ids?: number[];
}

/**
 * Alta explícita de cliente desde caja (sin venta de por medio). A diferencia de
 * `resolverCliente` (checkout), aquí un duplicado por celular/email/NIT es un
 * conflicto (409): el cajero debe buscar y usar el cliente existente, no crear otro.
 * Solo se pueden asignar privilegios ACTIVOS (los publicados por el admin).
 */
export async function crearClienteDesdeCaja(input: CrearClienteCajaData) {
  const tel = normTelefono(input.telefono);
  const email = normEmail(input.email);
  const nit = normNit(input.nit);
  const nombre = input.nombre.trim();

  const or: Prisma.ClienteWhereInput[] = [];
  if (tel) or.push({ telefono: tel });
  if (email) or.push({ email });
  if (nit && nit.length >= 6) or.push({ nit });
  if (or.length > 0) {
    const existente = await prisma.cliente.findFirst({ where: { OR: or }, select: { nombre: true } });
    if (existente) {
      throw new ConflictError(`Ya existe un cliente con ese celular, email o NIT: ${existente.nombre}. Búscalo y selecciónalo en lugar de crearlo de nuevo.`);
    }
  }

  const deseados = Array.from(new Set(input.privilegio_ids ?? []));
  const activos = deseados.length > 0
    ? await prisma.privilegio.findMany({
        where: { id: { in: deseados }, activo: true },
        select: { id: true, nombre: true, porcentaje: true },
      })
    : [];
  if (activos.length !== deseados.length) {
    throw new ValidationError('Solo se pueden asignar privilegios activos publicados por el administrador');
  }

  let cliente;
  try {
    cliente = await prisma.$transaction(async tx => {
      const creado = await tx.cliente.create({
        data: { nombre, telefono: tel, email, nit },
      });
      if (deseados.length > 0) {
        await tx.clientePrivilegio.createMany({
          data: deseados.map(pid => ({ cliente_id: creado.id, privilegio_id: pid })),
          skipDuplicates: true,
        });
      }
      return creado;
    });
  } catch (e) {
    // Carrera: otro request registró el mismo celular entre el chequeo y el create.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictError('Ese celular ya pertenece a otro cliente');
    }
    throw e;
  }

  const privilegios = activos.map(p => ({ id: p.id, nombre: p.nombre, porcentaje: Number(p.porcentaje) }));
  return { cliente, privilegios };
}

/**
 * Cliente centinela único para ventas anónimas (cliente que no quiere registrarse).
 * Mantiene trazabilidad sin ensuciar la base de clientes reales: todas las ventas
 * anónimas se asocian a este mismo id.
 */
export async function getClienteAnonimo(db: Db = prisma): Promise<number> {
  const existente = await db.cliente.findFirst({ where: { es_anonimo: true } });
  if (existente) return existente.id;
  const creado = await db.cliente.create({
    data: { nombre: 'Cliente Anónimo', es_anonimo: true },
  });
  return creado.id;
}
