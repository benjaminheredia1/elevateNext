import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function GET(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

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
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

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
