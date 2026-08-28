/**
 * Integración: registrarCompra y el costo promedio ponderado.
 * Regresión del bug de stock negativo: un stock negativo NO debe participar
 * en la ponderación del costo promedio (estilo Odoo AVCO), porque produce
 * costos absurdos (más altos que cualquier precio pagado).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { registrarCompra, resolverConsumoInsumos } from './inventario.service';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

let adminId: number;
const createdInsumoIds: number[] = [];

async function crearInsumo(stock: number, costo: number) {
  const insumo = await prisma.insumo.create({
    data: {
      nombre: `Insumo compra test ${Date.now()}-${Math.random()}`,
      unidad_medida: 'UNIDAD',
      stock_actual: stock,
      stock_minimo: 0,
      costo_promedio: costo,
    },
  });
  createdInsumoIds.push(insumo.id);
  return insumo;
}

async function comprar(insumoId: number, cantidad: number, costoUnitario: number) {
  return prisma.$transaction((tx) =>
    registrarCompra(tx, insumoId, cantidad, costoUnitario, 'test', adminId, 'DUENO'),
  );
}

describe('registrarCompra — costo promedio ponderado', () => {
  beforeAll(async () => {
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { email: 'benjaherediaruiz@gmail.com' } });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (createdInsumoIds.length > 0) {
      await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: createdInsumoIds } } });
      await prisma.insumo.deleteMany({ where: { id: { in: createdInsumoIds } } });
    }
  });

  it('con stock POSITIVO pondera normalmente', async () => {
    const insumo = await crearInsumo(10, 5);
    const { insumo: despues } = await comprar(insumo.id, 10, 8);
    expect(despues.stock_actual).toBe(20);
    expect(despues.costo_promedio).toBeCloseTo(6.5, 5); // (10·5 + 10·8) / 20
  });

  it('con stock NEGATIVO no pondera contra el negativo: el costo queda en el de la compra', async () => {
    const insumo = await crearInsumo(-3, 5);
    const { insumo: despues } = await comprar(insumo.id, 10, 8);
    // El stock sí sigue siendo incremental (el faltante se corrige con conteo físico)
    expect(despues.stock_actual).toBe(7);
    // Antes del fix: (−3·5 + 10·8) / 7 = 9.29 — más caro que cualquier precio pagado.
    expect(despues.costo_promedio).toBeCloseTo(8, 5);
  });

  it('con stock CERO el costo queda en el de la compra', async () => {
    const insumo = await crearInsumo(0, 12);
    const { insumo: despues } = await comprar(insumo.id, 5, 7);
    expect(despues.stock_actual).toBe(5);
    expect(despues.costo_promedio).toBeCloseTo(7, 5);
  });

  it('compra que no alcanza a salir del negativo: costo de la compra, sin división rara', async () => {
    const insumo = await crearInsumo(-10, 5);
    const { insumo: despues } = await comprar(insumo.id, 4, 8);
    expect(despues.stock_actual).toBe(-6);
    expect(despues.costo_promedio).toBeCloseTo(8, 5);
  });
});

describe('resolverConsumoInsumos — prioridad del insumo espejo sobre la receta local', () => {
  const createdInsumoIds: number[] = [];
  const createdProductoIds: number[] = [];

  afterAll(async () => {
    if (createdProductoIds.length > 0) {
      await prisma.recetasProducto.deleteMany({ where: { producto_id: { in: createdProductoIds } } });
      await prisma.producto.deleteMany({ where: { id: { in: createdProductoIds } } });
    }
    if (createdInsumoIds.length > 0) {
      await prisma.insumo.deleteMany({ where: { id: { in: createdInsumoIds } } });
    }
  });

  it('descuenta el insumo espejo y NO la receta local cuando el producto tiene ambos', async () => {
    const sufijo = Date.now();
    const sucursalId = await sucursalPorDefectoId();

    const harina = await prisma.insumo.create({
      data: { nombre: `Harina ${sufijo}`, unidad_medida: 'GR', stock_actual: 1000, stock_minimo: 0, costo_promedio: 0.01 },
    });
    createdInsumoIds.push(harina.id);
    const espejo = await prisma.insumo.create({
      data: { nombre: `Brownie ${sufijo}`, unidad_medida: 'UNIDAD', stock_actual: 5, stock_minimo: 0, costo_promedio: 12 },
    });
    createdInsumoIds.push(espejo.id);
    const producto = await prisma.producto.create({
      data: {
        nombre: `Brownie ${sufijo}`, descripcion: 'x', precio: 20,
        tipo: 'ELABORADO', estado_publicacion: 'PUBLICADO',
        insumo_reventa_id: espejo.id,
      },
    });
    createdProductoIds.push(producto.id);
    // Receta local vieja, la que quedará como histórico tras el corte
    await prisma.recetasProducto.create({
      data: { producto_id: producto.id, insumo_id: harina.id, cantidad_utilizada: 80, sucursal_id: sucursalId },
    });

    const consumo = await resolverConsumoInsumos(producto.id, 3, prisma, sucursalId);

    expect(consumo.get(espejo.id)).toBe(3);
    expect(consumo.has(harina.id)).toBe(false);
  });

  it('sigue usando la receta local cuando el producto no tiene espejo', async () => {
    const sufijo = Date.now();
    const sucursalId = await sucursalPorDefectoId();

    const harina = await prisma.insumo.create({
      data: { nombre: `Harina sin espejo ${sufijo}`, unidad_medida: 'GR', stock_actual: 1000, stock_minimo: 0, costo_promedio: 0.01 },
    });
    createdInsumoIds.push(harina.id);
    const producto = await prisma.producto.create({
      data: { nombre: `Torta ${sufijo}`, descripcion: 'x', precio: 20, tipo: 'ELABORADO', estado_publicacion: 'PUBLICADO' },
    });
    createdProductoIds.push(producto.id);
    await prisma.recetasProducto.create({
      data: { producto_id: producto.id, insumo_id: harina.id, cantidad_utilizada: 50, sucursal_id: sucursalId },
    });

    const consumo = await resolverConsumoInsumos(producto.id, 2, prisma, sucursalId);

    expect(consumo.get(harina.id)).toBe(100);
  });
});
