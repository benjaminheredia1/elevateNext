/**
 * analitica.service.ts
 * KPIs de ventas e inventario: ventas por día, food cost,
 * ingeniería de menú, heatmap, mix por categoría y marca.
 */
import prisma from '@/lib/prisma';
import { costoFichaTecnica } from './inventario.service';
import type { Rango } from '@/lib/server/dto/inventario.dto';

// ─────────────────────────────────────────────────────────
// Helper: fecha de inicio según rango
// ─────────────────────────────────────────────────────────
function fechaDesde(rango: Rango): Date {
  const d = new Date();
  const dias = rango === '7d' ? 7 : rango === '30d' ? 30 : 90;
  d.setDate(d.getDate() - dias);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─────────────────────────────────────────────────────────
// Tipos de retorno
// ─────────────────────────────────────────────────────────
export interface VentaDia   { fecha: string; total: number; cantidad: number }
export interface MenuItem   { producto_id: number; nombre: string; ventas: number; margen: number; categoria: 'Estrella' | 'Caballo' | 'Puzzle' | 'Perro' }
export interface HeatmapCell { diaSemana: number; hora: number; ventas: number }
export interface MixItem    { nombre: string; total: number; pct: number }

export interface AnaliticaResult {
  ventasPorDia:       VentaDia[];
  foodCostTotal:      number;
  ingenieriaMeniu:    MenuItem[];
  heatmap:            HeatmapCell[];
  mixCategoria:       MixItem[];
  mixMarca:           MixItem[];
  totalVentas:        number;
  totalTransacciones: number;
}

// ─────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────
export async function getAnalitica(rango: Rango): Promise<AnaliticaResult> {
  const desde = fechaDesde(rango);

  // ── Cargar transacciones con detalles en el rango ─────────────
  const transacciones = await prisma.transaccion.findMany({
    where: {
      created_at: { gte: desde },
      estado:     { in: ['ENTREGADO', 'PAGADO'] },
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

  // ── Ventas por día ────────────────────────────────────────────
  const ventasDiaMap = new Map<string, { total: number; cantidad: number }>();
  let totalVentas = 0;

  for (const t of transacciones) {
    const fecha = t.created_at.toISOString().slice(0, 10);
    const prev  = ventasDiaMap.get(fecha) ?? { total: 0, cantidad: 0 };
    ventasDiaMap.set(fecha, { total: prev.total + Number(t.total), cantidad: prev.cantidad + 1 });
    totalVentas += Number(t.total);
  }

  const ventasPorDia: VentaDia[] = Array.from(ventasDiaMap.entries()).map(
    ([fecha, v]) => ({ fecha, ...v }),
  );

  // ── Mapa de ventas por producto ────────────────────────────────
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

  // ── Food cost total ponderado ─────────────────────────────────
  let foodCostNumerador = 0;
  let foodCostDenominador = 0;

  for (const [pid, data] of productoVentas.entries()) {
    const costo = await costoFichaTecnica(pid);
    if (data.precio > 0) {
      const pct = (costo / data.precio) * 100;
      foodCostNumerador   += pct * data.totalVentas;
      foodCostDenominador += data.totalVentas;
    }
  }
  const foodCostTotal = foodCostDenominador > 0 ? foodCostNumerador / foodCostDenominador : 0;

  // ── Ingeniería de menú (Boston Matrix simplificada) ────────────
  const prodIds = Array.from(productoVentas.keys());

  // Mediana de ventas y mediana de margen
  const ventasArr   = prodIds.map(id => productoVentas.get(id)!.ventas);
  const medVentas   = mediana(ventasArr);

  const margenes    = await Promise.all(
    prodIds.map(async (id) => {
      const costo  = await costoFichaTecnica(id);
      const precio = productoVentas.get(id)!.precio;
      return { id, margen: precio > 0 ? ((precio - costo) / precio) * 100 : 0 };
    }),
  );
  const medMargen = mediana(margenes.map(m => m.margen));

  const ingenieriaMeniu: MenuItem[] = prodIds.map((id) => {
    const data   = productoVentas.get(id)!;
    const margen = margenes.find(m => m.id === id)!.margen;
    const altaVenta  = data.ventas  >= medVentas;
    const altoMargen = margen >= medMargen;

    let categoria: MenuItem['categoria'];
    if (altaVenta  && altoMargen)  categoria = 'Estrella';
    else if (altaVenta  && !altoMargen) categoria = 'Caballo';
    else if (!altaVenta && altoMargen)  categoria = 'Puzzle';
    else                                categoria = 'Perro';

    return { producto_id: id, nombre: data.nombre, ventas: data.ventas, margen, categoria };
  });

  // ── Heatmap hora × día de semana ─────────────────────────────
  const heatmapMap = new Map<string, number>();
  for (const t of transacciones) {
    const key = `${t.created_at.getDay()}-${t.created_at.getHours()}`;
    heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + Number(t.total));
  }
  const heatmap: HeatmapCell[] = Array.from(heatmapMap.entries()).map(([k, v]) => {
    const [dia, hora] = k.split('-').map(Number);
    return { diaSemana: dia, hora, ventas: v };
  });

  // ── Mix por categoría ─────────────────────────────────────────
  const catMap = new Map<string, number>();
  for (const t of transacciones) {
    for (const d of t.transaccionesDetalles_id) {
      const cats = d.producto.categoria_id;
      const nombre = cats[0]?.categoria?.nombre ?? 'Sin categoría';
      catMap.set(nombre, (catMap.get(nombre) ?? 0) + Number(d.precio_unitario) * d.cantidad);
    }
  }
  const mixCategoria = toMixItems(catMap);

  // ── Mix por marca ─────────────────────────────────────────────
  const marcaMap = new Map<string, number>();
  for (const t of transacciones) {
    for (const d of t.transaccionesDetalles_id) {
      const ms = d.producto.marcas;
      const nombre = ms[0]?.marca?.nombre ?? 'Sin marca';
      marcaMap.set(nombre, (marcaMap.get(nombre) ?? 0) + Number(d.precio_unitario) * d.cantidad);
    }
  }
  const mixMarca = toMixItems(marcaMap);

  return {
    ventasPorDia,
    foodCostTotal:      Math.round(foodCostTotal * 100) / 100,
    ingenieriaMeniu,
    heatmap,
    mixCategoria,
    mixMarca,
    totalVentas:        Math.round(totalVentas * 100) / 100,
    totalTransacciones: transacciones.length,
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
