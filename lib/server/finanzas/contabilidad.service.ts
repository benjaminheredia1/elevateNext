import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { RangoFechas } from './rango';
import { equivalenteMensual } from './gastos-fijos.service';

function decimal(value: unknown): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'number' || typeof value === 'string') return new Prisma.Decimal(value);
  return new Prisma.Decimal(0);
}

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

function sucursalWhere(sucursal?: number) {
  return sucursal ? { turno: { sucursal_id: sucursal } } : {};
}

export async function estadoResultados(rango: RangoFechas, sucursal?: number) {
  const [movimientos, gastosFijos] = await Promise.all([
    prisma.movimientoCaja.findMany({
      where: {
        created_at: { gte: rango.desde, lte: rango.hasta },
        ...sucursalWhere(sucursal),
      },
      include: { transaccion: true },
    }),
    prisma.gastoFijo.findMany({ where: { activo: true } }),
  ]);

  const ventas = movimientos.filter(m => m.tipo === 'VENTA' && !m.transaccion?.es_cortesia);
  const ingresosEfectivo = ventas
    .filter(m => m.metodo_pago === 'EFECTIVO')
    .reduce((sum, m) => sum.plus(m.monto), new Prisma.Decimal(0));
  const ingresosQr = ventas
    .filter(m => m.metodo_pago === 'QR')
    .reduce((sum, m) => sum.plus(m.monto), new Prisma.Decimal(0));
  const ingresosTarjeta = ventas
    .filter(m => m.metodo_pago === 'TARJETA')
    .reduce((sum, m) => sum.plus(m.monto), new Prisma.Decimal(0));
  const ingresos = ingresosEfectivo.plus(ingresosQr).plus(ingresosTarjeta);

  const cmv = movimientos
    .filter(m => m.tipo === 'COMPRA_INSUMO' || (m.tipo === 'GASTO_OPERATIVO' && m.categoria === 'Insumos'))
    .reduce((sum, m) => sum.plus(decimal(m.monto).abs()), new Prisma.Decimal(0));

  const gastosOperativosCaja = movimientos
    .filter(m => m.tipo === 'GASTO_OPERATIVO' && m.categoria !== 'Insumos')
    .reduce((sum, m) => sum.plus(decimal(m.monto).abs()), new Prisma.Decimal(0));
  const diasRango = Math.max(1, Math.ceil((rango.hasta.getTime() - rango.desde.getTime()) / 86_400_000));
  const gastosFijosProrrateados = gastosFijos.reduce((sum, gasto) => {
    const diario = equivalenteMensual(Number(gasto.monto), gasto.frecuencia) / 30;
    return sum.plus(new Prisma.Decimal(diario * diasRango));
  }, new Prisma.Decimal(0));
  const gastosOperativos = gastosOperativosCaja.plus(gastosFijosProrrateados);

  const utilidadBruta = ingresos.minus(cmv);
  const utilidadNeta = utilidadBruta.minus(gastosOperativos);
  const margenBruto = ingresos.gt(0) ? utilidadBruta.div(ingresos).times(100) : new Prisma.Decimal(0);
  const ticketPromedio = ventas.length > 0 ? ingresos.div(ventas.length) : new Prisma.Decimal(0);

  const categorias = new Map<string, Prisma.Decimal>();
  for (const mov of movimientos) {
    const key = mov.categoria ?? mov.tipo;
    categorias.set(key, (categorias.get(key) ?? new Prisma.Decimal(0)).plus(decimal(mov.monto)));
  }

  return {
    rango,
    ingresos: {
      total: toNumber(ingresos),
      efectivo: toNumber(ingresosEfectivo),
      qr: toNumber(ingresosQr),
      tarjeta: toNumber(ingresosTarjeta),
      ventas_count: ventas.length,
      ticket_promedio: toNumber(ticketPromedio),
    },
    cmv: toNumber(cmv),
    utilidad_bruta: toNumber(utilidadBruta),
    margen_bruto: toNumber(margenBruto),
    gastos_operativos: toNumber(gastosOperativos),
    gastos_fijos_prorrateados: toNumber(gastosFijosProrrateados),
    utilidad_neta: toNumber(utilidadNeta),
    desglose_categoria: Array.from(categorias.entries()).map(([categoria, monto]) => ({ categoria, monto: toNumber(monto) })),
  };
}

export async function balanceGeneral(sucursal?: number) {
  const cuentas = await prisma.cuentaFinanciera.findMany({
    where: sucursal ? { sucursal_id: sucursal } : {},
  });
  const saldosCuentas = cuentas.reduce((sum, cuenta) => sum.plus(cuenta.saldo), new Prisma.Decimal(0));

  // TODO(Fase 4A): sumar valor neto de ActivoFijo.
  const activosFijos = new Prisma.Decimal(0);
  // TODO(Fase 5): sumar inventario valorizado stock x costo.
  const inventario = new Prisma.Decimal(0);
  // TODO(Fase 4B): sumar CuentaCorriente POR_PAGAR pendiente.
  const pasivos = new Prisma.Decimal(0);

  const activos = saldosCuentas.plus(activosFijos).plus(inventario);
  const patrimonio = activos.minus(pasivos);

  return {
    sucursal: sucursal ?? null,
    activos: {
      total: toNumber(activos),
      cuentas_financieras: toNumber(saldosCuentas),
      activos_fijos: toNumber(activosFijos),
      inventario: toNumber(inventario),
    },
    pasivos: { total: toNumber(pasivos) },
    patrimonio: toNumber(patrimonio),
  };
}
