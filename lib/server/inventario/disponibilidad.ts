/**
 * disponibilidad.ts
 * Calcula el RINDE (porciones que se pueden producir con el stock actual) y
 * si un producto está agotado, replicando la misma lógica que la columna
 * RINDE del panel de admin para mantener consistencia.
 */

type RecetaItem = { cantidad_utilizada: number; insumo?: { stock_actual: number } | null };

interface ProductoLike {
  recetaProducto_id?: RecetaItem[] | null;
  insumo_reventa?: { stock_actual: number } | null;
}

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
    const rinde = Math.floor(p.insumo_reventa.stock_actual);
    return { rinde, stockTracked: true, agotado: rinde <= 0 };
  }

  // ELABORADO: mínimo de floor(stock / cantidad) sobre los insumos de la receta.
  const receta = p.recetaProducto_id ?? [];
  if (receta.length > 0) {
    let min = Infinity;
    for (const item of receta) {
      if (!item.cantidad_utilizada || item.cantidad_utilizada <= 0) continue;
      const stock = item.insumo?.stock_actual ?? 0;
      min = Math.min(min, Math.floor(stock / item.cantidad_utilizada));
    }
    const rinde = min === Infinity ? null : min;
    return { rinde, stockTracked: rinde !== null, agotado: rinde !== null && rinde <= 0 };
  }

  // Sin receta ni insumo de reventa: no se rastrea stock → nunca se bloquea.
  return { rinde: null, stockTracked: false, agotado: false };
}
