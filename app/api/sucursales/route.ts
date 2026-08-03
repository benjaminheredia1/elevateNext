import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Sucursales activas para la tienda pública: solo lo necesario para que el
 * cliente elija dónde comprar. No expone datos operativos (cuentas, turnos).
 */
export async function GET() {
  try {
    const sucursales = await prisma.sucursal.findMany({
      where: { activa: true },
      orderBy: { id: 'asc' },
      select: { id: true, nombre: true, direccion: true, lat: true, lng: true },
    });
    return NextResponse.json({ data: sucursales });
  } catch (error) {
    console.error('GET /api/sucursales error:', error);
    return NextResponse.json({ error: 'Error al obtener sucursales' }, { status: 500 });
  }
}
