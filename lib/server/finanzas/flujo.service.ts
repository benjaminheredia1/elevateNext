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
  const [movimientos, sinCobro] = await Promise.all([
    prisma.movimientoCaja.findMany({
      where: {
        created_at: { gte: rango.desde, lte: rango.hasta },
        // Columna propia: incluye también los movimientos sin turno (gastos y ajustes).
        ...(sucursal ? { sucursal_id: sucursal } : {}),
      },
      include: {
        cuenta: true,
        turno: true,
        transaccion: { include: { cliente: { select: { nombre: true } } } },
      },
      orderBy: { created_at: 'desc' },
    }),
    // Fiados y cortesías del período: entregados, pero sin plata que haya tocado
    // la caja, así que no tienen MovimientoCaja y hasta ahora eran invisibles
    // acá. Contabilidad los necesita en el detalle del día —el fiado porque está
    // por cobrar, la cortesía porque genera costo sin ingreso—, y sin ellos el
    // flujo no explica por qué las ventas del día no coinciden con la caja.
    // Se piden por `movimientos: { none: {} }`, el mismo criterio que usa
    // `pedidosSinCobroDelTurno` para el libro del cajero.
    prisma.transaccion.findMany({
      where: {
        created_at: { gte: rango.desde, lte: rango.hasta },
        movimientos: { none: {} },
        ...(sucursal ? { sucursal_id: sucursal } : {}),
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true, numero_sucursal: true, created_at: true, total: true,
        es_cortesia: true, cliente_nombre: true,
        cliente: { select: { nombre: true } },
      },
    }),
  ]);

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

  // Se totalizan aparte y NO se suman al flujo: no entró ni salió plata. Son el
  // contexto que explica la diferencia entre las ventas del período y la caja.
  let fiadosOtorgados = new Prisma.Decimal(0);
  let cortesias = new Prisma.Decimal(0);
  for (const pedido of sinCobro) {
    if (pedido.es_cortesia) cortesias = cortesias.plus(pedido.total);
    else fiadosOtorgados = fiadosOtorgados.plus(pedido.total);
  }

  return {
    rango,
    entradas: toNumber(entradas),
    salidas: toNumber(salidas),
    flujo_neto: toNumber(flujoNeto),
    fiados_otorgados: toNumber(fiadosOtorgados),
    cortesias: toNumber(cortesias),
    pedidos_sin_cobro: sinCobro.map(p => ({
      id: p.id,
      numero_sucursal: p.numero_sucursal,
      created_at: p.created_at,
      monto: toNumber(p.total),
      es_cortesia: p.es_cortesia,
      cliente: p.cliente?.nombre ?? p.cliente_nombre ?? null,
    })),
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
      // Datos ligeros de la venta para mostrarlos en la fila sin abrir el detalle.
      venta_codigo: m.transaccion?.codigo ?? null,
      venta_cliente: m.transaccion?.cliente?.nombre ?? m.transaccion?.cliente_nombre ?? null,
    })),
  };
}
