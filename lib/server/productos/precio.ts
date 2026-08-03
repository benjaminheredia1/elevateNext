/**
 * Cálculo de precio final de un producto con promociones activas.
 * Única fuente de verdad de precios: la usa GET /api/productos (tienda)
 * y POST /api/pedidos (validación server-side del total).
 */
import { promocionVigente, type ReglaVigencia } from '@/lib/server/promociones/vigencia';

interface PromocionLike {
  /** Texto histórico ("20%", "5"). Se usa solo si no hay campos tipados. */
  valor: string;
  modo_precio?: 'PORCENTAJE' | 'MONTO_DESCUENTO' | 'PRECIO_FIJO' | null;
  monto?: MontoLike | null;
  activo?: boolean;
  reglasHorarias_id: ReglaVigencia[];
  /**
   * Sucursales donde vale. Lista vacía = todas: es como se comportan las
   * promociones anteriores a multi-sucursal, que no tienen ninguna fila.
   */
  sucursales?: { sucursal_id: number; disponible: boolean }[];
}

interface PromocionProductoLike {
  promocionDescuentos: PromocionLike;
}

/** Acepta number (legacy) o Prisma.Decimal (columnas numeric). */
export type MontoLike = number | { toNumber(): number };

export function monto(v: MontoLike): number {
  return typeof v === 'number' ? v : v.toNumber();
}

export interface ProductoConPromos {
  precio: MontoLike;
  promocionProducto_id: PromocionProductoLike[];
}

export interface PrecioCalculado {
  /** Precio unitario final (con el mejor descuento activo aplicado). */
  precioFinal: number;
  /** Monto de descuento por unidad (0 si no hay promo activa). */
  descuento: number;
}

/** Include de Prisma necesario para que `calcularPrecioFinal` tenga las promos. */
export const includePromos = {
  promocionProducto_id: {
    include: {
      promocionDescuentos: {
        include: { reglasHorarias_id: true, sucursales: true },
      },
    },
  },
} as const;

/**
 * ¿La promoción alcanza a esta sucursal?
 *
 * Sin filas de sucursal vale en todas: las promociones creadas antes de
 * multi-sucursal no tienen ninguna, y dejarlas de aplicar en silencio les
 * cambiaría el precio a productos que hoy se venden con descuento.
 */
function alcanzaSucursal(promo: PromocionLike, sucursalId?: number): boolean {
  const filas = promo.sucursales ?? [];
  if (filas.length === 0 || sucursalId == null) return true;
  return filas.some(f => f.sucursal_id === sucursalId && f.disponible);
}

/**
 * Precio resultante de aplicar una promoción sobre una base.
 *
 * Los campos tipados (`modo_precio` + `monto`) son la fuente; el `valor` de
 * texto queda como respaldo para filas viejas que todavía no se migraron.
 */
export function aplicarModo(base: number, promo: PromocionLike): number {
  const modo = promo.modo_precio
    ?? (promo.valor.includes('%') ? 'PORCENTAJE' : 'MONTO_DESCUENTO');
  const valor = promo.monto != null
    ? monto(promo.monto)
    : parseFloat(promo.valor.replace('%', '')) || 0;

  switch (modo) {
    case 'PORCENTAJE':      return base - (base * valor) / 100;
    case 'PRECIO_FIJO':     return valor;
    case 'MONTO_DESCUENTO':
    default:                return base - valor;
  }
}

export function calcularPrecioFinal(
  p: ProductoConPromos,
  now: Date = new Date(),
  sucursalId?: number,
): PrecioCalculado {
  const precioBase = monto(p.precio);
  let precioFinal = precioBase;
  let descuento = 0;

  for (const pp of p.promocionProducto_id) {
    const promo = pp.promocionDescuentos;
    if (promo.activo === false) continue;
    if (!alcanzaSucursal(promo, sucursalId)) continue;
    // Fechas + días + franja horaria, en hora de Bolivia.
    if (!promocionVigente(promo.reglasHorarias_id, now)) continue;

    const nuevoPrecio = aplicarModo(precioBase, promo);
    if (nuevoPrecio < precioFinal) {
      precioFinal = Math.max(0, nuevoPrecio);
      descuento = precioBase - precioFinal;
    }
  }

  return { precioFinal, descuento };
}
