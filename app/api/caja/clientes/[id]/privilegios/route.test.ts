/**
 * Integración: asignación de privilegios a clientes desde caja.
 * Regla central: el cajero solo puede otorgar privilegios ACTIVOS
 * (publicados por el admin), y cada cambio queda en auditoría.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT, GET } from './route';
import { GET as getPrivilegiosCaja } from '@/app/api/caja/privilegios/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

let token: string;
let clienteId: number;
let privActivoId: number;
let privInactivoId: number;

function req(method: string, url: string, body?: unknown, tk?: string) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const ctx = () => ({ params: Promise.resolve({ id: String(clienteId) }) });

beforeAll(async () => {
  const cajero = await login('cajero@elevate.com', 'cajero123');
  token = cajero.access_token;
  const admin = await prisma.usuario.findUniqueOrThrow({ where: { email: 'benjaherediaruiz@gmail.com' } });

  // Fixtures idempotentes
  const cliente = await prisma.cliente.upsert({
    where: { telefono: '79999001' },
    update: {},
    create: { nombre: 'Cliente Privilegios E2E', telefono: '79999001' },
  });
  clienteId = cliente.id;

  let activo = await prisma.privilegio.findFirst({ where: { nombre: 'Privilegio E2E Activo' } });
  if (!activo) activo = await prisma.privilegio.create({ data: { nombre: 'Privilegio E2E Activo', porcentaje: 10, activo: true, creado_por_id: admin.id } });
  else await prisma.privilegio.update({ where: { id: activo.id }, data: { activo: true } });
  privActivoId = activo.id;

  let inactivo = await prisma.privilegio.findFirst({ where: { nombre: 'Privilegio E2E Inactivo' } });
  if (!inactivo) inactivo = await prisma.privilegio.create({ data: { nombre: 'Privilegio E2E Inactivo', porcentaje: 50, activo: false, creado_por_id: admin.id } });
  else await prisma.privilegio.update({ where: { id: inactivo.id }, data: { activo: false } });
  privInactivoId = inactivo.id;

  // Estado inicial limpio
  await prisma.clientePrivilegio.deleteMany({ where: { cliente_id: clienteId } });
});

describe('privilegios de clientes desde caja', () => {
  it('rechaza sin token (401)', async () => {
    const res = await PUT(req('PUT', `/api/caja/clientes/${clienteId}/privilegios`, { privilegio_ids: [privActivoId] }), ctx());
    expect(res.status).toBe(401);
  });

  it('el catálogo de caja solo lista privilegios activos', async () => {
    const res = await getPrivilegiosCaja(req('GET', '/api/caja/privilegios', undefined, token));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const ids = data.map((p: { id: number }) => p.id);
    expect(ids).toContain(privActivoId);
    expect(ids).not.toContain(privInactivoId);
  });

  it('no permite otorgar un privilegio inactivo (422)', async () => {
    const res = await PUT(req('PUT', `/api/caja/clientes/${clienteId}/privilegios`, { privilegio_ids: [privInactivoId] }, token), ctx());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('activos');
  });

  it('otorga un privilegio activo y lo deja en auditoría', async () => {
    const res = await PUT(req('PUT', `/api/caja/clientes/${clienteId}/privilegios`, { privilegio_ids: [privActivoId] }, token), ctx());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.some((p: { id: number }) => p.id === privActivoId)).toBe(true);

    const audit = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'ClientePrivilegio', entidad_id: String(clienteId) },
      orderBy: { created_at: 'desc' },
      include: { usuario: { select: { email: true } } },
    });
    expect(audit).toBeTruthy();
    expect(audit?.rol).toBe('CAJERO');
    expect(audit?.usuario.email).toBe('cajero@elevate.com');
    expect(audit?.detalle).toContain('Privilegio E2E Activo');
    expect(audit?.detalle).toContain('Cliente Privilegios E2E');
  });

  it('quita el privilegio con lista vacía y también audita', async () => {
    const antes = await prisma.registroAuditoria.count({ where: { entidad: 'ClientePrivilegio', entidad_id: String(clienteId) } });
    const res = await PUT(req('PUT', `/api/caja/clientes/${clienteId}/privilegios`, { privilegio_ids: [] }, token), ctx());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.filter((p: { activo?: boolean; id: number }) => p.id === privActivoId)).toHaveLength(0);
    const despues = await prisma.registroAuditoria.count({ where: { entidad: 'ClientePrivilegio', entidad_id: String(clienteId) } });
    expect(despues).toBe(antes + 1);
  });

  it('GET devuelve los privilegios actuales del cliente', async () => {
    const res = await GET(req('GET', `/api/caja/clientes/${clienteId}/privilegios`, undefined, token), ctx());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
