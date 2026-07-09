import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const { nombre, valor } = await request.json();
    const promocion = await prisma.promocionesDescuentos.update({
      where: { id: Number(id) },
      data: { nombre, valor },
    });
    return NextResponse.json(promocion);
  } catch {
    return NextResponse.json({ message: 'Error al actualizar' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(_, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    await prisma.promocionesDescuentos.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: 'Eliminado' });
  } catch {
    return NextResponse.json({ message: 'Error al eliminar' }, { status: 500 });
  }
}
