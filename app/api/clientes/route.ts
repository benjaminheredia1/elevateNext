import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    const clientes = await prisma.cliente.findMany({
      where: {
        es_anonimo: false,
        ...(search ? {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' } },
            { telefono: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: {
        transacciones: {
          select: { total: true, created_at: true },
          orderBy: { created_at: 'asc' },
        }
      },
      orderBy: { created_at: 'desc' },
    });

    const clientesConStats = clientes.map(c => ({
      ...c,
      total_pedidos: c.transacciones.length,
      total_gastado: c.transacciones.reduce((a, t) => a + t.total, 0),
      primer_pedido: c.transacciones[0]?.created_at ?? null,
    }));

    const totalIngresos = clientesConStats.reduce((a, c) => a + c.total_gastado, 0);
    const gastoPromedio = clientes.length > 0 ? totalIngresos / clientes.length : 0;

    return NextResponse.json({
      data: clientesConStats,
      stats: {
        total_clientes: clientes.length,
        total_ingresos: totalIngresos,
        gasto_promedio: gastoPromedio,
      }
    });
  } catch (error) {
    console.error('GET /api/clientes error:', error);
    return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nombre, telefono, direccion } = body;
    if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });

    // Buscar si ya existe un cliente con ese teléfono
    if (telefono) {
      const existing = await prisma.cliente.findFirst({ where: { telefono } });
      if (existing) {
        return NextResponse.json({ data: existing, existed: true });
      }
    }

    const cliente = await prisma.cliente.create({
      data: { nombre, telefono, direccion },
    });
    return NextResponse.json({ data: cliente }, { status: 201 });
  } catch (error) {
    console.error('POST /api/clientes error:', error);
    return NextResponse.json({ error: 'Error al crear cliente' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
