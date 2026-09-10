/**
 * Ventas del período para admin.
 *
 * Es la contracara de /api/admin/flujo-caja: ahí solo está la plata que se
 * movió, acá están todas las ventas —fiados y cortesías incluidos—, que es lo
 * que explica por qué las dos pantallas nunca dan el mismo número.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { login } from '@/lib/auth';
import { GET } from './route';

const MARCADOR = `ventas-admin-${Date.now()}`;

let tokenDueno: string;
let tokenCajero: string;
let sucursalId: number;
let otraSucursalId: number;
let productoId: number;
const creadas: number[] = [];

const pedir = (query = '', token = tokenDueno) =>
  GET(new NextRequest(`http://localhost/api/admin/ventas${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }));

async function crearVenta(opts: { total: number; sucursal_id: number; cortesia?: boolean; fiado?: boolean }) {
  const venta = await prisma.transaccion.create({
    data: {
      canal: 'SALON',
      sucursal_id: opts.sucursal_id,
      metodo_pago: 'EFECTIVO',
      total: opts.total,
      es_cortesia: opts.cortesia ?? false,
      estado: opts.fiado ? 'ENTREGADO' : 'PAGADO',
      payment_status: opts.fiado ? 'PENDIENTE' : 'PAGADO',
      cliente_nombre: `${MARCADOR} cliente`,
      transaccionesDetalles_id: {
        create: [{ producto_id: productoId, precio_unitario: opts.total, cantidad: 1 }],
      },
    },
  });
  creadas.push(venta.id);
  return venta;
}

beforeAll(async () => {
  tokenDueno = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
  tokenCajero = (await login('cajero@elevate.com', 'cajero123')).access_token;

  sucursalId = (await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } })).id;
  otraSucursalId = (await prisma.sucursal.create({ data: { nombre: `${MARCADOR} otra`, activa: true } })).id;

  productoId = (await prisma.producto.create({
    data: { nombre: `${MARCADOR} plato`, descripcion: 'fixture', precio: 50, disponible: true },
  })).id;

  await crearVenta({ total: 50, sucursal_id: sucursalId });
  await crearVenta({ total: 30, sucursal_id: sucursalId, fiado: true });
  await crearVenta({ total: 20, sucursal_id: sucursalId, cortesia: true });
  await crearVenta({ total: 90, sucursal_id: otraSucursalId });
});

afterAll(async () => {
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: creadas } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: creadas } } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.sucursal.deleteMany({ where: { id: otraSucursalId } });
});

describe('GET /api/admin/ventas', () => {
  it('devuelve las ventas del período con su forma de cierre', async () => {
    const body = await (await pedir('?rango=hoy')).json();
    const propias = body.ventas.filter((v: { id: number }) => creadas.includes(v.id));

    expect(propias).toHaveLength(4);
    const formas = propias.map((v: { forma: string }) => v.forma).sort();
    expect(formas).toEqual(['CORTESIA', 'FIADO', 'PAGADA', 'PAGADA']);
  });

  it('trae el detalle y la sucursal de cada venta', async () => {
    const body = await (await pedir('?rango=hoy')).json();
    const venta = body.ventas.find((v: { id: number }) => v.id === creadas[0]);

    expect(venta.items[0].nombre).toContain(MARCADOR);
    expect(venta.sucursal).toBeTruthy();
    expect(venta.sucursal_id).toBe(sucursalId);
  });

  it('filtra por sucursal cuando se pide una', async () => {
    const body = await (await pedir(`?rango=hoy&sucursal=${otraSucursalId}`)).json();
    const ajenas = body.ventas.filter((v: { sucursal_id: number }) => v.sucursal_id !== otraSucursalId);

    expect(ajenas).toHaveLength(0);
    expect(body.ventas.map((v: { id: number }) => v.id)).toContain(creadas[3]);
  });

  it('un rango pasado no devuelve nada', async () => {
    const body = await (await pedir('?rango=custom&desde=2020-01-01&hasta=2020-01-02')).json();
    expect(body.ventas.filter((v: { id: number }) => creadas.includes(v.id))).toHaveLength(0);
  });

  it('sin sesión responde 401', async () => {
    expect((await pedir('?rango=hoy', '')).status).toBe(401);
  });

  it('el cajero no entra: es una pantalla de admin', async () => {
    expect((await pedir('?rango=hoy', tokenCajero)).status).toBe(403);
  });
});
