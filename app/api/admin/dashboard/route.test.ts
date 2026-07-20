import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { hoyISO, rangoDiaNegocio } from '@/lib/server/fechas';

const MARCADOR = `dashboard-test-${Date.now()}`;
const transaccionIds: number[] = [];

function request(token: string | null, query = 'rango=7d') {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/admin/dashboard?${query}`, { headers });
}

beforeAll(async () => {
  const hoy = rangoDiaNegocio().desde;
  const mediodia = new Date(hoy.getTime() + 12 * 3600_000);

  // Venta neta de hoy + cancelada de hoy (no debe contar en ventas ni pedidos)
  const venta = await prisma.transaccion.create({
    data: { cliente_nombre: MARCADOR, total: 40, estado: 'PAGADO', payment_status: 'PAGADO', created_at: mediodia },
  });
  const cancelada = await prisma.transaccion.create({
    data: { cliente_nombre: MARCADOR, total: 500, estado: 'CANCELADO', created_at: mediodia },
  });
  transaccionIds.push(venta.id, cancelada.id);
});

afterAll(async () => {
  await prisma.transaccion.deleteMany({ where: { id: { in: transaccionIds } } });
});

describe('GET /api/admin/dashboard', () => {
  it('401 sin token', async () => {
    const response = await GET(request(null));
    expect(response.status).toBe(401);
  });

  it('devuelve el rango completo en una sola respuesta (serie de 7 días)', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await GET(request(access_token, 'rango=7d'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.serie).toHaveLength(7);
    expect(body.serie[6].fecha).toBe(hoyISO());
    expect(body.serie.every((d: any) => typeof d.ventas === 'number' && typeof d.pedidos === 'number')).toBe(true);
  });

  it('las ventas incluyen la venta neta y excluyen la cancelada; cancelados se reportan aparte', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await GET(request(access_token, 'rango=hoy'));
    const body = await response.json();

    expect(body.kpis.ventas).toBeGreaterThanOrEqual(40);
    expect(body.kpis.cancelados).toBeGreaterThanOrEqual(1);
    // La cancelada de Bs 500 no puede estar sumada: si lo estuviera, ventas ≥ 540
    expect(body.kpis.ventas).toBeLessThan(500);
  });

  it('expone utilidad y food cost basados en CMV por receta', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await GET(request(access_token, 'rango=hoy'));
    const body = await response.json();

    expect(body.contabilidad).toHaveProperty('cmv');
    expect(body.contabilidad).toHaveProperty('gastos_fijos_prorrateados');
    expect(body.kpis).toHaveProperty('food_cost_pct');
    expect(body.contabilidad.utilidad).toBeCloseTo(
      body.contabilidad.ingresos - body.contabilidad.cmv - body.contabilidad.gastos_operativos,
      1,
    );
  });
});
