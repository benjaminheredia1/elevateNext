/**
 * catalogo-sucursal.service.ts
 *
 * Qué vende cada sucursal. El producto es uno solo en el catálogo (identidad,
 * descripción, categoría); la sucursal define su precio, su disponibilidad y,
 * opcionalmente, su nombre y foto. Al habilitar un producto en otra sucursal se
 * copia la receta de la sucursal de origen como punto de partida — desde ese
 * momento son independientes.
 */
import prisma from '@/lib/prisma';
import { Prisma, type EstadoPublicacion } from '@prisma/client';
import { NotFoundError, ValidationError } from '@/lib/server/errors';
import { aplicarOverrides } from '@/lib/server/productos/overrides';

type Db = Prisma.TransactionClient | typeof prisma;

export interface HabilitacionInput {
  precio?: number;
  disponible?: boolean;
  /** Overrides del local. En null hereda del catálogo. */
  nombre?: string | null;
  imagen_url?: string | null;
  descripcion?: string | null;
  calorias?: number | null;
  proteina?: string | null;
  estado_publicacion?: EstadoPublicacion | null;
  /** Sucursal de la que copiar la receta al habilitar. */
  copiar_receta_de?: number;
}

/** Campos que la sucursal puede sobrescribir, para copiarlos de un local a otro. */
const CAMPOS_OVERRIDE = ['nombre', 'imagen_url', 'descripcion', 'calorias', 'proteina', 'estado_publicacion'] as const;

/** Datos visibles de un producto en una sucursal, ya resueltos los overrides. */
export interface ProductoEnSucursal {
  producto_id: number;
  sucursal_id: number;
  nombre: string;
  imagen_url: string | null;
  precio: number;
  disponible: boolean;
  /** true si el nombre o la foto están sobrescritos en esta sucursal. */
  personalizado: boolean;
}

/**
 * Catálogo de una sucursal. `soloDisponibles` es lo que necesita el menú
 * público; el admin quiere ver también lo deshabilitado.
 */
export async function catalogoDeSucursal(
  sucursalId: number,
  { soloDisponibles = true, db = prisma as Db } = {},
): Promise<ProductoEnSucursal[]> {
  const filas = await db.productoSucursal.findMany({
    where: {
      sucursal_id: sucursalId,
      ...(soloDisponibles ? { disponible: true } : {}),
    },
    include: { producto: true },
    orderBy: { producto_id: 'asc' },
  });

  return filas
    // El estado de publicación puede estar sobrescrito por el local, así que se
    // filtra con la ficha ya resuelta y no con la del catálogo.
    .map(fila => ({ fila, resuelto: aplicarOverrides(fila.producto, fila) }))
    .filter(({ resuelto }) => !soloDisponibles || resuelto.estado_publicacion === 'PUBLICADO')
    .map(({ fila, resuelto }) => ({
      producto_id: fila.producto_id,
      sucursal_id: fila.sucursal_id,
      nombre: resuelto.nombre,
      imagen_url: resuelto.imagen_url,
      precio: Number(fila.precio),
      disponible: fila.disponible,
      personalizado: fila.nombre != null || fila.imagen_url != null,
    }));
}

/** Habilitaciones de un producto en todas las sucursales (pantalla de admin). */
export async function sucursalesDeProducto(productoId: number, db: Db = prisma) {
  const [sucursales, habilitaciones, recetas] = await Promise.all([
    db.sucursal.findMany({ where: { activa: true }, orderBy: { id: 'asc' }, select: { id: true, nombre: true } }),
    db.productoSucursal.findMany({ where: { producto_id: productoId } }),
    db.recetasProducto.groupBy({ by: ['sucursal_id'], where: { producto_id: productoId }, _count: { _all: true } }),
  ]);

  const porSucursal = new Map(habilitaciones.map(h => [h.sucursal_id, h]));
  const insumosPorSucursal = new Map(recetas.map(r => [r.sucursal_id, r._count._all]));

  return sucursales.map(s => {
    const habilitacion = porSucursal.get(s.id);
    return {
      sucursal_id: s.id,
      sucursal: s.nombre,
      habilitado: !!habilitacion,
      precio: habilitacion ? Number(habilitacion.precio) : null,
      disponible: habilitacion?.disponible ?? false,
      nombre: habilitacion?.nombre ?? null,
      imagen_url: habilitacion?.imagen_url ?? null,
      insumos_receta: insumosPorSucursal.get(s.id) ?? 0,
    };
  });
}

/**
 * Habilita (o actualiza) un producto en una sucursal. Al habilitarlo por
 * primera vez copia la receta indicada, de modo que no haya que reescribir la
 * ficha técnica; después las dos son independientes.
 */
export async function habilitarProductoEnSucursal(
  productoId: number,
  sucursalId: number,
  input: HabilitacionInput = {},
  db: Db = prisma,
) {
  const producto = await db.producto.findUnique({
    where: { id: productoId },
    select: { id: true, precio: true, tipo: true, insumo_reventa_id: true },
  });
  if (!producto) throw new NotFoundError('Producto no encontrado');

  const sucursal = await db.sucursal.findUnique({ where: { id: sucursalId }, select: { id: true, activa: true } });
  if (!sucursal) throw new ValidationError('La sucursal indicada no existe');
  if (!sucursal.activa) throw new ValidationError('La sucursal indicada está desactivada');

  const precio = input.precio ?? Number(producto.precio);
  // Un producto traído de otra sucursal entra sin precio: el local le pone el
  // suyo. Se admite el cero solo si además entra fuera de venta, para que nunca
  // llegue a la carta a Bs 0; con `disponible` distinto de false se sigue
  // exigiendo un precio real.
  const entraFueraDeVenta = input.disponible === false;
  if (!(precio > 0) && !(precio === 0 && entraFueraDeVenta)) {
    throw new ValidationError('El precio de venta debe ser mayor a cero');
  }

  const yaHabilitado = await db.productoSucursal.findUnique({
    where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
    select: { id: true },
  });

  // Los overrides solo se escriben si vienen en el pedido: lo que no llega se
  // deja como está, y en el alta queda en null (heredando del catálogo).
  const overrides = Object.fromEntries(
    CAMPOS_OVERRIDE.filter(campo => input[campo] !== undefined).map(campo => [campo, input[campo]]),
  );

  const habilitacion = await db.productoSucursal.upsert({
    where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
    create: {
      producto_id: productoId,
      sucursal_id: sucursalId,
      precio,
      disponible: input.disponible ?? true,
      ...overrides,
    },
    update: {
      precio,
      ...(input.disponible !== undefined ? { disponible: input.disponible } : {}),
      ...overrides,
    },
  });

  // La copia de ficha técnica solo ocurre en el alta, y solo si la sucursal
  // destino aún no tiene una propia: nunca pisa una receta ya ajustada.
  if (!yaHabilitado && input.copiar_receta_de) {
    if (producto.tipo === 'ELABORADO') {
      await copiarReceta(productoId, input.copiar_receta_de, sucursalId, db);
    } else if (producto.insumo_reventa_id != null) {
      // Reventa: no hay receta, pero el producto ES un insumo. Sin darlo de alta
      // acá, el local lo vendía sin descontar nada de su inventario y sin costo.
      await habilitarInsumosEnSucursal([producto.insumo_reventa_id], sucursalId, db);
    }
  }

  return habilitacion;
}

/** Copia la ficha técnica de un producto de una sucursal a otra. */
export async function copiarReceta(
  productoId: number,
  desdeSucursal: number,
  haciaSucursal: number,
  db: Db = prisma,
) {
  if (desdeSucursal === haciaSucursal) return 0;

  const yaTiene = await db.recetasProducto.count({
    where: { producto_id: productoId, sucursal_id: haciaSucursal },
  });
  if (yaTiene > 0) return 0;

  const origen = await db.recetasProducto.findMany({
    where: { producto_id: productoId, sucursal_id: desdeSucursal },
    select: { insumo_id: true, cantidad_utilizada: true },
  });
  if (origen.length === 0) return 0;

  await db.recetasProducto.createMany({
    data: origen.map(item => ({
      producto_id: productoId,
      sucursal_id: haciaSucursal,
      insumo_id: item.insumo_id,
      cantidad_utilizada: item.cantidad_utilizada,
    })),
    skipDuplicates: true,
  });

  // Los insumos de la receta entran al inventario del destino, en CERO: una
  // ficha técnica que apunta a insumos que el local no maneja no puede
  // descontar stock ni calcular su costo, y el insumo ni siquiera aparecería
  // en su inventario. El stock no se copia — la mercadería no se mueve sola.
  await habilitarInsumosEnSucursal(origen.map(i => i.insumo_id), haciaSucursal, db);

  return origen.length;
}

/**
 * Da de alta en el inventario de una sucursal los insumos indicados, TODO en
 * cero: stock, costo promedio y niveles de alerta.
 *
 * Nada se toma de la sucursal de origen a propósito. El costo promedio es lo que
 * pagó ese otro local por su mercadería; heredarlo mete su plata en el CMV y el
 * food cost del local nuevo, que todavía no compró nada. Cada sucursal carga su
 * costo real al registrar su primera compra, y sus mínimos según cuánto venda.
 *
 * Los insumos que el local ya maneja no se tocan: esos números son suyos.
 */
async function habilitarInsumosEnSucursal(
  insumoIds: number[],
  haciaSucursal: number,
  db: Db = prisma,
) {
  if (insumoIds.length === 0) return 0;

  const yaEnDestino = await db.stockSucursal.findMany({
    where: { sucursal_id: haciaSucursal, insumo_id: { in: insumoIds } },
    select: { insumo_id: true },
  });
  const yaEstan = new Set(yaEnDestino.map(f => f.insumo_id));
  const faltantes = [...new Set(insumoIds)].filter(id => !yaEstan.has(id));
  if (faltantes.length === 0) return 0;

  await db.stockSucursal.createMany({
    data: faltantes.map(id => ({
      insumo_id: id,
      sucursal_id: haciaSucursal,
      stock_actual: 0,
      costo_promedio: 0,
      stock_minimo: 0,
      punto_critico: 0,
    })),
    skipDuplicates: true,
  });

  return faltantes.length;
}

/**
 * Retira un producto del menú de una sucursal. No borra el histórico: las
 * ventas ya hechas siguen apuntando al producto.
 */
export async function deshabilitarProductoEnSucursal(
  productoId: number,
  sucursalId: number,
  db: Db = prisma,
) {
  const habilitacion = await db.productoSucursal.findUnique({
    where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
    select: { id: true },
  });
  if (!habilitacion) throw new NotFoundError('El producto no está habilitado en esa sucursal');

  return db.productoSucursal.update({
    where: { id: habilitacion.id },
    data: { disponible: false },
  });
}

/**
 * Da de baja el producto SOLO en esta sucursal: sale de su menú con un motivo,
 * conservando precio, receta e historial para poder restaurarlo.
 *
 * Es la baja lógica del local, contraparte de `Producto.estado_publicacion =
 * BAJA`, que retira el producto de todo el negocio. Un local no puede sacar un
 * plato del menú de otro.
 */
export async function darDeBajaEnSucursal(
  productoId: number,
  sucursalId: number,
  motivo: string,
  db: Db = prisma,
) {
  const habilitacion = await db.productoSucursal.findUnique({
    where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
    select: { id: true },
  });
  if (!habilitacion) throw new NotFoundError('El producto no está habilitado en esa sucursal');

  return db.productoSucursal.update({
    where: { id: habilitacion.id },
    data: { disponible: false, motivo_baja: motivo, fecha_baja: new Date() },
  });
}

/** Devuelve al menú de la sucursal un producto dado de baja ahí. */
export async function restaurarEnSucursal(
  productoId: number,
  sucursalId: number,
  db: Db = prisma,
) {
  const habilitacion = await db.productoSucursal.findUnique({
    where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
    select: { id: true },
  });
  if (!habilitacion) throw new NotFoundError('El producto no está habilitado en esa sucursal');

  return db.productoSucursal.update({
    where: { id: habilitacion.id },
    data: { disponible: true, motivo_baja: null, fecha_baja: null },
  });
}

export type ModoQuitado = 'ELIMINADO' | 'DESHABILITADO';

export interface ResultadoQuitar {
  modo: ModoQuitado;
  /** Ventas del producto en ESA sucursal; > 0 impide borrar la habilitación. */
  ventas: number;
}

/**
 * Quita un producto del catálogo de UNA sucursal, sin tocar a las demás.
 *
 * Es la contracara de `habilitarProductoEnSucursal` y no debe confundirse con
 * eliminar el producto: la fila `Producto` es del negocio y se comparte, así que
 * borrarla afectaría a todos los locales y rompería su histórico de ventas.
 *
 * El criterio es el historial **de esa sucursal**:
 * - Sin ventas ahí, la habilitación y la receta local se borran: el producto
 *   desaparece de ese menú como si nunca hubiera estado.
 * - Con ventas ahí, no se borra nada —dejaría detalles de venta apuntando a una
 *   ficha inexistente— y solo se marca como no disponible.
 */
export async function quitarProductoDeSucursal(
  productoId: number,
  sucursalId: number,
  db: Db = prisma,
): Promise<ResultadoQuitar> {
  const habilitacion = await db.productoSucursal.findUnique({
    where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
    select: { id: true },
  });
  if (!habilitacion) throw new NotFoundError('El producto no está habilitado en esa sucursal');

  const ventas = await db.transaccionesDetalles.count({
    where: { producto_id: productoId, transaccion: { sucursal_id: sucursalId } },
  });

  if (ventas > 0) {
    await db.productoSucursal.update({
      where: { id: habilitacion.id },
      data: { disponible: false },
    });
    return { modo: 'DESHABILITADO', ventas };
  }

  await db.recetasProducto.deleteMany({ where: { producto_id: productoId, sucursal_id: sucursalId } });
  await db.productoSucursal.delete({ where: { id: habilitacion.id } });
  return { modo: 'ELIMINADO', ventas: 0 };
}

/**
 * Precio vigente de un producto en una sucursal. Cae al precio del catálogo si
 * la sucursal no lo tiene habilitado (pedidos antiguos, integraciones).
 */
export async function precioEnSucursal(
  productoId: number,
  sucursalId: number,
  db: Db = prisma,
): Promise<number | null> {
  const fila = await db.productoSucursal.findUnique({
    where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
    select: { precio: true, disponible: true },
  });
  if (!fila) return null;
  return Number(fila.precio);
}
