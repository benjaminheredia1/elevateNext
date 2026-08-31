import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

describe('/api/admin/centros-produccion', () => {
  const creados: number[] = [];

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const pedir = (url: string, method: string, access_token: string, body?: unknown) =>
    new NextRequest(`http://localhost${url}`, {
      method,
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  afterAll(async () => {
    if (creados.length > 0) {
      await prisma.centroProduccion.deleteMany({ where: { id: { in: creados } } });
    }
  });

  it('crea un centro con DUENO y lo lista', async () => {
    const access_token = await token();
    const nombre = `Centro Test ${Date.now()}`;

    const res = await POST(pedir('/api/admin/centros-produccion', 'POST', access_token, { nombre }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.nombre).toBe(nombre);
    expect(body.data.activo).toBe(true);
    creados.push(body.data.id);

    const listado = await (await GET(pedir('/api/admin/centros-produccion', 'GET', access_token))).json();
    expect(listado.items.some((c: { id: number }) => c.id === body.data.id)).toBe(true);
  });

  it('rechaza un nombre repetido con 409', async () => {
    const access_token = await token();
    const nombre = `Centro Repetido Test ${Date.now()}`;

    const primero = await POST(pedir('/api/admin/centros-produccion', 'POST', access_token, { nombre }));
    creados.push((await primero.json()).data.id);

    const segundo = await POST(pedir('/api/admin/centros-produccion', 'POST', access_token, { nombre }));
    expect(segundo.status).toBe(409);
  });

  it('un CAJERO no puede crear un centro: 403', async () => {
    const cajero_token = (await login('cajero@elevate.com', 'cajero123')).access_token;
    const res = await POST(pedir('/api/admin/centros-produccion', 'POST', cajero_token, { nombre: 'No debería crearse' }));
    expect(res.status).toBe(403);
  });

  it('rechaza un body inválido con 422', async () => {
    const access_token = await token();
    const res = await POST(pedir('/api/admin/centros-produccion', 'POST', access_token, { nombre: 'x' }));
    expect(res.status).toBe(422);
  });
});
