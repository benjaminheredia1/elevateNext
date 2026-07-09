import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, STAFF } from '@/lib/server/auth/guard';

export async function GET(req: NextRequest) {
  const auth = await guard(req, STAFF);
  if (auth instanceof NextResponse) return auth;

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
          porcentaje: i.stock_minimo > 0
            ? Math.min(100, Math.round((i.stock_actual / (i.stock_minimo * 2)) * 100))
            : (i.stock_actual > 0 ? 100 : 0),
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/alertas error:', error);
    return NextResponse.json({ error: 'Error al obtener alertas' }, { status: 500 });
  }
}
