import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { RangoFechas } from './rango';

function toNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

function add(map: Map<string, Prisma.Decimal>, key: string, value: Prisma.Decimal) {
  map.set(key, (map.get(key) ?? new Prisma.Decimal(0)).plus(value));
}

export async function flujoCaja(rango: RangoFechas, sucursal?: number) {
  const movimientos = await prisma.movimientoCaja.findMany({
    where: {
      created_at: { gte: rango.desde, lte: rango.hasta },
      ...(sucursal ? { turno: { sucursal_id: sucursal } } : {}),
    },
    include: { cuenta: true, turno: true, transaccion: true },
    orderBy: { created_at: 'desc' },
  });

  let entradas = new Prisma.Decimal(0);
  let salidas = new Prisma.Decimal(0);
  const porMetodo = new Map<string, Prisma.Decimal>();
  // Entradas y salidas por categoría se reportan separadas: el neto mezcla
  // signos y oculta cuánto entró y cuánto se fue en cada rubro.
  const categoriaEntradas = new Map<string, Prisma.Decimal>();
  const categoriaSalidas = new Map<string, Prisma.Decimal>();

  for (const mov of movimientos) {
    const monto = mov.monto;
    const categoria = mov.categoria ?? mov.tipo;
    if (monto.gte(0)) {
      entradas = entradas.plus(monto);
      add(categoriaEntradas, categoria, monto);
    } else {
      salidas = salidas.plus(monto.abs());
      add(categoriaSalidas, categoria, monto.abs());
    }
    add(porMetodo, mov.metodo_pago, monto);
  }

  const flujoNeto = entradas.minus(salidas);

  return {
    rango,
    entradas: toNumber(entradas),
    salidas: toNumber(salidas),
    flujo_neto: toNumber(flujoNeto),
    por_metodo: Array.from(porMetodo.entries()).map(([metodo, monto]) => ({ metodo, monto: toNumber(monto) })),
    entradas_por_categoria: Array.from(categoriaEntradas.entries())
      .map(([categoria, monto]) => ({ categoria, monto: toNumber(monto) }))
      .sort((a, b) => b.monto - a.monto),
    salidas_por_categoria: Array.from(categoriaSalidas.entries())
      .map(([categoria, monto]) => ({ categoria, monto: toNumber(monto) }))
      .sort((a, b) => b.monto - a.monto),
    movimientos: movimientos.map(m => ({
      id: m.id,
      tipo: m.tipo,
      metodo_pago: m.metodo_pago,
      categoria: m.categoria,
      concepto: m.concepto,
      monto: toNumber(m.monto),
      created_at: m.created_at,
      cuenta: m.cuenta.nombre,
      turno_id: m.turno_id,
      transaccion_id: m.transaccion_id,
    })),
  };
}
