import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const categorias = await prisma.categoria.findMany();
    return NextResponse.json(categorias);
  } catch {
    return NextResponse.json({ message: 'Error al obtener categorías' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { nombre, detalles } = await request.json();
    const categoria = await prisma.categoria.create({
      data: { nombre, detalles },
    });
    return NextResponse.json(categoria, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Error al crear categoría' }, { status: 500 });
  }
}
