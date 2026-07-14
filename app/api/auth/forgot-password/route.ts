import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited } from '@/lib/server/rate-limit';
import { requestPasswordReset } from '@/lib/server/auth/password-reset.service';

const GENERIC_MESSAGE =
  'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.';

export async function POST(request: NextRequest) {
  if (isRateLimited(request, 60000, 3)) {
    return NextResponse.json({ message: 'Demasiados intentos. Espera un minuto.' }, { status: 429 });
  }

  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ message: 'Correo electrónico requerido' }, { status: 400 });
    }

    try {
      await requestPasswordReset(email);
    } catch (error) {
      console.error('Error enviando correo de restablecimiento:', error);
      return NextResponse.json(
        { message: 'No se pudo enviar el correo. Verifica la configuración de Resend e intenta de nuevo.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  } catch {
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }
}
