import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import {
  definirRecetaCentro, obtenerRecetaCentro, registrarProduccion,
  rindeDelCentro, costoUnitarioProduccion, rindeDeReceta,
} from './produccion.service';
import { altaInsumoEnCentro } from './insumos-centro.service';

/**
 * Producción en el Centro (Fase 2).
 *
 * La aserción que de verdad importa es la contable: producir TRANSFORMA valor,
 * no lo crea ni lo destruye. Si el valorizado del inventario del centro cambia
 * al producir, el costeo está mal y el CMV va a arrastrar ese error hasta el
 * estado de resultados.
 */
describe('produccion.service', () => {
  let centroId: number;
  let productoId: number;
  let harinaId: number;
  let quesoId: number;
  const insumosCreados: number[] = [];
  let adminId: number;

  const valorizadoDelCentro = async () => {
    const filas = await prisma.stockCentro.findMany({ where: { centro_id: centroId } });
    return filas.reduce((acc, f) => acc + f.stock_actual * f.costo_promedio, 0);
  };

  beforeAll(async () => {
    const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    adminId = admin.id;

    const centro = await prisma.centroProduccion.create({ data: { nombre: `Centro produccion test ${Date.now()}` } });
    centroId = centro.id;

    // 20 kg de harina a Bs 10 = Bs 200 · 5 kg de queso a Bs 40 = Bs 200
    const harina = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Harina prod test ${Date.now()}`, unidad_medida: 'KG',
      stock_inicial: 20, costo_unitario: 10, stock_minimo: 0, punto_critico: 0,
    }, adminId, 'DUENO'));
    harinaId = harina.insumo.id;

    const queso = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Queso prod test ${Date.now()}`, unidad_medida: 'KG',
      stock_inicial: 5, costo_unitario: 40, stock_minimo: 0, punto_critico: 0,
    }, adminId, 'DUENO'));
    quesoId = queso.insumo.id;
    insumosCreados.push(harinaId, quesoId);

    const producto = await prisma.producto.create({
      data: { nombre: `Empanada test ${Date.now()}`, descripcion: 'Producto de prueba', precio: 12 },
    });
    productoId = producto.id;
  });

  afterAll(async () => {
    if (centroId == null) return;
    const producto = await prisma.producto.findUnique({ where: { id: productoId } });
    await prisma.recetaCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.producto.update({ where: { id: productoId }, data: { insumo_reventa_id: null } });
    await prisma.producto.delete({ where: { id: productoId } });
    if (producto?.insumo_reventa_id) insumosCreados.push(producto.insumo_reventa_id);
    await prisma.insumo.deleteMany({ where: { id: { in: insumosCreados } } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
  });

  it('definir la receta crea el insumo espejo del producto si no existía', async () => {
    // 0.2 kg de harina + 0.05 kg de queso por empanada.
    const receta = await definirRecetaCentro(centroId, productoId, [
      { insumo_id: harinaId, cantidad_utilizada: 0.2 },
      { insumo_id: quesoId, cantidad_utilizada: 0.05 },
    ], adminId, 'DUENO');

    expect(receta).toHaveLength(2);

    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    expect(producto.insumo_reventa_id).not.toBeNull();

    // El espejo queda listado en el inventario del centro, en cero.
    const espejo = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: producto.insumo_reventa_id! } },
    });
    expect(espejo.stock_actual).toBe(0);
  });

  it('el rinde es el mínimo entre los insumos de la receta', async () => {
    const receta = await obtenerRecetaCentro(centroId, productoId);
    // harina: floor(20 / 0.2) = 100 · queso: floor(5 / 0.05) = 100
    expect(rindeDeReceta(receta)).toBe(100);
    // 0.2×10 + 0.05×40 = 4
    expect(costoUnitarioProduccion(receta)).toBeCloseTo(4, 6);

    const listado = await rindeDelCentro(centroId);
    const fila = listado.find(r => r.producto_id === productoId);
    expect(fila?.unidades_posibles).toBe(100);
    expect(fila?.costo_unitario).toBeCloseTo(4, 6);
  });

  it('producir consume el insumo bruto y acredita el terminado sin cambiar el valor del inventario', async () => {
    const valorAntes = await valorizadoDelCentro();
    expect(valorAntes).toBeCloseTo(400, 6); // 200 de harina + 200 de queso

    const res = await prisma.$transaction((tx) =>
      registrarProduccion(tx, centroId, productoId, 50, undefined, adminId, 'DUENO'));

    expect(res.costo_unitario).toBeCloseTo(4, 6);
    expect(res.costo_total).toBeCloseTo(200, 6);

    const harina = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: harinaId } },
    });
    const queso = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: quesoId } },
    });
    expect(harina.stock_actual).toBeCloseTo(10, 6);  // 20 − 50×0.2
    expect(queso.stock_actual).toBeCloseTo(2.5, 6);  // 5 − 50×0.05

    expect(res.stock.stock_actual).toBe(50);
    expect(res.stock.costo_promedio).toBeCloseTo(4, 6);

    // LA aserción contable: 100 de harina + 100 de queso + 200 de terminado.
    const valorDespues = await valorizadoDelCentro();
    expect(valorDespues).toBeCloseTo(valorAntes, 6);
  });

  it('el kardex deja un movimiento PRODUCCION por insumo consumido y uno por lo producido', async () => {
    const movimientos = await prisma.movimientoCentro.findMany({
      where: { centro_id: centroId, tipo_movimiento: 'PRODUCCION' },
    });
    expect(movimientos).toHaveLength(3);
    expect(movimientos.filter(m => m.cantidad < 0)).toHaveLength(2);
    expect(movimientos.filter(m => m.cantidad > 0)).toHaveLength(1);
  });

  it('sin insumo suficiente rechaza y no toca nada', async () => {
    const valorAntes = await valorizadoDelCentro();

    await expect(
      prisma.$transaction((tx) => registrarProduccion(tx, centroId, productoId, 10_000, undefined, adminId, 'DUENO')),
    ).rejects.toThrow(/Insumo insuficiente/);

    expect(await valorizadoDelCentro()).toBeCloseTo(valorAntes, 6);
  });

  it('un producto sin receta en el centro no se puede producir', async () => {
    const otro = await prisma.producto.create({
      data: { nombre: `Sin receta test ${Date.now()}`, descripcion: 'x', precio: 5 },
    });
    await expect(
      prisma.$transaction((tx) => registrarProduccion(tx, centroId, otro.id, 1, undefined, adminId, 'DUENO')),
    ).rejects.toThrow(/no tiene receta/);
    await prisma.producto.delete({ where: { id: otro.id } });
  });

  it('una receta con un insumo que el centro no maneja se rechaza al definirla', async () => {
    const ajeno = await prisma.insumo.create({
      data: { nombre: `Insumo ajeno prod ${Date.now()}`, unidad_medida: 'KG', stock_actual: 0, stock_minimo: 0 },
    });
    insumosCreados.push(ajeno.id);

    await expect(
      definirRecetaCentro(centroId, productoId, [{ insumo_id: ajeno.id, cantidad_utilizada: 1 }], adminId, 'DUENO'),
    ).rejects.toThrow(/no están en el inventario del centro/);
  });
});
