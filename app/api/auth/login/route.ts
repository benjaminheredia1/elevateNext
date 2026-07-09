import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth';
import { isRateLimited } from '@/lib/server/rate-limit';
import { setAuthCookie } from '@/lib/server/auth/cookies';

export async function POST(request: NextRequest) {
  // Máximo 10 intentos de login por IP por minuto (mitiga fuerza bruta)
  if (isRateLimited(request, 60000, 10)) {
    return NextResponse.json({ message: 'Demasiados intentos. Espera un minuto.' }, { status: 429 });
  }
  try {
    const body = await request.json();
    const identifier = body.identifier ?? body.email;
    const { password } = body;
    if (!identifier || !password) {
      return NextResponse.json({ message: 'Usuario/email y contraseña requeridos' }, { status: 400 });
    }
    const result = await login(identifier, password);
    const res = NextResponse.json(result, { status: 200 });
    setAuthCookie(res, result.access_token); // sesión httpOnly (el JSON se mantiene por compatibilidad)
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en login';
    return NextResponse.json({ message }, { status: 401 });
  }
}
