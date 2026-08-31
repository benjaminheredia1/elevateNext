export type ProductoTipo = 'ELABORADO' | 'REVENTA' | 'TERCIADO';

/**
 * Cómo se rotula el tipo de un producto según quién lo mira.
 *
 * Desde que el Centro es el único origen, al mostrador no le importa si el
 * Centro lo hornea o lo compra: le llega hecho, en unidades, y lo vende igual.
 * Mostrarle "Elaborado" invitaría a buscar una receta que la sucursal ya no
 * tiene y no puede tocar.
 *
 * En el Centro sí importa la diferencia: es quien decide si producirlo o
 * comprarlo, y de eso depende que tenga receta y consuma insumo bruto.
 *
 * El dato en la BD no cambia: `Producto.tipo` sigue siendo el real. Esto es
 * solo el rótulo, y por eso vive en el frontend y no en el modelo.
 */
export function etiquetaTipo(tipo: ProductoTipo | string, ambito: 'sucursal' | 'centro'): string {
  if (ambito === 'sucursal') return 'Terciado';
  // En el Centro solo existen dos: lo que produce y lo que compra. Un producto
  // viejo marcado TERCIADO cae en "Reventa", que es lo que es desde acá:
  // mercadería que el Centro compra hecha y despacha.
  return tipo === 'ELABORADO' ? 'Elaborado' : 'Reventa';
}
