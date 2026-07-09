import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const { fecha_inicio, fecha_fin } = await request.json();
    const regla = await prisma.reglasHorarias.update({
      where: { id: Number(id) },
      data: { fecha_inicio: new Date(fecha_inicio), fecha_fin: new Date(fecha_fin) },
    });
    return NextResponse.json(regla);
  } catch {
    return NextResponse.json({ message: 'Error al actualizar' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(_, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    await prisma.reglasHorarias.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: 'Eliminado' });
  } catch {
    return NextResponse.json({ message: 'Error al eliminar' }, { status: 500 });
  }
}
