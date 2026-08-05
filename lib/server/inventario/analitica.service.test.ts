import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';
import { getAnalitica } from './analitica.service';
import { hoyISO, rangoDiaNegocio } from '@/lib/server/fechas';

const MARCADOR = `analitica-test-${Date.now()}`;

let productoId: number;
let insumoId: number;
const transaccionIds: number[] = [];

beforeAll(async () => {
  const insumo = await prisma.insumo.create({
    data: {
      nombre: `Insumo ${MARCADOR}`,
      unidad_medida: 'UNIDAD',
      stock_actual: 100,
      stock_minimo: 0,
      costo_promedio: 5,
    },
  });
  insumoId = insumo.id;

  const producto = await prisma.producto.create({
    data: {
      nombre: `Producto ${MARCADOR}`,
      descripcion: 'fixture',
      precio: 20,
      tipo: 'ELABORADO',
      estado_publicacion: 'PUBLICADO',
      recetaProducto_id: { create: [{ insumo_id: insumoId, sucursal_id: await sucursalPorDefectoId(), cantidad_utilizada: 1 }] },
    },
  });
  productoId = producto.id;

  // Venta neta a las 21:00 de Bolivia de hoy (01:00 UTC de mañana):
  // debe caer en el día de negocio de HOY.
  const nocturna = new Date(`${hoyISO()}T21:00:00.000-04:00`);
  const venta = await prisma.transaccion.create({
    data: {
      sucursal_id: await sucursalPorDefectoId(),
      cliente_nombre: MARCADOR,
      total: 20,
      estado: 'PAGADO',
      payment_status: 'PAGADO',
      created_at: nocturna,
      transaccionesDetalles_id: {
        create: [{ producto_id: productoId, precio_unitario: 20, cantidad: 2 }],
      },
    },
  });
  transaccionIds.push(venta.id);

  // Cortesía de hoy: NO debe aparecer en la analítica
  const cortesia = await prisma.transaccion.create({
    data: {
      sucursal_id: await sucursalPorDefectoId(),
      cliente_nombre: MARCADOR,
      total: 999,
      estado: 'ENTREGADO',
      es_cortesia: true,
      created_at: rangoDiaNegocio().desde,
      transaccionesDetalles_id: {
        create: [{ producto_id: productoId, precio_unitario: 999, cantidad: 50 }],
      },
    },
  });
  transaccionIds.push(cortesia.id);
});

afterAll(async () => {
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: transaccionIds } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: transaccionIds } } });
  await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.insumo.deleteMany({ where: { id: insumoId } });
});

describe('getAnalitica', () => {
  it('la venta de las 21:00 Bolivia cae en el día de negocio de hoy (no mañana)', async () => {
    const resultado = await getAnalitica('7d');
    const hoy = resultado.ventasPorDia.find(d => d.fecha === hoyISO());
    expect(hoy).toBeDefined();
    expect(hoy!.total).toBeGreaterThanOrEqual(20);
    // Ningún día futuro puede tener ventas
    expect(resultado.ventasPorDia.every(d => d.fecha <= hoyISO())).toBe(true);
  });

  it('excluye cortesías de ventas y de la ingeniería de menú', async () => {
    const resultado = await getAnalitica('7d');
    const fila = resultado.ingenieriaMeniu.find(item => item.producto_id === productoId);
    expect(fila).toBeDefined();
    // Solo las 2 unidades de la venta real; las 50 de la cortesía no cuentan
    expect(fila!.ventas).toBe(2);
    expect(fila!.total_vendido).toBe(40);
  });

  it('expone costo, food cost y margen por producto para la tabla de rentabilidad', async () => {
    const resultado = await getAnalitica('7d');
    const fila = resultado.ingenieriaMeniu.find(item => item.producto_id === productoId)!;
    expect(fila.precio).toBe(20);
    expect(fila.costo).toBe(5);            // 1 insumo × Bs 5
    expect(fila.food_cost_pct).toBe(25);   // 5 / 20
    expect(fila.margen).toBe(75);
  });

  it('la analítica es de un solo local: otra sucursal no ve estas ventas', async () => {
    // Sin sucursal explícita se usa la principal, donde está el fixture.
    const principal = await getAnalitica('7d');
    expect(principal.ingenieriaMeniu.some(item => item.producto_id === productoId)).toBe(true);

    const otra = await prisma.sucursal.create({ data: { nombre: `Sucursal ${MARCADOR}` } });
    try {
      const vacia = await getAnalitica('7d', undefined, otra.id);
      // Las ventas son de la principal: no deben aparecer al mirar otro local.
      expect(vacia.ingenieriaMeniu.some(item => item.producto_id === productoId)).toBe(false);
    } finally {
      await prisma.sucursal.deleteMany({ where: { id: otra.id } });
    }
  });

  it('usa el precio de venta del local, no el del catálogo', async () => {
    const sucursalId = await sucursalPorDefectoId();
    // El catálogo dice 20; este local lo cobra a 40, así que el margen sobre un
    // costo de 5 pasa de 75% a 87.5%.
    await prisma.productoSucursal.create({
      data: { producto_id: productoId, sucursal_id: sucursalId, precio: 40, update_at: new Date() },
    });
    try {
      const resultado = await getAnalitica('7d');
      const fila = resultado.ingenieriaMeniu.find(item => item.producto_id === productoId)!;
      expect(fila.precio).toBe(40);
      expect(fila.food_cost_pct).toBe(12.5);
      expect(fila.margen).toBe(87.5);
    } finally {
      await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
    }
  });

  it('el CMV del período valoriza el consumo por receta', async () => {
    const resultado = await getAnalitica('7d');
    // Nuestro fixture aporta 2 unidades × Bs 5 = Bs 10 al CMV
    expect(resultado.cmvTotal).toBeGreaterThanOrEqual(10);
    expect(resultado.totalVentas).toBeGreaterThanOrEqual(20);
  });
});
