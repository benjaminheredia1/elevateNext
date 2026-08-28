import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { RangoFechas } from './rango';
import { ventasNetas, cmvPorReceta, gastosOperativos } from './metricas.service';
import { valorEnLibros } from '@/lib/server/admin/activos.service';
import { valorEnTransito } from '@/lib/server/centro-produccion/traslados.service';

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

function sucursalWhere(sucursal?: number) {
  // MovimientoCaja lleva su propia sucursal desde la Fase 2 multi-sucursal.
  return sucursal ? { sucursal_id: sucursal } : {};
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
 * Los activos fijos son globales (no tienen sucursal), así que se suman
 * completos aun cuando se filtre por sucursal.
 */
export async function balanceGeneral(sucursal?: number) {
  const [cuentas, insumos, cuentasCorrientes, activosFijosRows, stockCentros, enTransito] = await Promise.all([
    prisma.cuentaFinanciera.findMany({
      where: sucursal ? { sucursal_id: sucursal } : {},
    }),
    // Inventario valorizado por local: cada sucursal tiene su stock y su costo
    // promedio. Sin filtro se suman todas, que es el valor del negocio.
    prisma.stockSucursal.findMany({
      // `activo` de la fila: un insumo de baja en Sur no vale como inventario
      // de Sur, aunque Fitbull lo siga usando.
      where: { activo: true, ...(sucursal ? { sucursal_id: sucursal } : {}) },
      select: { stock_actual: true, costo_promedio: true },
    }),
    prisma.cuentaCorriente.findMany({
      where: { estado: { in: ['PENDIENTE', 'PARCIAL'] } },
      select: { tipo: true, monto: true, monto_pagado: true },
    }),
    prisma.activoFijo.findMany({
      where: { activo: true },
      select: { valor_original: true, valor_actual: true, depreciacion_pct: true, fecha_compra: true },
    }),
    // El inventario del Centro de Producción es activo del negocio igual que el
    // de un local. Sin esto, la mercadería producida y todavía no despachada
    // desaparece del balance y el activo queda subvaluado justo por el monto
    // que el Centro tiene guardado.
    //
    // Se cuenta solo en la vista consolidada: un centro no pertenece a ninguna
    // sucursal, así que sumarlo al balance de un local le atribuiría plata que
    // no es suya.
    sucursal
      ? Promise.resolve([] as { stock_actual: number; costo_promedio: number }[])
      : prisma.stockCentro.findMany({
          where: { activo: true },
          select: { stock_actual: true, costo_promedio: true },
        }),
    // Mercadería despachada que todavía no se recibió: ya no está en el Centro
    // y todavía no está en la sucursal, pero es del negocio. Al filtrar por
    // sucursal se cuenta la que va camino a ESA sucursal, que es plata ya
    // comprometida con ese local.
    valorEnTransito(sucursal ? { sucursalId: sucursal } : {}),
  ]);

  const saldosCuentas = cuentas.reduce((sum, cuenta) => sum.plus(cuenta.saldo), new Prisma.Decimal(0));
  const cajaEfectivo = cuentas
    .filter(c => c.tipo === 'EFECTIVO')
    .reduce((sum, cuenta) => sum.plus(cuenta.saldo), new Prisma.Decimal(0));

  // Stock negativo (deuda operativa de inventario) no suma valor al activo.
  const inventarioSucursales = insumos.reduce(
    (sum, fila) => sum + Math.max(0, fila.stock_actual) * fila.costo_promedio,
    0,
  );
  const inventarioCentros = stockCentros.reduce(
    (sum, fila) => sum + Math.max(0, fila.stock_actual) * fila.costo_promedio,
    0,
  );
  const inventario = inventarioSucursales + inventarioCentros + enTransito;

  const saldoPendiente = (cc: { monto: Prisma.Decimal; monto_pagado: Prisma.Decimal }) =>
    Prisma.Decimal.max(cc.monto.minus(cc.monto_pagado), new Prisma.Decimal(0));

  const porCobrar = cuentasCorrientes
    .filter(cc => cc.tipo === 'POR_COBRAR')
    .reduce((sum, cc) => sum.plus(saldoPendiente(cc)), new Prisma.Decimal(0));
  const porPagar = cuentasCorrientes
    .filter(cc => cc.tipo === 'POR_PAGAR')
    .reduce((sum, cc) => sum.plus(saldoPendiente(cc)), new Prisma.Decimal(0));

  // Valor neto actual de los activos fijos (equipos, muebles, etc.).
  // Mismo criterio que el panel de activos fijos: el valor en libros se deriva
  // de la depreciacion acumulada, no del numero congelado al dar de alta.
  const activosFijos = activosFijosRows.reduce(
    (sum, af) =>
      sum.plus(
        valorEnLibros(
          Number(af.valor_original),
          af.depreciacion_pct != null ? Number(af.depreciacion_pct) : null,
          af.fecha_compra,
          Number(af.valor_actual),
        ),
      ),
    new Prisma.Decimal(0),
  );

  const activos = saldosCuentas.plus(inventario.toFixed(2)).plus(porCobrar).plus(activosFijos);
  const patrimonio = activos.minus(porPagar);

  return {
    sucursal: sucursal ?? null,
    activos: {
      total: toNumber(activos),
      caja_efectivo: toNumber(cajaEfectivo),
      cuentas_financieras: toNumber(saldosCuentas),
      inventario: Number(inventario.toFixed(2)),
      // Desglosado para que el número total sea auditable: dónde está parada
      // la mercadería es la primera pregunta de cualquier arqueo.
      inventario_sucursales: Number(inventarioSucursales.toFixed(2)),
      inventario_centros: Number(inventarioCentros.toFixed(2)),
      inventario_en_transito: Number(enTransito.toFixed(2)),
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

/**
 * Movimientos contables del período, en detalle, para la descarga en Excel.
 *
 * Las ventas se acompañan de los productos que se vendieron: un renglón que solo
 * dice "Venta #908 — Bs 110" no permite auditar nada, y ese detalle es la razón
 * por la que se baja el archivo en vez de mirar la pantalla.
 */
export async function movimientosContables(rango: RangoFechas, sucursal?: number) {
  const movimientos = await prisma.movimientoCaja.findMany({
    where: {
      created_at: { gte: rango.desde, lte: rango.hasta },
      ...(sucursal ? { sucursal_id: sucursal } : {}),
    },
    orderBy: { created_at: 'desc' },
    include: {
      transaccion: {
        select: {
          transaccionesDetalles_id: {
            select: { cantidad: true, producto: { select: { nombre: true } } },
          },
        },
      },
    },
  });

  return movimientos.map(m => {
    const productos = m.transaccion?.transaccionesDetalles_id
      .map(d => (d.cantidad > 1 ? `${d.producto?.nombre ?? 'Producto'} x${d.cantidad}` : d.producto?.nombre ?? 'Producto'))
      .join(', ');
    const monto = Number(m.monto);
    return {
      fecha: m.created_at,
      // El signo es lo que define si entró o salió plata: los egresos se guardan
      // en negativo.
      tipo: monto < 0 ? 'Egreso' : 'Ingreso',
      concepto: m.concepto,
      detalle: productos || m.categoria || '',
      monto: Math.abs(monto),
      metodo_pago: m.metodo_pago,
    };
  });
}
