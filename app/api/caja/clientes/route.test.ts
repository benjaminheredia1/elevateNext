/**
 * Integración: alta de clientes desde caja (POST /api/caja/clientes).
 * Reglas centrales: el cajero puede registrar un cliente sin venta de por medio;
 * un duplicado por celular/email/NIT es 409 (debe usar el cliente existente);
 * todo alta queda en auditoría. Los privilegios ya no se asignan al cliente:
 * se eligen por venta en el POS.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

const TEL_NUEVO = '79999101';
const NOMBRE_NUEVO = 'Cliente Alta Caja E2E';

let token: string;

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

  it('crea el cliente sin venta y lo audita (201)', async () => {
    const res = await POST(req({ nombre: NOMBRE_NUEVO, telefono: TEL_NUEVO }, token));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.id).toBeGreaterThan(0);
    expect(data.nombre).toBe(NOMBRE_NUEVO);
    expect(data.telefono).toBe(TEL_NUEVO);
    expect(data.deuda_saldo).toBe(0);

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
  });
});
