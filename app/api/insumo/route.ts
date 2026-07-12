import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function GET(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    // Por defecto solo activos (selector de recetas, etc.). El panel de inventario
    // pide también los dados de baja para poder mostrarlos y reactivarlos.
    const incluirInactivos = new URL(req.url).searchParams.get('incluir_inactivos') === '1';
    const insumos = await prisma.insumo.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      orderBy: { nombre: 'asc' },
    });
    return NextResponse.json(insumos);
  } catch {
    return NextResponse.json({ message: 'Error al obtener insumos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const {
      categoria_insumo,
      costo_promedio,
      equivalencia_cantidad,
      equivalencia_unidad,
      nombre,
      proveedor,
      punto_critico,
      stock_actual,
      stock_minimo,
      unidad_medida,
    } = await request.json();
    const tieneEquivalencia = equivalencia_unidad && equivalencia_cantidad;
    const insumo = await prisma.insumo.create({
      data: {
        categoria_insumo: categoria_insumo || null,
        costo_promedio: Number(costo_promedio || 0),
        equivalencia_cantidad: tieneEquivalencia ? Number(equivalencia_cantidad) : null,
        equivalencia_unidad: tieneEquivalencia ? equivalencia_unidad : null,
        nombre,
        proveedor: proveedor || null,
        punto_critico: Number(punto_critico || 0),
        stock_actual: Number(stock_actual || 0),
        stock_minimo: Number(stock_minimo || 0),
        unidad_medida,
      },
    });
    return NextResponse.json(insumo, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Error al crear insumo' }, { status: 500 });
  }
}
