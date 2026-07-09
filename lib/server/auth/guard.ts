import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, type Session } from './session';
import type { Rol } from '@prisma/client';

/** Personal con acceso operativo (pedidos, alertas). */
export const STAFF: Rol[] = ['DUENO', 'ADMIN', 'CAJERO'];
/** Solo administración (inventario, catálogo, finanzas, configuración). */
export const ADMIN: Rol[] = ['DUENO', 'ADMIN'];

/**
 * Guardia para route handlers legacy: verifica JWT y rol sin lanzar
 * dentro del try/catch propio del handler.
 * Devuelve la Session si está autorizado, o una NextResponse 401/403 lista
 * para retornar.
 *
 * Uso:
 *   const auth = await guard(req, ADMIN);
 *   if (auth instanceof NextResponse) return auth;
 */
export async function guard(req: NextRequest, roles: Rol[] = STAFF): Promise<Session | NextResponse> {
  try {
    const session = await requireAuth(req);
    requireRole(session, roles);
    return session;
  } catch (e) {
    const status = e instanceof Error && 'status' in e ? (e as { status: number }).status : 401;
    const message = e instanceof Error ? e.message : 'No autenticado';
    return NextResponse.json({ error: message }, { status });
  }
}
