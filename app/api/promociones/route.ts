import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const promociones = await prisma.promocionesDescuentos.findMany({
      include: { reglasHorarias_id: true, promocionProducto_id: true },
    });
    return NextResponse.json(promociones);
  } catch {
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { nombre, valor } = await request.json();
    const promocion = await prisma.promocionesDescuentos.create({
      data: { nombre, valor },
    });
    return NextResponse.json(promocion, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Error al crear promoción' }, { status: 500 });
  }
}
