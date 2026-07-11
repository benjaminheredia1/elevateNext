import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

function req(url: string, init: { method?: string; body?: string; token: string }) {
  return new NextRequest(url, {
    method: init.method,
    body: init.body,
    headers: { authorization: `Bearer ${init.token}`, 'content-type': 'application/json' },
  });
}

describe('/api/admin/dias-feriados', () => {
  let adminToken: string;
  let cajeroToken: string;
  const createdIds: number[] = [];

  beforeAll(async () => {
    const admin = await login('benjaherediaruiz@gmail.com', 'benja122');
    adminToken = admin.access_token;
    const cajero = await login('cajero@elevate.com', 'cajero123');
    cajeroToken = cajero.access_token;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.diaFeriado.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it('GET rechaza sin token (401)', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/dias-feriados'));
    expect(response.status).toBe(401);
  });

  it('GET rechaza a un CAJERO (403)', async () => {
    const response = await GET(req('http://localhost/api/admin/dias-feriados', { token: cajeroToken }));
    expect(response.status).toBe(403);
  });

  it('POST crea un feriado global (sucursal_id null)', async () => {
    const fecha = '2027-01-01';
    const response = await POST(req('http://localhost/api/admin/dias-feriados', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ fecha, nombre: 'Año Nuevo (test)' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.sucursal_id).toBeNull();
    createdIds.push(body.id);
  });

  it('POST duplicado (misma fecha+sucursal) devuelve 409', async () => {
    const fecha = '2027-05-01';
    const first = await POST(req('http://localhost/api/admin/dias-feriados', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ fecha, nombre: 'Feriado test dup' }),
    }));
    const firstBody = await first.json();
    createdIds.push(firstBody.id);

    const second = await POST(req('http://localhost/api/admin/dias-feriados', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ fecha, nombre: 'Feriado test dup otra vez' }),
    }));
    expect(second.status).toBe(409);
  });

  it('DELETE elimina el feriado y audita', async () => {
    const created = await POST(req('http://localhost/api/admin/dias-feriados', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ fecha: '2027-08-06', nombre: 'Feriado a borrar' }),
    }));
    const createdBody = await created.json();

    const response = await DELETE(req(`http://localhost/api/admin/dias-feriados?id=${createdBody.id}`, {
      method: 'DELETE', token: adminToken,
    }));
    expect(response.status).toBe(200);

    const fila = await prisma.diaFeriado.findUnique({ where: { id: createdBody.id } });
    expect(fila).toBeNull();

    const auditoria = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'DiaFeriado', accion: 'ELIMINO', entidad_id: String(createdBody.id) },
    });
    expect(auditoria).toBeTruthy();
  });
});
