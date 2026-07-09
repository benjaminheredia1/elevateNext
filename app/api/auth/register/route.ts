import { NextRequest, NextResponse } from 'next/server';
import { register } from '@/lib/auth';
import { isRateLimited } from '@/lib/server/rate-limit';
import { setAuthCookie } from '@/lib/server/auth/cookies';

export async function POST(request: NextRequest) {
  // Máximo 5 registros por IP por minuto (evita creación masiva de cuentas)
  if (isRateLimited(request, 60000, 5)) {
    return NextResponse.json({ message: 'Demasiados intentos. Espera un minuto.' }, { status: 429 });
  }
  try {
    const { email, password, nombre, apellido_paterno, apellido_materno } = await request.json();
    if (!email || !password || !nombre) {
      return NextResponse.json({ message: 'Datos incompletos' }, { status: 400 });
    }
    const result = await register(email, password, apellido_paterno, apellido_materno, nombre);
    const res = NextResponse.json(result, { status: 201 });
    setAuthCookie(res, result.access_token); // sesión httpOnly (el JSON se mantiene por compatibilidad)
    return res;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en registro';
    return NextResponse.json({ message }, { status: 400 });
  }
}
