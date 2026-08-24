/**
 * Integración: edición de la ficha del cliente desde admin. A diferencia de la
 * de caja, acá también se corrige la dirección; y editar desde caja no debe
 * borrarla (caja no manda ese campo).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from './route';
import { PUT as PUT_CAJA } from '@/app/api/caja/clientes/[id]/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

const SUFIJO = Date.now().toString().slice(-7);
const NOMBRE = `Cliente Admin Editar ${SUFIJO}`;
const NOMBRE_OCUPADO = `Cliente Tel Ocupado Admin ${SUFIJO}`;
const TEL_OCUPADO = `7${SUFIJO}`;

let tokenAdmin: string;
let tokenCajero: string;
let clienteId: number;
let ocupadoId: number;

function req(body: unknown, tk?: string) {
  return new NextRequest('http://localhost/api/admin/clientes/0', {
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
  tokenAdmin = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
  tokenCajero = (await login('cajero@elevate.com', 'cajero123')).access_token;

  const cliente = await prisma.cliente.create({
    data: { nombre: NOMBRE, direccion: 'Av. Vieja 100' },
  });
  clienteId = cliente.id;

  const ocupado = await prisma.cliente.create({
    data: { nombre: NOMBRE_OCUPADO, telefono: TEL_OCUPADO },
  });
  ocupadoId = ocupado.id;
});

afterAll(async () => {
  await prisma.registroAuditoria.deleteMany({
    where: { entidad: 'Cliente', entidad_id: { in: [String(clienteId), String(ocupadoId)] } },
  });
  await prisma.cliente.deleteMany({ where: { id: { in: [clienteId, ocupadoId] } } });
});

describe('PUT /api/admin/clientes/[id]', () => {
  it('rechaza sin token (401)', async () => {
    const res = await PUT(req({ nombre: 'X' }), ctx(clienteId));
    expect(res.status).toBe(401);
  });

  it('rechaza al cajero (403): la ficha completa es de admin', async () => {
    const res = await PUT(req({ nombre: NOMBRE }, tokenCajero), ctx(clienteId));
    expect(res.status).toBe(403);
  });

  it('nombre vacío → 422', async () => {
    const res = await PUT(req({ nombre: '   ' }, tokenAdmin), ctx(clienteId));
    expect(res.status).toBe(422);
  });

  it('corrige nombre, NIT, celular y dirección, y audita el antes→después', async () => {
    const res = await PUT(req({
      nombre: `${NOMBRE} Corregido`,
      telefono: `6${SUFIJO}`,
      nit: '9876543',
      email: '',
      direccion: 'Calle Nueva 250',
    }, tokenAdmin), ctx(clienteId));
    expect(res.status).toBe(200);

    const { data } = await res.json();
    expect(data.nombre).toBe(`${NOMBRE} Corregido`);
    expect(data.telefono).toBe(`6${SUFIJO}`);
    expect(data.nit).toBe('9876543');
    expect(data.email).toBeNull(); // '' se normaliza a null
    expect(data.direccion).toBe('Calle Nueva 250');

    const audit = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'Cliente', entidad_id: String(clienteId), accion: 'MODIFICO' },
      orderBy: { created_at: 'desc' },
    });
    expect(audit?.rol).toBe('DUENO');
    expect(audit?.detalle).toContain('direccion: "Av. Vieja 100" → "Calle Nueva 250"');
    expect(audit?.detalle).toContain('nit: "—" → "9876543"');
  });

  it('celular de otro cliente → 409', async () => {
    const res = await PUT(req({
      nombre: `${NOMBRE} Corregido`,
      telefono: TEL_OCUPADO,
    }, tokenAdmin), ctx(clienteId));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('otro cliente');
  });

  it('editar desde caja no borra la dirección (caja no manda ese campo)', async () => {
    const res = await PUT_CAJA(req({
      nombre: `${NOMBRE} Desde Caja`,
      telefono: `6${SUFIJO}`,
      nit: '9876543',
      email: '',
    }, tokenCajero), ctx(clienteId));
    expect(res.status).toBe(200);

    const { data } = await res.json();
    expect(data.nombre).toBe(`${NOMBRE} Desde Caja`);
    expect(data.direccion).toBe('Calle Nueva 250');
  });

  it('sin cambios reales no vuelve a auditar', async () => {
    const antes = await prisma.registroAuditoria.count({
      where: { entidad: 'Cliente', entidad_id: String(clienteId), accion: 'MODIFICO' },
    });
    const res = await PUT(req({
      nombre: `${NOMBRE} Desde Caja`,
      telefono: `6${SUFIJO}`,
      nit: '9876543',
      email: '',
      direccion: 'Calle Nueva 250',
    }, tokenAdmin), ctx(clienteId));
    expect(res.status).toBe(200);

    const despues = await prisma.registroAuditoria.count({
      where: { entidad: 'Cliente', entidad_id: String(clienteId), accion: 'MODIFICO' },
    });
    expect(despues).toBe(antes);
  });
});
