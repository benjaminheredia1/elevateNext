import prisma from '@/lib/prisma';
import { ConflictError, NotFoundError } from '@/lib/server/errors';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Marca que la baja del insumo fue provocada por la baja de su producto de
 * reventa (y no una baja manual del inventario). Solo las bajas con este
 * prefijo se revierten automáticamente al restaurar el producto.
 */
const PREFIJO_BAJA_POR_PRODUCTO = 'Baja automática por baja del producto de reventa';

/**
 * Al dar de baja un producto de REVENTA, dar de baja también su insumo si es
 * de uso exclusivo (ninguna receta, ningún otro producto activo, ningún mixto
 * lo referencia). Devuelve true si el insumo fue dado de baja.
 */
export async function bajaInsumoExclusivoDeReventa(
  tx: Prisma.TransactionClient,
  producto: { id: number; nombre: string; insumo_reventa_id: number | null },
  motivo: string,
): Promise<boolean> {
  if (!producto.insumo_reventa_id) return false;
  const insumoId = producto.insumo_reventa_id;

  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo || !insumo.activo) return false;

  const [enRecetas, otrosProductos, enMixtos] = await Promise.all([
    tx.recetasProducto.count({ where: { insumo_id: insumoId } }),
    tx.producto.count({
      where: { insumo_reventa_id: insumoId, id: { not: producto.id }, estado_publicacion: { not: 'BAJA' } },
    }),
    tx.insumoMixtoDetalle.count({
      where: { OR: [{ insumo_hijo_id: insumoId }, { insumo_padre_id: insumoId }] },
    }),
  ]);
  if (enRecetas + otrosProductos + enMixtos > 0) return false;

  await tx.insumo.update({
    where: { id: insumoId },
    data: {
      activo: false,
      fecha_baja: new Date(),
      motivo_baja: `${PREFIJO_BAJA_POR_PRODUCTO} "${producto.nombre}". Motivo: ${motivo}`,
    },
  });
  return true;
}

/**
 * Al restaurar un producto de REVENTA que estaba en BAJA, reactivar su insumo
 * solo si su baja fue la cascada automática (no una baja manual del inventario).
 * Devuelve true si el insumo fue reactivado.
 */
export async function reactivarInsumoDeReventaSiCascada(
  tx: Prisma.TransactionClient,
  insumoReventaId: number | null,
): Promise<boolean> {
  if (!insumoReventaId) return false;

  const insumo = await tx.insumo.findUnique({ where: { id: insumoReventaId } });
  if (!insumo || insumo.activo) return false;
  if (!insumo.motivo_baja?.startsWith(PREFIJO_BAJA_POR_PRODUCTO)) return false;

  await tx.insumo.update({
    where: { id: insumoReventaId },
    data: { activo: true, fecha_baja: null, motivo_baja: null },
  });
  return true;
}

/**
 * Dar de baja un insumo y cascada a productos en revisión.
 *
 * Si el insumo está en recetas:
 * 1. Marca el insumo como inactivo
 * 2. Pasa todos los productos ELABORADOS que lo usan a estado EN_REVISION
 * 3. Registra qué insumo causó la revisión
 *
 * Si el insumo es reventa:
 * 1. Marca como inactivo (baja lógica)
 */
export async function darDeBajaInsumo(
  insumoId: number,
  motivo: string,
  db: PrismaClient = prisma
) {
  const insumo = await db.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  return db.$transaction(async (tx: any) => {
    // Marcar insumo como inactivo
    const insumoBaja = await tx.insumo.update({
      where: { id: insumoId },
      data: {
        activo: false,
        fecha_baja: new Date(),
        motivo_baja: motivo,
      },
    });

    // Productos ELABORADOS que usan este insumo en su receta
    const recetasAfectadas = await tx.recetasProducto.findMany({
      where: { insumo_id: insumoId, producto: { tipo: 'ELABORADO' } },
      include: { producto: { select: { id: true, nombre: true } } },
    });

    // Productos de REVENTA mapeados 1:1 a este insumo (ej. Agua Vital):
    // sin el insumo no hay nada que vender, también pasan a revisión.
    const reventasAfectadas = await tx.producto.findMany({
      where: { insumo_reventa_id: insumoId },
      select: { id: true, nombre: true },
    });

    const afectados = [
      ...recetasAfectadas.map((rp: any) => ({ id: rp.producto.id, nombre: rp.producto.nombre })),
      ...reventasAfectadas,
    ];

    if (afectados.length > 0) {
      await tx.producto.updateMany({
        where: { id: { in: afectados.map((p: { id: number }) => p.id) } },
        data: {
          en_revision: true,
          revision_desde: new Date(),
          motivo_revision: `Insumo "${insumo.nombre}" fue dado de baja. Motivo: ${motivo}`,
          insumo_causa_revision_id: insumoId,
        },
      });
    }

    return {
      insumo: insumoBaja,
      productosEnRevision: afectados.length,
      productos: afectados,
    };
  });
}

/**
 * Resolver producto en revisión: cambiar a estado anterior y limpiar flags.
 * Se usa cuando el usuario editó la receta y la resolvió.
 */
export async function resolverProductoEnRevision(
  productoId: number,
  db: PrismaClient = prisma
) {
  const producto = await db.producto.findUnique({ where: { id: productoId } });
  if (!producto) throw new NotFoundError('Producto no encontrado');
  if (!producto.en_revision) throw new ConflictError('Producto no está en revisión');

  return db.producto.update({
    where: { id: productoId },
    data: {
      en_revision: false,
      revision_desde: null,
      motivo_revision: null,
      insumo_causa_revision_id: null,
    },
  });
}

/**
 * Listar productos en revisión de la sucursal.
 */
export async function listarProductosEnRevision(db: PrismaClient = prisma) {
  return db.producto.findMany({
    where: { en_revision: true },
    include: {
      recetaProducto_id: {
        include: { insumo: true },
      },
      categoria_id: {
        include: { categoria: true },
      },
    },
    orderBy: { revision_desde: 'desc' },
  });
}

/**
 * Reactivar un insumo que fue dado de baja.
 * Automáticamente resuelve los productos que estaban en revisión por culpa de este insumo.
 */
export async function reactivarInsumo(insumoId: number, db: PrismaClient = prisma) {
  const insumo = await db.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');
  if (insumo.activo) throw new ConflictError('Insumo ya está activo');

  return db.$transaction(async (tx: any) => {
    // Reactivar insumo
    const insumoReactivado = await tx.insumo.update({
      where: { id: insumoId },
      data: {
        activo: true,
        fecha_baja: null,
        motivo_baja: null,
      },
    });

    // Resolver productos que estaban en revisión por ESTE insumo
    const productosResueltos = await tx.producto.updateMany({
      where: {
        insumo_causa_revision_id: insumoId,
        en_revision: true,
      },
      data: {
        en_revision: false,
        revision_desde: null,
        motivo_revision: null,
        insumo_causa_revision_id: null,
      },
    });

    return {
      insumo: insumoReactivado,
      productosResueltos: productosResueltos.count,
    };
  });
}
