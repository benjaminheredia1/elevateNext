import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT, DELETE } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * Regresión: editar el costo de un insumo (botón "Editar", no "Compra") no
 * movía el costo con el que se calculan las recetas — ese costo vive en
 * StockSucursal (por local desde multi-sucursal), y el PUT solo escribía el
 * agregado Insumo.costo_promedio. Reportado en producción: "cambio Agua
 * Cielo de 3.8 a 4 y me sigue saliendo 3.8".
 */
describe('PUT /api/insumo/[id] — edición de costo por sucursal', () => {
  let insumoId: number;
  let sucursalId: number;

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const pedir = (url: string, body: unknown, access_token: string) =>
    new NextRequest(`http://localhost${url}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const sucursal = await prisma.sucursal.findFirstOrThrow({ where: { activa: true } });
    sucursalId = sucursal.id;

    const insumo = await prisma.insumo.create({
      data: {
        nombre: `Agua Cielo test ${Date.now()}`,
        unidad_medida: 'UNIDAD',
        stock_actual: 0,
        stock_minimo: 0,
        costo_promedio: 3.8,
      },
    });
    insumoId = insumo.id;

    await prisma.stockSucursal.create({
      data: {
        insumo_id: insumoId,
        sucursal_id: sucursalId,
        stock_actual: 10,
        costo_promedio: 3.8,
        stock_minimo: 0,
        punto_critico: 0,
      },
    });
  });

  afterAll(async () => {
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.insumo.delete({ where: { id: insumoId } });
  });

  it('al editar el costo de un insumo, el costo de ESA sucursal cambia (no se queda en el viejo)', async () => {
    const access_token = await token();

    const res = await PUT(
      pedir(`/api/insumo/${insumoId}`, {
        nombre: 'Agua Cielo',
        unidad_medida: 'UNIDAD',
        costo_promedio: 4,
        stock_minimo: 0,
        punto_critico: 0,
        sucursal_id: sucursalId,
      }, access_token),
      { params: Promise.resolve({ id: String(insumoId) }) },
    );
    expect(res.status).toBe(200);

    const stock = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
    });
    expect(stock.costo_promedio).toBe(4);

    const insumo = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    expect(insumo.costo_promedio).toBe(4);
  });

  it('no toca el stock_actual de la sucursal', async () => {
    const access_token = await token();
    await PUT(
      pedir(`/api/insumo/${insumoId}`, {
        nombre: 'Agua Cielo', unidad_medida: 'UNIDAD', costo_promedio: 5,
        stock_minimo: 0, punto_critico: 0, sucursal_id: sucursalId,
      }, access_token),
      { params: Promise.resolve({ id: String(insumoId) }) },
    );

    const stock = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
    });
    expect(stock.stock_actual).toBe(10);
  });
});

/**
 * Regresión I-1: el borrado físico contaba recetas, reventa e insumos mixtos,
 * pero no el inventario del Centro de Producción. La FK de StockCentro es
 * ON DELETE CASCADE, así que la fila del centro se borraba en silencio y sin
 * auditoría; y la de MovimientoCentro es RESTRICT, así que Postgres tiraba
 * P2003 y el admin recibía un 500 genérico en vez del 409 explicativo que el
 * endpoint da para todos los demás usos.
 */
describe('DELETE /api/insumo/[id] — insumo en uso por el Centro de Producción', () => {
  let insumoId: number;
  let centroId: number;

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const pedirBorrado = (access_token: string) =>
    new NextRequest(`http://localhost/api/insumo/${insumoId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${access_token}` },
    });

  beforeAll(async () => {
    const centro = await prisma.centroProduccion.create({
      data: { nombre: `Centro borrado test ${Date.now()}` },
    });
    centroId = centro.id;

    const insumo = await prisma.insumo.create({
      data: {
        nombre: `Insumo del centro ${Date.now()}`,
        unidad_medida: 'KG',
        stock_actual: 0,
        stock_minimo: 0,
        costo_promedio: 1,
      },
    });
    insumoId = insumo.id;

    await prisma.stockCentro.create({
      data: { centro_id: centroId, insumo_id: insumoId, stock_actual: 5, costo_promedio: 1 },
    });
  });

  afterAll(async () => {
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
    await prisma.insumo.deleteMany({ where: { id: insumoId } });
  });

  it('devuelve 409 explicando el uso y NO borra la fila del centro', async () => {
    const res = await DELETE(pedirBorrado(await token()), {
      params: Promise.resolve({ id: String(insumoId) }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/[Cc]entro/);

    const sigue = await prisma.stockCentro.count({ where: { insumo_id: insumoId } });
    expect(sigue).toBe(1);
    const insumo = await prisma.insumo.findUnique({ where: { id: insumoId } });
    expect(insumo).not.toBeNull();
  });
});
