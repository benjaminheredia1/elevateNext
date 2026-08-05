/**
 * Coordenadas de una sucursal a partir de su enlace de Google Maps.
 *
 * El dueño carga el local pegando el link que le da la app de Maps —que casi
 * siempre es un acortado `maps.app.goo.gl`— y no la latitud y longitud sueltas,
 * que hay que ir a buscar con clic derecho y nadie hace. Sin coordenadas el
 * checkout no puede medir la distancia y el delivery termina cobrándose en cero.
 *
 * Resolver el acortado necesita una llamada de red, así que esto corre en el
 * servidor y solo al guardar la sucursal: las coordenadas quedan persistidas y
 * la tienda las lee ya listas, sin depender de Google en cada visita.
 */

/** Hosts de enlaces cortos que hay que seguir para ver las coordenadas. */
const HOSTS_CORTOS = ['maps.app.goo.gl', 'goo.gl'];

export interface Coordenadas {
  lat: number;
  lng: number;
}

/**
 * Santa Cruz y el resto del mundo entran acá, pero un `0,0` o un valor fuera de
 * rango es basura de parseo, no una ubicación: se descarta.
 */
function coordenadasValidas(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // La isla nula: el punto (0,0) está en el Atlántico y siempre es un error.
  return !(lat === 0 && lng === 0);
}

/**
 * Extrae el punto de una URL de Maps ya expandida.
 *
 * Se prueban los formatos en orden de precisión:
 *   1. `!3d<lat>!4d<lng>` — la ubicación exacta del lugar según Google.
 *   2. `@<lat>,<lng>,<zoom>` — el centro de la cámara: unos metros de más, pero
 *      es lo único que traen los enlaces compartidos desde el escritorio.
 *   3. `?q=`, `?ll=`, `?daddr=` — enlaces armados a mano o por otra app.
 *
 * Devuelve null si la URL no tiene coordenadas (por ejemplo, un enlace corto sin
 * resolver o una búsqueda por nombre).
 */
export function coordenadasDesdeUrlMaps(url: string | null | undefined): Coordenadas | null {
  if (!url) return null;

  // 1. Ubicación del lugar.
  const lugar = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (lugar) {
    const lat = Number(lugar[1]);
    const lng = Number(lugar[2]);
    if (coordenadasValidas(lat, lng)) return { lat, lng };
  }

  // 2. Centro de la cámara.
  const camara = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (camara) {
    const lat = Number(camara[1]);
    const lng = Number(camara[2]);
    if (coordenadasValidas(lat, lng)) return { lat, lng };
  }

  // 3. Parámetros de consulta: q / ll / daddr, con el par "lat,lng".
  try {
    const parsed = new URL(url);
    for (const clave of ['q', 'll', 'daddr', 'center']) {
      const valor = parsed.searchParams.get(clave);
      if (!valor) continue;
      const par = valor.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
      if (!par) continue;
      const lat = Number(par[1]);
      const lng = Number(par[2]);
      if (coordenadasValidas(lat, lng)) return { lat, lng };
    }
  } catch {
    // URL mal formada: ya se intentó por regex, no hay más que sacarle.
  }

  return null;
}

/** true si el enlace es de los cortos, que no traen las coordenadas adentro. */
export function esEnlaceCorto(url: string): boolean {
  try {
    return HOSTS_CORTOS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Sigue la redirección de un enlace corto y devuelve la URL final.
 *
 * Con timeout porque esto corre dentro del guardado de la sucursal: si Google
 * no responde, se guarda igual sin coordenadas en lugar de dejar al dueño
 * esperando ante un formulario colgado.
 */
export async function expandirEnlaceCorto(url: string, timeoutMs = 5000): Promise<string | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: abort.signal,
      // Sin User-Agent de navegador, Google devuelve una página de consentimiento
      // sin coordenadas.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ElevateBot/1.0)' },
    });
    return res.url || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Coordenadas de un enlace de Maps, resolviendo el acortado si hace falta.
 *
 * Nunca lanza: si no se puede averiguar, devuelve null y quien llama decide.
 * Para el guardado de la sucursal eso significa dejar lat/lng vacías, que el
 * checkout ya sabe reportar como "envío a coordinar".
 */
export async function coordenadasDesdeMaps(url: string | null | undefined): Promise<Coordenadas | null> {
  if (!url) return null;

  const directas = coordenadasDesdeUrlMaps(url);
  if (directas) return directas;

  if (!esEnlaceCorto(url)) return null;

  const expandida = await expandirEnlaceCorto(url);
  return coordenadasDesdeUrlMaps(expandida);
}

/**
 * Qué lat/lng guardar para una sucursal.
 *
 * Lo que el dueño escribió a mano manda: si cargó las coordenadas, son esas y no
 * se tocan. Solo cuando quedaron vacías se sacan del enlace de Maps, que es el
 * caso normal —se pega el link y listo—.
 */
export async function coordenadasParaGuardar(input: {
  lat?: number;
  lng?: number;
  maps_url?: string;
}): Promise<{ lat: number | null; lng: number | null }> {
  if (input.lat != null && input.lng != null) {
    return { lat: input.lat, lng: input.lng };
  }

  const delEnlace = await coordenadasDesdeMaps(input.maps_url);
  if (delEnlace) return delEnlace;

  // Ni coordenadas ni enlace utilizable: se guarda sin ubicación. El checkout
  // lo reporta como "envío a coordinar" en vez de cobrar el reparto en cero.
  return { lat: input.lat ?? null, lng: input.lng ?? null };
}
