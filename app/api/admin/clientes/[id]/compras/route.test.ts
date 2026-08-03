/**
 * Compras de un cliente: las tres formas juntas.
 *
 * Una lista armada desde los movimientos de caja dejaría afuera los fiados y
 * las cortesías, que no mueven plata — y son justo las que uno quiere ver al
 * abrir la ficha de un cliente.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { login } from '@/lib/auth';
import { GET } from './route';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const MARCADOR = `compras-cliente-${Date.now()}`;

let token: string;
let sucursal: number;
let clienteId: number;
let productoId: number;
let duenoId: number;

const pedir = (id = clienteId) => GET(
  new NextRequest(`http://localhost/api/admin/clientes/${id}/compras`, {
    headers: { authorization: `Bearer ${token}` },
  }),
  { params: Promise.resolve({ id: String(id) }) },
);

async function comprar(opts: { total: number; cortesia?: boolean; fiado?: boolean; cancelada?: boolean }) {
  const venta = await prisma.transaccion.create({
    data: {
      canal: 'SALON',
      sucursal_id: sucursal,
      cliente_id: clienteId,
      total: opts.total,
      es_cortesia: opts.cortesia ?? false,
      estado: opts.cancelada ? 'CANCELADO' : opts.fiado ? 'ENTREGADO' : 'PAGADO',
      payment_status: opts.fiado ? 'PENDIENTE' : 'PAGADO',
      transaccionesDetalles_id: {
        create: [{ producto_id: productoId, precio_unitario: opts.total, cantidad: 1 }],
      },
    },
  });
  if (opts.fiado) {
    await prisma.cuentaCorriente.create({
      data: {
        tipo: 'POR_COBRAR', contraparte: MARCADOR, concepto: `Fiado venta #${venta.id}`,
        monto: opts.total, monto_pagado: 0, transaccion_id: venta.id, cliente_id: clienteId,
        creado_por_id: duenoId,
      },
    });
  }
  return venta;
}

beforeAll(async () => {
  token = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
  sucursal = await sucursalPorDefectoId();
  duenoId = (await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } })).id;

  productoId = (await prisma.producto.create({
    data: { nombre: `${MARCADOR} plato`, descripcion: 'fixture', precio: 50 },
  })).id;
  clienteId = (await prisma.cliente.create({
    data: { nombre: `${MARCADOR} cliente`, telefono: `7${Date.now().toString().slice(-7)}` },
  })).id;

  await comprar({ total: 100 });
  await comprar({ total: 60, fiado: true });
  await comprar({ total: 40, cortesia: true });
  await comprar({ total: 999, cancelada: true });
});

afterAll(async () => {
  const ventas = await prisma.transaccion.findMany({ where: { cliente_id: clienteId }, select: { id: true } });
  const ids = ventas.map(v => v.id);
  await prisma.cuentaCorriente.deleteMany({ where: { transaccion_id: { in: ids } } });
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: ids } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: ids } } });
  await prisma.cliente.deleteMany({ where: { id: clienteId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
});

describe('GET /api/admin/clientes/[id]/compras', () => {
  it('devuelve las compras de las tres formas', async () => {
    const body = await (await pedir()).json();
    const formas = body.items.map((i: { forma: string }) => i.forma).sort();
    // La cancelada también se lista (4 en total), pero no cuenta como gasto.
    expect(body.items).toHaveLength(4);
    expect(formas).toContain('PAGADA');
    expect(formas).toContain('FIADO');
    expect(formas).toContain('CORTESIA');
  });

  it('separa lo pagado de lo fiado y las cortesías', async () => {
    const { resumen } = await (await pedir()).json();
    // La cancelada (999) no suma en ningún lado.
    expect(resumen.pagado).toBe(100);
    expect(resumen.fiado).toBe(60);
    expect(resumen.cortesias).toBe(40);
    expect(resumen.compras).toBe(3);
  });

  it('informa el saldo que el cliente todavía debe', async () => {
    const { resumen, items } = await (await pedir()).json();
    expect(resumen.deuda_pendiente).toBe(60);
    const fiado = items.find((i: { forma: string }) => i.forma === 'FIADO');
    expect(fiado.deuda.saldo).toBe(60);
  });

  it('trae el detalle de cada compra', async () => {
    const { items } = await (await pedir()).json();
    expect(items[0].items[0].nombre).toContain(MARCADOR);
  });

  it('404 si el cliente no existe', async () => {
    expect((await pedir(99_999_999)).status).toBe(404);
  });
});
