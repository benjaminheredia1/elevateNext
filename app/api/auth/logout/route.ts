import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/server/auth/cookies';

/**
 * Cierra la sesión borrando la cookie httpOnly.
 * El frontend no puede borrarla por sí mismo (httpOnly), por eso este endpoint.
 */
export async function POST() {
  const res = NextResponse.json({ message: 'Sesión cerrada' });
  clearAuthCookie(res);
  return res;
}
