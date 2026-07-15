/**
 * Integración: alta de clientes desde caja (POST /api/caja/clientes).
 * Reglas centrales: el cajero puede registrar un cliente sin venta de por medio,
 * asignándole solo privilegios ACTIVOS; un duplicado por celular/email/NIT es 409
 * (debe usar el cliente existente); todo alta queda en auditoría.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

const TEL_NUEVO = '79999101';
const NOMBRE_NUEVO = 'Cliente Alta Caja E2E';

let token: string;
let privActivoId: number;
let privInactivoId: number;

function req(body?: unknown, tk?: string) {
  return new NextRequest('http://localhost/api/caja/clientes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  const cajero = await login('cajero@elevate.com', 'cajero123');
  token = cajero.access_token;
  const admin = await prisma.usuario.findUniqueOrThrow({ where: { email: 'benjaherediaruiz@gmail.com' } });

  // Fixtures idempotentes de privilegios
  let activo = await prisma.privilegio.findFirst({ where: { nombre: 'Privilegio E2E Activo' } });
  if (!activo) activo = await prisma.privilegio.create({ data: { nombre: 'Privilegio E2E Activo', porcentaje: 10, activo: true, creado_por_id: admin.id } });
  else await prisma.privilegio.update({ where: { id: activo.id }, data: { activo: true } });
  privActivoId = activo.id;

  let inactivo = await prisma.privilegio.findFirst({ where: { nombre: 'Privilegio E2E Inactivo' } });
  if (!inactivo) inactivo = await prisma.privilegio.create({ data: { nombre: 'Privilegio E2E Inactivo', porcentaje: 50, activo: false, creado_por_id: admin.id } });
  else await prisma.privilegio.update({ where: { id: inactivo.id }, data: { activo: false } });
  privInactivoId = inactivo.id;

  // Limpiar clientes dejados por corridas anteriores
  const previos = await prisma.cliente.findMany({
    where: { OR: [{ telefono: TEL_NUEVO }, { nombre: NOMBRE_NUEVO }] },
    select: { id: true },
  });
  const ids = previos.map(c => c.id);
  if (ids.length > 0) {
    await prisma.clientePrivilegio.deleteMany({ where: { cliente_id: { in: ids } } });
    await prisma.cliente.deleteMany({ where: { id: { in: ids } } });
  }
});

describe('alta de clientes desde caja', () => {
  it('rechaza sin token (401)', async () => {
    const res = await POST(req({ nombre: NOMBRE_NUEVO }));
    expect(res.status).toBe(401);
  });

  it('rechaza entrada inválida: nombre muy corto (422)', async () => {
    const res = await POST(req({ nombre: 'X' }, token));
    expect(res.status).toBe(422);
  });

  it('no crea el cliente si se pide un privilegio inactivo (422)', async () => {
    const res = await POST(req({ nombre: NOMBRE_NUEVO, telefono: TEL_NUEVO, privilegio_ids: [privInactivoId] }, token));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('activos');
    const cliente = await prisma.cliente.findFirst({ where: { telefono: TEL_NUEVO } });
    expect(cliente).toBeNull();
  });

  it('crea el cliente con privilegio activo, sin venta, y lo audita (201)', async () => {
    const res = await POST(req({ nombre: NOMBRE_NUEVO, telefono: TEL_NUEVO, privilegio_ids: [privActivoId] }, token));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.id).toBeGreaterThan(0);
    expect(data.nombre).toBe(NOMBRE_NUEVO);
    expect(data.telefono).toBe(TEL_NUEVO);
    expect(data.deuda_saldo).toBe(0);
    expect(data.descuento_pct).toBe(10);
    expect(data.privilegios.map((p: { id: number }) => p.id)).toContain(privActivoId);

    // Vínculo real en BD
    const vinculos = await prisma.clientePrivilegio.findMany({ where: { cliente_id: data.id } });
    expect(vinculos.map(v => v.privilegio_id)).toEqual([privActivoId]);

    // Auditoría del alta
    const audit = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'Cliente', entidad_id: String(data.id), accion: 'CREO' },
      orderBy: { created_at: 'desc' },
      include: { usuario: { select: { email: true } } },
    });
    expect(audit).toBeTruthy();
    expect(audit?.rol).toBe('CAJERO');
    expect(audit?.usuario.email).toBe('cajero@elevate.com');
    expect(audit?.detalle).toContain(NOMBRE_NUEVO);
    expect(audit?.detalle).toContain('Privilegio E2E Activo');
  });

  it('rechaza un duplicado por celular (409) sin crear otro cliente', async () => {
    const res = await POST(req({ nombre: 'Otro Nombre Distinto', telefono: TEL_NUEVO }, token));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain(NOMBRE_NUEVO);
    const cuantos = await prisma.cliente.count({ where: { telefono: TEL_NUEVO } });
    expect(cuantos).toBe(1);
  });

  it('permite registrar solo con nombre (sin celular/NIT/email)', async () => {
    const res = await POST(req({ nombre: NOMBRE_NUEVO }, token));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.telefono).toBeNull();
    expect(data.privilegios).toEqual([]);
    expect(data.descuento_pct).toBe(0);
  });
});
