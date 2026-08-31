/**
 * metricas.service.ts — Definiciones canónicas de las métricas financieras.
 * Todas las pantallas (dashboard, analítica, contabilidad) deben leer de aquí
 * para que "ventas", "CMV" y "gastos" signifiquen lo mismo en todo el sistema.
 *
 * - Ventas (devengado): Transaccion ENTREGADO/PAGADO, sin cortesías ni
 *   canceladas. Incluye fiados y pagos online aunque no hayan tocado caja.
 * - CMV: consumo por receta de lo vendido × costo CONGELADO en cada línea al
 *   momento de vender; las líneas anteriores a ese campo (sin costo congelado)
 *   caen al costo actual del insumo (no las compras del período; esas
 *   pertenecen al flujo de caja).
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
    // Se filtra por la columna propia de la venta, no por su turno: las ventas
    // web no tienen turno y con el filtro anterior desaparecían del reporte.
    ...(sucursal ? { sucursal_id: sucursal } : {}),
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
 * CMV del período: suma el costo CONGELADO de cada línea vendida
 * (costo_unitario × cantidad). Las líneas de antes de este cambio no tienen
 * costo congelado (quedaron en null) y caen al costo actual del insumo, igual
 * que se comportaba todo el sistema hasta ahora — sin eso, un reporte de un
 * período viejo se quedaría en blanco en vez de aproximar.
 */
export async function cmvPorReceta(rango: RangoFechas, sucursal?: number): Promise<number> {
  const detalles = await prisma.transaccionesDetalles.findMany({
    where: { transaccion: whereVentasNetas(rango, sucursal) },
    select: {
      producto_id: true, cantidad: true, costo_unitario: true,
      transaccion: { select: { sucursal_id: true } },
    },
  });

  // Las líneas sin costo congelado necesitan el costo en vivo. Se resuelven todas
  // juntas antes de sumar: con `await` dentro del bucle, cada ficha técnica esperaba
  // a la anterior, y como las ventas previas a este campo nunca se backfillean, ese
  // camino es el de TODOS los reportes con datos viejos — serializarlo son cientos
  // de consultas en fila contra una base remota.
  const clavesPendientes = new Map<string, { productoId: number; sucursalId: number }>();
  for (const detalle of detalles) {
    if (detalle.costo_unitario != null) continue;
    const sucursalId = detalle.transaccion.sucursal_id;
    clavesPendientes.set(`${detalle.producto_id}:${sucursalId}`, { productoId: detalle.producto_id, sucursalId });
  }
  const costoEnVivo = new Map(await Promise.all(
    Array.from(clavesPendientes, async ([clave, { productoId, sucursalId }]): Promise<[string, number]> =>
      [clave, await costoFichaTecnica(productoId, undefined, sucursalId)]),
  ));

  let cmv = 0;
  for (const detalle of detalles) {
    const costo = detalle.costo_unitario != null
      ? detalle.costo_unitario
      : (costoEnVivo.get(`${detalle.producto_id}:${detalle.transaccion.sucursal_id}`) ?? 0);
    cmv += costo * Number(detalle.cantidad);
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
        ...(sucursal ? { sucursal_id: sucursal } : {}),
      },
      select: { monto: true, categoria: true },
    }),
    // Los gastos fijos son del local: al filtrar por sucursal solo prorratean
    // los suyos, para que la utilidad por sucursal sea honesta.
    prisma.gastoFijo.findMany({ where: { activo: true, ...(sucursal ? { sucursal_id: sucursal } : {}) } }),
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
