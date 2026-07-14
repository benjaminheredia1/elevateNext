import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited } from '@/lib/server/rate-limit';
import { resetPasswordWithToken } from '@/lib/server/auth/password-reset.service';

export async function POST(request: NextRequest) {
  if (isRateLimited(request, 60000, 5)) {
    return NextResponse.json({ message: 'Demasiados intentos. Espera un minuto.' }, { status: 429 });
  }

  try {
    const { token, password } = await request.json();
    if (!token || !password) {
      return NextResponse.json({ message: 'Token y contraseña requeridos' }, { status: 400 });
    }

    await resetPasswordWithToken(token, password);
    return NextResponse.json({ message: 'Contraseña actualizada correctamente' }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al restablecer contraseña';
    return NextResponse.json({ message }, { status: 400 });
  }
}
