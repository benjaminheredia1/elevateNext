import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError, ForbiddenError } from '@/lib/server/auth/session';

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class ValidationError extends AppError { constructor(m = 'Datos inválidos') { super(422, m); } }
export class NotFoundError extends AppError { constructor(m = 'No encontrado') { super(404, m); } }
export class ConflictError extends AppError { constructor(m = 'Conflicto') { super(409, m); } }

export function handleApiError(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'Datos inválidos', code: 'VALIDATION', detalles: e.issues }, { status: 422 });
  }
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('API error:', e);
  return NextResponse.json({ error: 'Error interno' }, { status: 500 });
}
