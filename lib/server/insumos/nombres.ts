/**
 * nombres.ts
 *
 * Un insumo espejo se llama igual que su producto, así que dos productos con el
 * mismo nombre dejan dos renglones de inventario indistinguibles en pantalla.
 * Eso fue el incidente de septiembre de 2026: el Centro abastecía un renglón y
 * la caja descontaba el otro, así que lo despachado no bajaba nunca y lo
 * vendido se iba a negativo, sin que nada avisara.
 *
 * El freno vive acá y no en cada endpoint porque hay tres puertas por las que
 * nace un espejo (alta de producto, edición de producto y producción en el
 * Centro) y alcanza con que una quede abierta para reabrir el problema.
 */
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ConflictError } from '@/lib/server/errors';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Dos nombres son "el mismo producto" para quien opera aunque difieran en
 * mayúsculas, tildes o espacios de más. Los duplicados reales fueron
 * "Sandwich pollo" vs "Sándwich pollo" y "Brownie" vs "Brownie ": comparar el
 * nombre crudo los habría dejado pasar a todos.
 */
export function normalizarNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    // Las marcas combinantes que NFD acaba de separar.
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface InsumoHomonimo {
  id: number;
  nombre: string;
}

/**
 * Busca un insumo activo que se llame igual (normalizado). Se compara en
 * memoria porque la colisión real es por tilde y mayúscula, que Postgres no
 * iguala sin `unaccent`, y la lista de insumos activos es de cientos de filas,
 * no de millones.
 */
export async function buscarInsumoHomonimo(
  nombre: string,
  db: Db = prisma,
  excluirId?: number | null,
): Promise<InsumoHomonimo | null> {
  const clave = normalizarNombre(nombre);
  if (!clave) return null;

  const candidatos = await db.insumo.findMany({
    where: { activo: true, ...(excluirId ? { id: { not: excluirId } } : {}) },
    select: { id: true, nombre: true },
  });
  return candidatos.find(i => normalizarNombre(i.nombre) === clave) ?? null;
}

/**
 * Frena la creación de un segundo renglón de inventario con un nombre que ya
 * existe. Es deliberadamente insalvable: no hay flag que lo saltee, porque el
 * aviso que sí se podía saltear se salteó 27 veces seguidas y así nacieron los
 * duplicados. Para el caso legítimo —dos productos parecidos— la salida es
 * reusar el insumo (`insumo_reventa_id`) o ponerle un nombre que los distinga,
 * que es lo que el operador va a ver en pantalla.
 */
export async function asegurarNombreDeInsumoLibre(
  nombre: string,
  db: Db = prisma,
  excluirId?: number | null,
): Promise<void> {
  const homonimo = await buscarInsumoHomonimo(nombre, db, excluirId);
  if (!homonimo) return;

  throw new ConflictError(
    `Ya existe "${homonimo.nombre.trim()}" en el inventario (insumo #${homonimo.id}). ` +
    `Crear un segundo renglón con el mismo nombre parte el stock en dos: el Centro abastece uno ` +
    `y la caja descuenta el otro. Reponé el que ya existe, o poné un nombre que los distinga.`,
  );
}
