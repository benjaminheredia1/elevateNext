import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { RangoFechas } from './rango';
import { ventasNetas, cmvPorReceta, gastosOperativos } from './metricas.service';

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

function sucursalWhere(sucursal?: number) {
  return sucursal ? { turno: { sucursal_id: sucursal } } : {};
}

/**
 * Estado de resultados devengado:
 * - Ingresos = ventas netas (incluye fiados y pagos online que no pasaron por caja).
 * - CMV = consumo por receta de lo vendido (las compras van al flujo de caja).
 * - Gastos = gastos de caja + fijos prorrateados.
 * El desglose por método (efectivo/QR/tarjeta) refleja lo COBRADO en caja, que
 * puede ser menor a lo vendido (fiados) — por eso se expone cobrado/por_cobrar.
 */
export async function estadoResultados(rango: RangoFechas, sucursal?: number) {
  const [ventas, cmv, gastos, movimientos] = await Promise.all([
    ventasNetas(rango, sucursal),
    cmvPorReceta(rango, sucursal),
    gastosOperativos(rango, sucursal),
    prisma.movimientoCaja.findMany({
      where: {
        created_at: { gte: rango.desde, lte: rango.hasta },
        ...sucursalWhere(sucursal),
      },
      include: { transaccion: { select: { es_cortesia: true } } },
    }),
  ]);

  const cobradoPorMetodo = (metodo: 'EFECTIVO' | 'QR' | 'TARJETA') =>
    movimientos
      .filter(m => m.tipo === 'VENTA' && m.metodo_pago === metodo && !m.transaccion?.es_cortesia)
      .reduce((sum, m) => sum.plus(m.monto), new Prisma.Decimal(0));

  const cobradoEfectivo = cobradoPorMetodo('EFECTIVO');
  const cobradoQr = cobradoPorMetodo('QR');
  const cobradoTarjeta = cobradoPorMetodo('TARJETA');
  const cobrosFiado = movimientos
    .filter(m => m.tipo === 'INGRESO_EXTRA' && m.categoria === 'Cobro fiado')
    .reduce((sum, m) => sum.plus(m.monto), new Prisma.Decimal(0));

  const ingresos = new Prisma.Decimal(ventas.total);
  const utilidadBruta = ingresos.minus(cmv);
  const utilidadNeta = utilidadBruta.minus(gastos.total);
  const margenBruto = ingresos.gt(0) ? utilidadBruta.div(ingresos).times(100) : new Prisma.Decimal(0);
  const foodCost = ingresos.gt(0) ? new Prisma.Decimal(cmv).div(ingresos).times(100) : new Prisma.Decimal(0);

  const categorias = new Map<string, Prisma.Decimal>();
  for (const mov of movimientos) {
    const key = mov.categoria ?? mov.tipo;
    categorias.set(key, (categorias.get(key) ?? new Prisma.Decimal(0)).plus(mov.monto));
  }

  return {
    rango,
    ingresos: {
      total: ventas.total,
      ventas_count: ventas.cantidad,
      ticket_promedio: ventas.ticket_promedio,
      por_cobrar: ventas.por_cobrar,
      cobrado: {
        efectivo: toNumber(cobradoEfectivo),
        qr: toNumber(cobradoQr),
        tarjeta: toNumber(cobradoTarjeta),
        cobros_fiado: toNumber(cobrosFiado),
      },
      // Compatibilidad con el shape anterior (cobrado por método):
      efectivo: toNumber(cobradoEfectivo),
      qr: toNumber(cobradoQr),
      tarjeta: toNumber(cobradoTarjeta),
    },
    cmv,
    food_cost_pct: toNumber(foodCost),
    utilidad_bruta: toNumber(utilidadBruta),
    margen_bruto: toNumber(margenBruto),
    gastos_operativos: gastos.total,
    gastos_caja: gastos.de_caja,
    gastos_fijos_prorrateados: gastos.fijos_prorrateados,
    utilidad_neta: toNumber(utilidadNeta),
    ventas_por_dia: ventas.por_dia,
    desglose_categoria: Array.from(categorias.entries()).map(([categoria, monto]) => ({ categoria, monto: toNumber(monto) })),
  };
}

/**
 * Balance general a hoy:
 * - Activos: saldos de cuentas financieras + inventario valorizado
 *   (stock × costo_promedio de insumos activos) + cuentas por cobrar pendientes.
 * - Pasivos: cuentas por pagar pendientes.
 * - Patrimonio: activos − pasivos.
 * (Activos fijos quedan en 0 hasta que exista el módulo — Fase 4A.)
 */
export async function balanceGeneral(sucursal?: number) {
  const [cuentas, insumos, cuentasCorrientes] = await Promise.all([
    prisma.cuentaFinanciera.findMany({
      where: sucursal ? { sucursal_id: sucursal } : {},
    }),
    prisma.insumo.findMany({
      where: { activo: true },
      select: { stock_actual: true, costo_promedio: true },
    }),
    prisma.cuentaCorriente.findMany({
      where: { estado: { in: ['PENDIENTE', 'PARCIAL'] } },
      select: { tipo: true, monto: true, monto_pagado: true },
    }),
  ]);

  const saldosCuentas = cuentas.reduce((sum, cuenta) => sum.plus(cuenta.saldo), new Prisma.Decimal(0));
  const cajaEfectivo = cuentas
    .filter(c => c.tipo === 'EFECTIVO')
    .reduce((sum, cuenta) => sum.plus(cuenta.saldo), new Prisma.Decimal(0));

  // Stock negativo (deuda operativa de inventario) no suma valor al activo.
  const inventario = insumos.reduce(
    (sum, insumo) => sum + Math.max(0, insumo.stock_actual) * insumo.costo_promedio,
    0,
  );

  const saldoPendiente = (cc: { monto: Prisma.Decimal; monto_pagado: Prisma.Decimal }) =>
    Prisma.Decimal.max(cc.monto.minus(cc.monto_pagado), new Prisma.Decimal(0));

  const porCobrar = cuentasCorrientes
    .filter(cc => cc.tipo === 'POR_COBRAR')
    .reduce((sum, cc) => sum.plus(saldoPendiente(cc)), new Prisma.Decimal(0));
  const porPagar = cuentasCorrientes
    .filter(cc => cc.tipo === 'POR_PAGAR')
    .reduce((sum, cc) => sum.plus(saldoPendiente(cc)), new Prisma.Decimal(0));

  // TODO(Fase 4A): sumar valor neto de ActivoFijo cuando exista el módulo.
  const activosFijos = new Prisma.Decimal(0);

  const activos = saldosCuentas.plus(inventario.toFixed(2)).plus(porCobrar).plus(activosFijos);
  const patrimonio = activos.minus(porPagar);

  return {
    sucursal: sucursal ?? null,
    activos: {
      total: toNumber(activos),
      caja_efectivo: toNumber(cajaEfectivo),
      cuentas_financieras: toNumber(saldosCuentas),
      inventario: Number(inventario.toFixed(2)),
      cuentas_por_cobrar: toNumber(porCobrar),
      activos_fijos: toNumber(activosFijos),
    },
    pasivos: {
      total: toNumber(porPagar),
      cuentas_por_pagar: toNumber(porPagar),
    },
    patrimonio: toNumber(patrimonio),
  };
}
