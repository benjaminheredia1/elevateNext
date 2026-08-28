import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ValidationError } from '@/lib/server/errors';

/**
 * Lee la clave de idempotencia de la cabecera `Idempotency-Key`.
 *
 * La clave nombra la INTENCIÓN del operador, no la petición HTTP: el cliente la
 * genera una vez (al abrir el formulario) y la repite en cada reintento. Por eso
 * el servidor puede distinguir "el usuario quiere cargar otra compra igual" de
 * "esta compra ya la registré y la respuesta se perdió en el camino".
 *
 * Es opcional a propósito: los endpoints ya existen y hay clientes (tests,
 * Electron viejo) que no la mandan. Sin clave el endpoint se comporta como
 * antes — el que la manda es el que queda protegido.
 */
const claveSchema = z.string().uuid();

export function leerClaveIdempotencia(req: NextRequest): string | null {
  const cruda = req.headers.get('Idempotency-Key');
  if (!cruda) return null;

  // Se exige UUID en vez de aceptar texto libre: una clave que el cliente
  // recicle sin querer (un "1", el id del insumo) bloquearía para siempre esa
  // operación con un 409 imposible de entender.
  const parsed = claveSchema.safeParse(cruda.trim());
  if (!parsed.success) throw new ValidationError('Idempotency-Key debe ser un UUID');
  return parsed.data;
}
