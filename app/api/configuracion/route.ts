import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function GET() {
  try {
    const config = await prisma.configuracion.findUnique({
      where: { id: 1 },
    });
    
    // Default fallback to Santa Cruz if not set
    if (!config) {
      return NextResponse.json({
        data: {
          id: 1,
          sucursal_lat: -17.7710,
          sucursal_lng: -63.1900,
          sucursal_nombre: 'Sucursal Principal',
        }
      });
    }

    return NextResponse.json({ data: config });
  } catch (error) {
    console.error('GET config error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { sucursal_lat, sucursal_lng, sucursal_nombre } = body;

    const config = await prisma.configuracion.upsert({
      where: { id: 1 },
      update: {
        sucursal_lat: Number(sucursal_lat),
        sucursal_lng: Number(sucursal_lng),
        sucursal_nombre: sucursal_nombre || 'Sucursal Principal'
      },
      create: {
        id: 1,
        sucursal_lat: Number(sucursal_lat),
        sucursal_lng: Number(sucursal_lng),
        sucursal_nombre: sucursal_nombre || 'Sucursal Principal'
      }
    });

    return NextResponse.json({ data: config, message: 'Configuración actualizada' });
  } catch (error) {
    console.error('POST config error:', error);
    return NextResponse.json({ error: 'Error al guardar la configuración' }, { status: 500 });
  }
}
