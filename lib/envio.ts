/**
 * Cotización del delivery: cuánto cobrar por llevar un pedido desde el local
 * hasta la ubicación que marcó el cliente.
 *
 * El precio sale de un tarifario por tramos —el que fijó el negocio, más abajo—
 * y no de una fórmula: es una tabla cerrada que el repartidor y la cajera leen
 * de memoria, y que el cliente puede verificar. Fuera del último tramo se sigue
 * cobrando por km, para no regalar el viaje largo.
 *
 * El tarifario es único para todos los locales; lo que sí decide cada sucursal
 * es hasta dónde reparte (`envio_radio_km`) y si le pone un tope al cobro
 * (`envio_maximo`), que son decisiones operativas, no de precio.
 *
 * Sin prisma adentro: lo usa el checkout en el navegador y también el servidor.
 */

/**
 * Tarifario vigente, en tramos cerrados por arriba: la primera fila cuyo
 * `hasta_km` alcance la distancia es la que se cobra.
 *
 *   0    a  2,0 km → Bs 10      7,1 a  8,0 km → Bs 22
 *   2,1  a  3,0 km → Bs 12      8,1 a  9,0 km → Bs 25
 *   3,1  a  5,0 km → Bs 15      9,1 a 10,0 km → Bs 27
 *   5,1  a  6,0 km → Bs 18     10,1 a 11,0 km → Bs 30
 *   6,1  a  7,0 km → Bs 20     11,1 a 12,0 km → Bs 32
 */
export const TRAMOS_ENVIO: ReadonlyArray<{ hasta_km: number; costo: number }> = [
  { hasta_km: 2, costo: 10 },
  { hasta_km: 3, costo: 12 },
  { hasta_km: 5, costo: 15 },
  { hasta_km: 6, costo: 18 },
  { hasta_km: 7, costo: 20 },
  { hasta_km: 8, costo: 22 },
  { hasta_km: 9, costo: 25 },
  { hasta_km: 10, costo: 27 },
  { hasta_km: 11, costo: 30 },
  { hasta_km: 12, costo: 32 },
];

/** Pasado el último tramo, cada km adicional (redondeado hacia arriba). */
export const ENVIO_POR_KM_EXTRA = 3;

/** Recargo cuando se reparte bajo lluvia. */
export const RECARGO_LLUVIA = 3;

export interface LimitesEnvio {
  /** Tope del envío. null = sin tope. */
  envio_maximo?: number | null;
  /** Hasta dónde reparte el local. null = sin límite. */
  envio_radio_km?: number | null;
}

export interface OpcionesEnvio {
  /**
   * Reparto bajo lluvia: suma el recargo. Todavía no hay interfaz para
   * activarlo; el parámetro existe para que el recargo tenga un solo lugar
   * donde vivir cuando se decida quién lo prende.
   */
  lluvia?: boolean;
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
 * Lo que dice el tarifario para una distancia dada, sin topes ni recargos.
 *
 * Los tramos se leen sobre la distancia ya redondeada a un decimal, que es como
 * está escrito el tarifario (2,1 arranca el segundo tramo). Más allá del último
 * tramo se suma por km entero: medio km de más ya significa un viaje más largo,
 * y cobrar fracciones es imposible de explicar.
 */
export function costoPorDistancia(distancia_km: number): number {
  const tramo = TRAMOS_ENVIO.find(t => distancia_km <= t.hasta_km);
  if (tramo) return tramo.costo;

  const ultimo = TRAMOS_ENVIO[TRAMOS_ENVIO.length - 1];
  const kmExtra = Math.ceil(distancia_km - ultimo.hasta_km);
  return ultimo.costo + kmExtra * ENVIO_POR_KM_EXTRA;
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
  limites: LimitesEnvio = {},
  opciones: OpcionesEnvio = {},
): CotizacionEnvio {
  const distancia = Math.round(distanciaRecorrido(local, destino) * 10) / 10;

  const dentroDeCobertura = limites.envio_radio_km == null || distancia <= limites.envio_radio_km;

  let costo = costoPorDistancia(distancia);
  // El tope se aplica sobre el tarifario; la lluvia va después, porque es un
  // costo del viaje concreto y no parte del precio de la distancia.
  if (limites.envio_maximo != null) costo = Math.min(costo, limites.envio_maximo);
  if (opciones.lluvia) costo += RECARGO_LLUVIA;

  return {
    distancia_km: distancia,
    costo: Math.round(costo * 100) / 100,
    dentroDeCobertura,
  };
}
