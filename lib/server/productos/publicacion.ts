import { ValidationError } from '@/lib/server/errors';
import { monto, type MontoLike } from '@/lib/server/productos/precio';

export type ProductoPublicable = {
  nombre: string;
  descripcion: string;
  precio: MontoLike;
  imagen_url: string | null;
  tipo: 'ELABORADO' | 'REVENTA' | 'TERCIADO';
  insumo_reventa_id: number | null;
  /** true si se creará el insumo de reventa junto con el producto */
  tiene_nuevo_insumo_reventa?: boolean;
  marcas: unknown[];
  recetaProducto_id: { cantidad_utilizada: number; insumo_id: number }[];
};

export function faltantesPublicacion(producto: ProductoPublicable) {
  const faltantes: string[] = [];

  if (!producto.nombre.trim()) faltantes.push('nombre');
  if (!(monto(producto.precio) > 0)) faltantes.push('precio de venta');
  if (producto.marcas.length === 0) faltantes.push('menu donde aparecera');

  // Un terciado se publica igual que un producto de reventa: lo que necesita es
  // un insumo propio del que descontar, no una receta local.
  if (producto.tipo !== 'ELABORADO') {
    if (!producto.insumo_reventa_id && !producto.tiene_nuevo_insumo_reventa) {
      // El texto cambia con el tipo porque va directo al mensaje de error: a
      // quien publica un terciado, "falta insumo de reventa" no le dice nada.
      faltantes.push(producto.tipo === 'TERCIADO' ? 'insumo de inventario' : 'insumo de reventa');
    }
  } else {
    const recetaValida = producto.recetaProducto_id.length > 0
      && producto.recetaProducto_id.every((item) => item.insumo_id > 0 && item.cantidad_utilizada > 0);
    if (!recetaValida) faltantes.push('receta con insumos y cantidades validas');
  }

  return faltantes;
}

export function assertPublicable(producto: ProductoPublicable) {
  const faltantes = faltantesPublicacion(producto);
  if (faltantes.length > 0) {
    throw new ValidationError(`No se puede publicar: falta ${faltantes.join(', ')}.`);
  }
}
