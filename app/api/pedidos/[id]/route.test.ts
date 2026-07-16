/**
 * Integración: seguridad del ciclo de vida del pedido.
 * - GET exige autenticación (expone datos del cliente).
 * - Un fiado con deuda pendiente no puede marcarse "pagado" a mano (409):
 *   el cobro debe pasar por Deudores para que el dinero quede registrado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from './route';
import { GET as GET_TRACKING } from './tracking/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CONTRAPARTE = 'Cliente Pedido Fiado Seguridad E2E';

let token: string;
let cajeroUserId: number;
let pedidoId: number;
let cuentaId: number;

function req(method: 'GET' | 'PUT', id: number | string, body?: unknown, tk?: string) {
  return new NextRequest(`http://localhost/api/pedidos/${id}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

async function limpiarFixtures() {
  const cuentas = await prisma.cuentaCorriente.findMany({ where: { contraparte: CONTRAPARTE }, select: { id: true, transaccion_id: true } });
  await prisma.cuentaCorrientePago.deleteMany({ where: { cuenta_id: { in: cuentas.map(c => c.id) } } });
  await prisma.cuentaCorriente.deleteMany({ where: { id: { in: cuentas.map(c => c.id) } } });
  const ventaIds = cuentas.map(c => c.transaccion_id).filter((x): x is number => x != null);
  await prisma.transaccion.deleteMany({ where: { id: { in: ventaIds } } });
}

beforeAll(async () => {
  const cajero = await login('cajero@elevate.com', 'cajero123');
  token = cajero.access_token;
  const user = await prisma.usuario.findUniqueOrThrow({ where: { email: 'cajero@elevate.com' } });
  cajeroUserId = user.id;

  await limpiarFixtures();

  // Venta fiada con su deuda pendiente vinculada
  const venta = await prisma.transaccion.create({
    data: { total: 25, estado: 'PAGADO', payment_status: 'PENDIENTE', cajero_id: cajeroUserId },
  });
  pedidoId = venta.id;
  const cuenta = await prisma.cuentaCorriente.create({
    data: { tipo: 'POR_COBRAR', contraparte: CONTRAPARTE, concepto: `Fiado venta #${venta.id}`, monto: 25, creado_por_id: cajeroUserId, transaccion_id: venta.id },
  });
  cuentaId = cuenta.id;
});

afterAll(async () => {
  await limpiarFixtures();
});

describe('seguridad de /api/pedidos/[id]', () => {
  it('GET sin token devuelve 401', async () => {
    const res = await GET(req('GET', pedidoId), ctx(pedidoId));
    expect(res.status).toBe(401);
  });

  it('GET con token devuelve el pedido', async () => {
    const res = await GET(req('GET', pedidoId, undefined, token), ctx(pedidoId));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.id).toBe(pedidoId);
  });

  it('GET con id no numérico devuelve 422', async () => {
    const res = await GET(req('GET', 'abc', undefined, token), ctx('abc'));
    expect(res.status).toBe(422);
  });

  it('no permite marcar "pagado" un fiado con deuda pendiente (409)', async () => {
    const res = await PUT(req('PUT', pedidoId, { payment_status: 'PAGADO' }, token), ctx(pedidoId));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('Deudores');

    const pedido = await prisma.transaccion.findUniqueOrThrow({ where: { id: pedidoId } });
    expect(pedido.payment_status).toBe('PENDIENTE');
  });

  it('el tracking público funciona sin sesión y NO expone datos del cliente', async () => {
    const res = await GET_TRACKING(req('GET', pedidoId), ctx(pedidoId));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.id).toBe(pedidoId);
    expect(data.estado).toBeDefined();
    // Solo campos de seguimiento: nada de PII, montos ni detalle
    expect(Object.keys(data).sort()).toEqual(['codigo', 'driver_lat', 'driver_lng', 'estado', 'id', 'tipo_entrega']);
  });

  it('el tracking con id inválido devuelve 400', async () => {
    const res = await GET_TRACKING(req('GET', 'abc'), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('con la deuda ya saldada sí permite marcar "pagado"', async () => {
    await prisma.cuentaCorriente.update({ where: { id: cuentaId }, data: { estado: 'PAGADA', monto_pagado: 25 } });

    const res = await PUT(req('PUT', pedidoId, { payment_status: 'PAGADO' }, token), ctx(pedidoId));
    expect(res.status).toBe(200);
    const pedido = await prisma.transaccion.findUniqueOrThrow({ where: { id: pedidoId } });
    expect(pedido.payment_status).toBe('PAGADO');
  });
});
