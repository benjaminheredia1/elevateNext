import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = body.identifier ?? body.email;
    const { password } = body;
    if (!identifier || !password) {
      return NextResponse.json({ message: 'Usuario/email y contraseña requeridos' }, { status: 400 });
    }
    const result = await login(identifier, password);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en login';
    return NextResponse.json({ message }, { status: 401 });
  }
}
