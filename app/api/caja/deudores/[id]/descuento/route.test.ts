/**
 * Integración: privilegio posterior sobre una deuda (fiado) — para cuando al
 * vender se olvidó aplicarlo. El cajero solo manda el privilegio_id; el % y el
 * monto descontado los calcula el servidor. Verifica que reduce el monto (no es
 * un pago), registra qué privilegio se aplicó, salda la deuda si el nuevo total
 * iguala lo cobrado, permite uno solo por deuda y nunca deja el total por
 * debajo de lo ya cobrado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { GET as GET_DEUDORES } from '../../route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CONTRAPARTE = 'Cliente Privilegio Deuda E2E';
const NOMBRE_PROD = 'Producto Privilegio Deuda E2E';
const PRIV_20 = 'Privilegio Deuda E2E 20';
const PRIV_INACTIVO = 'Privilegio Deuda E2E Inactivo';

let token: string;
let cajeroUserId: number;
let turnoId: number;
let clienteId: number;
let cuentaId: number;
let ventaId: number;
let priv20Id: number;
let privInactivoId: number;

function reqDescuento(cuenta: number, body: unknown, tk?: string) {
  const req = new NextRequest(`http://localhost/api/caja/deudores/${cuenta}/descuento`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: String(cuenta) }) });
}

async function crearDeudaConVenta(monto: number, opts: { pagado?: number; sinCliente?: boolean } = {}) {
  const producto = await prisma.producto.upsert({
    where: { id: (await prisma.producto.findFirst({ where: { nombre: NOMBRE_PROD } }))?.id ?? 0 },
    update: {},
    create: { nombre: NOMBRE_PROD, descripcion: 'Fixture privilegio fiado', precio: monto, disponible: true },
  });
  const venta = await prisma.transaccion.create({
    data: {
      total: monto, estado: 'PAGADO', payment_status: 'PENDIENTE',
      cliente_id: opts.sinCliente ? null : clienteId, turno_id: turnoId, cajero_id: cajeroUserId,
      transaccionesDetalles_id: { create: [{ producto_id: producto.id, precio_unitario: monto, cantidad: 1 }] },
    },
  });
  ventaId = venta.id;
  const pagado = opts.pagado ?? 0;
  const cuenta = await prisma.cuentaCorriente.create({
    data: {
      tipo: 'POR_COBRAR', contraparte: CONTRAPARTE, concepto: `Fiado venta #${venta.id}`,
      monto, monto_pagado: pagado, estado: pagado > 0 ? 'PARCIAL' : 'PENDIENTE',
      creado_por_id: cajeroUserId, cliente_id: opts.sinCliente ? null : clienteId, transaccion_id: venta.id,
    },
  });
  return cuenta.id;
}

async function limpiarFixtures() {
  const cuentas = await prisma.cuentaCorriente.findMany({ where: { contraparte: CONTRAPARTE }, select: { id: true, transaccion_id: true } });
  const cuentaIds = cuentas.map(c => c.id);
  await prisma.cuentaCorrientePago.deleteMany({ where: { cuenta_id: { in: cuentaIds } } });
  await prisma.cuentaCorriente.deleteMany({ where: { id: { in: cuentaIds } } });
  const ventaIds = cuentas.map(c => c.transaccion_id).filter((x): x is number => x != null);
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: ventaIds } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: ventaIds } } });
  await prisma.privilegio.deleteMany({ where: { nombre: { in: [PRIV_20, PRIV_INACTIVO] } } });
}

beforeAll(async () => {
  const cajero = await login('cajero@elevate.com', 'cajero123');
  token = cajero.access_token;

  const user = await prisma.usuario.findUniqueOrThrow({ where: { email: 'cajero@elevate.com' } });
  if (user.sucursal_id == null) throw new Error('El seed debe asignar sucursal al cajero');
  cajeroUserId = user.id;

  const cliente = await prisma.cliente.upsert({
    where: { telefono: '79999011' },
    update: {},
    create: { nombre: CONTRAPARTE, telefono: '79999011' },
  });
  clienteId = cliente.id;

  await limpiarFixtures();

  const priv20 = await prisma.privilegio.create({
    data: { nombre: PRIV_20, porcentaje: 20, activo: true, creado_por_id: cajeroUserId },
  });
  priv20Id = priv20.id;
  const privInactivo = await prisma.privilegio.create({
    data: { nombre: PRIV_INACTIVO, porcentaje: 50, activo: false, creado_por_id: cajeroUserId },
  });
  privInactivoId = privInactivo.id;

  // El privilegio no necesita turno abierto: turno cerrado solo para colgar la venta
  const turno = await prisma.cajaTurno.create({
    data: {
      sucursal_id: user.sucursal_id, cajero_id: user.id,
      apertura_efectivo: 0, apertura_qr: 0, estado: 'CERRADO', fecha_cierre: new Date(),
    },
  });
  turnoId = turno.id;

  cuentaId = await crearDeudaConVenta(50);
});

afterAll(async () => {
  await limpiarFixtures();
});

describe('POST /api/caja/deudores/[id]/descuento (privilegio)', () => {
  it('rechaza sin token (401)', async () => {
    const res = await reqDescuento(cuentaId, { privilegio_id: priv20Id });
    expect(res.status).toBe(401);
  });

  it('privilegio_id inválido devuelve 422', async () => {
    const res = await reqDescuento(cuentaId, { privilegio_id: 'abc' }, token);
    expect(res.status).toBe(422);
  });

  it('privilegio inexistente devuelve 422', async () => {
    const res = await reqDescuento(cuentaId, { privilegio_id: 99999999 }, token);
    expect(res.status).toBe(422);
  });

  it('privilegio inactivo devuelve 422 y no toca la deuda', async () => {
    const res = await reqDescuento(cuentaId, { privilegio_id: privInactivoId }, token);
    expect(res.status).toBe(422);
    const cuenta = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(Number(cuenta.monto)).toBe(50);
  });

  it('deuda sin cliente registrado devuelve 422', async () => {
    const manualId = await crearDeudaConVenta(30, { sinCliente: true });
    const res = await reqDescuento(manualId, { privilegio_id: priv20Id }, token);
    expect(res.status).toBe(422);
  });

  it('aplica el privilegio: el servidor calcula el descuento y no registra pago', async () => {
    const res = await reqDescuento(cuentaId, { privilegio_id: priv20Id }, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    // 20% de Bs 50 = Bs 10
    expect(body).toMatchObject({ estado: 'PENDIENTE', monto: 40, saldo: 40, descuento: 10 });

    const cuenta = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(Number(cuenta.monto)).toBe(40);
    expect(Number(cuenta.monto_pagado)).toBe(0);
    expect(Number(cuenta.descuento)).toBe(10);
    expect(cuenta.motivo_descuento).toBe(`Privilegio: ${PRIV_20} (-20%)`);
    // No es un pago: el ledger de pagos queda vacío
    expect(await prisma.cuentaCorrientePago.count({ where: { cuenta_id: cuentaId } })).toBe(0);
  });

  it('un segundo privilegio sobre la misma deuda devuelve 409', async () => {
    const res = await reqDescuento(cuentaId, { privilegio_id: priv20Id }, token);
    expect(res.status).toBe(409);
    const cuenta = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(Number(cuenta.monto)).toBe(40);
  });

  it('el listado de deudores expone el privilegio aplicado', async () => {
    const res = await GET_DEUDORES(new NextRequest('http://localhost/api/caja/deudores', {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const item = body.items.find((i: { id: number }) => i.id === cuentaId);
    expect(item).toBeDefined();
    expect(item.descuento).toBe(10);
    expect(item.motivo_descuento).toContain(PRIV_20);
    expect(item.saldo).toBe(40);
  });

  it('si el nuevo total iguala lo cobrado, salda la deuda y la venta queda pagada', async () => {
    // Deuda de Bs 50 con Bs 40 cobrados: −20% deja el total en Bs 40 = lo pagado
    const saldadaId = await crearDeudaConVenta(50, { pagado: 40 });
    const ventaSaldada = ventaId;
    const res = await reqDescuento(saldadaId, { privilegio_id: priv20Id }, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ estado: 'PAGADA', monto: 40, saldo: 0, descuento: 10 });

    const cuenta = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: saldadaId } });
    expect(cuenta.estado).toBe('PAGADA');
    const venta = await prisma.transaccion.findUniqueOrThrow({ where: { id: ventaSaldada } });
    expect(venta.payment_status).toBe('PAGADO');
  });

  it('si el descuento dejaría el total por debajo de lo cobrado, devuelve 422', async () => {
    // Deuda de Bs 50 con Bs 45 cobrados: −20% dejaría el total en Bs 40 < 45
    const sobrepagadaId = await crearDeudaConVenta(50, { pagado: 45 });
    const res = await reqDescuento(sobrepagadaId, { privilegio_id: priv20Id }, token);
    expect(res.status).toBe(422);
    const cuenta = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: sobrepagadaId } });
    expect(Number(cuenta.monto)).toBe(50);
  });

  it('una deuda ya pagada no admite privilegio (409)', async () => {
    const pagadaId = await crearDeudaConVenta(20);
    await prisma.cuentaCorriente.update({ where: { id: pagadaId }, data: { monto_pagado: 20, estado: 'PAGADA' } });
    const res = await reqDescuento(pagadaId, { privilegio_id: priv20Id }, token);
    expect(res.status).toBe(409);
  });

  it('deuda inexistente devuelve 404', async () => {
    const res = await reqDescuento(99999999, { privilegio_id: priv20Id }, token);
    expect(res.status).toBe(404);
  });
});
