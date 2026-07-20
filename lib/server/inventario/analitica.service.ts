/**
 * analitica.service.ts
 * KPIs de ventas e inventario del período seleccionado: ventas por día,
 * food cost, ingeniería de menú, heatmap y mix por categoría/marca.
 * Todas las agrupaciones de día/hora usan la zona horaria del negocio
 * (Bolivia) — nunca la del servidor.
 */
import prisma from '@/lib/prisma';
import { costoFichaTecnica } from './inventario.service';
import { hoyISO, rangoDiaNegocio } from '@/lib/server/fechas';
import { diaNegocioDe, ESTADOS_VENTA } from '@/lib/server/finanzas/metricas.service';
import type { Rango } from '@/lib/server/dto/inventario.dto';

const TZ = 'America/La_Paz';
const formatoHora = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false });
const formatoDiaSemana = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const DIA_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// ─────────────────────────────────────────────────────────
// Helper: inicio del rango anclado al día de negocio
// ─────────────────────────────────────────────────────────
function fechaDesde(rango: Rango): Date {
  const dias = rango === '7d' ? 7 : rango === '30d' ? 30 : 90;
  const [anio, mes, dia] = hoyISO().split('-').map(Number);
  const inicio = new Date(Date.UTC(anio, mes - 1, dia - (dias - 1)));
  return rangoDiaNegocio(inicio.toISOString().slice(0, 10)).desde;
}

// ─────────────────────────────────────────────────────────
// Tipos de retorno
// ─────────────────────────────────────────────────────────
export interface VentaDia   { fecha: string; total: number; cantidad: number }
export interface MenuItem {
  producto_id: number;
  nombre: string;
  ventas: number;
  total_vendido: number;
  precio: number;
  costo: number;
  food_cost_pct: number;
  margen: number;
  categoria: 'Estrella' | 'Caballo' | 'Puzzle' | 'Perro';
}
export interface HeatmapCell { diaSemana: number; hora: number; ventas: number }
export interface MixItem    { nombre: string; total: number; pct: number }

export interface AnaliticaResult {
  ventasPorDia:       VentaDia[];
  foodCostTotal:      number;
  cmvTotal:           number;
  margenBruto:        number;
  ingenieriaMeniu:    MenuItem[];
  heatmap:            HeatmapCell[];
  mixCategoria:       MixItem[];
  mixMarca:           MixItem[];
  totalVentas:        number;
  totalTransacciones: number;
  ticketPromedio:     number;
}

// ─────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────
export async function getAnalitica(rango: Rango): Promise<AnaliticaResult> {
  const desde = fechaDesde(rango);

  // ── Ventas netas del período (sin cortesías) ──────────────────
  const transacciones = await prisma.transaccion.findMany({
    where: {
      created_at: { gte: desde },
      estado:     { in: [...ESTADOS_VENTA] },
      es_cortesia: false,
    },
    include: {
      transaccionesDetalles_id: {
        include: {
          producto: {
            include: {
              categoria_id: { include: { categoria: true } },
              marcas:       { include: { marca: true } },
            },
          },
        },
      },
    },
    orderBy: { created_at: 'asc' },
  });

  // ── Ventas por día de negocio ─────────────────────────────────
  const ventasDiaMap = new Map<string, { total: number; cantidad: number }>();
  let totalVentas = 0;

  for (const t of transacciones) {
    const fecha = diaNegocioDe(t.created_at);
    const prev  = ventasDiaMap.get(fecha) ?? { total: 0, cantidad: 0 };
    ventasDiaMap.set(fecha, { total: prev.total + Number(t.total), cantidad: prev.cantidad + 1 });
    totalVentas += Number(t.total);
  }

  const ventasPorDia: VentaDia[] = Array.from(ventasDiaMap.entries())
    .map(([fecha, v]) => ({ fecha, total: Number(v.total.toFixed(2)), cantidad: v.cantidad }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // ── Ventas por producto ───────────────────────────────────────
  const productoVentas = new Map<number, { nombre: string; ventas: number; totalVentas: number; precio: number }>();

  for (const t of transacciones) {
    for (const d of t.transaccionesDetalles_id) {
      const pid = d.producto_id;
      const prev = productoVentas.get(pid) ?? {
        nombre:      d.producto.nombre,
        ventas:      0,
        totalVentas: 0,
        precio:      Number(d.producto.precio),
      };
      productoVentas.set(pid, {
        ...prev,
        ventas:      prev.ventas + d.cantidad,
        totalVentas: prev.totalVentas + Number(d.precio_unitario) * d.cantidad,
      });
    }
  }

  // ── Costos por receta (una sola pasada, en paralelo) ──────────
  const prodIds = Array.from(productoVentas.keys());
  const costosPorProducto = new Map<number, number>(
    await Promise.all(
      prodIds.map(async (id): Promise<[number, number]> => [id, await costoFichaTecnica(id)]),
    ),
  );

  // ── CMV, food cost y margen bruto del período ─────────────────
  let cmvTotal = 0;
  for (const [pid, data] of productoVentas.entries()) {
    cmvTotal += (costosPorProducto.get(pid) ?? 0) * data.ventas;
  }
  const foodCostTotal = totalVentas > 0 ? (cmvTotal / totalVentas) * 100 : 0;
  const margenBruto = totalVentas > 0 ? ((totalVentas - cmvTotal) / totalVentas) * 100 : 0;

  // ── Ingeniería de menú (matriz popularidad × rentabilidad) ─────
  const ventasArr = prodIds.map(id => productoVentas.get(id)!.ventas);
  const medVentas = mediana(ventasArr);

  const margenPct = (id: number) => {
    const precio = productoVentas.get(id)!.precio;
    const costo = costosPorProducto.get(id) ?? 0;
    return precio > 0 ? ((precio - costo) / precio) * 100 : 0;
  };
  const medMargen = mediana(prodIds.map(margenPct));

  const ingenieriaMeniu: MenuItem[] = prodIds.map((id) => {
    const data   = productoVentas.get(id)!;
    const costo  = costosPorProducto.get(id) ?? 0;
    const margen = margenPct(id);
    const altaVenta  = data.ventas >= medVentas;
    const altoMargen = margen >= medMargen;

    let categoria: MenuItem['categoria'];
    if (altaVenta  && altoMargen)  categoria = 'Estrella';
    else if (altaVenta  && !altoMargen) categoria = 'Caballo';
    else if (!altaVenta && altoMargen)  categoria = 'Puzzle';
    else                                categoria = 'Perro';

    return {
      producto_id: id,
      nombre: data.nombre,
      ventas: data.ventas,
      total_vendido: Number(data.totalVentas.toFixed(2)),
      precio: data.precio,
      costo: Number(costo.toFixed(2)),
      food_cost_pct: data.precio > 0 ? Number(((costo / data.precio) * 100).toFixed(2)) : 0,
      margen: Number(margen.toFixed(2)),
      categoria,
    };
  });

  // ── Heatmap hora × día de semana (hora de Bolivia) ────────────
  const heatmapMap = new Map<string, number>();
  for (const t of transacciones) {
    const dia = DIA_SEMANA[formatoDiaSemana.format(t.created_at)] ?? 0;
    const hora = Number(formatoHora.format(t.created_at)) % 24;
    const key = `${dia}-${hora}`;
    heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + Number(t.total));
  }
  const heatmap: HeatmapCell[] = Array.from(heatmapMap.entries()).map(([k, v]) => {
    const [dia, hora] = k.split('-').map(Number);
    return { diaSemana: dia, hora, ventas: Number(v.toFixed(2)) };
  });

  // ── Mix por categoría y por marca ─────────────────────────────
  const catMap = new Map<string, number>();
  const marcaMap = new Map<string, number>();
  for (const t of transacciones) {
    for (const d of t.transaccionesDetalles_id) {
      const monto = Number(d.precio_unitario) * d.cantidad;
      const cat = d.producto.categoria_id[0]?.categoria?.nombre ?? 'Sin categoría';
      catMap.set(cat, (catMap.get(cat) ?? 0) + monto);
      const marca = d.producto.marcas[0]?.marca?.nombre ?? 'Sin marca';
      marcaMap.set(marca, (marcaMap.get(marca) ?? 0) + monto);
    }
  }

  return {
    ventasPorDia,
    foodCostTotal:      Math.round(foodCostTotal * 100) / 100,
    cmvTotal:           Math.round(cmvTotal * 100) / 100,
    margenBruto:        Math.round(margenBruto * 100) / 100,
    ingenieriaMeniu,
    heatmap,
    mixCategoria:       toMixItems(catMap),
    mixMarca:           toMixItems(marcaMap),
    totalVentas:        Math.round(totalVentas * 100) / 100,
    totalTransacciones: transacciones.length,
    ticketPromedio:     transacciones.length > 0 ? Math.round((totalVentas / transacciones.length) * 100) / 100 : 0,
  };
}

// ─────────────────────────────────────────────────────────
// Utils privados
// ─────────────────────────────────────────────────────────
function mediana(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toMixItems(map: Map<string, number>): MixItem[] {
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .map(([nombre, v]) => ({ nombre, total: Math.round(v * 100) / 100, pct: total > 0 ? Math.round((v / total) * 10000) / 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}
