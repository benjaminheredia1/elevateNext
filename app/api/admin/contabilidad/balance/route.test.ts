import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

const MARCADOR = `balance-test-${Date.now()}`;

let insumoId: number;
let porCobrarId: number;
let porPagarId: number;

function request(token: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/admin/contabilidad/balance', { headers });
}

beforeAll(async () => {
  const admin = await prisma.usuario.findUniqueOrThrow({ where: { email: 'benjaherediaruiz@gmail.com' } });

  // Inventario valorizado: 10 unidades × Bs 2.50 = Bs 25
  const insumo = await prisma.insumo.create({
    data: {
      nombre: `Insumo ${MARCADOR}`,
      unidad_medida: 'UNIDAD',
      stock_actual: 10,
      stock_minimo: 0,
      costo_promedio: 2.5,
    },
  });
  insumoId = insumo.id;

  // CxC pendiente Bs 40 (30 ya pagados de 70) y CxP pendiente Bs 60
  const porCobrar = await prisma.cuentaCorriente.create({
    data: {
      tipo: 'POR_COBRAR', contraparte: MARCADOR, concepto: 'fiado test',
      monto: 70, monto_pagado: 30, estado: 'PARCIAL', creado_por_id: admin.id,
    },
  });
  porCobrarId = porCobrar.id;
  const porPagar = await prisma.cuentaCorriente.create({
    data: {
      tipo: 'POR_PAGAR', contraparte: MARCADOR, concepto: 'proveedor test',
      monto: 60, estado: 'PENDIENTE', creado_por_id: admin.id,
    },
  });
  porPagarId = porPagar.id;
});

afterAll(async () => {
  await prisma.cuentaCorriente.deleteMany({ where: { id: { in: [porCobrarId, porPagarId] } } });
  await prisma.insumo.deleteMany({ where: { id: insumoId } });
});

describe('GET /api/admin/contabilidad/balance', () => {
  it('401 sin token', async () => {
    const response = await GET(request(null));
    expect(response.status).toBe(401);
  });

  it('expone caja_efectivo (bug: la UI leía un campo inexistente y mostraba Bs 0)', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await GET(request(access_token));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activos).toHaveProperty('caja_efectivo');
    expect(typeof body.activos.caja_efectivo).toBe('number');
  });

  it('valoriza inventario y cuentas por cobrar/pagar pendientes', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await GET(request(access_token));
    const body = await response.json();

    // El fixture aporta ≥ Bs 25 de inventario, ≥ Bs 40 por cobrar, ≥ Bs 60 por pagar
    expect(body.activos.inventario).toBeGreaterThanOrEqual(25);
    expect(body.activos.cuentas_por_cobrar).toBeGreaterThanOrEqual(40);
    expect(body.pasivos.cuentas_por_pagar).toBeGreaterThanOrEqual(60);
    expect(body.patrimonio).toBeCloseTo(body.activos.total - body.pasivos.total, 1);
  });
});
