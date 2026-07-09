import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const unidadId = Number(id);
    const { nombre, activo } = await request.json();

    const data: { nombre?: string; activo?: boolean } = {};

    if (nombre !== undefined) {
      const nombreTrim = String(nombre).trim();
      if (!nombreTrim) {
        return NextResponse.json({ message: 'El nombre es requerido' }, { status: 400 });
      }
      const existente = await prisma.unidadMedida.findFirst({
        where: { nombre: { equals: nombreTrim, mode: 'insensitive' }, NOT: { id: unidadId } },
      });
      if (existente) {
        return NextResponse.json({ message: `Ya existe una unidad "${existente.nombre}"` }, { status: 409 });
      }
      data.nombre = nombreTrim;
    }

    if (activo !== undefined) {
      data.activo = Boolean(activo);
    }

    const unidad = await prisma.unidadMedida.update({ where: { id: unidadId }, data });
    return NextResponse.json(unidad);
  } catch {
    return NextResponse.json({ message: 'Error al actualizar la unidad de medida' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const unidadId = Number(id);

    const unidad = await prisma.unidadMedida.findUnique({ where: { id: unidadId } });
    if (!unidad) {
      return NextResponse.json({ message: 'No encontrada' }, { status: 404 });
    }

    const enUso = await prisma.insumo.count({ where: { unidad_medida: unidad.nombre, activo: true } });
    if (enUso > 0) {
      return NextResponse.json(
        { message: `No se puede eliminar: ${enUso} insumo(s) usan esta unidad. Desactívala en su lugar.` },
        { status: 409 },
      );
    }

    await prisma.unidadMedida.delete({ where: { id: unidadId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Error al eliminar la unidad de medida' }, { status: 500 });
  }
}
