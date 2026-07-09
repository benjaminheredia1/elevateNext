import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function GET(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const insumos = await prisma.insumo.findMany({ where: { activo: true } });
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
      nombre,
      proveedor,
      punto_critico,
      stock_actual,
      stock_minimo,
      unidad_medida,
    } = await request.json();
    const insumo = await prisma.insumo.create({
      data: {
        categoria_insumo: categoria_insumo || null,
        costo_promedio: Number(costo_promedio || 0),
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
