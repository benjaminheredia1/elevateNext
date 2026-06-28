import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const producto = await prisma.producto.findUnique({
      where: { id: parseInt(id) },
      include: {
        categoria_id: { include: { categoria: true } },
        recetaProducto_id: { include: { insumo: true } },
      },
    });
    if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    return NextResponse.json({ data: producto });
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener producto' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { nombre, descripcion, precio, imagen_url, disponible } = body;
    const producto = await prisma.producto.update({
      where: { id: parseInt(id) },
      data: { nombre, descripcion, precio: precio ? Number(precio) : undefined, imagen_url, disponible },
    });
    return NextResponse.json({ data: producto });
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar producto' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.producto.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ message: 'Producto eliminado' });
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar producto' }, { status: 500 });
  }
}
