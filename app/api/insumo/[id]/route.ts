import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const insumo = await prisma.insumo.findFirst({ where: { id: Number(id) } });
    if (!insumo) return NextResponse.json({ message: 'No encontrado' }, { status: 404 });
    return NextResponse.json(insumo);
  } catch {
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const {
      categoria_insumo,
      costo_promedio,
      nombre,
      proveedor,
      punto_critico,
      stock_actual,
      stock_minimo,
      unidad_medida,
    } = await request.json();
    const insumo = await prisma.insumo.update({
      where: { id: Number(id) },
      data: {
        categoria_insumo: categoria_insumo || null,
        costo_promedio: Number(costo_promedio || 0),
        nombre,
        proveedor: proveedor || null,
        punto_critico: Number(punto_critico || 0),
        stock_actual: Number(stock_actual || 0),
        stock_minimo: Number(stock_minimo || 0),
        unidad_medida,
      },
    });
    return NextResponse.json(insumo);
  } catch {
    return NextResponse.json({ message: 'Error al actualizar' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.insumo.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: 'Eliminado' });
  } catch {
    return NextResponse.json({ message: 'Error al eliminar' }, { status: 500 });
  }
}
