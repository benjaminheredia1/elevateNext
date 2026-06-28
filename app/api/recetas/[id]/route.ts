import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.recetasProducto.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ message: 'Receta eliminada' });
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar receta' }, { status: 500 });
  }
}
