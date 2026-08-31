import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { POST as POST_CENTRO } from '../route';
import { POST as POST_INSUMO } from '../[id]/insumos/route';
import { POST as POST_COMPRA } from './route';
import { POST as POST_MERMA } from '../merma/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * Idempotencia de los endpoints del Centro que mueven stock con deltas.
 *
 * Lo que se prueba no es el status code sino el EFECTO: que después del
 * reintento el stock y el costo promedio hayan quedado como si la operación
 * se hubiera ejecutado una sola vez. Un 409 con el stock ya duplicado sería
 * un test verde sobre un bug.
 */
describe('idempotencia de compra y merma del Centro', () => {
  let centroId: number;
  let insumoId: number;

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const pedir = (url: string, access_token: string, body: unknown, clave?: string) =>
    new NextRequest(`http://localhost${url}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access_token}`,
        'content-type': 'application/json',
        ...(clave ? { 'Idempotency-Key': clave } : {}),
      },
      body: JSON.stringify(body),
    });

  const stockDeCentro = () => prisma.stockCentro.findUniqueOrThrow({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
  });

  beforeAll(async () => {
    const access_token = await token();
    const crear = await POST_CENTRO(pedir('/api/admin/centros-produccion', access_token, { nombre: `Centro idem ${Date.now()}` }));
    centroId = (await crear.json()).data.id;

    // 10 kg a Bs 20: el punto de partida del ejemplo de promedio ponderado.
    const alta = await POST_INSUMO(
      pedir(`/api/admin/centros-produccion/${centroId}/insumos`, access_token, {
        nombre: `Carne idem ${Date.now()}`, unidad_medida: 'KG',
        stock_inicial: 10, costo_unitario: 20, stock_minimo: 2, punto_critico: 1,
      }),
      { params: Promise.resolve({ id: String(centroId) }) },
    );
    insumoId = (await alta.json()).data.insumo.id;
  });

  afterAll(async () => {
    // Guarda deliberada: si el beforeAll falla, centroId queda undefined y un
    // deleteMany({ where: { centro_id: undefined } }) no filtra nada — borra la
    // tabla entera de la base de tests.
    if (centroId == null || insumoId == null) return;
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.insumo.deleteMany({ where: { id: insumoId } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
  });

  it('la misma compra reenviada con la misma clave no duplica stock ni descoloca el costo promedio', async () => {
    const access_token = await token();
    const clave = randomUUID();
    const compra = { centro_id: centroId, insumo_id: insumoId, cantidad: 5, costo_unitario: 26 };

    const primera = await POST_COMPRA(pedir('/api/admin/centros-produccion/compra', access_token, compra, clave));
    expect(primera.status).toBe(201);

    const trasPrimera = await stockDeCentro();
    expect(trasPrimera.stock_actual).toBe(15);
    // (10×20 + 5×26) / 15 = 22
    expect(trasPrimera.costo_promedio).toBeCloseTo(22, 4);

    // Reintento: mismo cuerpo, misma clave. Es lo que manda axios cuando la
    // respuesta se pierde, o el operador cuando vuelve a apretar.
    const reintento = await POST_COMPRA(pedir('/api/admin/centros-produccion/compra', access_token, compra, clave));
    expect(reintento.status).toBe(409);
    expect((await reintento.json()).code).toBe('IDEMPOTENTE');

    const trasReintento = await stockDeCentro();
    expect(trasReintento.stock_actual).toBe(15);
    expect(trasReintento.costo_promedio).toBeCloseTo(22, 4);

    // Se cuenta por clave y no por tipo: el alta con stock inicial ya dejó su
    // propio INGRESO en el kardex, y contarlos todos mediría otra cosa.
    const movimientos = await prisma.movimientoCentro.count({ where: { idempotency_key: clave } });
    expect(movimientos).toBe(1);
  });

  it('con una clave nueva, la misma compra sí se registra: no se bloquea la operación legítima', async () => {
    const access_token = await token();
    const compra = { centro_id: centroId, insumo_id: insumoId, cantidad: 5, costo_unitario: 26 };

    const segunda = await POST_COMPRA(pedir('/api/admin/centros-produccion/compra', access_token, compra, randomUUID()));
    expect(segunda.status).toBe(201);

    const stock = await stockDeCentro();
    expect(stock.stock_actual).toBe(20);
    // (15×22 + 5×26) / 20 = 23
    expect(stock.costo_promedio).toBeCloseTo(23, 4);
  });

  it('la misma merma reenviada con la misma clave no descuenta dos veces', async () => {
    const access_token = await token();
    const clave = randomUUID();
    const merma = { centro_id: centroId, insumo_id: insumoId, cantidad: 4, descripcion: 'Merma idem' };

    const primera = await POST_MERMA(pedir('/api/admin/centros-produccion/merma', access_token, merma, clave));
    expect(primera.status).toBe(201);
    expect((await stockDeCentro()).stock_actual).toBe(16);

    const reintento = await POST_MERMA(pedir('/api/admin/centros-produccion/merma', access_token, merma, clave));
    expect(reintento.status).toBe(409);
    expect((await stockDeCentro()).stock_actual).toBe(16);
  });

  it('sin cabecera el endpoint sigue funcionando como antes (clientes viejos)', async () => {
    const access_token = await token();
    const res = await POST_MERMA(pedir('/api/admin/centros-produccion/merma', access_token,
      { centro_id: centroId, insumo_id: insumoId, cantidad: 1, descripcion: 'Merma sin clave' }));
    expect(res.status).toBe(201);
    expect((await stockDeCentro()).stock_actual).toBe(15);
  });

  it('una clave que no es UUID se rechaza con 422 en vez de envenenar el índice', async () => {
    const access_token = await token();
    const res = await POST_MERMA(pedir('/api/admin/centros-produccion/merma', access_token,
      { centro_id: centroId, insumo_id: insumoId, cantidad: 1, descripcion: 'Clave inválida' }, '1'));
    expect(res.status).toBe(422);
    expect((await stockDeCentro()).stock_actual).toBe(15);
  });
});
