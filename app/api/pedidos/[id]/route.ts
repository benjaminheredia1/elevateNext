import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pedido = await prisma.transaccion.findUnique({
      where: { id: parseInt(id) },
      include: {
        transaccionesDetalles_id: { include: { producto: true } },
        usuario: { select: { nombre: true, email: true } },
      },
    });
    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    return NextResponse.json({ data: pedido });
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener pedido' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    let updateData = { ...body };
    if (body.generar_driver_link) {
      delete updateData.generar_driver_link;
      const existing = await prisma.transaccion.findUnique({ where: { id: parseInt(id) } });
      if (!existing?.driver_link_id) {
        updateData.driver_link_id = crypto.randomUUID().split('-')[0]; // short random string
      }
    }

    const pedido = await prisma.transaccion.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        transaccionesDetalles_id: { include: { producto: true } },
      },
    });
    return NextResponse.json({ data: pedido });
  } catch (error: any) {
    console.error("PUT Error:", error);
    return NextResponse.json({ error: error.message || 'Error al actualizar pedido' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.transaccion.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ message: 'Pedido eliminado' });
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar pedido' }, { status: 500 });
  }
}
