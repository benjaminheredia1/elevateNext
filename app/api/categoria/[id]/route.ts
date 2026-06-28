import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const categoria = await prisma.categoria.findFirst({ where: { id: Number(id) } });
    if (!categoria) return NextResponse.json({ message: 'No encontrado' }, { status: 404 });
    return NextResponse.json(categoria);
  } catch {
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { nombre, detalles } = await request.json();
    const categoria = await prisma.categoria.update({
      where: { id: Number(id) },
      data: { nombre, detalles },
    });
    return NextResponse.json(categoria);
  } catch {
    return NextResponse.json({ message: 'Error al actualizar' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.categoria.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: 'Eliminado' });
  } catch {
    return NextResponse.json({ message: 'Error al eliminar' }, { status: 500 });
  }
}
