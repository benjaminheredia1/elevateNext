/**
 * Conversión de unidades para la ENTRADA de datos en la UI.
 * La BD guarda cantidades y costos siempre en la unidad base del insumo;
 * estas funciones convierten lo que el usuario teclea hacia esa base.
 * Solo se convierte dentro de la misma dimensión física (peso ↔ peso,
 * volumen ↔ volumen); UNIDAD y unidades personalizadas no se convierten.
 */
export type DimensionUnidad = 'PESO' | 'VOLUMEN' | 'CONTEO' | 'OTRA';

const CATALOGO: Record<string, { dim: DimensionUnidad; factor: number; label: string }> = {
  GR: { dim: 'PESO', factor: 1, label: 'gr' },
  KG: { dim: 'PESO', factor: 1000, label: 'kg' },
  OZ: { dim: 'PESO', factor: 28.35, label: 'oz' },
  LB: { dim: 'PESO', factor: 453.59, label: 'lb' },
  ML: { dim: 'VOLUMEN', factor: 1, label: 'ml' },
  LT: { dim: 'VOLUMEN', factor: 1000, label: 'lt' },
  OZ_FL: { dim: 'VOLUMEN', factor: 29.57, label: 'oz fl' },
  UNIDAD: { dim: 'CONTEO', factor: 1, label: 'unidad' },
};

export function infoUnidad(u: string) {
  return CATALOGO[u.trim().toUpperCase()] ?? null;
}

export function dimensionDe(u: string): DimensionUnidad {
  return infoUnidad(u)?.dim ?? 'OTRA';
}

/** Unidades en las que se puede teclear un valor para un insumo cuya unidad base es `base`. */
export function unidadesEntrada(base: string): { key: string; label: string }[] {
  const info = infoUnidad(base);
  if (!info || info.dim === 'CONTEO' || info.dim === 'OTRA') {
    return [{ key: base.trim().toUpperCase(), label: base.trim().toLowerCase() || '—' }];
  }
  return Object.entries(CATALOGO)
    .filter(([, v]) => v.dim === info.dim)
    .map(([key, v]) => ({ key, label: v.label }));
}

/** Convierte una cantidad entre unidades de la misma dimensión; null si no son compatibles. */
export function convertir(cantidad: number, de: string, a: string): number | null {
  const iDe = infoUnidad(de);
  const iA = infoUnidad(a);
  if (!iDe || !iA || iDe.dim !== iA.dim) {
    return de.trim().toUpperCase() === a.trim().toUpperCase() ? cantidad : null;
  }
  return (cantidad * iDe.factor) / iA.factor;
}

export function redondearCantidad(n: number, decimales = 4): number {
  return Number(n.toFixed(decimales));
}
