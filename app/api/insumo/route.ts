import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const insumos = await prisma.insumo.findMany();
    return NextResponse.json(insumos);
  } catch {
    return NextResponse.json({ message: 'Error al obtener insumos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { nombre, stock_actual, stock_minimo, unidad_medida } = await request.json();
    const insumo = await prisma.insumo.create({
      data: { nombre, stock_actual, stock_minimo, unidad_medida },
    });
    return NextResponse.json(insumo, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Error al crear insumo' }, { status: 500 });
  }
}
