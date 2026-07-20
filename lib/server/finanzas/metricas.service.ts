/**
 * metricas.service.ts — Definiciones canónicas de las métricas financieras.
 * Todas las pantallas (dashboard, analítica, contabilidad) deben leer de aquí
 * para que "ventas", "CMV" y "gastos" signifiquen lo mismo en todo el sistema.
 *
 * - Ventas (devengado): Transaccion ENTREGADO/PAGADO, sin cortesías ni
 *   canceladas. Incluye fiados y pagos online aunque no hayan tocado caja.
 * - CMV: consumo por receta de lo vendido × costo_promedio actual del insumo
 *   (no las compras del período; esas pertenecen al flujo de caja).
 * - Gastos operativos: MovimientoCaja GASTO_OPERATIVO (sin categoría Insumos)
 *   + gastos fijos prorrateados por día.
 */
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { costoFichaTecnica } from '@/lib/server/inventario/inventario.service';
import { equivalenteMensual } from './gastos-fijos.service';
import type { RangoFechas } from './rango';

const TZ = 'America/La_Paz';
const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

/** 'YYYY-MM-DD' del día de negocio (Bolivia) al que pertenece un instante. */
export function diaNegocioDe(instante: Date): string {
  return formatoDia.format(instante);
}

export const ESTADOS_VENTA = ['ENTREGADO', 'PAGADO'] as const;

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

/** Filtro Prisma de las ventas netas del rango (devengado). */
export function whereVentasNetas(rango: RangoFechas, sucursal?: number): Prisma.TransaccionWhereInput {
  return {
    created_at: { gte: rango.desde, lte: rango.hasta },
    estado: { in: [...ESTADOS_VENTA] },
    es_cortesia: false,
    ...(sucursal ? { turno: { sucursal_id: sucursal } } : {}),
  };
}

export interface VentasNetas {
  total: number;
  cantidad: number;
  ticket_promedio: number;
  /** Parte de las ventas cuyo pago sigue pendiente (fiados, COD en curso). */
  por_cobrar: number;
  por_dia: { fecha: string; total: number; cantidad: number }[];
}

export async function ventasNetas(rango: RangoFechas, sucursal?: number): Promise<VentasNetas> {
  const ventas = await prisma.transaccion.findMany({
    where: whereVentasNetas(rango, sucursal),
    select: { total: true, created_at: true, payment_status: true },
  });

  let total = new Prisma.Decimal(0);
  let porCobrar = new Prisma.Decimal(0);
  const porDia = new Map<string, { total: Prisma.Decimal; cantidad: number }>();

  for (const venta of ventas) {
    total = total.plus(venta.total);
    if (venta.payment_status !== 'PAGADO') porCobrar = porCobrar.plus(venta.total);
    const fecha = diaNegocioDe(venta.created_at);
    const dia = porDia.get(fecha) ?? { total: new Prisma.Decimal(0), cantidad: 0 };
    porDia.set(fecha, { total: dia.total.plus(venta.total), cantidad: dia.cantidad + 1 });
  }

  return {
    total: toNumber(total),
    cantidad: ventas.length,
    ticket_promedio: ventas.length ? toNumber(total.div(ventas.length)) : 0,
    por_cobrar: toNumber(porCobrar),
    por_dia: Array.from(porDia.entries())
      .map(([fecha, v]) => ({ fecha, total: toNumber(v.total), cantidad: v.cantidad }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

/**
 * CMV del período: consumo por receta de lo vendido × costo_promedio actual.
 * Productos sin receta (o de reventa sin insumo espejo) aportan 0.
 */
export async function cmvPorReceta(rango: RangoFechas, sucursal?: number): Promise<number> {
  const detalles = await prisma.transaccionesDetalles.findMany({
    where: { transaccion: whereVentasNetas(rango, sucursal) },
    select: { producto_id: true, cantidad: true },
  });

  const cantidades = new Map<number, number>();
  for (const detalle of detalles) {
    cantidades.set(detalle.producto_id, (cantidades.get(detalle.producto_id) ?? 0) + Number(detalle.cantidad));
  }

  const costos = await Promise.all(
    Array.from(cantidades.keys()).map(async (productoId) => ({
      productoId,
      costo: await costoFichaTecnica(productoId),
    })),
  );

  let cmv = 0;
  for (const { productoId, costo } of costos) {
    cmv += costo * (cantidades.get(productoId) ?? 0);
  }
  return Number(cmv.toFixed(2));
}

export interface GastosOperativos {
  total: number;
  de_caja: number;
  fijos_prorrateados: number;
}

/** Gastos operativos del rango: gastos de caja (sin Insumos) + fijos prorrateados. */
export async function gastosOperativos(rango: RangoFechas, sucursal?: number): Promise<GastosOperativos> {
  const [movimientos, gastosFijos] = await Promise.all([
    prisma.movimientoCaja.findMany({
      where: {
        created_at: { gte: rango.desde, lte: rango.hasta },
        tipo: 'GASTO_OPERATIVO',
        ...(sucursal ? { turno: { sucursal_id: sucursal } } : {}),
      },
      select: { monto: true, categoria: true },
    }),
    prisma.gastoFijo.findMany({ where: { activo: true } }),
  ]);

  const deCaja = movimientos
    .filter(m => m.categoria !== 'Insumos')
    .reduce((sum, m) => sum.plus(m.monto.abs()), new Prisma.Decimal(0));

  const diasRango = Math.max(1, Math.ceil((rango.hasta.getTime() - rango.desde.getTime()) / 86_400_000));
  const fijos = gastosFijos.reduce((sum, gasto) => {
    const diario = equivalenteMensual(Number(gasto.monto), gasto.frecuencia) / 30;
    return sum + diario * diasRango;
  }, 0);

  return {
    total: Number((toNumber(deCaja) + fijos).toFixed(2)),
    de_caja: toNumber(deCaja),
    fijos_prorrateados: Number(fijos.toFixed(2)),
  };
}

export interface ProductoVendido {
  producto_id: number;
  nombre: string;
  cantidad: number;
  total: number;
}

/** Top de productos vendidos (por unidades) dentro de las ventas netas del rango. */
export async function masVendidos(rango: RangoFechas, sucursal?: number, limite = 5): Promise<ProductoVendido[]> {
  const detalles = await prisma.transaccionesDetalles.findMany({
    where: { transaccion: whereVentasNetas(rango, sucursal) },
    select: {
      producto_id: true,
      cantidad: true,
      precio_unitario: true,
      producto: { select: { nombre: true } },
    },
  });

  const vendidos = new Map<number, ProductoVendido>();
  for (const detalle of detalles) {
    const actual = vendidos.get(detalle.producto_id) ?? {
      producto_id: detalle.producto_id,
      nombre: detalle.producto.nombre,
      cantidad: 0,
      total: 0,
    };
    actual.cantidad += Number(detalle.cantidad);
    actual.total += Number(detalle.precio_unitario) * Number(detalle.cantidad);
    vendidos.set(detalle.producto_id, actual);
  }

  return Array.from(vendidos.values())
    .map(v => ({ ...v, total: Number(v.total.toFixed(2)) }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, limite);
}
