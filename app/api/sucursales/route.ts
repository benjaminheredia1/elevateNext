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
      select: {
        id: true, nombre: true, direccion: true, telefono: true, maps_url: true, lat: true, lng: true,
        // Tarifa de delivery: el checkout cotiza el envío en el navegador para
        // mostrarlo mientras el cliente mueve el pin, sin ir y volver al server.
        envio_base: true, envio_km_incluidos: true, envio_por_km: true,
        envio_maximo: true, envio_radio_km: true,
      },
    });
    // Los Decimal de Prisma serializan como string y el checkout hace cuentas
    // con ellos: se mandan como número para que no termine concatenando texto.
    return NextResponse.json({
      data: sucursales.map(s => ({
        ...s,
        envio_base: Number(s.envio_base),
        envio_por_km: Number(s.envio_por_km),
        envio_maximo: s.envio_maximo == null ? null : Number(s.envio_maximo),
      })),
    });
  } catch (error) {
    console.error('GET /api/sucursales error:', error);
    return NextResponse.json({ error: 'Error al obtener sucursales' }, { status: 500 });
  }
}
