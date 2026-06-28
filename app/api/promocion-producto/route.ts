import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const items = await prisma.promocionProducto.findMany({
      include: { producto: true, promocionDescuentos: true },
    });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { producto_id, key, promocion_descuentos_id } = await request.json();
    const item = await prisma.promocionProducto.create({
      data: { producto_id, key, promocion_descuentos_id },
    });
    return NextResponse.json(item, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Error al crear' }, { status: 500 });
  }
}
