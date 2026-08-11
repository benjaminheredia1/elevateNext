/**
 * sucursal.service.ts
 * Resolución de la sucursal a la que pertenece una operación.
 *
 * Regla general: toda venta nace con sucursal. El POS la toma del turno abierto;
 * el checkout web, de la sucursal cuyo menú estaba viendo el cliente. Cuando el
 * dato no viene (pedidos de integraciones antiguas), se cae a la sucursal activa
 * más antigua, que es la principal del negocio.
 */
import prisma from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/server/errors';
import { ForbiddenError } from '@/lib/server/auth/session';
import type { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient | typeof prisma;

/** Sucursal activa más antigua: la principal del negocio. */
export async function sucursalPorDefecto(db: Db = prisma) {
  const sucursal = await db.sucursal.findFirst({
    where: { activa: true },
    orderBy: { id: 'asc' },
    select: { id: true, nombre: true },
  });
  if (!sucursal) throw new NotFoundError('No hay ninguna sucursal activa configurada');
  return sucursal;
}

/** Atajo cuando solo se necesita el id de la sucursal principal. */
export async function sucursalPorDefectoId(db: Db = prisma): Promise<number> {
  return (await sucursalPorDefecto(db)).id;
}

/**
 * Valida la sucursal pedida y devuelve su id. Si no se indica ninguna, cae a la
 * principal — nunca devuelve null, para que ninguna venta quede huérfana.
 */
export async function resolverSucursal(sucursalId: unknown, db: Db = prisma): Promise<number> {
  const id = Number(sucursalId);
  // Viene de `alcanceSucursal`: usuario sin sucursal asignada. No puede caer a la
  // principal, o el encierro por rol se evadiría por esta puerta.
  if (id === SIN_ALCANCE) {
    throw new ValidationError('Tu usuario no tiene una sucursal asignada. Pedile al dueño que te asigne una.');
  }
  if (!Number.isInteger(id) || id <= 0) return (await sucursalPorDefecto(db)).id;

  const sucursal = await db.sucursal.findUnique({ where: { id }, select: { id: true, activa: true } });
  if (!sucursal) throw new ValidationError('La sucursal indicada no existe');
  if (!sucursal.activa) throw new ValidationError('La sucursal indicada está desactivada');
  return sucursal.id;
}

/**
 * Alcance de lectura de un usuario, aplicado en el servidor.
 *
 * - DUENO: ve todo el negocio. Sin `pedida` obtiene el consolidado; con `pedida`,
 *   esa sucursal. Es el único rol que puede comparar todos los locales.
 * - ADMIN: puede tener varias sucursales asignadas y elegir entre ellas. Si pide
 *   una que no es suya, se corta con 403 en vez de caer a la principal: pedir el
 *   local de al lado es un intento de evasión, no un descuido que haya que tapar.
 *   Sin `pedida`, ve su sucursal principal (una a la vez, no el agregado).
 * - CAJERO: una sola sucursal, la suya.
 *
 * Esconder el selector en la interfaz no alcanza: la restricción tiene que vivir
 * acá, porque la API se puede llamar a mano.
 *
 * Un usuario no-DUENO sin ninguna sucursal devuelve `SIN_ALCANCE`, un id que no
 * existe, para que las consultas no devuelvan nada. Es deliberado: ante una
 * asignación faltante, mostrar todo el negocio sería la falla peligrosa.
 */
export const SIN_ALCANCE = -1;

export interface SesionConAlcance {
  rol: string;
  sucursal_id: number | null;
  /** Opcional: las sesiones viejas de los tests traen solo `sucursal_id`. */
  sucursales?: number[];
}

/** Sucursales que el usuario puede ver, sin duplicados. */
function sucursalesDe(session: SesionConAlcance): number[] {
  const lista = [...(session.sucursales ?? [])];
  if (session.sucursal_id != null && !lista.includes(session.sucursal_id)) {
    lista.push(session.sucursal_id);
  }
  return lista;
}

export function alcanceSucursal(session: SesionConAlcance, pedida?: number): number | undefined {
  if (session.rol === 'DUENO') return pedida;

  const propias = sucursalesDe(session);
  if (propias.length === 0) return SIN_ALCANCE;
  if (pedida == null) return session.sucursal_id ?? propias[0];
  if (!propias.includes(pedida)) {
    throw new ForbiddenError('No tenés acceso a esa sucursal');
  }
  return pedida;
}
