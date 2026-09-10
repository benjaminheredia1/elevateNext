/**
 * Tests del informe que reemplaza la planilla de contabilidad.
 *
 * Reproducen los tres motivos del descuadre que reportó la contadora:
 * cortesías con costo y sin ingreso, fiados desfasados en el tiempo respecto
 * de la caja, y el descuento por privilegio que el sistema aplica sobre el
 * total de la venta y no sobre cada línea.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';
import { informeContable } from './informe-contable.service';
import type { RangoFechas } from './rango';

// Día de negocio aislado en el pasado para no chocar con otros tests
// (Bolivia, UTC-4).
const RANGO: RangoFechas = {
  desde: new Date('2021-03-10T00:00:00.000-04:00'),
  hasta: new Date('2021-03-10T23:59:59.999-04:00'),
};
const MEDIODIA = new Date('2021-03-10T12:00:00.000-04:00');

const MARCADOR = 'informe-contable-test';

let productoId: number;
let insumoId: number;
let sucursalId: number;
let usuarioId: number;
let cuentaId: number;
const transaccionIds: number[] = [];
const movimientoIds: number[] = [];

/** Venta con una línea de `cantidad` unidades a `precioUnitario` cada una. */
async function crearVenta(args: {
  precioUnitario: number;
  cantidad: number;
  /** Total de la venta. Distinto del bruto = hubo descuento sobre el total. */
  total: number;
  payment_status?: 'PAGADO' | 'PENDIENTE' | 'COD_PENDIENTE';
  es_cortesia?: boolean;
  /** Crea la CuentaCorriente detrás, como hace `registrarVentaFisica`. */
  conDeuda?: boolean;
  /** La deuda ya fue saldada (cobrada más tarde, en otro período). */
  deudaPagada?: boolean;
  /**
   * Crea el MovimientoCaja de tipo VENTA, como hace `registrarVentaFisica` con
   * una venta cobrada en el momento. Fiados y cortesías NO lo tienen: es
   * justamente lo que los distingue.
   */
  conMovimiento?: boolean;
  /** Costo congelado por unidad al momento de vender. */
  costoUnitario?: number;
}) {
  const venta = await prisma.transaccion.create({
    data: {
      sucursal_id: sucursalId,
      cliente_nombre: MARCADOR,
      total: args.total,
      estado: 'ENTREGADO',
      payment_status: args.payment_status ?? 'PAGADO',
      es_cortesia: args.es_cortesia ?? false,
      created_at: MEDIODIA,
      transaccionesDetalles_id: {
        create: [{
          producto_id: productoId,
          precio_unitario: args.precioUnitario,
          cantidad: args.cantidad,
          costo_unitario: args.costoUnitario ?? 4,
        }],
      },
    },
  });
  transaccionIds.push(venta.id);

  if (args.conDeuda) {
    await prisma.cuentaCorriente.create({
      data: {
        tipo: 'POR_COBRAR',
        contraparte: MARCADOR,
        concepto: `Fiado venta #${venta.id}`,
        monto: args.total,
        monto_pagado: args.deudaPagada ? args.total : 0,
        estado: args.deudaPagada ? 'PAGADA' : 'PENDIENTE',
        creado_por_id: usuarioId,
        transaccion_id: venta.id,
      },
    });
  }
  if (args.conMovimiento) {
    await prisma.movimientoCaja.create({
      data: {
        sucursal_id: sucursalId, cuenta_id: cuentaId, tipo: 'VENTA',
        metodo_pago: 'EFECTIVO', monto: args.total,
        concepto: `Venta #${venta.id}`, transaccion_id: venta.id,
        creado_por_id: usuarioId, created_at: MEDIODIA,
      },
    });
    movimientoIds.push(venta.id);
  }
  return venta;
}

beforeAll(async () => {
  sucursalId = await sucursalPorDefectoId();
  // Cualquier usuario sirve: solo se usa como autor de la cuenta por cobrar.
  usuarioId = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  cuentaId = (await prisma.cuentaFinanciera.findFirstOrThrow({
    where: { sucursal_id: sucursalId, tipo: 'EFECTIVO' }, select: { id: true },
  })).id;

  const insumo = await prisma.insumo.create({
    data: {
      nombre: `Insumo ${MARCADOR} ${Date.now()}`,
      unidad_medida: 'UNIDAD', stock_actual: 100, stock_minimo: 0, costo_promedio: 4,
    },
  });
  insumoId = insumo.id;

  const producto = await prisma.producto.create({
    data: {
      nombre: `Producto ${MARCADOR} ${Date.now()}`,
      descripcion: 'fixture', precio: 10, tipo: 'ELABORADO', estado_publicacion: 'PUBLICADO',
      recetaProducto_id: { create: [{ insumo_id: insumoId, sucursal_id: sucursalId, cantidad_utilizada: 1 }] },
    },
  });
  productoId = producto.id;

  // 1) Venta pagada normal: 2 x Bs 10 = 20, sin descuento. Cobrada en el acto.
  await crearVenta({ precioUnitario: 10, cantidad: 2, total: 20, conMovimiento: true });
  // 2) Fiada de salón: entregada, con su cuenta por cobrar detrás.
  await crearVenta({ precioUnitario: 10, cantidad: 1, total: 10, payment_status: 'PENDIENTE', conDeuda: true });
  // 3) Cortesía: total completo guardado, pero nunca se cobra.
  await crearVenta({ precioUnitario: 10, cantidad: 1, total: 10, es_cortesia: true });
  // 4) Con privilegio del 20%: bruto 10, total guardado 8. El sistema aplica el
  //    descuento sobre el total y deja la línea en 10.
  await crearVenta({ precioUnitario: 10, cantidad: 1, total: 8, conMovimiento: true });
  // 5) Contra-entrega del delivery: entregado y sin cobrar, pero SIN cuenta
  //    corriente detrás. Es el caso que quedaba con la observación vacía.
  await crearVenta({ precioUnitario: 10, cantidad: 1, total: 10, payment_status: 'COD_PENDIENTE' });
  // 6) Fiado de ESTE día que YA se cobró después (en otro período): la venta
  //    quedó en payment_status PAGADO y su deuda en PAGADA, pero el día que se
  //    entregó no entró plata a la caja. Tiene que seguir contando como fiado
  //    otorgado de este día, o la conciliación del mes cambia sola con el
  //    tiempo, a medida que se van cobrando las deudas viejas.
  await crearVenta({
    precioUnitario: 10, cantidad: 1, total: 10,
    payment_status: 'PAGADO', conDeuda: true, deudaPagada: true,
  });
});

afterAll(async () => {
  await prisma.movimientoCaja.deleteMany({ where: { transaccion_id: { in: movimientoIds } } });
  await prisma.cuentaCorriente.deleteMany({ where: { transaccion_id: { in: transaccionIds } } });
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: transaccionIds } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: transaccionIds } } });
  await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.insumo.deleteMany({ where: { id: insumoId } });
});

/** Las líneas del fixture, ignorando cualquier otro dato del día. */
async function lineasDelFixture() {
  const informe = await informeContable(RANGO, sucursalId);
  return informe.lineas.filter(l => transaccionIds.includes(l.venta_id));
}

describe('informeContable — hoja de ventas por producto', () => {
  it('la cortesía sale con ingreso cero pero conserva el costo', async () => {
    const lineas = await lineasDelFixture();
    const cortesia = lineas.find(l => l.observaciones.startsWith('Cortesía'));

    expect(cortesia).toBeDefined();
    expect(cortesia!.valor_de_venta).toBe(0);
    expect(cortesia!.dctos).toBe(0);
    // El costo se conserva: es el "me genera un costo pero no un ingreso".
    expect(cortesia!.costo).toBe(4);
    expect(cortesia!.ganancia_real).toBe(-4);
  });

  it('el fiado cuenta como venta y queda marcado como pendiente de cobro', async () => {
    const lineas = await lineasDelFixture();
    const fiado = lineas.find(l => l.observaciones === 'Fiado pendiente de cobro');

    expect(fiado).toBeDefined();
    expect(fiado!.valor_de_venta).toBe(10);
  });

  it('el contra-entrega sin cuenta corriente igual queda marcado sin cobrar', async () => {
    const lineas = await lineasDelFixture();
    const cod = lineas.find(l => l.observaciones === 'Pendiente de cobro');

    expect(cod).toBeDefined();
    expect(cod!.valor_de_venta).toBe(10);
  });

  it('reparte entre las líneas el descuento aplicado sobre el total', async () => {
    const lineas = await lineasDelFixture();
    // La venta con privilegio: línea de Bs 10, total guardado Bs 8.
    const conDescuento = lineas.find(l => l.valor_total === 10 && l.dctos === 0.8);

    expect(conDescuento).toBeDefined();
    expect(conDescuento!.valor_de_venta).toBe(8);
    expect(conDescuento!.ganancia_real).toBe(4);
  });

  it('una venta sin descuento queda al 100% y no se toca', async () => {
    const lineas = await lineasDelFixture();
    const normal = lineas.find(l => l.cantidad === 2);

    expect(normal!.valor_total).toBe(20);
    expect(normal!.valor_de_venta).toBe(20);
    expect(normal!.dctos).toBe(1);
    expect(normal!.costo).toBe(8);
  });

  it('las cortesías NO inflan el total vendido pero sí el costo', async () => {
    const lineas = await lineasDelFixture();
    const vendido = lineas.reduce((s, l) => s + l.valor_de_venta, 0);
    const costo = lineas.reduce((s, l) => s + l.costo, 0);

    // 20 (normal) + 10 (fiado) + 0 (cortesía) + 8 (dcto) + 10 (COD) + 10 (cobrado después)
    expect(vendido).toBe(58);
    // 7 unidades × Bs 4, la de la cortesía incluida
    expect(costo).toBe(28);
  });
});

describe('informeContable — conciliación diaria', () => {
  it('el fiado otorgado se resta de las ventas para llegar a la caja', async () => {
    const informe = await informeContable(RANGO, sucursalId);
    const dia = informe.dias.find(d => d.fecha === '2021-03-10');

    expect(dia).toBeDefined();
    // Devengado sin cortesías: 20 + 10 (fiado) + 8 + 10 (COD) + 10 (ya cobrado) = 58.
    expect(dia!.ventas_devengadas).toBe(58);
    // Lo entregado y no cobrado ESE día: fiado + contra-entrega + el fiado que
    // se cobró después. Los tres salieron del local sin que entrara plata.
    expect(dia!.fiados_otorgados).toBe(30);
    // Y la cortesía va aparte, con su costo, sin sumar a las ventas.
    expect(dia!.cortesias).toBe(10);
    expect(dia!.costo_cortesias).toBe(4);
  });

  it('un fiado ya cobrado sigue contando como otorgado el día que se entregó', async () => {
    const informe = await informeContable(RANGO, sucursalId);
    const dia = informe.dias.find(d => d.fecha === '2021-03-10')!;

    // Si esto se midiera por `payment_status`, el fiado saldado ya no contaría
    // y este número bajaría a 20: la conciliación de un mes cerrado cambiaría
    // sola cada vez que alguien paga una deuda vieja.
    expect(dia.fiados_otorgados).toBe(30);
  });

  it('la ecuación del puente cierra contra el movimiento neto', async () => {
    const informe = await informeContable(RANGO, sucursalId);
    const dia = informe.dias.find(d => d.fecha === '2021-03-10')!;

    expect(dia.movimiento_neto_caja).toBeCloseTo(
      dia.ventas_devengadas - dia.fiados_otorgados + dia.cobros_fiado
      + dia.otros_ingresos - dia.egresos,
      2,
    );
  });
});
