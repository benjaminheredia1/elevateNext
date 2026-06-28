import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productoId = searchParams.get('producto_id');
    const recetas = await prisma.recetasProducto.findMany({
      where: productoId ? { producto_id: parseInt(productoId) } : {},
      include: { insumo: true, producto: true },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json({ data: recetas });
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener recetas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { producto_id, insumo_id, cantidad_utilizada } = body;
    const receta = await prisma.recetasProducto.create({
      data: {
        producto_id: parseInt(producto_id),
        insumo_id: parseInt(insumo_id),
        cantidad_utilizada: Number(cantidad_utilizada),
      },
      include: { insumo: true, producto: true },
    });
    return NextResponse.json({ data: receta }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear receta' }, { status: 500 });
  }
}
