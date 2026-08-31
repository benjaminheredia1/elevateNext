import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { POST as POST_PRODUCCION } from './route';
import { GET as GET_RECETAS, POST as POST_RECETAS } from '../recetas/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { altaInsumoEnCentro } from '@/lib/server/centro-produccion/insumos-centro.service';

describe('/api/admin/centros-produccion/produccion', () => {
  let centroId: number;
  let productoId: number;
  let insumoId: number;
  let espejoId: number | null = null;

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const pedir = (url: string, method: string, access_token: string, body?: unknown, clave?: string) =>
    new NextRequest(`http://localhost${url}`, {
      method,
      headers: {
        authorization: `Bearer ${access_token}`,
        'content-type': 'application/json',
        ...(clave ? { 'Idempotency-Key': clave } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  beforeAll(async () => {
    const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    const centro = await prisma.centroProduccion.create({ data: { nombre: `Centro ruta prod ${Date.now()}` } });
    centroId = centro.id;

    const alta = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Masa ruta prod ${Date.now()}`, unidad_medida: 'KG',
      stock_inicial: 100, costo_unitario: 5, stock_minimo: 0, punto_critico: 0,
    }, admin.id, 'DUENO'));
    insumoId = alta.insumo.id;

    const producto = await prisma.producto.create({
      data: { nombre: `Pan ruta prod ${Date.now()}`, descripcion: 'x', precio: 10 },
    });
    productoId = producto.id;
  });

  afterAll(async () => {
    if (centroId == null) return;
    const producto = await prisma.producto.findUnique({ where: { id: productoId } });
    espejoId = producto?.insumo_reventa_id ?? null;
    await prisma.recetaCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.producto.update({ where: { id: productoId }, data: { insumo_reventa_id: null } });
    await prisma.producto.delete({ where: { id: productoId } });
    await prisma.insumo.deleteMany({ where: { id: { in: [insumoId, ...(espejoId ? [espejoId] : [])] } } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
  });

  it('define la receta y la devuelve con el rinde', async () => {
    const access_token = await token();
    const res = await POST_RECETAS(pedir('/api/admin/centros-produccion/recetas', 'POST', access_token, {
      centro_id: centroId, producto_id: productoId,
      lineas: [{ insumo_id: insumoId, cantidad_utilizada: 0.5 }],
    }));
    expect(res.status).toBe(201);

    const listado = await (await GET_RECETAS(
      pedir(`/api/admin/centros-produccion/recetas?centro_id=${centroId}`, 'GET', access_token),
    )).json();
    const fila = listado.items.find((r: { producto_id: number }) => r.producto_id === productoId);
    expect(fila.unidades_posibles).toBe(200); // floor(100 / 0.5)
    expect(fila.costo_unitario).toBeCloseTo(2.5, 6);
  });

  it('produce y acredita el terminado', async () => {
    const access_token = await token();
    const res = await POST_PRODUCCION(pedir('/api/admin/centros-produccion/produccion', 'POST', access_token, {
      centro_id: centroId, producto_id: productoId, cantidad: 40,
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.stock.stock_actual).toBe(40);
    expect(body.data.costo_total).toBeCloseTo(100, 6); // 40 × 2.5
  });

  it('la misma producción reenviada con la misma clave no duplica lo producido', async () => {
    const access_token = await token();
    const clave = randomUUID();
    const cuerpo = { centro_id: centroId, producto_id: productoId, cantidad: 10 };

    expect((await POST_PRODUCCION(pedir('/api/admin/centros-produccion/produccion', 'POST', access_token, cuerpo, clave))).status).toBe(201);

    const reintento = await POST_PRODUCCION(pedir('/api/admin/centros-produccion/produccion', 'POST', access_token, cuerpo, clave));
    expect(reintento.status).toBe(409);

    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    const espejo = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: producto.insumo_reventa_id! } },
    });
    expect(espejo.stock_actual).toBe(50); // 40 + 10, no 60

    // Y el insumo bruto tampoco se consumió dos veces: 100 − 50×0.5 = 75.
    const bruto = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
    });
    expect(bruto.stock_actual).toBeCloseTo(75, 6);
  });

  it('sin sesión: 401', async () => {
    const res = await POST_PRODUCCION(new NextRequest('http://localhost/api/admin/centros-produccion/produccion', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ centro_id: centroId, producto_id: productoId, cantidad: 1 }),
    }));
    expect(res.status).toBe(401);
  });

  it('un CAJERO no puede producir: 403', async () => {
    const cajero = (await login('cajero@elevate.com', 'cajero123')).access_token;
    const res = await POST_PRODUCCION(pedir('/api/admin/centros-produccion/produccion', 'POST', cajero, {
      centro_id: centroId, producto_id: productoId, cantidad: 1,
    }));
    expect(res.status).toBe(403);
  });

  it('cantidad no entera: 422', async () => {
    const access_token = await token();
    const res = await POST_PRODUCCION(pedir('/api/admin/centros-produccion/produccion', 'POST', access_token, {
      centro_id: centroId, producto_id: productoId, cantidad: 2.5,
    }));
    expect(res.status).toBe(422);
  });
});
