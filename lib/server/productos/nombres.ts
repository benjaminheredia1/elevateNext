/**
 * nombres.ts (productos)
 *
 * Buscar el producto que ya se llama así. El aviso de duplicado existía desde
 * antes, pero comparaba el nombre crudo: "Sándwich pollo" y "Sandwich pollo"
 * pasaban como productos distintos, y así entraron varios de los duplicados de
 * septiembre de 2026 sin que nadie viera el aviso.
 *
 * Compara solo contra productos: un insumo que se llame igual es otra cosa
 * —puede ser el ingrediente de una receta— y no tiene por qué impedir dar de
 * alta un producto.
 */
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { normalizarNombre } from '@/lib/server/insumos/nombres';

type Db = Prisma.TransactionClient | typeof prisma;

export interface ProductoHomonimo {
  id: number;
  nombre: string;
  sucursales: { sucursal: { id: number; nombre: string } }[];
}

/**
 * Producto vivo (no dado de baja) con el mismo nombre, ignorando mayúsculas,
 * tildes y espacios de más. `excluirId` sirve al renombrar: un producto no es
 * duplicado de sí mismo.
 */
export async function buscarProductoHomonimo(
  nombre: string,
  db: Db = prisma,
  excluirId?: number | null,
): Promise<ProductoHomonimo | null> {
  const clave = normalizarNombre(nombre);
  if (!clave) return null;

  // Se comparan en memoria porque la colisión real es por tilde, y Postgres no
  // las iguala sin `unaccent`. El catálogo son cientos de filas.
  const candidatos = await db.producto.findMany({
    where: {
      estado_publicacion: { not: 'BAJA' },
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    select: {
      id: true,
      nombre: true,
      sucursales: { select: { sucursal: { select: { id: true, nombre: true } } } },
    },
  });
  return candidatos.find(p => normalizarNombre(p.nombre) === clave) ?? null;
}
