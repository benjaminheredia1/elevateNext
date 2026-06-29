/* ============================================================
 *  Helpers de inventario / ingeniería de menú (Fase 1)
 *  Adaptados a los DATOS REALES del backend (no al mock del zip).
 *  Funciones agnósticas de forma: la tabla y el wizard mapean
 *  sus datos a estas firmas mínimas.
 * ============================================================ */

/* ---- Food cost (umbrales del zip) ---- */
/** Color del badge de food cost. <35% verde · 35–40% ámbar · >40% rojo. */
export const foodCostColor = (pct: number): string =>
  pct < 35 ? 'var(--fresh)' : pct <= 40 ? 'var(--amber)' : 'var(--danger)'

/* ---- Ingeniería de menú (matriz popularidad × rentabilidad) ---- */
export type MenuClass = 'Estrella' | 'Caballo' | 'Puzzle' | 'Perro'

export const menuClassMeta: Record<MenuClass, { icon: string; color: string }> = {
  Estrella: { icon: '⭐', color: 'var(--fresh)' },
  Caballo: { icon: '🐴', color: 'var(--info)' },
  Puzzle: { icon: '🧩', color: 'var(--amber)' },
  Perro: { icon: '🐶', color: 'var(--danger)' },
}

/** Clasifica un plato cruzando ventas (popularidad) × margen (rentabilidad). */
export function classifyMenu(sales: number, margin: number, avgSales: number, avgMargin: number): MenuClass {
  const popular = sales >= avgSales
  const profitable = margin >= avgMargin
  if (popular && profitable) return 'Estrella'
  if (popular && !profitable) return 'Caballo'
  if (!popular && profitable) return 'Puzzle'
  return 'Perro'
}

/* ---- Rinde (porciones que alcanzan con el stock actual) ---- */
export interface PortionInput {
  /** stock disponible del insumo (en su unidad) */
  stock: number
  /** cantidad utilizada por porción */
  cantidad: number
}

/**
 * Porciones armables = mín( floor(stock / cantidad) ) sobre la receta.
 * Para producto de reventa, pasar un único ítem { stock, cantidad: 1 }.
 */
export function buildablePortions(items: PortionInput[]): number {
  if (!items || items.length === 0) return 0
  let min = Infinity
  for (const { stock, cantidad } of items) {
    if (!cantidad || cantidad <= 0) continue
    min = Math.min(min, Math.floor(stock / cantidad))
  }
  return min === Infinity ? 0 : min
}

/* ---- Costo de receta en vivo (para el wizard) ---- */
export interface RecipeCostInput {
  /** costo unitario del insumo (costo_promedio) */
  costo: number
  /** cantidad utilizada por porción */
  cantidad: number
}

/** Costo total de una ficha técnica = Σ (costo_promedio × cantidad). */
export function computeRecipeCost(items: RecipeCostInput[]): number {
  if (!items || items.length === 0) return 0
  return items.reduce((sum, it) => sum + (it.costo || 0) * (it.cantidad || 0), 0)
}

/** Food cost % a partir de costo y precio (0 si no hay precio). */
export function foodCostPct(costo: number, precio: number): number {
  return precio > 0 ? (costo / precio) * 100 : 0
}
