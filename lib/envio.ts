/**
 * Cotización del delivery: cuánto cobrar por llevar un pedido desde el local
 * hasta la ubicación que marcó el cliente.
 *
 * El esquema es el que usa el rubro —base con unos km incluidos más un monto por
 * km adicional— y no un precio plano, que castiga al cliente cercano y regala el
 * viaje largo. Referencias: PedidosYa Envíos cobra Bs 5 los primeros 5 km y Bs 1
 * por km adicional; la tarifa municipal de Cochabamba, Bs 6,50 el primer km y
 * Bs 2 por cada km más. Las de plataforma están subsidiadas, así que los valores
 * por defecto (Bs 8 / 2,5 km / Bs 2,50 por km) quedan en el medio y cada local
 * los ajusta en /admin/sucursales.
 *
 * Sin prisma adentro: lo usa el checkout en el navegador y también el servidor.
 */

export interface TarifaEnvio {
  /** Cuánto cuesta el envío dentro de los km incluidos. */
  envio_base: number;
  /** Km que ya cubre la base. */
  envio_km_incluidos: number;
  /** Monto por cada km adicional (se redondea el km hacia arriba). */
  envio_por_km: number;
  /** Tope del envío. null = sin tope. */
  envio_maximo?: number | null;
  /** Hasta dónde reparte el local. null = sin límite. */
  envio_radio_km?: number | null;
}

export interface Coordenada {
  lat: number;
  lng: number;
}

export interface CotizacionEnvio {
  /** Distancia estimada de recorrido, en km. */
  distancia_km: number;
  /** Cuánto se cobra por el envío. */
  costo: number;
  /** false cuando la ubicación quedó fuera del radio de reparto del local. */
  dentroDeCobertura: boolean;
}

/**
 * Corrección de la línea recta al recorrido real por calles.
 *
 * Una ciudad con manzanas obliga a doblar: el motorizado siempre hace más
 * kilómetros que la línea recta. 1,3 es el factor de rodeo que se usa
 * habitualmente en trazados urbanos, y cobrar la línea recta pelada sería
 * cobrar de menos en cada viaje.
 */
export const FACTOR_RECORRIDO = 1.3;

const RADIO_TIERRA_KM = 6371;

/** Distancia en línea recta entre dos puntos (haversine), en km. */
export function distanciaLineaRecta(a: Coordenada, b: Coordenada): number {
  const rad = (grados: number) => (grados * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distancia estimada de recorrido: la línea recta corregida por el rodeo urbano. */
export function distanciaRecorrido(local: Coordenada, destino: Coordenada): number {
  return distanciaLineaRecta(local, destino) * FACTOR_RECORRIDO;
}

/**
 * Cotiza el envío del local al destino.
 *
 * Devuelve la cotización incluso fuera de cobertura (con `dentroDeCobertura` en
 * false) para que la pantalla pueda decir "estás a 14 km, no llegamos" en lugar
 * de un error sin explicación.
 */
export function cotizarEnvio(
  local: Coordenada,
  destino: Coordenada,
  tarifa: TarifaEnvio,
): CotizacionEnvio {
  const distancia = Math.round(distanciaRecorrido(local, destino) * 10) / 10;

  const dentroDeCobertura = tarifa.envio_radio_km == null || distancia <= tarifa.envio_radio_km;

  // Los km que pasan de la base se cobran por km entero: medio km de más ya
  // significa un viaje más largo, y cobrar fracciones es imposible de explicar.
  const excedente = Math.max(0, distancia - tarifa.envio_km_incluidos);
  const kmExtra = Math.ceil(excedente);

  let costo = tarifa.envio_base + kmExtra * tarifa.envio_por_km;
  if (tarifa.envio_maximo != null) costo = Math.min(costo, tarifa.envio_maximo);

  return {
    distancia_km: distancia,
    costo: Math.round(costo * 100) / 100,
    dentroDeCobertura,
  };
}
