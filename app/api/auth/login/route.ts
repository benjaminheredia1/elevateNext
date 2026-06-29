import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth';
import { isRateLimited } from '@/lib/server/rate-limit';

export async function POST(request: NextRequest) {
  if (isRateLimited(request, 60000, 5)) { // Max 5 login attempts per minute
    return NextResponse.json({ message: 'Demasiados intentos de inicio de sesión. Por favor intente más tarde.' }, { status: 429 });
  }

  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ message: 'Email y contraseña requeridos' }, { status: 400 });
    }
    const result = await login(email, password);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en login';
    return NextResponse.json({ message }, { status: 401 });
  }
}
