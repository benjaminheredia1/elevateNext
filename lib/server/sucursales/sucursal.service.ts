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
 *   esa sucursal. Es el único rol que puede comparar locales.
 * - Cualquier otro rol (ADMIN, CAJERO): queda encerrado en la sucursal que tiene
 *   asignada, ignorando lo que mande el query string. Esconder el selector en la
 *   interfaz no alcanza: la restricción tiene que vivir acá, porque la API se
 *   puede llamar a mano.
 *
 * Un usuario no-DUENO sin sucursal asignada devuelve `SIN_ALCANCE`, un id que no
 * existe, para que las consultas no devuelvan nada. Es deliberado: ante una
 * asignación faltante, mostrar todo el negocio sería la falla peligrosa.
 */
export const SIN_ALCANCE = -1;

export function alcanceSucursal(
  session: { rol: string; sucursal_id: number | null },
  pedida?: number,
): number | undefined {
  if (session.rol === 'DUENO') return pedida;
  return session.sucursal_id ?? SIN_ALCANCE;
}
