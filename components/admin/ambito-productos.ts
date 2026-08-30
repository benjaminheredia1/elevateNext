/**
 * A quién le pega una acción del catálogo de productos.
 *
 * La misma pantalla sirve al Centro y a la sucursal, y el local elegido queda
 * guardado en el navegador. Sin esta decisión explícita, entrar desde el Centro
 * seguía arrastrando ese local: dar de baja fallaba con "el producto no está
 * habilitado en esa sucursal" y —peor, porque no avisa— publicar o archivar le
 * tocaba el menú a ese local.
 *
 * Son tres inventarios distintos y ninguna baja viaja entre ellos:
 *
 * - `centro`   → el centro deja de abastecer ese producto. Las sucursales que
 *                ya lo venden siguen igual: el centro solo abastece.
 * - `sucursal` → sale de la carta de ESE local. Los demás y el centro, intactos.
 * - `catalogo` → el producto deja de existir para el negocio, y su insumo
 *                espejo se apaga en todos los locales. Es del dueño en
 *                consolidado, nunca del Centro.
 */
export type AmbitoProductos = 'sucursal' | 'centro';
export type DestinoBaja = 'centro' | 'sucursal' | 'catalogo';

/**
 * La sucursal sobre la que operan las acciones. En el Centro, ninguna: lo que
 * se hace ahí no le cambia la carta a ningún local.
 */
export function sucursalDeLasAcciones(ambito: AmbitoProductos, guardada: string): string {
  return ambito === 'centro' ? '' : guardada;
}

export function destinoDeLaBaja(ambito: AmbitoProductos, guardada: string): DestinoBaja {
  if (ambito === 'centro') return 'centro';
  return sucursalDeLasAcciones(ambito, guardada) ? 'sucursal' : 'catalogo';
}
