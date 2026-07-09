import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(_req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    await prisma.recetasProducto.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ message: 'Receta eliminada' });
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar receta' }, { status: 500 });
  }
}
