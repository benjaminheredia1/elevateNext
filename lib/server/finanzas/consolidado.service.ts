/**
 * consolidado.service.ts
 *
 * Vista de dueño: el negocio entero, con el desglose de cada sucursal y su peso
 * relativo. Reutiliza los mismos servicios que la vista filtrada, así que los
 * números de una sucursal aquí y en su reporte individual coinciden por
 * construcción.
 */
import prisma from '@/lib/prisma';
import type { RangoFechas } from './rango';
import { ventasNetas, cmvPorReceta, gastosOperativos } from './metricas.service';

export interface SucursalConsolidada {
  sucursal_id: number;
  sucursal: string;
  ventas: number;
  pedidos: number;
  ticket_promedio: number;
  cmv: number;
  gastos: number;
  utilidad: number;
  margen_bruto_pct: number;
  food_cost_pct: number;
  /** Peso de esta sucursal sobre las ventas totales del periodo. */
  participacion_pct: number;
}

export interface Consolidado {
  rango: RangoFechas;
  totales: {
    ventas: number;
    pedidos: number;
    cmv: number;
    gastos: number;
    utilidad: number;
    margen_bruto_pct: number;
    food_cost_pct: number;
  };
  sucursales: SucursalConsolidada[];
  /** Ventas por producto y sucursal, para comparar el mismo plato entre locales. */
  productos: {
    producto_id: number;
    nombre: string;
    total: number;
    por_sucursal: { sucursal_id: number; sucursal: string; cantidad: number; total: number }[];
  }[];
}

function pct(parte: number, total: number) {
  return total > 0 ? Number(((parte / total) * 100).toFixed(2)) : 0;
}

export async function consolidadoPorSucursal(rango: RangoFechas): Promise<Consolidado> {
  const sucursales = await prisma.sucursal.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, nombre: true },
  });

  // Una pasada por sucursal, con los mismos servicios que usa la vista filtrada.
  const filas = await Promise.all(
    sucursales.map(async (s) => {
      const [ventas, cmv, gastos] = await Promise.all([
        ventasNetas(rango, s.id),
        cmvPorReceta(rango, s.id),
        gastosOperativos(rango, s.id),
      ]);
      const utilidad = Number((ventas.total - cmv - gastos.total).toFixed(2));
      return {
        sucursal_id: s.id,
        sucursal: s.nombre,
        ventas: ventas.total,
        pedidos: ventas.cantidad,
        ticket_promedio: ventas.ticket_promedio,
        cmv,
        gastos: gastos.total,
        utilidad,
        margen_bruto_pct: pct(ventas.total - cmv, ventas.total),
        food_cost_pct: pct(cmv, ventas.total),
        participacion_pct: 0,
      };
    }),
  );

  const totalVentas = Number(filas.reduce((acc, f) => acc + f.ventas, 0).toFixed(2));
  const totalCmv = Number(filas.reduce((acc, f) => acc + f.cmv, 0).toFixed(2));
  const totalGastos = Number(filas.reduce((acc, f) => acc + f.gastos, 0).toFixed(2));
  const totalPedidos = filas.reduce((acc, f) => acc + f.pedidos, 0);

  for (const fila of filas) fila.participacion_pct = pct(fila.ventas, totalVentas);

  // Comparativa del mismo producto entre locales: el producto_id es compartido,
  // así que "la hamburguesa" es la misma en A y en B.
  const detalles = await prisma.transaccionesDetalles.findMany({
    where: {
      transaccion: {
        created_at: { gte: rango.desde, lte: rango.hasta },
        estado: { in: ['PAGADO', 'ENTREGADO', 'LISTO', 'EN_CAMINO', 'EN_PREPARACION'] },
        es_cortesia: false,
      },
    },
    select: {
      cantidad: true,
      precio_unitario: true,
      producto: { select: { id: true, nombre: true } },
      transaccion: { select: { sucursal_id: true } },
    },
  });

  const nombreSucursal = new Map(sucursales.map(s => [s.id, s.nombre]));
  const porProducto = new Map<number, {
    producto_id: number; nombre: string; total: number;
    por_sucursal: Map<number, { cantidad: number; total: number }>;
  }>();

  for (const d of detalles) {
    const monto = Number(d.precio_unitario) * d.cantidad;
    const entrada = porProducto.get(d.producto.id) ?? {
      producto_id: d.producto.id,
      nombre: d.producto.nombre,
      total: 0,
      por_sucursal: new Map(),
    };
    entrada.total += monto;
    const sucursalId = d.transaccion.sucursal_id;
    const previo = entrada.por_sucursal.get(sucursalId) ?? { cantidad: 0, total: 0 };
    previo.cantidad += d.cantidad;
    previo.total += monto;
    entrada.por_sucursal.set(sucursalId, previo);
    porProducto.set(d.producto.id, entrada);
  }

  const productos = Array.from(porProducto.values())
    .map(p => ({
      producto_id: p.producto_id,
      nombre: p.nombre,
      total: Number(p.total.toFixed(2)),
      por_sucursal: Array.from(p.por_sucursal.entries()).map(([sucursalId, v]) => ({
        sucursal_id: sucursalId,
        sucursal: nombreSucursal.get(sucursalId) ?? `Sucursal #${sucursalId}`,
        cantidad: v.cantidad,
        total: Number(v.total.toFixed(2)),
      })),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    rango,
    totales: {
      ventas: totalVentas,
      pedidos: totalPedidos,
      cmv: totalCmv,
      gastos: totalGastos,
      utilidad: Number((totalVentas - totalCmv - totalGastos).toFixed(2)),
      margen_bruto_pct: pct(totalVentas - totalCmv, totalVentas),
      food_cost_pct: pct(totalCmv, totalVentas),
    },
    sucursales: filas,
    productos,
  };
}
