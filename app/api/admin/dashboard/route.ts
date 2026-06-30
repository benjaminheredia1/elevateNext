import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function decimalNumber(value: any) {
  return Number(Number(value ?? 0).toFixed(2));
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const fecha = searchParams.get('fecha') ? new Date(String(searchParams.get('fecha'))) : new Date();
    const desde = startOfDay(fecha);
    const hasta = endOfDay(fecha);
    const sucursal = searchParams.get('sucursal') ? Number(searchParams.get('sucursal')) : undefined;

    const [pedidosHoy, pedidosPendientes, detallesHoy, movimientosHoy, insumos, turnoActivo, recentOrders] = await Promise.all([
      prisma.transaccion.findMany({
        where: { created_at: { gte: desde, lte: hasta }, ...(sucursal ? { turno: { sucursal_id: sucursal } } : {}) },
        select: { id: true, total: true, estado: true, created_at: true, es_cortesia: true },
      }),
      prisma.transaccion.count({ where: { estado: 'PENDIENTE' } }),
      prisma.transaccionesDetalles.findMany({
        where: { transaccion: { created_at: { gte: desde, lte: hasta }, ...(sucursal ? { turno: { sucursal_id: sucursal } } : {}) } },
        include: { producto: { select: { id: true, nombre: true } } },
      }),
      prisma.movimientoCaja.findMany({
        where: { created_at: { gte: desde, lte: hasta }, ...(sucursal ? { turno: { sucursal_id: sucursal } } : {}) },
        include: { transaccion: true },
      }),
      prisma.insumo.findMany({ orderBy: { nombre: 'asc' } }),
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

    // Ventas = transacciones completadas del día (incluye pedidos web y ventas de caja,
    // sin doble conteo porque la venta de caja crea una sola Transaccion).
    const ESTADOS_VENTA = new Set(['ENTREGADO', 'PAGADO']);
    const ventasHoy = pedidosHoy.filter(p => ESTADOS_VENTA.has(p.estado) && !p.es_cortesia);
    const ingresos = ventasHoy.reduce((sum, p) => sum + decimalNumber(p.total), 0);
    const cmv = movimientosHoy
      .filter(m => m.tipo === 'COMPRA_INSUMO' || (m.tipo === 'GASTO_OPERATIVO' && m.categoria === 'Insumos'))
      .reduce((sum, m) => sum + Math.abs(decimalNumber(m.monto)), 0);
    const otrosGastos = movimientosHoy
      .filter(m => m.tipo === 'GASTO_OPERATIVO' && m.categoria !== 'Insumos')
      .reduce((sum, m) => sum + Math.abs(decimalNumber(m.monto)), 0);
    const utilidad = ingresos - cmv - otrosGastos;

    const vendidos = new Map<number, { producto_id: number; nombre: string; cantidad: number; total: number }>();
    for (const detalle of detallesHoy) {
      const current = vendidos.get(detalle.producto_id) ?? { producto_id: detalle.producto_id, nombre: detalle.producto.nombre, cantidad: 0, total: 0 };
      current.cantidad += Number(detalle.cantidad);
      current.total += Number(detalle.precio_unitario) * Number(detalle.cantidad);
      vendidos.set(detalle.producto_id, current);
    }

    const pedidosPorHora = Array.from({ length: 12 }, (_, i) => {
      const h = new Date();
      h.setHours(h.getHours() - (11 - i), 0, 0, 0);
      const next = new Date(h);
      next.setHours(next.getHours() + 1);
      return {
        hora: `${h.getHours()}:00`,
        pedidos: pedidosHoy.filter(p => new Date(p.created_at) >= h && new Date(p.created_at) < next).length,
      };
    });

    const alertas = insumos
      .map(i => ({
        ...i,
        nivel: i.stock_actual <= i.stock_minimo ? 'critico' : i.stock_actual <= i.stock_minimo * 1.5 ? 'advertencia' : 'ok',
        porcentaje: Math.min(100, (i.stock_actual / (i.stock_minimo * 2)) * 100),
      }))
      .filter(i => i.nivel !== 'ok');

    return NextResponse.json({
      kpis: {
        ganancia_hoy: decimalNumber(utilidad),
        ventas: decimalNumber(ingresos),
        pedidos: pedidosHoy.length,
        ticket_promedio: ventasHoy.length ? decimalNumber(ingresos / ventasHoy.length) : 0,
        pedidos_pendientes: pedidosPendientes,
      },
      contabilidad_hoy: {
        ingresos: decimalNumber(ingresos),
        cmv: decimalNumber(cmv),
        otros_gastos: decimalNumber(otrosGastos),
        utilidad: decimalNumber(utilidad),
      },
      mas_vendidos: Array.from(vendidos.values()).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5),
      alertas_inventario: alertas,
      turno_activo: turnoActivo,
      pedidos_por_hora: pedidosPorHora,
      pedidos_recientes: recentOrders,
    });
  } catch (e) { return handleApiError(e); }
}
