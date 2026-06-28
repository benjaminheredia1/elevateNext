import { NextRequest, NextResponse } from 'next/server';
import { register } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password, nombre, apellido_paterno, apellido_materno } = await request.json();
    if (!email || !password || !nombre) {
      return NextResponse.json({ message: 'Datos incompletos' }, { status: 400 });
    }
    const result = await register(email, password, apellido_paterno, apellido_materno, nombre);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en registro';
    return NextResponse.json({ message }, { status: 400 });
  }
}
