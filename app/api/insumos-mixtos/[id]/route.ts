import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const insumoId = Number(id);
    if (!Number.isInteger(insumoId)) {
      return NextResponse.json({ error: 'Id de insumo inválido' }, { status: 400 });
    }

    // Con historial (movimientos o recetas) no hay borrado físico: baja lógica
    const [movimientos, recetas] = await Promise.all([
      prisma.movimientoInterno.count({ where: { insumo_id: insumoId } }),
      prisma.recetasProducto.count({ where: { insumo_id: insumoId } }),
    ]);
    if (movimientos > 0 || recetas > 0) {
      return NextResponse.json(
        { error: 'Este insumo tiene movimientos o recetas asociadas: usa "Dar de baja" en lugar de eliminarlo, así los reportes históricos no se rompen.' },
        { status: 409 },
      );
    }

    await prisma.$transaction([
      prisma.insumoMixtoDetalle.deleteMany({ where: { insumo_padre_id: insumoId } }),
      prisma.insumo.delete({ where: { id: insumoId } }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/insumos-mixtos/[id] error:', error);
    return NextResponse.json({ error: 'Error al eliminar insumo mixto' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const insumoId = Number(id);
    if (!Number.isInteger(insumoId)) {
      return NextResponse.json({ error: 'Id de insumo inválido' }, { status: 400 });
    }
    const body = await req.json();
    const { nombre, unidad_medida, stock_minimo, detalles } = body;

    // Delete old detalles and recreate
    await prisma.insumoMixtoDetalle.deleteMany({ where: { insumo_padre_id: insumoId } });

    const updated = await prisma.insumo.update({
      where: { id: insumoId },
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
