import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function GET(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pedidosHoy, pedidosPendientes, insumos] = await Promise.all([
      prisma.transaccion.findMany({
        where: { created_at: { gte: today } },
        select: { total: true, estado: true, created_at: true },
      }),
      prisma.transaccion.count({ where: { estado: 'PENDIENTE' } }),
      prisma.insumo.findMany(),
    ]);

    const ingresosHoy = pedidosHoy.reduce((acc, p) => acc + Number(p.total), 0);
    const criticos = insumos.filter(i => i.stock_actual <= i.stock_minimo).length;
    const advertencia = insumos.filter(
      i => i.stock_actual > i.stock_minimo && i.stock_actual <= i.stock_minimo * 1.5
    ).length;

    // Pedidos por hora (últimas 12 horas)
    const pedidosPorHora = Array.from({ length: 12 }, (_, i) => {
      const h = new Date();
      h.setHours(h.getHours() - (11 - i), 0, 0, 0);
      const next = new Date(h);
      next.setHours(next.getHours() + 1);
      const count = pedidosHoy.filter(p =>
        new Date(p.created_at) >= h && new Date(p.created_at) < next
      ).length;
      return { hora: `${h.getHours()}:00`, pedidos: count };
    });

    const recentOrders = await prisma.transaccion.findMany({
      take: 5,
      orderBy: { created_at: 'desc' },
      include: {
        transaccionesDetalles_id: { include: { producto: { select: { nombre: true } } } },
      },
    });

    return NextResponse.json({
      data: {
        pedidos_hoy: pedidosHoy.length,
        ingresos_hoy: ingresosHoy,
        pedidos_pendientes: pedidosPendientes,
        insumos_criticos: criticos,
        insumos_advertencia: advertencia,
        pedidos_por_hora: pedidosPorHora,
        pedidos_recientes: recentOrders,
      },
    });
  } catch (error) {
    console.error('GET /api/stats error:', error);
    return NextResponse.json({ error: 'Error al obtener estadísticas' }, { status: 500 });
  }
}

// Not needed as GET handler for Next.js App Router, but good practice
export const dynamic = 'force-dynamic';
