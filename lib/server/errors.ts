import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthError, ForbiddenError } from '@/lib/server/auth/session';

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class ValidationError extends AppError { constructor(m = 'Datos inválidos') { super(422, m); } }
export class NotFoundError extends AppError { constructor(m = 'No encontrado') { super(404, m); } }
export class ConflictError extends AppError { constructor(m = 'Conflicto') { super(409, m); } }

export function handleApiError(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    console.error('Validation error:', JSON.stringify(e.issues));
    return NextResponse.json({ error: 'Datos inválidos', code: 'VALIDATION', detalles: e.issues }, { status: 422 });
  }
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });

  // P2002 = violación de índice único. Sin este mapeo cae al 500 genérico de
  // abajo, que le esconde al operador la única cosa útil: que el dato ya
  // existe. El caso de `idempotency_key` es un reintento, no un error de
  // carga, y merece decirlo con esas palabras.
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    // Qué columna se violó viaja en un lugar distinto según el driver: con el
    // motor clásico está en `meta.target`; con el adaptador pg de Prisma 7 está
    // en `meta.driverAdapterError.cause.constraint.fields`. Serializar el meta
    // entero y buscar el nombre de la columna cubre las dos formas sin atarse a
    // ninguna, que es exactamente lo que se rompió al migrar de driver.
    const meta = JSON.stringify(e.meta ?? '');
    if (meta.includes('idempotency_key')) {
      return NextResponse.json(
        { error: 'Esta operación ya fue registrada. Actualizá la pantalla para ver el resultado.', code: 'IDEMPOTENTE' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Ya existe un registro con esos datos', code: 'DUPLICADO' }, { status: 409 });
  }

  // P2028 = la transacción expiró · P2024 = no consiguió conexión del pool.
  // Los dos son la base tardando más de lo que el margen permite, y los dos
  // revierten TODO: no queda nada a medias. Sin este mapeo caen al 500 genérico
  // de abajo y el operador ve "Error interno", que no le dice ni que puede
  // reintentar ni que su mercadería sigue donde estaba. Fue exactamente lo que
  // pasó con las recepciones de traslados contra la base remota.
  if (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    (e.code === 'P2028' || e.code === 'P2024')
  ) {
    console.error('Timeout de transacción:', e.code, e.message);
    return NextResponse.json(
      {
        error: 'La base de datos tardó demasiado y la operación se canceló. No se registró nada: podés reintentar.',
        code: 'TIMEOUT',
      },
      { status: 503 },
    );
  }
  console.error('API error:', e);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
