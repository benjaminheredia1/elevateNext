import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { rangoDiaNegocio, hoyISO } from '@/lib/server/fechas';
import { parseSucursal, inicioDelHistorial } from '@/lib/server/finanzas/rango';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import {
  ventasNetas,
  cmvPorReceta,
  gastosOperativos,
  masVendidos,
  diaNegocioDe,
} from '@/lib/server/finanzas/metricas.service';

const RANGO_DIAS: Record<string, number> = { hoy: 1, '7d': 7, '30d': 30 };
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Tope de días de un rango personalizado, para no armar series gigantes. */
const MAX_DIAS_CUSTOM = 366;

/** Días de negocio 'YYYY-MM-DD' del rango, del más antiguo a hoy (Bolivia). */
function diasDelRango(dias: number): string[] {
  const [anio, mes, dia] = hoyISO().split('-').map(Number);
  return Array.from({ length: dias }, (_, i) => {
    const fecha = new Date(Date.UTC(anio, mes - 1, dia - (dias - 1 - i)));
    return fecha.toISOString().slice(0, 10);
  });
}

/** 'YYYY-MM-DD' → epoch UTC. El mes de `Date.UTC` es 0-based: pasarle el número
 *  del ISO tal cual corría el rango un mes entero hacia adelante. */
function epochDe(fechaISO: string): number {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

/** Días de negocio entre dos fechas, inclusive. La fecha de fin nunca es menor a la de inicio. */
function diasEntre(desdeISO: string, hastaISO: string): string[] {
  const inicio = epochDe(desdeISO);
  const fin = epochDe(hastaISO);
  const dias: string[] = [];
  for (let t = inicio; t <= fin && dias.length < MAX_DIAS_CUSTOM; t += 86_400_000) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

/** Días del período pedido: presets fijos o rango personalizado validado. */
async function fechasDelParametro(searchParams: URLSearchParams, rangoParam: string): Promise<string[]> {
  // Todo el historial: del primer registro real hasta hoy. `diasEntre` corta en
  // MAX_DIAS_CUSTOM, así que la serie no crece sin límite con los años.
  if (rangoParam === 'todo') {
    return diasEntre(diaNegocioDe(await inicioDelHistorial()), hoyISO());
  }
  if (rangoParam !== 'custom') return diasDelRango(RANGO_DIAS[rangoParam] ?? 1);

  const hoy = hoyISO();
  const desdeParam = searchParams.get('desde');
  const hastaParam = searchParams.get('hasta');
  const desde = desdeParam && FECHA_ISO.test(desdeParam) ? desdeParam : hoy;
  const hastaPedido = hastaParam && FECHA_ISO.test(hastaParam) ? hastaParam : hoy;
  // Se acepta fin igual al inicio; menor se corrige al inicio en vez de fallar.
  return diasEntre(desde, hastaPedido < desde ? desde : hastaPedido);
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const rangoParam = searchParams.get('rango') ?? 'hoy';
    const sucursal = alcanceSucursal(session, parseSucursal(searchParams));

    const fechas = await fechasDelParametro(searchParams, rangoParam);
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
          ...(sucursal ? { sucursal_id: sucursal } : {}),
        },
        _count: { _all: true },
      }),
      prisma.transaccion.count({ where: { estado: 'PENDIENTE' } }),
      // Stock por local: con el agregado del negocio, un local en cero quedaba
      // tapado por el stock del otro y la alerta nunca saltaba.
      prisma.stockSucursal.findMany({
        where: { insumo: { activo: true }, ...(sucursal ? { sucursal_id: sucursal } : {}) },
        include: { insumo: true, sucursal: { select: { id: true, nombre: true } } },
        orderBy: { insumo: { nombre: 'asc' } },
      }),
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
      .map(f => ({
        ...f.insumo,
        stock_actual: f.stock_actual,
        stock_minimo: f.stock_minimo,
        punto_critico: f.punto_critico,
        sucursal_id: f.sucursal.id,
        sucursal: f.sucursal.nombre,
        nivel: f.stock_actual <= f.stock_minimo ? 'critico' : f.stock_actual <= f.stock_minimo * 1.5 ? 'advertencia' : 'ok',
        porcentaje: f.stock_minimo > 0 ? Math.min(100, (f.stock_actual / (f.stock_minimo * 2)) * 100) : 100,
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
