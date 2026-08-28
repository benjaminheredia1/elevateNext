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
  } else if (!producto.insumo_reventa_id && !producto.tiene_nuevo_insumo_reventa) {
    // Un ELABORADO con insumo espejo se publica sin receta local: nace en el
    // Centro, su ficha de producción vive en RecetaCentro y la sucursal lo
    // vende contra el espejo, 1:1. Exigirle receta acá le pedía algo que por
    // diseño ya no puede tener, y lo dejaba imposible de publicar.
    //
    // Sin espejo NI receta sigue sin publicarse: no habría de dónde descontar
    // al vender.
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
