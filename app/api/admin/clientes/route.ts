import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.toLowerCase() ?? '';

    const clientes = await prisma.cliente.findMany({
      include: {
        transacciones: {
          select: { total: true, created_at: true, estado: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const items = clientes
      .map(c => {
        const txs = c.transacciones;
        const total_gastado = txs.reduce((s, t) => s + t.total, 0);
        const primer_pedido = txs.length > 0
          ? txs.reduce((min, t) => t.created_at < min ? t.created_at : min, txs[0].created_at)
          : null;
        return {
          id: c.id,
          nombre: c.nombre,
          telefono: c.telefono,
          direccion: c.direccion,
          pedidos: txs.length,
          total_gastado: Number(total_gastado.toFixed(2)),
          gasto_promedio: txs.length > 0 ? Number((total_gastado / txs.length).toFixed(2)) : 0,
          primer_pedido,
          created_at: c.created_at,
        };
      })
      .filter(c => !q || c.nombre.toLowerCase().includes(q) || (c.telefono ?? '').includes(q));

    const totalClientes = items.length;
    const totalIngresos = Number(items.reduce((s, c) => s + c.total_gastado, 0).toFixed(2));
    const gastoPromedio = totalClientes > 0 ? Number((totalIngresos / totalClientes).toFixed(2)) : 0;

    return NextResponse.json({
      items,
      resumen: { total_clientes: totalClientes, ingresos_totales: totalIngresos, gasto_promedio: gastoPromedio },
    });
  } catch (e) { return handleApiError(e); }
}
