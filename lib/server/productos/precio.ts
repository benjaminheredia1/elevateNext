/**
 * Cálculo de precio final de un producto con promociones activas.
 * Única fuente de verdad de precios: la usa GET /api/productos (tienda)
 * y POST /api/pedidos (validación server-side del total).
 */

interface ReglaHorariaLike {
  fecha_inicio: Date;
  fecha_fin: Date;
}

interface PromocionLike {
  valor: string;
  reglasHorarias_id: ReglaHorariaLike[];
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
        include: { reglasHorarias_id: true },
      },
    },
  },
} as const;

export function calcularPrecioFinal(p: ProductoConPromos, now: Date = new Date()): PrecioCalculado {
  const precioBase = monto(p.precio);
  let precioFinal = precioBase;
  let descuento = 0;

  for (const pp of p.promocionProducto_id) {
    const promo = pp.promocionDescuentos;
    const isActiva = promo.reglasHorarias_id.some(
      (r) => now >= r.fecha_inicio && now <= r.fecha_fin,
    );
    if (!isActiva) continue;

    let nuevoPrecio = precioBase;
    if (promo.valor.includes('%')) {
      const pct = parseFloat(promo.valor.replace('%', ''));
      nuevoPrecio = precioBase - (precioBase * pct) / 100;
    } else {
      nuevoPrecio = precioBase - parseFloat(promo.valor);
    }
    if (nuevoPrecio < precioFinal) {
      precioFinal = Math.max(0, nuevoPrecio);
      descuento = precioBase - precioFinal;
    }
  }

  return { precioFinal, descuento };
}
