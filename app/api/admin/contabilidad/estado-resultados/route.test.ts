import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

// Día de negocio aislado para este archivo (no chocar con otros tests).
const DIA = '2020-07-10';
const MARCADOR = 'er-test';

let productoId: number;
let insumoId: number;
const transaccionIds: number[] = [];

function request(token: string | null, query: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost/api/admin/contabilidad/estado-resultados?${query}`, { headers });
}

beforeAll(async () => {
  const insumo = await prisma.insumo.create({
    data: {
      nombre: `Insumo ${MARCADOR} ${Date.now()}`,
      unidad_medida: 'UNIDAD',
      stock_actual: 50,
      stock_minimo: 0,
      costo_promedio: 4,
    },
  });
  insumoId = insumo.id;

  const producto = await prisma.producto.create({
    data: {
      nombre: `Producto ${MARCADOR} ${Date.now()}`,
      descripcion: 'fixture',
      precio: 25,
      tipo: 'ELABORADO',
      estado_publicacion: 'PUBLICADO',
      recetaProducto_id: { create: [{ insumo_id: insumoId, cantidad_utilizada: 1 }] },
    },
  });
  productoId = producto.id;

  const mediodia = new Date(`${DIA}T12:00:00.000-04:00`);
  // Venta pagada Bs 25 + venta fiada Bs 25 (sin movimiento de caja)
  for (const payment of ['PAGADO', 'PENDIENTE'] as const) {
    const venta = await prisma.transaccion.create({
      data: {
        cliente_nombre: MARCADOR,
        total: 25,
        estado: 'ENTREGADO',
        payment_status: payment,
        created_at: mediodia,
        transaccionesDetalles_id: {
          create: [{ producto_id: productoId, precio_unitario: 25, cantidad: 1 }],
        },
      },
    });
    transaccionIds.push(venta.id);
  }
});

afterAll(async () => {
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: transaccionIds } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: transaccionIds } } });
  await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.insumo.deleteMany({ where: { id: insumoId } });
});

describe('GET /api/admin/contabilidad/estado-resultados', () => {
  it('401 sin token', async () => {
    const response = await GET(request(null, 'rango=hoy'));
    expect(response.status).toBe(401);
  });

  it('403 con rol CAJERO', async () => {
    const { access_token } = await login('cajero@elevate.com', 'cajero123');
    const response = await GET(request(access_token, 'rango=hoy'));
    expect(response.status).toBe(403);
  });

  it('ingresos devengados: la venta fiada cuenta aunque no tocó caja', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await GET(request(access_token, `rango=custom&desde=${DIA}&hasta=${DIA}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ingresos.total).toBe(50); // 25 pagada + 25 fiada
    expect(body.ingresos.ventas_count).toBe(2);
    expect(body.ingresos.por_cobrar).toBe(25);
  });

  it('CMV por receta (no compras): 2 ventas × 1 insumo × Bs 4 = Bs 8', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await GET(request(access_token, `rango=custom&desde=${DIA}&hasta=${DIA}`));
    const body = await response.json();

    expect(body.cmv).toBe(8);
    expect(body.utilidad_bruta).toBe(42);
    expect(body.margen_bruto).toBe(84); // 42/50
  });
});
