import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const insumos = await prisma.insumo.findMany({ orderBy: { nombre: 'asc' } });

    const criticos = insumos.filter(i => i.stock_actual <= i.stock_minimo);
    const advertencia = insumos.filter(
      i => i.stock_actual > i.stock_minimo && i.stock_actual <= i.stock_minimo * 1.5
    );
    const ok = insumos.filter(i => i.stock_actual > i.stock_minimo * 1.5);

    return NextResponse.json({
      data: {
        criticos,
        advertencia,
        ok,
        total_alertas: criticos.length + advertencia.length,
        resumen: insumos.map(i => ({
          ...i,
          nivel: i.stock_actual <= i.stock_minimo
            ? 'critico'
            : i.stock_actual <= i.stock_minimo * 1.5
              ? 'advertencia'
              : 'ok',
          porcentaje: Math.min(100, (i.stock_actual / (i.stock_minimo * 2)) * 100),
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/alertas error:', error);
    return NextResponse.json({ error: 'Error al obtener alertas' }, { status: 500 });
  }
}
