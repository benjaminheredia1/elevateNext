import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { POST as POST_COMPRA } from './route';
import { POST as POST_MERMA } from '../merma/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * Idempotencia del motor de sucursales. Gemelo del test del Centro: el mismo
 * problema existía en los dos motores y arreglarlo en uno solo dejaba el
 * sistema asimétrico. Se verifica el efecto sobre StockSucursal, que es el
 * costo con el que se calculan recetas y food cost.
 */
describe('idempotencia de compra y merma de sucursal', () => {
  let insumoId: number;
  let sucursalId: number;

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

  const stock = () => prisma.stockSucursal.findUniqueOrThrow({
    where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
  });

  beforeAll(async () => {
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;

    const insumo = await prisma.insumo.create({
      data: { nombre: `Insumo idem sucursal ${Date.now()}`, unidad_medida: 'KG', stock_actual: 0, stock_minimo: 0 },
    });
    insumoId = insumo.id;

    // Punto de partida idéntico al del Centro: 10 kg a Bs 20.
    await prisma.stockSucursal.create({
      data: { insumo_id: insumoId, sucursal_id: sucursalId, stock_actual: 10, costo_promedio: 20 },
    });
  });

  afterAll(async () => {
    if (insumoId == null) return;
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.insumo.delete({ where: { id: insumoId } });
  });

  it('la compra reenviada con la misma clave no duplica stock ni costo promedio', async () => {
    const access_token = await token();
    const clave = randomUUID();
    const compra = { insumo_id: insumoId, cantidad: 5, costo_unitario: 26, sucursal_id: sucursalId };

    expect((await POST_COMPRA(pedir('/api/admin/insumos/compra', access_token, compra, clave))).status).toBe(201);

    const trasPrimera = await stock();
    expect(trasPrimera.stock_actual).toBe(15);
    expect(trasPrimera.costo_promedio).toBeCloseTo(22, 4);

    const reintento = await POST_COMPRA(pedir('/api/admin/insumos/compra', access_token, compra, clave));
    expect(reintento.status).toBe(409);
    expect((await reintento.json()).code).toBe('IDEMPOTENTE');

    const trasReintento = await stock();
    expect(trasReintento.stock_actual).toBe(15);
    expect(trasReintento.costo_promedio).toBeCloseTo(22, 4);
    expect(await prisma.movimientoInterno.count({ where: { idempotency_key: clave } })).toBe(1);
  });

  it('la merma reenviada con la misma clave no descuenta dos veces', async () => {
    const access_token = await token();
    const clave = randomUUID();
    const merma = { insumo_id: insumoId, cantidad: 3, descripcion: 'Merma idem', sucursal_id: sucursalId };

    expect((await POST_MERMA(pedir('/api/admin/insumos/merma', access_token, merma, clave))).status).toBe(201);
    expect((await stock()).stock_actual).toBe(12);

    const reintento = await POST_MERMA(pedir('/api/admin/insumos/merma', access_token, merma, clave));
    expect(reintento.status).toBe(409);
    expect((await stock()).stock_actual).toBe(12);
  });

  it('sin cabecera se comporta como antes', async () => {
    const access_token = await token();
    const res = await POST_MERMA(pedir('/api/admin/insumos/merma', access_token,
      { insumo_id: insumoId, cantidad: 2, descripcion: 'Merma sin clave', sucursal_id: sucursalId }));
    expect(res.status).toBe(201);
    expect((await stock()).stock_actual).toBe(10);
  });
});
