import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

function req(url: string, init: { method?: string; body?: string; token: string }) {
  return new NextRequest(url, {
    method: init.method,
    body: init.body,
    headers: { authorization: `Bearer ${init.token}`, 'content-type': 'application/json' },
  });
}

describe('/api/admin/horarios-trabajadores', () => {
  let adminToken: string;
  let cajeroToken: string;
  let cajeroId: number;
  let clienteId: number;
  const horarioIdsToClean: Array<{ usuario_id: number; dia_semana: number }> = [];

  beforeAll(async () => {
    const admin = await login('benjaherediaruiz@gmail.com', 'benja122');
    adminToken = admin.access_token;

    const cajero = await login('cajero@elevate.com', 'cajero123');
    cajeroToken = cajero.access_token;
    cajeroId = cajero.user.id;

    const hash = await bcrypt.hash('cliente-test-pass', 10);
    const cliente = await prisma.usuario.create({
      data: {
        nombre: 'Cliente', apellido_paterno: 'De', apellido_materno: 'Prueba',
        email: `cliente-test-${Date.now()}@example.com`, password: hash, token: '',
        rol: 'CLIENTE', activo: true,
      },
    });
    clienteId = cliente.id;
  });

  afterAll(async () => {
    if (horarioIdsToClean.length > 0) {
      await prisma.horarioTrabajador.deleteMany({
        where: { OR: horarioIdsToClean.map(h => ({ usuario_id: h.usuario_id, dia_semana: h.dia_semana })) },
      });
    }
    await prisma.usuario.delete({ where: { id: clienteId } });
  });

  it('GET rechaza sin token (401)', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/horarios-trabajadores'));
    expect(response.status).toBe(401);
  });

  it('GET rechaza a un CAJERO (403)', async () => {
    const response = await GET(req('http://localhost/api/admin/horarios-trabajadores', { token: cajeroToken }));
    expect(response.status).toBe(403);
  });

  it('GET como ADMIN devuelve trabajadores con los 7 días normalizados', async () => {
    const response = await GET(req('http://localhost/api/admin/horarios-trabajadores', { token: adminToken }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.trabajadores)).toBe(true);
    const cajero = body.trabajadores.find((t: any) => t.usuario_id === cajeroId);
    expect(cajero).toBeTruthy();
    expect(Object.keys(cajero.dias)).toHaveLength(7);
    expect(cajero.dias['1']).toHaveProperty('es_libre');
  });

  it('PUT crea una celda nueva y es idempotente (mismo usuario_id+dia_semana no duplica)', async () => {
    horarioIdsToClean.push({ usuario_id: cajeroId, dia_semana: 1 });

    const body = {
      cambios: [{ usuario_id: cajeroId, dia_semana: 1, es_libre: false, hora_entrada: '08:00', hora_salida: '16:00' }],
    };

    const r1 = await PUT(req('http://localhost/api/admin/horarios-trabajadores', {
      method: 'PUT', token: adminToken, body: JSON.stringify(body),
    }));
    expect(r1.status).toBe(200);

    const r2 = await PUT(req('http://localhost/api/admin/horarios-trabajadores', {
      method: 'PUT', token: adminToken, body: JSON.stringify(body),
    }));
    expect(r2.status).toBe(200);

    const filas = await prisma.horarioTrabajador.findMany({ where: { usuario_id: cajeroId, dia_semana: 1 } });
    expect(filas).toHaveLength(1);
    expect(filas[0].hora_entrada).toBe('08:00');
    expect(filas[0].hora_salida).toBe('16:00');
  });

  it('PUT con es_libre=true fuerza las horas a null en BD', async () => {
    horarioIdsToClean.push({ usuario_id: cajeroId, dia_semana: 2 });

    const response = await PUT(req('http://localhost/api/admin/horarios-trabajadores', {
      method: 'PUT', token: adminToken,
      body: JSON.stringify({ cambios: [{ usuario_id: cajeroId, dia_semana: 2, es_libre: true }] }),
    }));
    expect(response.status).toBe(200);

    const fila = await prisma.horarioTrabajador.findUnique({
      where: { usuario_id_dia_semana: { usuario_id: cajeroId, dia_semana: 2 } },
    });
    expect(fila?.es_libre).toBe(true);
    expect(fila?.hora_entrada).toBeNull();
    expect(fila?.hora_salida).toBeNull();
  });

  it('PUT rechaza hora_salida <= hora_entrada (422) y no aplica el lote (rollback)', async () => {
    const response = await PUT(req('http://localhost/api/admin/horarios-trabajadores', {
      method: 'PUT', token: adminToken,
      body: JSON.stringify({
        cambios: [
          { usuario_id: cajeroId, dia_semana: 3, es_libre: false, hora_entrada: '16:00', hora_salida: '08:00' },
        ],
      }),
    }));
    expect(response.status).toBe(422);

    const fila = await prisma.horarioTrabajador.findUnique({
      where: { usuario_id_dia_semana: { usuario_id: cajeroId, dia_semana: 3 } },
    });
    expect(fila).toBeNull();
  });

  it('PUT rechaza usuario_id de un CLIENTE (no crea horario)', async () => {
    const response = await PUT(req('http://localhost/api/admin/horarios-trabajadores', {
      method: 'PUT', token: adminToken,
      body: JSON.stringify({ cambios: [{ usuario_id: clienteId, dia_semana: 1, es_libre: true }] }),
    }));
    expect(response.status).toBeGreaterThanOrEqual(400);

    const fila = await prisma.horarioTrabajador.findUnique({
      where: { usuario_id_dia_semana: { usuario_id: clienteId, dia_semana: 1 } },
    });
    expect(fila).toBeNull();
  });

  it('PUT rechaza a un CAJERO (403)', async () => {
    const response = await PUT(req('http://localhost/api/admin/horarios-trabajadores', {
      method: 'PUT', token: cajeroToken,
      body: JSON.stringify({ cambios: [{ usuario_id: cajeroId, dia_semana: 4, es_libre: true }] }),
    }));
    expect(response.status).toBe(403);
  });

  it('PUT deja registro en RegistroAuditoria', async () => {
    horarioIdsToClean.push({ usuario_id: cajeroId, dia_semana: 5 });

    await PUT(req('http://localhost/api/admin/horarios-trabajadores', {
      method: 'PUT', token: adminToken,
      body: JSON.stringify({ cambios: [{ usuario_id: cajeroId, dia_semana: 5, es_libre: true }] }),
    }));

    const auditoria = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'HorarioTrabajador' },
      orderBy: { created_at: 'desc' },
    });
    expect(auditoria).toBeTruthy();
    expect(auditoria?.accion).toBe('MODIFICO');
  });
});
