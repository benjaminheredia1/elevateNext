export interface LineaReceta {
  insumo_id: number;
  cantidad_utilizada: number;
}

/**
 * Qué agrega al cuerpo del alta el hecho de que venga del Centro.
 *
 * Vive aparte del wizard y no inline porque la regla tiene dos mitades que se
 * confundieron una vez y dejaron el sistema sin poder crear productos de
 * reventa:
 *
 * - `centro_id` va SIEMPRE que el alta salga del Centro, sea lo que sea el
 *   producto. Es lo que el servidor exige desde que el Centro es el único
 *   origen; sin él responde 422. Atarlo al tipo dejaba a los de reventa sin
 *   forma de crearse en ningún lado, porque la sucursal ya no da de alta.
 * - `receta_centro` va solo si el producto LLEVA receta. Un reventa no la
 *   tiene: el Centro lo compra, no lo produce.
 */
export function extrasDelCentro(
  centroId: number | undefined,
  tipo: string,
  receta: LineaReceta[],
): { centro_id?: number; receta_centro?: LineaReceta[] } {
  if (!centroId) return {};

  const extras: { centro_id: number; receta_centro?: LineaReceta[] } = { centro_id: centroId };
  if (tipo === 'ELABORADO') {
    extras.receta_centro = receta.map(({ insumo_id, cantidad_utilizada }) => ({ insumo_id, cantidad_utilizada }));
  }
  return extras;
}
