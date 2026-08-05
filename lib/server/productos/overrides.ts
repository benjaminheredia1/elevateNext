/**
 * overrides.ts
 *
 * Resolución de la ficha de un producto EN UNA SUCURSAL.
 *
 * El catálogo (`Producto`) guarda una sola identidad por producto, para no
 * duplicar filas y poder comparar cuánto vende el mismo plato en cada local. Lo
 * que cada sucursal puede cambiar vive en su `ProductoSucursal`: mientras el
 * campo esté en null hereda del catálogo, y al escribirlo queda fijo en ese
 * local sin afectar a los demás. Editar un producto desde la sucursal B nunca
 * toca lo que ve la sucursal A.
 *
 * Categorías y marcas siguen la misma regla con las filas puente: las de
 * `sucursal_id = null` son las del catálogo y las hereda todo el mundo; si un
 * local define las suyas, esas reemplazan a las heredadas solo para él.
 */
import type { EstadoPublicacion } from '@prisma/client';

/** Campos del catálogo que una sucursal puede sobrescribir. */
export interface CamposCatalogo {
  nombre: string;
  descripcion: string;
  precio: unknown;
  imagen_url: string | null;
  disponible: boolean;
  estado_publicacion: EstadoPublicacion;
  calorias: number | null;
  proteina: string | null;
  en_revision: boolean;
  revision_desde: Date | null;
  motivo_revision: string | null;
  insumo_causa_revision_id: number | null;
}

/** La habilitación del producto en la sucursal, con sus overrides. */
export interface HabilitacionSucursal {
  precio: unknown;
  disponible: boolean;
  nombre: string | null;
  imagen_url: string | null;
  descripcion: string | null;
  calorias: number | null;
  proteina: string | null;
  estado_publicacion: EstadoPublicacion | null;
  motivo_baja?: string | null;
  fecha_baja?: Date | null;
  en_revision?: boolean;
  revision_desde?: Date | null;
  motivo_revision?: string | null;
  insumo_causa_revision_id?: number | null;
}

/** Fila puente (categoría o marca) que puede ser del catálogo o de un local. */
export interface FilaPorSucursal {
  sucursal_id: number | null;
}

/**
 * Devuelve el producto tal como lo ve esa sucursal. Sin habilitación (dueño en
 * consolidado, pedidos viejos) devuelve el catálogo sin tocar.
 */
export function aplicarOverrides<T extends CamposCatalogo>(
  producto: T,
  enSucursal?: Partial<HabilitacionSucursal> | null,
): T {
  if (!enSucursal) return producto;
  return {
    ...producto,
    nombre:             enSucursal.nombre ?? producto.nombre,
    descripcion:        enSucursal.descripcion ?? producto.descripcion,
    imagen_url:         enSucursal.imagen_url ?? producto.imagen_url,
    calorias:           enSucursal.calorias ?? producto.calorias,
    proteina:           enSucursal.proteina ?? producto.proteina,
    estado_publicacion: enSucursal.estado_publicacion ?? producto.estado_publicacion,
    precio:             enSucursal.precio ?? producto.precio,
    // La disponibilidad no se hereda: la fila del local es la que manda sobre
    // su propio menú, incluso cuando el catálogo dice lo contrario.
    disponible:         enSucursal.disponible ?? producto.disponible,
    // La revisión tampoco: nace de la receta del local, que es suya. Que en Sur
    // falte un insumo no pone en revisión la ficha de Fitbull.
    en_revision:              enSucursal.en_revision ?? false,
    revision_desde:           enSucursal.revision_desde ?? null,
    motivo_revision:          enSucursal.motivo_revision ?? null,
    insumo_causa_revision_id: enSucursal.insumo_causa_revision_id ?? null,
  };
}

/**
 * Categorías/marcas vigentes en una sucursal: las propias si definió alguna,
 * las del catálogo si no. Sin sucursal (vista consolidada) devuelve las del
 * catálogo, que son las que esa vista edita.
 */
export function vigentesEnSucursal<T extends FilaPorSucursal>(
  filas: T[],
  sucursalId: number | null,
): T[] {
  if (sucursalId != null) {
    const propias = filas.filter(f => f.sucursal_id === sucursalId);
    if (propias.length > 0) return propias;
  }
  return filas.filter(f => f.sucursal_id === null);
}

/**
 * `true` si el local tiene ficha propia de categorías/marcas. Sirve para saber
 * si una edición debe reemplazar las del local o crear el override.
 */
export function tieneOverridePropio(filas: FilaPorSucursal[], sucursalId: number): boolean {
  return filas.some(f => f.sucursal_id === sucursalId);
}

/** Campos de la ficha que una sucursal puede tener propios o heredados. */
export const CAMPOS_HEREDABLES = [
  'nombre', 'descripcion', 'imagen_url', 'calorias', 'proteina', 'estado_publicacion',
  'categorias', 'marcas',
] as const;
export type CampoHeredable = typeof CAMPOS_HEREDABLES[number];

/** Qué campos está heredando del catálogo esta sucursal. */
export type MapaHerencia = Record<CampoHeredable, boolean>;

/**
 * Producto listo para mostrar en una sucursal: overrides aplicados, categorías
 * y marcas vigentes, y el mapa de qué se hereda.
 *
 * Es el ÚNICO punto por el que deberían pasar las lecturas de producto que se
 * muestran en el contexto de un local. Resolverlo a mano en cada endpoint es
 * cómo se cuelan pantallas mostrando el nombre del catálogo en una sucursal
 * que lo tiene sobrescrito.
 */
export function resolverProducto<
  T extends CamposCatalogo & {
    categoria_id?: FilaPorSucursal[];
    marcas?: FilaPorSucursal[];
    sucursales?: Partial<HabilitacionSucursal>[];
  },
>(producto: T, sucursalId: number | null) {
  const enSucursal = sucursalId != null ? producto.sucursales?.[0] ?? null : null;
  const resuelto = aplicarOverrides(producto, enSucursal);

  return {
    ...resuelto,
    ...(producto.categoria_id ? { categoria_id: vigentesEnSucursal(producto.categoria_id, sucursalId) } : {}),
    ...(producto.marcas ? { marcas: vigentesEnSucursal(producto.marcas, sucursalId) } : {}),
    sucursal_id: sucursalId,
    heredado: mapaHerencia(producto, enSucursal, sucursalId),
  };
}

/**
 * Qué campos vienen del catálogo y cuáles son propios del local. Lo consume la
 * interfaz para decirlo en pantalla: sin esto, el usuario no puede saber si al
 * guardar está por congelar un valor o si va a seguir los cambios del catálogo.
 */
export function mapaHerencia(
  producto: { categoria_id?: FilaPorSucursal[]; marcas?: FilaPorSucursal[] },
  enSucursal: Partial<HabilitacionSucursal> | null | undefined,
  sucursalId: number | null,
): MapaHerencia {
  // En consolidado se edita el catálogo: no hay nada que heredar.
  if (sucursalId == null || !enSucursal) {
    return Object.fromEntries(CAMPOS_HEREDABLES.map(c => [c, false])) as MapaHerencia;
  }
  return {
    nombre:             enSucursal.nombre == null,
    descripcion:        enSucursal.descripcion == null,
    imagen_url:         enSucursal.imagen_url == null,
    calorias:           enSucursal.calorias == null,
    proteina:           enSucursal.proteina == null,
    estado_publicacion: enSucursal.estado_publicacion == null,
    categorias:         !tieneOverridePropio(producto.categoria_id ?? [], sucursalId),
    marcas:             !tieneOverridePropio(producto.marcas ?? [], sucursalId),
  };
}
