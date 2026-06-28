import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const productos = await prisma.producto.findMany({
      include: {
        categoria_id: { include: { categoria: true } },
        recetaProducto_id: { include: { insumo: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    return NextResponse.json({ data: productos });
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nombre, descripcion, precio, imagen_url, disponible } = body;
    const producto = await prisma.producto.create({
      data: { nombre, descripcion, precio: Number(precio), imagen_url, disponible: disponible ?? true },
    });
    return NextResponse.json({ data: producto }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear producto' }, { status: 500 });
  }
}
