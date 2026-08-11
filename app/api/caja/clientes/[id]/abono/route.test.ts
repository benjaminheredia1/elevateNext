/**
 * Integración: abono de deuda por cliente con selección de deudas concretas
 * (cuenta_ids) y pago mixto. Lo no seleccionado debe quedar intacto como
 * deuda pendiente, y cada parte del cobro queda en el ledger.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const CONTRAPARTE = 'Cliente Abono Selectivo E2E';
// Deudor con muchos fiados abiertos: reproduce el tope de cuenta_ids que en
// producción impedía saldarle la cuenta completa a un cliente con 69 deudas.
const CONTRAPARTE_MUCHAS = 'Cliente Muchas Deudas E2E';
const CANTIDAD_DEUDAS = 69;

let token: string;
let sucursalId: number;
let cajeroUserId: number;
let turnoId: number;
let clienteId: number;
let deudaAntiguaId: number;
let deudaRecienteId: number;
let clienteMuchasId: number;
let ventaFiadaId: number;

function reqAbono(cliente: number, body: unknown, tk?: string) {
  const req = new NextRequest(`http://localhost/api/caja/clientes/${cliente}/abono`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: String(cliente) }) });
}

async function limpiarFixtures() {
  const cuentas = await prisma.cuentaCorriente.findMany({ where: { contraparte: { in: [CONTRAPARTE, CONTRAPARTE_MUCHAS] } }, select: { id: true, transaccion_id: true } });
  const ids = cuentas.map(c => c.id);
  const pagos = await prisma.cuentaCorrientePago.findMany({ where: { cuenta_id: { in: ids } }, select: { movimiento_caja_id: true } });
  await prisma.cuentaCorrientePago.deleteMany({ where: { cuenta_id: { in: ids } } });
  const movIds = pagos.map(p => p.movimiento_caja_id).filter((x): x is number => x != null);
  await prisma.movimientoCaja.deleteMany({ where: { id: { in: movIds } } });
  await prisma.cuentaCorriente.deleteMany({ where: { id: { in: ids } } });
  const ventaIds = cuentas.map(c => c.transaccion_id).filter((x): x is number => x != null);
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
    where: { telefono: '79999011' },
    update: {},
    create: { nombre: CONTRAPARTE, telefono: '79999011' },
  });
  clienteId = cliente.id;

  await limpiarFixtures();

  await prisma.cajaTurno.updateMany({
    where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
    data: { estado: 'CERRADO', fecha_cierre: new Date() },
  });
  const turno = await prisma.cajaTurno.create({
    data: { sucursal_id: sucursalId, cajero_id: user.id, apertura_efectivo: 100, apertura_qr: 0 },
  });
  turnoId = turno.id;

  const antigua = await prisma.cuentaCorriente.create({
    data: { tipo: 'POR_COBRAR', contraparte: CONTRAPARTE, concepto: 'Fiado antiguo E2E', monto: 10, creado_por_id: cajeroUserId, cliente_id: clienteId, created_at: new Date('2026-01-01') },
  });
  deudaAntiguaId = antigua.id;
  // La reciente nace de una venta fiada: al saldarla debe pasar a PAGADO
  const ventaFiada = await prisma.transaccion.create({
    data: { sucursal_id: await sucursalPorDefectoId(), total: 20, estado: 'PAGADO', payment_status: 'PENDIENTE', cliente_id: clienteId, turno_id: turnoId, cajero_id: cajeroUserId },
  });
  ventaFiadaId = ventaFiada.id;
  const reciente = await prisma.cuentaCorriente.create({
    data: { tipo: 'POR_COBRAR', contraparte: CONTRAPARTE, concepto: `Fiado venta #${ventaFiada.id}`, monto: 20, creado_por_id: cajeroUserId, cliente_id: clienteId, transaccion_id: ventaFiada.id },
  });
  deudaRecienteId = reciente.id;

  const clienteMuchas = await prisma.cliente.upsert({
    where: { telefono: '79999012' },
    update: {},
    create: { nombre: CONTRAPARTE_MUCHAS, telefono: '79999012' },
  });
  clienteMuchasId = clienteMuchas.id;
  await prisma.cuentaCorriente.createMany({
    data: Array.from({ length: CANTIDAD_DEUDAS }, (_, i) => ({
      tipo: 'POR_COBRAR' as const, contraparte: CONTRAPARTE_MUCHAS,
      concepto: `Fiado acumulado #${i + 1}`, monto: 10,
      creado_por_id: cajeroUserId, cliente_id: clienteMuchasId,
    })),
  });
});

afterAll(async () => {
  await limpiarFixtures();
  await prisma.cajaTurno.updateMany({
    where: { id: turnoId, estado: 'ABIERTO' },
    data: { estado: 'CERRADO', fecha_cierre: new Date() },
  });
});

describe('POST /api/caja/clientes/[id]/abono — cobro selectivo y mixto', () => {
  it('rechaza sin token (401)', async () => {
    const res = await reqAbono(clienteId, { pagos: [{ metodo_pago: 'EFECTIVO', monto: 5 }] });
    expect(res.status).toBe(401);
  });

  it('cuenta_ids de otro cliente o inexistente devuelve 422', async () => {
    const res = await reqAbono(clienteId, {
      pagos: [{ metodo_pago: 'EFECTIVO', monto: 5 }],
      cuenta_ids: [999999],
    }, token);
    expect(res.status).toBe(422);
  });

  it('pago que supera lo seleccionado devuelve 422', async () => {
    const res = await reqAbono(clienteId, {
      pagos: [{ metodo_pago: 'EFECTIVO', monto: 25 }],
      cuenta_ids: [deudaRecienteId], // saldo seleccionado: 20
    }, token);
    expect(res.status).toBe(422);
  });

  it('cobra solo la deuda seleccionada con pago mixto; la otra queda pendiente', async () => {
    const res = await reqAbono(clienteId, {
      pagos: [{ metodo_pago: 'EFECTIVO', monto: 8 }, { metodo_pago: 'QR', monto: 12 }],
      cuenta_ids: [deudaRecienteId],
    }, token);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.abonado).toBe(20);
    expect(body.saldo_restante).toBe(0);

    const reciente = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: deudaRecienteId } });
    expect(reciente.estado).toBe('PAGADA');
    expect(Number(reciente.monto_pagado)).toBe(20);

    // Deuda saldada: la venta fiada que la originó deja de estar "pago pendiente"
    const ventaFiada = await prisma.transaccion.findUniqueOrThrow({ where: { id: ventaFiadaId } });
    expect(ventaFiada.payment_status).toBe('PAGADO');

    // La no seleccionada queda intacta
    const antigua = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: deudaAntiguaId } });
    expect(antigua.estado).toBe('PENDIENTE');
    expect(Number(antigua.monto_pagado)).toBe(0);

    // Ledger: un pago por método, ambos ligados a movimientos del turno
    const pagos = await prisma.cuentaCorrientePago.findMany({ where: { cuenta_id: deudaRecienteId }, orderBy: { id: 'asc' } });
    expect(pagos).toHaveLength(2);
    expect(pagos.map(p => p.metodo_pago).sort()).toEqual(['EFECTIVO', 'QR']);
    expect(pagos.reduce((s, p) => s + Number(p.monto), 0)).toBe(20);
    for (const p of pagos) {
      expect(p.movimiento_caja_id).not.toBeNull();
      const mov = await prisma.movimientoCaja.findUniqueOrThrow({ where: { id: p.movimiento_caja_id! } });
      expect(mov.turno_id).toBe(turnoId);
    }
  });

  it('formato viejo { monto, metodo_pago } sigue funcionando (FIFO sobre todas)', async () => {
    const res = await reqAbono(clienteId, { monto: 4, metodo_pago: 'EFECTIVO' }, token);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.abonado).toBe(4);
    expect(body.saldo_restante).toBe(6); // quedaba 10 de la antigua

    const antigua = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: deudaAntiguaId } });
    expect(antigua.estado).toBe('PARCIAL');
    expect(Number(antigua.monto_pagado)).toBe(4);
  });
});

describe('POST /api/caja/clientes/[id]/abono — deudor con muchas deudas', () => {
  it(`salda de una sola vez las ${CANTIDAD_DEUDAS} deudas seleccionadas`, async () => {
    const deudas = await prisma.cuentaCorriente.findMany({
      where: { cliente_id: clienteMuchasId, tipo: 'POR_COBRAR', estado: { not: 'PAGADA' } },
      select: { id: true },
    });
    expect(deudas).toHaveLength(CANTIDAD_DEUDAS);

    const res = await reqAbono(clienteMuchasId, {
      pagos: [{ metodo_pago: 'QR', monto: CANTIDAD_DEUDAS * 10 }],
      cuenta_ids: deudas.map(d => d.id),
    }, token);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.saldo_restante).toBe(0);

    const pendientes = await prisma.cuentaCorriente.count({
      where: { cliente_id: clienteMuchasId, tipo: 'POR_COBRAR', estado: { not: 'PAGADA' } },
    });
    expect(pendientes).toBe(0);

    // Las escrituras van agrupadas (un INSERT para todos los movimientos, otro
    // para el ledger), así que hay que comprobar que cada pago quedó atado a SU
    // movimiento: si el enlace se corriera, la plata se imputaría a otra deuda.
    const pagos = await prisma.cuentaCorrientePago.findMany({
      where: { cuenta_id: { in: deudas.map(d => d.id) } },
      include: { movimiento_caja: true },
    });
    expect(pagos).toHaveLength(CANTIDAD_DEUDAS);
    expect(new Set(pagos.map(p => p.movimiento_caja_id)).size).toBe(CANTIDAD_DEUDAS);
    for (const p of pagos) {
      expect(p.movimiento_caja).not.toBeNull();
      expect(Number(p.movimiento_caja!.monto)).toBe(Number(p.monto));
      expect(p.movimiento_caja!.metodo_pago).toBe('QR');
      expect(p.movimiento_caja!.turno_id).toBe(turnoId);
    }
  });
});
