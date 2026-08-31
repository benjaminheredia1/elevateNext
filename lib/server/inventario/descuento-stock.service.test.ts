import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';
import { descontarStockPorTransaccion } from './descuento-stock.service';

describe('descontarStockPorTransaccion — costo congelado por línea', () => {
  let sucursalId: number;
  let insumoId: number;
  let productoId: number;
  const transaccionIds: number[] = [];

  beforeAll(async () => {
    sucursalId = await sucursalPorDefectoId();

    const insumo = await prisma.insumo.create({
      data: {
        nombre: `Insumo congelado test ${Date.now()}`,
        unidad_medida: 'UNIDAD', stock_actual: 100, stock_minimo: 0, costo_promedio: 4,
      },
    });
    insumoId = insumo.id;
    await prisma.stockSucursal.create({
      data: { insumo_id: insumoId, sucursal_id: sucursalId, stock_actual: 100, costo_promedio: 4, stock_minimo: 0, punto_critico: 0 },
    });

    const producto = await prisma.producto.create({
      data: {
        nombre: `Producto congelado test ${Date.now()}`, descripcion: 'fixture', precio: 20,
        tipo: 'ELABORADO', estado_publicacion: 'PUBLICADO',
        recetaProducto_id: { create: [{ insumo_id: insumoId, sucursal_id: sucursalId, cantidad_utilizada: 2 }] },
      },
    });
    productoId = producto.id;
  });

  afterAll(async () => {
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: transaccionIds } } });
    await prisma.transaccion.deleteMany({ where: { id: { in: transaccionIds } } });
    await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
    await prisma.producto.deleteMany({ where: { id: productoId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.insumo.deleteMany({ where: { id: insumoId } });
  });

  it('congela el costo de la línea con el costo de la receta al momento de la venta', async () => {
    const venta = await prisma.transaccion.create({
      data: {
        sucursal_id: sucursalId, cliente_nombre: 'test costo congelado', total: 20,
        estado: 'PAGADO', payment_status: 'PAGADO',
        transaccionesDetalles_id: { create: [{ producto_id: productoId, precio_unitario: 20, cantidad: 1 }] },
      },
    });
    transaccionIds.push(venta.id);

    await prisma.$transaction((tx) => descontarStockPorTransaccion(tx, venta.id));

    const detalle = await prisma.transaccionesDetalles.findFirstOrThrow({ where: { transaccion_id: venta.id } });
    expect(detalle.costo_unitario).toBe(8); // receta: 2 × insumo a Bs 4

    // Cambiar el costo del insumo DESPUÉS de la venta no debe mover lo congelado.
    await prisma.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
      data: { costo_promedio: 999 },
    });
    const detalleDespues = await prisma.transaccionesDetalles.findFirstOrThrow({ where: { transaccion_id: venta.id } });
    expect(detalleDespues.costo_unitario).toBe(8);
  });
});
