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

  const motivoBaja = `${PREFIJO_BAJA_POR_PRODUCTO} "${producto.nombre}". Motivo: ${motivo}`;
  await tx.insumo.update({
    where: { id: insumoId },
    data: { activo: false, fecha_baja: new Date(), motivo_baja: motivoBaja },
  });
  // Esta cascada nace de la baja del producto en TODO el catálogo, así que el
  // insumo espejo sale del inventario de todos los locales: ninguno lo vende ya.
  await tx.stockSucursal.updateMany({
    where: { insumo_id: insumoId, activo: true },
    data: { activo: false, fecha_baja: new Date(), motivo_baja: motivoBaja },
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
  // Se revierte la cascada en los locales que la sufrieron: los que ya lo
  // habían dado de baja por su cuenta tienen otro motivo y no se tocan.
  await tx.stockSucursal.updateMany({
    where: { insumo_id: insumoReventaId, activo: false, motivo_baja: { startsWith: PREFIJO_BAJA_POR_PRODUCTO } },
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
  sucursalId: number,
  db: PrismaClient = prisma
) {
  const insumo = await db.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  const enSucursal = await db.stockSucursal.findUnique({
    where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
  });
  if (!enSucursal) throw new NotFoundError('El insumo no está en el inventario de esa sucursal');
  if (!enSucursal.activo) throw new ConflictError('El insumo ya está de baja en esta sucursal');

  return db.$transaction(async (tx: any) => {
    // La baja es DE ESTE LOCAL: las demás sucursales lo siguen usando.
    const bajaLocal = await tx.stockSucursal.update({
      where: { id: enSucursal.id },
      data: { activo: false, fecha_baja: new Date(), motivo_baja: motivo },
    });

    // Productos ELABORADOS cuya receta EN ESTA SUCURSAL usa el insumo. La ficha
    // técnica es del local, así que solo se revisan sus habilitaciones.
    const recetasAfectadas = await tx.recetasProducto.findMany({
      where: { insumo_id: insumoId, sucursal_id: sucursalId, producto: { tipo: 'ELABORADO' } },
      include: { producto: { select: { id: true, nombre: true } } },
    });

    // Productos de REVENTA mapeados 1:1 a este insumo (ej. Agua Vital) que este
    // local vende: sin el insumo no hay nada que vender acá.
    const reventasAfectadas = await tx.producto.findMany({
      where: { insumo_reventa_id: insumoId, sucursales: { some: { sucursal_id: sucursalId } } },
      select: { id: true, nombre: true },
    });

    const afectados = [
      ...recetasAfectadas.map((rp: any) => ({ id: rp.producto.id, nombre: rp.producto.nombre })),
      ...reventasAfectadas,
    ];

    if (afectados.length > 0) {
      await tx.productoSucursal.updateMany({
        where: { producto_id: { in: afectados.map((p: { id: number }) => p.id) }, sucursal_id: sucursalId },
        data: {
          en_revision: true,
          revision_desde: new Date(),
          motivo_revision: `Insumo "${insumo.nombre}" fue dado de baja en esta sucursal. Motivo: ${motivo}`,
          insumo_causa_revision_id: insumoId,
        },
      });
    }

    const agregados = await sincronizarAgregados(tx, insumoId, afectados.map((p: { id: number }) => p.id));

    return {
      insumo: { ...insumo, ...agregados.insumo, activo_en_sucursal: false, sucursal_id: sucursalId },
      stock_sucursal: bajaLocal,
      productosEnRevision: afectados.length,
      productos: afectados,
    };
  });
}

/**
 * Recalcula los agregados del negocio a partir de las filas de sucursal.
 *
 * `Insumo.activo` y `Producto.en_revision` dejaron de ser la verdad operativa
 * —esa vive en el local—, pero los siguen leyendo reportes y pantallas todavía
 * no migrados. Se derivan, en vez de escribirse a mano, para que no puedan
 * contradecir a las sucursales:
 *   - el insumo está de baja para el negocio cuando NINGÚN local lo usa ya;
 *   - el producto figura en revisión mientras ALGÚN local lo tenga en revisión.
 */
async function sincronizarAgregados(tx: any, insumoId: number, productoIds: number[]) {
  const filas = await tx.stockSucursal.findMany({
    where: { insumo_id: insumoId },
    select: { activo: true, motivo_baja: true, fecha_baja: true },
  });
  const activas = filas.filter((f: { activo: boolean }) => f.activo);
  const sinUso = filas.length > 0 && activas.length === 0;
  const ultimaBaja = filas.find((f: { activo: boolean }) => !f.activo);

  const insumo = await tx.insumo.update({
    where: { id: insumoId },
    data: sinUso
      ? { activo: false, fecha_baja: ultimaBaja?.fecha_baja ?? new Date(), motivo_baja: ultimaBaja?.motivo_baja ?? null }
      : { activo: true, fecha_baja: null, motivo_baja: null },
  });

  for (const productoId of productoIds) {
    const enRevision = await tx.productoSucursal.findFirst({
      where: { producto_id: productoId, en_revision: true },
      orderBy: { revision_desde: 'desc' },
    });
    await tx.producto.update({
      where: { id: productoId },
      data: enRevision
        ? {
            en_revision: true,
            revision_desde: enRevision.revision_desde,
            motivo_revision: enRevision.motivo_revision,
            insumo_causa_revision_id: enRevision.insumo_causa_revision_id,
          }
        : { en_revision: false, revision_desde: null, motivo_revision: null, insumo_causa_revision_id: null },
    });
  }

  return { insumo };
}

/**
 * Resolver producto en revisión: cambiar a estado anterior y limpiar flags.
 * Se usa cuando el usuario editó la receta y la resolvió.
 */
export async function resolverProductoEnRevision(
  productoId: number,
  sucursalId: number,
  db: PrismaClient = prisma
) {
  const enSucursal = await db.productoSucursal.findUnique({
    where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
  });
  if (!enSucursal) throw new NotFoundError('El producto no está habilitado en esa sucursal');
  if (!enSucursal.en_revision) throw new ConflictError('El producto no está en revisión en esta sucursal');

  return db.$transaction(async (tx: any) => {
    const resuelto = await tx.productoSucursal.update({
      where: { id: enSucursal.id },
      data: { en_revision: false, revision_desde: null, motivo_revision: null, insumo_causa_revision_id: null },
    });
    // El agregado del producto sigue en revisión si otro local lo está.
    const otra = await tx.productoSucursal.findFirst({
      where: { producto_id: productoId, en_revision: true },
      orderBy: { revision_desde: 'desc' },
    });
    await tx.producto.update({
      where: { id: productoId },
      data: otra
        ? {
            en_revision: true,
            revision_desde: otra.revision_desde,
            motivo_revision: otra.motivo_revision,
            insumo_causa_revision_id: otra.insumo_causa_revision_id,
          }
        : { en_revision: false, revision_desde: null, motivo_revision: null, insumo_causa_revision_id: null },
    });
    return resuelto;
  });
}

/**
 * Productos en revisión de una sucursal. Sin sucursal (dueño en consolidado)
 * devuelve los que están en revisión en algún local.
 */
export async function listarProductosEnRevision(sucursalId?: number, db: PrismaClient = prisma) {
  return db.producto.findMany({
    where: sucursalId != null
      ? { sucursales: { some: { sucursal_id: sucursalId, en_revision: true } } }
      : { sucursales: { some: { en_revision: true } } },
    include: {
      recetaProducto_id: {
        ...(sucursalId != null ? { where: { sucursal_id: sucursalId } } : {}),
        include: { insumo: true },
      },
      categoria_id: {
        include: { categoria: true },
      },
      ...(sucursalId != null ? { sucursales: { where: { sucursal_id: sucursalId } } } : {}),
    },
    orderBy: { revision_desde: 'desc' },
  });
}

/**
 * Reactivar un insumo que fue dado de baja.
 * Automáticamente resuelve los productos que estaban en revisión por culpa de este insumo.
 */
export async function reactivarInsumo(insumoId: number, sucursalId: number, db: PrismaClient = prisma) {
  const insumo = await db.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  const enSucursal = await db.stockSucursal.findUnique({
    where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
  });
  if (!enSucursal) throw new NotFoundError('El insumo no está en el inventario de esa sucursal');
  if (enSucursal.activo) throw new ConflictError('El insumo ya está activo en esta sucursal');

  return db.$transaction(async (tx: any) => {
    await tx.stockSucursal.update({
      where: { id: enSucursal.id },
      data: { activo: true, fecha_baja: null, motivo_baja: null },
    });

    // Se resuelven las revisiones que causó ESTE insumo EN ESTE LOCAL. Las de
    // otras sucursales siguen abiertas: allá el insumo puede seguir de baja.
    const enRevision = await tx.productoSucursal.findMany({
      where: { sucursal_id: sucursalId, en_revision: true, insumo_causa_revision_id: insumoId },
      select: { producto_id: true },
    });
    await tx.productoSucursal.updateMany({
      where: { sucursal_id: sucursalId, en_revision: true, insumo_causa_revision_id: insumoId },
      data: { en_revision: false, revision_desde: null, motivo_revision: null, insumo_causa_revision_id: null },
    });

    const { insumo: insumoReactivado } = await sincronizarAgregados(
      tx, insumoId, enRevision.map((r: { producto_id: number }) => r.producto_id),
    );

    return {
      insumo: insumoReactivado,
      productosResueltos: enRevision.length,
      sucursal_id: sucursalId,
    };
  });
}
