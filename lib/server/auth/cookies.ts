import { NextResponse } from 'next/server';

/** Debe coincidir con la vida del JWT (1200m en lib/auth.ts). */
const TOKEN_MAX_AGE_S = 1200 * 60;

export const AUTH_COOKIE = 'token';

/**
 * Setea el JWT como cookie httpOnly: el JS del navegador no puede leerla
 * (mitiga robo de sesión por XSS) y viaja sola en cada petición same-origin.
 * requireAuth (session.ts) ya la lee como fallback del header Authorization.
 */
export function setAuthCookie(res: NextResponse, token: string): void {
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE_S,
  });
}

export function clearAuthCookie(res: NextResponse): void {
  res.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
