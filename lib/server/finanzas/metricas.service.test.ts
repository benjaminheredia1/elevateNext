/**
 * Tests de caracterización del núcleo financiero unificado.
 * Reproducen los bugs de la auditoría: ventas fiadas/online excluidas del ER,
 * CMV calculado con compras en vez de recetas, y días corridos por timezone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import {
  ventasNetas,
  cmvPorReceta,
  gastosOperativos,
  masVendidos,
  diaNegocioDe,
} from './metricas.service';
import type { RangoFechas } from './rango';

// Rango de prueba aislado en el pasado para no chocar con datos de otros tests:
// día de negocio 2020-06-15 (Bolivia, UTC-4).
const RANGO: RangoFechas = {
  desde: new Date('2020-06-15T00:00:00.000-04:00'),
  hasta: new Date('2020-06-15T23:59:59.999-04:00'),
};

const MARCADOR = 'metricas-test';

let productoId: number;
let insumoId: number;
const transaccionIds: number[] = [];

async function crearVenta(args: {
  total: number;
  estado: 'ENTREGADO' | 'PAGADO' | 'CANCELADO' | 'PENDIENTE';
  payment_status?: 'PAGADO' | 'PENDIENTE' | 'COD_PENDIENTE';
  es_cortesia?: boolean;
  created_at: Date;
  cantidad?: number;
}) {
  const venta = await prisma.transaccion.create({
    data: {
      cliente_nombre: MARCADOR,
      total: args.total,
      estado: args.estado,
      payment_status: args.payment_status ?? 'PAGADO',
      es_cortesia: args.es_cortesia ?? false,
      created_at: args.created_at,
      transaccionesDetalles_id: {
        create: [{ producto_id: productoId, precio_unitario: args.total, cantidad: args.cantidad ?? 1 }],
      },
    },
  });
  transaccionIds.push(venta.id);
  return venta;
}

beforeAll(async () => {
  // Producto elaborado con receta conocida: 2 x insumo de costo 3.50 → costo 7.00
  const insumo = await prisma.insumo.create({
    data: {
      nombre: `Insumo ${MARCADOR} ${Date.now()}`,
      unidad_medida: 'UNIDAD',
      stock_actual: 100,
      stock_minimo: 0,
      costo_promedio: 3.5,
    },
  });
  insumoId = insumo.id;

  const producto = await prisma.producto.create({
    data: {
      nombre: `Producto ${MARCADOR} ${Date.now()}`,
      descripcion: 'fixture',
      precio: 20,
      tipo: 'ELABORADO',
      estado_publicacion: 'PUBLICADO',
      recetaProducto_id: { create: [{ insumo_id: insumoId, cantidad_utilizada: 2 }] },
    },
  });
  productoId = producto.id;

  const mediodia = new Date('2020-06-15T12:00:00.000-04:00');

  // 1) Venta pagada normal (mostrador)
  await crearVenta({ total: 20, estado: 'PAGADO', created_at: mediodia });
  // 2) Venta fiada entregada: cuenta como venta aunque no entró plata a caja
  await crearVenta({ total: 30, estado: 'ENTREGADO', payment_status: 'PENDIENTE', created_at: mediodia });
  // 3) Pedido web pagado online: cuenta aunque nunca pasó por caja
  await crearVenta({ total: 50, estado: 'ENTREGADO', payment_status: 'PAGADO', created_at: mediodia });
  // 4) Cortesía: NO cuenta como venta
  await crearVenta({ total: 15, estado: 'ENTREGADO', es_cortesia: true, created_at: mediodia });
  // 5) Cancelada: NO cuenta
  await crearVenta({ total: 99, estado: 'CANCELADO', created_at: mediodia });
  // 6) Pendiente (aún no entregada): NO cuenta todavía
  await crearVenta({ total: 77, estado: 'PENDIENTE', payment_status: 'PENDIENTE', created_at: mediodia });
  // 7) Venta a las 21:00 de Bolivia (01:00 UTC del día siguiente): pertenece al 15/06
  await crearVenta({ total: 10, estado: 'PAGADO', created_at: new Date('2020-06-15T21:00:00.000-04:00') });
});

afterAll(async () => {
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: transaccionIds } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: transaccionIds } } });
  await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.insumo.deleteMany({ where: { id: insumoId } });
});

describe('ventasNetas (devengado)', () => {
  it('incluye fiados y pagos online; excluye cortesías, canceladas y pendientes', async () => {
    const resultado = await ventasNetas(RANGO);
    // 20 + 30 (fiado) + 50 (online) + 10 (nocturna) = 110
    expect(resultado.total).toBe(110);
    expect(resultado.cantidad).toBe(4);
  });

  it('reporta el monto por cobrar (fiados) por separado', async () => {
    const resultado = await ventasNetas(RANGO);
    expect(resultado.por_cobrar).toBe(30);
  });

  it('calcula el ticket promedio solo sobre ventas reales', async () => {
    const resultado = await ventasNetas(RANGO);
    expect(resultado.ticket_promedio).toBe(27.5); // 110 / 4
  });

  it('agrupa por día de negocio de Bolivia: la venta de las 21:00 cae el 15/06, no el 16/06', async () => {
    const resultado = await ventasNetas(RANGO);
    expect(resultado.por_dia).toHaveLength(1);
    expect(resultado.por_dia[0]).toEqual({ fecha: '2020-06-15', total: 110, cantidad: 4 });
  });
});

describe('diaNegocioDe', () => {
  it('convierte un instante UTC al día de negocio de Bolivia', () => {
    // 01:30 UTC del 16/06 = 21:30 del 15/06 en Bolivia
    expect(diaNegocioDe(new Date('2020-06-16T01:30:00.000Z'))).toBe('2020-06-15');
    expect(diaNegocioDe(new Date('2020-06-15T12:00:00.000Z'))).toBe('2020-06-15');
  });
});

describe('cmvPorReceta', () => {
  it('valoriza el consumo por receta de lo vendido, no las compras del día', async () => {
    // 4 ventas netas × 1 unidad × (2 insumos × Bs 3.50) = Bs 28
    // (cortesías, canceladas y pendientes no consumen CMV de ventas)
    const cmv = await cmvPorReceta(RANGO);
    expect(cmv).toBe(28);
  });
});

describe('masVendidos', () => {
  it('cuenta solo unidades de ventas netas del rango', async () => {
    const top = await masVendidos(RANGO);
    const fila = top.find(p => p.producto_id === productoId);
    expect(fila).toBeDefined();
    expect(fila!.cantidad).toBe(4);
  });
});

describe('gastosOperativos', () => {
  it('en un rango sin movimientos devuelve solo los fijos prorrateados', async () => {
    const gastos = await gastosOperativos(RANGO);
    expect(gastos.de_caja).toBe(0);
    expect(gastos.total).toBe(gastos.fijos_prorrateados);
  });
});
