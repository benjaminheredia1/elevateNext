import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { rangoDiaNegocio, hoyISO } from '@/lib/server/fechas';
import {
  ventasNetas,
  cmvPorReceta,
  gastosOperativos,
  masVendidos,
} from '@/lib/server/finanzas/metricas.service';

const RANGO_DIAS: Record<string, number> = { hoy: 1, '7d': 7, '30d': 30 };

/** Días de negocio 'YYYY-MM-DD' del rango, del más antiguo a hoy (Bolivia). */
function diasDelRango(dias: number): string[] {
  const [anio, mes, dia] = hoyISO().split('-').map(Number);
  return Array.from({ length: dias }, (_, i) => {
    const fecha = new Date(Date.UTC(anio, mes - 1, dia - (dias - 1 - i)));
    return fecha.toISOString().slice(0, 10);
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const rangoParam = searchParams.get('rango') ?? 'hoy';
    const dias = RANGO_DIAS[rangoParam] ?? 1;
    const sucursal = searchParams.get('sucursal') ? Number(searchParams.get('sucursal')) : undefined;

    const fechas = diasDelRango(dias);
    const rango = {
      desde: rangoDiaNegocio(fechas[0]).desde,
      hasta: rangoDiaNegocio(fechas[fechas.length - 1]).hasta,
    };

    const [ventas, cmv, gastos, top, pedidosRango, pedidosPendientes, insumos, turnoActivo, recentOrders] = await Promise.all([
      ventasNetas(rango, sucursal),
      cmvPorReceta(rango, sucursal),
      gastosOperativos(rango, sucursal),
      masVendidos(rango, sucursal),
      prisma.transaccion.groupBy({
        by: ['estado'],
        where: {
          created_at: { gte: rango.desde, lte: rango.hasta },
          ...(sucursal ? { turno: { sucursal_id: sucursal } } : {}),
        },
        _count: { _all: true },
      }),
      prisma.transaccion.count({ where: { estado: 'PENDIENTE' } }),
      prisma.insumo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      prisma.cajaTurno.findFirst({
        where: { estado: 'ABIERTO', ...(sucursal ? { sucursal_id: sucursal } : {}) },
        include: { cajero: { select: { nombre: true, email: true } }, sucursal: { select: { nombre: true } } },
        orderBy: { fecha_apertura: 'desc' },
      }),
      prisma.transaccion.findMany({
        take: 5,
        orderBy: { created_at: 'desc' },
        include: { transaccionesDetalles_id: { include: { producto: { select: { nombre: true } } } } },
      }),
    ]);

    const cancelados = pedidosRango.find(p => p.estado === 'CANCELADO')?._count._all ?? 0;
    const pedidos = pedidosRango.reduce((sum, p) => sum + p._count._all, 0) - cancelados;

    const utilidad = Number((ventas.total - cmv - gastos.total).toFixed(2));
    const margenBrutoPct = ventas.total > 0 ? Number((((ventas.total - cmv) / ventas.total) * 100).toFixed(2)) : 0;
    const foodCostPct = ventas.total > 0 ? Number(((cmv / ventas.total) * 100).toFixed(2)) : 0;

    // Serie diaria con días sin ventas en cero (para el gráfico de tendencia).
    const porDia = new Map(ventas.por_dia.map(d => [d.fecha, d]));
    const serie = fechas.map(fecha => ({
      fecha,
      ventas: porDia.get(fecha)?.total ?? 0,
      pedidos: porDia.get(fecha)?.cantidad ?? 0,
    }));

    const alertas = insumos
      .map(i => ({
        ...i,
        nivel: i.stock_actual <= i.stock_minimo ? 'critico' : i.stock_actual <= i.stock_minimo * 1.5 ? 'advertencia' : 'ok',
        porcentaje: Math.min(100, (i.stock_actual / (i.stock_minimo * 2)) * 100),
      }))
      .filter(i => i.nivel !== 'ok');

    return NextResponse.json({
      rango: rangoParam,
      kpis: {
        ventas: ventas.total,
        pedidos,
        cancelados,
        ticket_promedio: ventas.ticket_promedio,
        utilidad,
        margen_bruto_pct: margenBrutoPct,
        food_cost_pct: foodCostPct,
        por_cobrar: ventas.por_cobrar,
        pedidos_pendientes: pedidosPendientes,
      },
      contabilidad: {
        ingresos: ventas.total,
        cmv,
        gastos_operativos: gastos.total,
        gastos_fijos_prorrateados: gastos.fijos_prorrateados,
        utilidad,
      },
      serie,
      mas_vendidos: top,
      alertas_inventario: alertas,
      turno_activo: turnoActivo,
      pedidos_recientes: recentOrders,
    });
  } catch (e) { return handleApiError(e); }
}
