import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN, STAFF } from '@/lib/server/auth/guard';

// Lectura con sesión de staff: antes este GET estaba sin autenticación.
export async function GET(request: NextRequest) {
  const auth = await guard(request, STAFF);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const soloActivas = searchParams.get('activo') === 'true';
    const unidades = await prisma.unidadMedida.findMany({
      where: soloActivas ? { activo: true } : undefined,
      orderBy: { nombre: 'asc' },
    });
    return NextResponse.json(unidades);
  } catch {
    return NextResponse.json({ message: 'Error al obtener unidades de medida' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { nombre } = await request.json();
    const nombreTrim = String(nombre ?? '').trim();
    if (!nombreTrim) {
      return NextResponse.json({ message: 'El nombre es requerido' }, { status: 400 });
    }

    const existente = await prisma.unidadMedida.findFirst({
      where: { nombre: { equals: nombreTrim, mode: 'insensitive' } },
    });
    if (existente) {
      return NextResponse.json({ message: `Ya existe una unidad "${existente.nombre}"` }, { status: 409 });
    }

    const unidad = await prisma.unidadMedida.create({ data: { nombre: nombreTrim } });
    return NextResponse.json(unidad, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Error al crear la unidad de medida' }, { status: 500 });
  }
}
