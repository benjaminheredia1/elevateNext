import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

// GET /api/insumos-mixtos
export async function GET(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const insumos = await prisma.insumo.findMany({
      where: { es_mixto: true },
      include: {
        insumos_mixtos_padre: {
          include: {
            insumo_hijo: { select: { id: true, nombre: true, unidad_medida: true, costo_promedio: true } }
          }
        }
      },
      orderBy: { nombre: 'asc' },
    });

    const withCost = insumos.map(i => {
      const costo = i.insumos_mixtos_padre.reduce((acc, d) => {
        return acc + d.cantidad * d.insumo_hijo.costo_promedio;
      }, 0);
      return { ...i, costo_calculado: costo };
    });

    return NextResponse.json({ data: withCost });
  } catch (error) {
    console.error('GET /api/insumos-mixtos error:', error);
    return NextResponse.json({ error: 'Error al obtener insumos mixtos' }, { status: 500 });
  }
}

// POST /api/insumos-mixtos — crear o actualizar
export async function POST(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { nombre, unidad_medida, stock_minimo, detalles } = body;
    // detalles: Array<{ insumo_hijo_id: number, cantidad: number }>

    if (!nombre || !unidad_medida || !detalles?.length) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    // Crear el insumo mixto
    const insumoMixto = await prisma.insumo.create({
      data: {
        nombre,
        unidad_medida,
        stock_actual: 0,
        stock_minimo: stock_minimo ?? 0,
        es_mixto: true,
        insumos_mixtos_padre: {
          create: detalles.map((d: { insumo_hijo_id: number; cantidad: number }) => ({
            insumo_hijo_id: d.insumo_hijo_id,
            cantidad: d.cantidad,
          })),
        },
      },
      include: { insumos_mixtos_padre: true },
    });

    return NextResponse.json({ data: insumoMixto }, { status: 201 });
  } catch (error) {
    console.error('POST /api/insumos-mixtos error:', error);
    return NextResponse.json({ error: 'Error al crear insumo mixto' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
