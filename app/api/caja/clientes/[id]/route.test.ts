/**
 * Integración: edición de datos de cliente desde caja (completar NIT/celular
 * faltantes), con auditoría del antes→después y control de duplicados.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

let token: string;
let clienteId: number;

function req(body: unknown, tk?: string) {
  return new NextRequest('http://localhost/api/caja/clientes/0', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

beforeAll(async () => {
  const cajero = await login('cajero@elevate.com', 'cajero123');
  token = cajero.access_token;

  // Cliente registrado sin NIT ni teléfono (como el caso real del pedido)
  const existente = await prisma.cliente.findFirst({ where: { nombre: 'Cliente Editar E2E' } });
  if (existente) {
    await prisma.cliente.update({ where: { id: existente.id }, data: { telefono: null, nit: null, email: null } });
    clienteId = existente.id;
  } else {
    const c = await prisma.cliente.create({ data: { nombre: 'Cliente Editar E2E' } });
    clienteId = c.id;
  }
  // Otro cliente dueño de un teléfono, para probar el conflicto
  await prisma.cliente.upsert({
    where: { telefono: '79999003' },
    update: {},
    create: { nombre: 'Cliente Telefono Ocupado E2E', telefono: '79999003' },
  });
});

describe('PUT /api/caja/clientes/[id] — edición de datos', () => {
  it('rechaza sin token (401)', async () => {
    const res = await PUT(req({ nombre: 'X' }), ctx(clienteId));
    expect(res.status).toBe(401);
  });

  it('completa NIT y celular faltantes y deja auditoría con antes→después', async () => {
    const res = await PUT(req({
      nombre: 'Cliente Editar E2E',
      telefono: '79999004',
      nit: '1234567',
      email: '',
    }, token), ctx(clienteId));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.telefono).toBe('79999004');
    expect(data.nit).toBe('1234567');
    expect(data.email).toBeNull(); // '' se normaliza a null

    const audit = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'Cliente', entidad_id: String(clienteId), accion: 'MODIFICO' },
      orderBy: { created_at: 'desc' },
    });
    expect(audit?.rol).toBe('CAJERO');
    expect(audit?.detalle).toContain('telefono: "—" → "79999004"');
    expect(audit?.detalle).toContain('nit: "—" → "1234567"');
  });

  it('celular de otro cliente → 409', async () => {
    const res = await PUT(req({ nombre: 'Cliente Editar E2E', telefono: '79999003' }, token), ctx(clienteId));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('otro cliente');
  });

  it('nombre vacío → 422', async () => {
    const res = await PUT(req({ nombre: '   ' }, token), ctx(clienteId));
    expect(res.status).toBe(422);
  });
});
