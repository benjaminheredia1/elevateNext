import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function GET(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const reglas = await prisma.reglasHorarias.findMany({
      include: { promocionesDescuentos: true },
    });
    return NextResponse.json(reglas);
  } catch {
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { promocionesDescuentos_id, fecha_inicio, fecha_fin } = await request.json();
    const regla = await prisma.reglasHorarias.create({
      data: {
        promocionesDescuentos_id,
        fecha_inicio: new Date(fecha_inicio),
        fecha_fin: new Date(fecha_fin),
      },
    });
    return NextResponse.json(regla, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Error al crear regla' }, { status: 500 });
  }
}
