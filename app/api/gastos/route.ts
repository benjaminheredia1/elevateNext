import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

// POST /api/gastos - registrar un gasto
export async function POST(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { monto, descripcion, caja_id } = body;

    if (!monto || !descripcion) {
      return NextResponse.json({ error: 'Monto y descripción son requeridos' }, { status: 400 });
    }

    let cajaId = caja_id;
    if (!cajaId) {
      const cajaActiva = await prisma.caja.findFirst({ where: { estado: 'ABIERTA' } });
      if (!cajaActiva) {
        return NextResponse.json({ error: 'No hay caja abierta' }, { status: 400 });
      }
      cajaId = cajaActiva.id;
    }

    const gasto = await prisma.gasto.create({
      data: { monto: Number(monto), descripcion, caja_id: cajaId },
    });
    return NextResponse.json({ data: gasto }, { status: 201 });
  } catch (error) {
    console.error('POST /api/gastos error:', error);
    return NextResponse.json({ error: 'Error al registrar gasto' }, { status: 500 });
  }
}

// GET /api/gastos
export async function GET(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const gastos = await prisma.gasto.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
      include: { caja: { select: { fecha_apertura: true } } },
    });
    return NextResponse.json({ data: gastos });
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener gastos' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
