import prisma from '@/lib/prisma';
import type { RangoFechas } from '@/lib/server/finanzas/rango';
import { ventaVistaInclude, mapearVenta } from '@/lib/server/ventas/venta-vista';

/**
 * Tope de filas de la pantalla de ventas de admin.
 *
 * Con "Todo" un local con años de historia devuelve decenas de miles de ventas
 * —cada una con su detalle— y eso no lo aguanta ni la consulta ni la tabla. Se
 * corta en las más recientes y la pantalla avisa que hay más, ofreciendo el
 * Excel, que sí baja el período completo.
 */
export const LIMITE_VENTAS = 300;

/**
 * Ventas del período para admin, con su detalle y su forma de cierre.
 *
 * `sucursal` undefined es el dueño mirando todo el negocio; cualquier otro rol
 * llega con su alcance ya resuelto por `alcanceSucursal`.
 */
export async function listarVentas(rango: RangoFechas, sucursal?: number) {
  const where = {
    created_at: { gte: rango.desde, lte: rango.hasta },
    ...(sucursal !== undefined ? { sucursal_id: sucursal } : {}),
  };

  const [ventas, total] = await Promise.all([
    prisma.transaccion.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: LIMITE_VENTAS,
      include: ventaVistaInclude,
    }),
    prisma.transaccion.count({ where }),
  ]);

  return {
    desde: rango.desde,
    hasta: rango.hasta,
    total,
    // Que la pantalla pueda decir "estás viendo 300 de 4.812".
    truncado: total > ventas.length,
    ventas: ventas.map(mapearVenta),
  };
}
