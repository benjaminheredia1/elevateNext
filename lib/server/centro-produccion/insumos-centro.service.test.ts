import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { crearCentro } from './centro-produccion.service';
import {
  altaInsumoEnCentro,
  registrarCompraCentro,
  registrarMermaCentro,
  registrarConteoFisicoCentro,
  darDeBajaInsumoCentro,
  reactivarInsumoCentro,
} from './insumos-centro.service';

let adminId: number;
let centroId: number;
const insumoIds: number[] = [];

async function alta(nombre: string, stockInicial = 10, costo = 5) {
  const resultado = await prisma.$transaction((tx) =>
    altaInsumoEnCentro(tx, centroId, {
      nombre, unidad_medida: 'KG', stock_inicial: stockInicial,
      costo_unitario: costo, stock_minimo: 2, punto_critico: 1,
    }, adminId, 'DUENO'),
  );
  insumoIds.push(resultado.insumo.id);
  return resultado;
}

describe('insumos-centro.service', () => {
  beforeAll(async () => {
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { email: 'benjaherediaruiz@gmail.com' } });
    adminId = admin.id;
    const centro = await crearCentro(`Centro Insumos Test ${Date.now()}`, undefined);
    centroId = centro.id;
  });

  afterAll(async () => {
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.insumo.deleteMany({ where: { id: { in: insumoIds } } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
  });

  it('altaInsumoEnCentro crea el insumo y su stock inicial', async () => {
    const { insumo, stock } = await alta(`Fideo test ${Date.now()}`, 20, 6);
    expect(stock.stock_actual).toBe(20);
    expect(stock.costo_promedio).toBe(6);

    const movimientos = await prisma.movimientoCentro.findMany({ where: { insumo_id: insumo.id } });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].tipo_movimiento).toBe('INGRESO');
  });

  it('altaInsumoEnCentro rechaza dar de alta el mismo insumo dos veces en el mismo centro', async () => {
    const nombre = `Avena test ${Date.now()}`;
    await alta(nombre, 5, 3);

    await expect(prisma.$transaction((tx) =>
      altaInsumoEnCentro(tx, centroId, {
        nombre, unidad_medida: 'KG', stock_inicial: 1,
        costo_unitario: 1, stock_minimo: 0, punto_critico: 0,
      }, adminId, 'DUENO'),
    )).rejects.toMatchObject({ status: 409 });
  });

  it('registrarCompraCentro pondera el costo promedio', async () => {
    const { insumo } = await alta(`Carne test ${Date.now()}`, 10, 5);

    const { stock } = await prisma.$transaction((tx) =>
      registrarCompraCentro(tx, centroId, insumo.id, 10, 8, 'compra test', adminId, 'DUENO'),
    );
    expect(stock.stock_actual).toBe(20);
    expect(stock.costo_promedio).toBeCloseTo(6.5, 5); // (10·5 + 10·8) / 20
  });

  it('registrarCompraCentro rechaza un insumo que el centro no maneja', async () => {
    const otroInsumo = await prisma.insumo.create({
      data: { nombre: `Insumo ajeno test ${Date.now()}`, unidad_medida: 'KG', stock_actual: 0, stock_minimo: 0 },
    });
    insumoIds.push(otroInsumo.id);

    await expect(prisma.$transaction((tx) =>
      registrarCompraCentro(tx, centroId, otroInsumo.id, 5, 5, undefined, adminId, 'DUENO'),
    )).rejects.toMatchObject({ status: 404 });
  });

  it('registrarMermaCentro descuenta stock', async () => {
    const { insumo } = await alta(`Lechuga test ${Date.now()}`, 10, 2);

    const { stock } = await prisma.$transaction((tx) =>
      registrarMermaCentro(tx, centroId, insumo.id, 3, 'se echó a perder', adminId, 'DUENO'),
    );
    expect(stock.stock_actual).toBe(7);
  });

  it('registrarConteoFisicoCentro fija el stock y registra la varianza', async () => {
    const { insumo } = await alta(`Tomate test ${Date.now()}`, 10, 2);

    const { stock, varianza } = await prisma.$transaction((tx) =>
      registrarConteoFisicoCentro(tx, centroId, insumo.id, 7, undefined, adminId, 'DUENO'),
    );
    expect(stock.stock_actual).toBe(7);
    expect(varianza).toBe(-3);
  });

  it('darDeBajaInsumoCentro apaga la fila sin tocar el stock, y se puede reactivar', async () => {
    const { insumo } = await alta(`Cebolla test ${Date.now()}`, 5, 1);

    const { stock: baja } = await darDeBajaInsumoCentro(centroId, insumo.id, 'ya no se usa', adminId, 'DUENO');
    expect(baja.activo).toBe(false);
    expect(baja.stock_actual).toBe(5); // la baja no borra el stock, solo apaga la fila

    await expect(
      darDeBajaInsumoCentro(centroId, insumo.id, 'de nuevo', adminId, 'DUENO'),
    ).rejects.toMatchObject({ status: 409 });

    const { stock: reactivado } = await reactivarInsumoCentro(centroId, insumo.id, adminId, 'DUENO');
    expect(reactivado.activo).toBe(true);
  });
});
