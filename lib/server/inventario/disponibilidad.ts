/**
 * disponibilidad.ts
 * Calcula el RINDE (porciones que se pueden producir con el stock actual) y
 * si un producto está agotado, replicando la misma lógica que la columna
 * RINDE del panel de admin para mantener consistencia.
 */

/**
 * El insumo puede traer `stocks` (filas de StockSucursal ya filtradas por el
 * local que se está consultando). Cuando viene, manda: el rinde debe salir del
 * stock DE ESE LOCAL. Con el agregado del negocio, una sucursal en cero se veía
 * abastecida por el stock de la otra y dejaba vender lo que no tenía.
 */
type InsumoStock = {
  stock_actual: number;
  activo?: boolean;
  stocks?: { stock_actual: number; activo?: boolean }[] | null;
};
type RecetaItem = { cantidad_utilizada: number; insumo?: InsumoStock | null };

interface ProductoLike {
  recetaProducto_id?: RecetaItem[] | null;
  insumo_reventa?: InsumoStock | null;
}

// Un insumo dado de baja no es vendible aunque le quede stock residual.
const stockDisponible = (insumo: InsumoStock) => {
  // `stocks` presente = consulta con sucursal. Array vacío significa que ese
  // local no maneja el insumo: es cero, no se hereda el total del negocio.
  if (insumo.stocks) {
    const local = insumo.stocks[0];
    // La baja es del local: acá manda su fila, no el agregado del negocio. Un
    // insumo de baja en Sur no rinde en Sur aunque Fitbull lo siga usando.
    if (!local || local.activo === false) return 0;
    return local.stock_actual;
  }
  if (insumo.activo === false) return 0;
  return insumo.stock_actual;
};

export interface RindeInfo {
  /** Porciones producibles con el stock actual. null = no se rastrea stock. */
  rinde: number | null;
  /** true si el producto descuenta insumos (elaborado con receta o reventa). */
  stockTracked: boolean;
  /** true si está rastreado y ya no se puede producir ni una unidad más. */
  agotado: boolean;
}

export function calcularRinde(p: ProductoLike): RindeInfo {
  // REVENTA: mapeo 1:1 a un insumo (1 producto = 1 unidad).
  if (p.insumo_reventa) {
    const rinde = Math.floor(stockDisponible(p.insumo_reventa));
    return { rinde, stockTracked: true, agotado: rinde <= 0 };
  }

  // ELABORADO: mínimo de floor(stock / cantidad) sobre los insumos de la receta.
  const receta = p.recetaProducto_id ?? [];
  if (receta.length > 0) {
    let min = Infinity;
    for (const item of receta) {
      if (!item.cantidad_utilizada || item.cantidad_utilizada <= 0) continue;
      const stock = item.insumo ? stockDisponible(item.insumo) : 0;
      min = Math.min(min, Math.floor(stock / item.cantidad_utilizada));
    }
    const rinde = min === Infinity ? null : min;
    return { rinde, stockTracked: rinde !== null, agotado: rinde !== null && rinde <= 0 };
  }

  // Sin receta ni insumo de reventa: no se rastrea stock → nunca se bloquea.
  return { rinde: null, stockTracked: false, agotado: false };
}
