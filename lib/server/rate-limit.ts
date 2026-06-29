import { NextRequest } from 'next/server';

interface RateLimitInfo {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitInfo>();

/**
 * Limitador de tasa (rate limiting) en memoria (sliding window simple).
 * Útil para proteger endpoints críticos (login, caja) en entornos single-instance.
 * Si se despliega en serverless multi-instancia, esto limitará por instancia,
 * lo cual sigue siendo útil para mitigar abusos a nivel básico.
 * 
 * @param req La petición (para obtener la IP)
 * @param windowMs Ventana de tiempo en milisegundos (ej: 60000 para 1 min)
 * @param max Máximo de peticiones permitidas en la ventana de tiempo
 * @returns true si se excede el límite (debe retornar 429), false si está permitido
 */
export function isRateLimited(req: NextRequest, windowMs: number = 60000, max: number = 5): boolean {
  // Extraer IP, fallback a 'unknown'
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const path = req.nextUrl.pathname;
  const key = `${ip}:${path}`;

  const now = Date.now();
  const info = store.get(key);

  if (!info) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  // Si ya pasó el tiempo de reset, reiniciamos el contador
  if (now > info.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  // Si está dentro de la ventana, incrementamos
  info.count += 1;
  store.set(key, info);

  return info.count > max;
}

// Limpieza periódica para no consumir memoria infinita
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, info] of store.entries()) {
      if (now > info.resetAt) {
        store.delete(key);
      }
    }
  }, 60000); // Limpiar cada minuto
}
