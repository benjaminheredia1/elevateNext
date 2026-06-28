import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.insumoMixtoDetalle.deleteMany({ where: { insumo_padre_id: parseInt(id) } });
    await prisma.insumo.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/insumos-mixtos/[id] error:', error);
    return NextResponse.json({ error: 'Error al eliminar insumo mixto' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { nombre, unidad_medida, stock_minimo, detalles } = body;

    // Delete old detalles and recreate
    await prisma.insumoMixtoDetalle.deleteMany({ where: { insumo_padre_id: parseInt(id) } });

    const updated = await prisma.insumo.update({
      where: { id: parseInt(id) },
      data: {
        nombre,
        unidad_medida,
        stock_minimo: stock_minimo ?? 0,
        insumos_mixtos_padre: {
          create: detalles.map((d: { insumo_hijo_id: number; cantidad: number }) => ({
            insumo_hijo_id: d.insumo_hijo_id,
            cantidad: d.cantidad,
          })),
        },
      },
      include: { insumos_mixtos_padre: true },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('PUT /api/insumos-mixtos/[id] error:', error);
    return NextResponse.json({ error: 'Error al actualizar insumo mixto' }, { status: 500 });
  }
}
