/**
 * Integración: cobro de deuda (fiado) desde caja con detalle de pagos.
 * Verifica que cada cobro quede en el ledger CuentaCorrientePago con método,
 * enlazado al MovimientoCaja del turno, y que el listado de deudores exponga
 * origen (venta) e historial de pagos.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { GET as GET_DEUDORES } from '../../route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

const CONTRAPARTE = 'Cliente Fiado Ledger E2E';
const NOMBRE_PROD = 'Producto Fiado Ledger E2E';

let token: string;
let sucursalId: number;
let cajeroUserId: number;
let turnoId: number;
let clienteId: number;
let cuentaId: number;
let ventaId: number;

function req(cuenta: number, body: unknown, tk?: string) {
  return new NextRequest(`http://localhost/api/caja/deudores/${cuenta}/pago`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function reqPago(cuenta: number, body: unknown, tk?: string) {
  return POST(req(cuenta, body, tk), { params: Promise.resolve({ id: String(cuenta) }) });
}

async function crearDeudaConVenta(monto: number) {
  const producto = await prisma.producto.upsert({
    where: { id: (await prisma.producto.findFirst({ where: { nombre: NOMBRE_PROD } }))?.id ?? 0 },
    update: {},
    create: { nombre: NOMBRE_PROD, descripcion: 'Fixture fiado ledger', precio: monto, disponible: true },
  });
  const venta = await prisma.transaccion.create({
    data: {
      total: monto, estado: 'PAGADO', payment_status: 'PENDIENTE',
      cliente_id: clienteId, turno_id: turnoId, cajero_id: cajeroUserId,
      transaccionesDetalles_id: { create: [{ producto_id: producto.id, precio_unitario: monto, cantidad: 1 }] },
    },
  });
  ventaId = venta.id;
  const cuenta = await prisma.cuentaCorriente.create({
    data: {
      tipo: 'POR_COBRAR', contraparte: CONTRAPARTE, concepto: `Fiado venta #${venta.id}`,
      monto, creado_por_id: cajeroUserId, cliente_id: clienteId, transaccion_id: venta.id,
    },
  });
  return cuenta.id;
}

async function limpiarFixtures() {
  const cuentas = await prisma.cuentaCorriente.findMany({ where: { contraparte: CONTRAPARTE }, select: { id: true, transaccion_id: true } });
  const cuentaIds = cuentas.map(c => c.id);
  const pagos = await prisma.cuentaCorrientePago.findMany({ where: { cuenta_id: { in: cuentaIds } }, select: { movimiento_caja_id: true } });
  await prisma.cuentaCorrientePago.deleteMany({ where: { cuenta_id: { in: cuentaIds } } });
  const movIds = pagos.map(p => p.movimiento_caja_id).filter((x): x is number => x != null);
  await prisma.movimientoCaja.deleteMany({ where: { id: { in: movIds } } });
  await prisma.cuentaCorriente.deleteMany({ where: { id: { in: cuentaIds } } });
  const ventaIds = cuentas.map(c => c.transaccion_id).filter((x): x is number => x != null);
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: ventaIds } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: ventaIds } } });
}

beforeAll(async () => {
  const cajero = await login('cajero@elevate.com', 'cajero123');
  token = cajero.access_token;

  const user = await prisma.usuario.findUniqueOrThrow({ where: { email: 'cajero@elevate.com' } });
  if (user.sucursal_id == null) throw new Error('El seed debe asignar sucursal al cajero');
  sucursalId = user.sucursal_id;
  cajeroUserId = user.id;

  const cliente = await prisma.cliente.upsert({
    where: { telefono: '79999010' },
    update: {},
    create: { nombre: CONTRAPARTE, telefono: '79999010' },
  });
  clienteId = cliente.id;

  await limpiarFixtures();

  // Turno limpio propio
  await prisma.cajaTurno.updateMany({
    where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
    data: { estado: 'CERRADO', fecha_cierre: new Date() },
  });
  const turno = await prisma.cajaTurno.create({
    data: { sucursal_id: sucursalId, cajero_id: user.id, apertura_efectivo: 100, apertura_qr: 0 },
  });
  turnoId = turno.id;

  cuentaId = await crearDeudaConVenta(50);
});

afterAll(async () => {
  await limpiarFixtures();
  await prisma.cajaTurno.updateMany({
    where: { id: turnoId, estado: 'ABIERTO' },
    data: { estado: 'CERRADO', fecha_cierre: new Date() },
  });
});

describe('POST /api/caja/deudores/[id]/pago — ledger de pagos', () => {
  it('rechaza sin token (401)', async () => {
    const res = await reqPago(cuentaId, { pagos: [{ metodo_pago: 'EFECTIVO', monto: 10 }] });
    expect(res.status).toBe(401);
  });

  it('entrada inválida devuelve 422', async () => {
    const res = await reqPago(cuentaId, { pagos: [{ metodo_pago: 'EFECTIVO', monto: -5 }] }, token);
    expect(res.status).toBe(422);
  });

  it('pago que supera el saldo devuelve 422', async () => {
    const res = await reqPago(cuentaId, { pagos: [{ metodo_pago: 'EFECTIVO', monto: 999 }] }, token);
    expect(res.status).toBe(422);
  });

  it('cobro parcial con formato viejo { monto, metodo_pago } sigue funcionando', async () => {
    const res = await reqPago(cuentaId, { monto: 10, metodo_pago: 'EFECTIVO' }, token);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.estado).toBe('PARCIAL');
    expect(body.saldo).toBe(40);

    const pagos = await prisma.cuentaCorrientePago.findMany({ where: { cuenta_id: cuentaId } });
    expect(pagos).toHaveLength(1);
    expect(Number(pagos[0].monto)).toBe(10);
    expect(pagos[0].metodo_pago).toBe('EFECTIVO');
    expect(pagos[0].movimiento_caja_id).not.toBeNull();
    const mov = await prisma.movimientoCaja.findUniqueOrThrow({ where: { id: pagos[0].movimiento_caja_id! } });
    expect(mov.turno_id).toBe(turnoId);
    expect(Number(mov.monto)).toBe(10);

    // Aún debe: la venta fiada sigue con pago pendiente
    const venta = await prisma.transaccion.findUniqueOrThrow({ where: { id: ventaId } });
    expect(venta.payment_status).toBe('PENDIENTE');
  });

  it('cobro mixto (efectivo + QR) salda la deuda con un pago por método', async () => {
    const res = await reqPago(cuentaId, {
      pagos: [{ metodo_pago: 'EFECTIVO', monto: 15.5 }, { metodo_pago: 'QR', monto: 24.5 }],
    }, token);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.estado).toBe('PAGADA');
    expect(body.saldo).toBe(0);

    const pagos = await prisma.cuentaCorrientePago.findMany({ where: { cuenta_id: cuentaId }, orderBy: { id: 'asc' } });
    expect(pagos).toHaveLength(3); // 1 del test anterior + 2 del mixto
    const mixto = pagos.slice(1);
    expect(mixto.map(p => p.metodo_pago).sort()).toEqual(['EFECTIVO', 'QR']);
    expect(mixto.reduce((s, p) => s + Number(p.monto), 0)).toBe(40);
    for (const p of mixto) expect(p.movimiento_caja_id).not.toBeNull();

    const cuenta = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: cuentaId } });
    expect(cuenta.estado).toBe('PAGADA');
    expect(Number(cuenta.monto_pagado)).toBe(50);

    // Deuda saldada: la venta fiada deja de estar "pago pendiente"
    const venta = await prisma.transaccion.findUniqueOrThrow({ where: { id: ventaId } });
    expect(venta.payment_status).toBe('PAGADO');
  });

  it('el listado de deudores expone origen (venta) e historial de pagos', async () => {
    // Nueva deuda parcial para que aparezca en el listado (la anterior quedó PAGADA)
    const cuenta2 = await crearDeudaConVenta(30);
    const cobro = await reqPago(cuenta2, { pagos: [{ metodo_pago: 'QR', monto: 12 }] }, token);
    expect(cobro.status).toBe(201);

    const res = await GET_DEUDORES(new NextRequest('http://localhost/api/caja/deudores', {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const item = body.items.find((i: { id: number }) => i.id === cuenta2);
    expect(item).toBeDefined();
    expect(item.estado).toBe('PARCIAL');
    expect(item.monto).toBe(30);
    expect(item.monto_pagado).toBe(12);
    expect(item.saldo).toBe(18);
    expect(item.origen).toMatchObject({ venta_id: ventaId });
    expect(item.origen.items).toEqual([{ nombre: NOMBRE_PROD, cantidad: 1, precio_unitario: 30, subtotal: 30 }]);
    expect(item.pagos).toHaveLength(1);
    expect(item.pagos[0]).toMatchObject({ monto: 12, metodo_pago: 'QR' });
    expect(item.pagos[0].cobrado_por).toBeTruthy();
  });

  it('sin turno abierto devuelve 409', async () => {
    const cuenta3 = await crearDeudaConVenta(20);
    await prisma.cajaTurno.updateMany({
      where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
      data: { estado: 'CERRADO', fecha_cierre: new Date() },
    });
    const res = await reqPago(cuenta3, { pagos: [{ metodo_pago: 'EFECTIVO', monto: 5 }] }, token);
    expect(res.status).toBe(409);
  });
});
