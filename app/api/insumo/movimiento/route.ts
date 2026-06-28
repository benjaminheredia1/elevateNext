import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { insumo_id, tipo_movimiento, cantidad, descripcion } = body;

    if (!insumo_id || !tipo_movimiento || !cantidad) {
      return NextResponse.json({ error: 'Campos requeridos: insumo_id, tipo_movimiento, cantidad' }, { status: 400 });
    }

    const insumo = await prisma.insumo.findUnique({ where: { id: parseInt(insumo_id) } });
    if (!insumo) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 });

    const delta = tipo_movimiento === 'INGRESO' ? Number(cantidad) : -Number(cantidad);
    const nuevoStock = Math.max(0, insumo.stock_actual + delta);

    const [movimiento, insumoActualizado] = await prisma.$transaction([
      prisma.movimientoInterno.create({
        data: {
          insumo_id: parseInt(insumo_id),
          tipo_movimiento,
          cantidad: Number(cantidad),
          descripcion: descripcion ?? `${tipo_movimiento} manual`,
        },
      }),
      prisma.insumo.update({
        where: { id: parseInt(insumo_id) },
        data: { stock_actual: nuevoStock },
      }),
    ]);

    const esCritico = nuevoStock <= insumo.stock_minimo;

    return NextResponse.json({
      data: movimiento,
      insumo: insumoActualizado,
      alerta: esCritico ? `⚠️ ${insumo.nombre} está por debajo del stock mínimo (${insumo.stock_minimo} ${insumo.unidad_medida})` : null,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/insumo/movimiento error:', error);
    return NextResponse.json({ error: 'Error al registrar movimiento' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const insumoId = searchParams.get('insumo_id');
    const movimientos = await prisma.movimientoInterno.findMany({
      where: insumoId ? { insumo_id: parseInt(insumoId) } : {},
      include: { insumo: true },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return NextResponse.json({ data: movimientos });
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener movimientos' }, { status: 500 });
  }
}
