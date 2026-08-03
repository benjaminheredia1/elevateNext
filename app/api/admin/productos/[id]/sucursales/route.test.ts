/**
 * DELETE /api/admin/productos/[id]/sucursales
 *
 * Contrato: saca el producto del menú de UNA sucursal, exige sesión con rol de
 * gestión, y no deja que un rol acotado toque el menú de otro local.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const CREDENCIALES = { email: 'benjaherediaruiz@gmail.com', password: 'benja122' };

function pedido(id: number, body: unknown, token?: string, metodo: 'DELETE' | 'POST' = 'DELETE') {
  return new NextRequest(`http://localhost/api/admin/productos/${id}/sucursales`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('DELETE /api/admin/productos/[id]/sucursales', () => {
  let token: string;
  let principalId: number;
  let segundaId: number;
  let productoId: number;

  beforeAll(async () => {
    token = (await login(CREDENCIALES.email, CREDENCIALES.password)).access_token;
    principalId = await sucursalPorDefectoId();
    const segunda = await prisma.sucursal.create({
      data: { nombre: `Sucursal test API quitar ${Date.now()}` },
    });
    segundaId = segunda.id;

    const producto = await prisma.producto.create({
      data: { nombre: `Producto test API quitar ${Date.now()}`, descripcion: 'test', precio: 30 },
    });
    productoId = producto.id;

    await prisma.productoSucursal.createMany({
      data: [
        { producto_id: productoId, sucursal_id: principalId, precio: 30, update_at: new Date() },
        { producto_id: productoId, sucursal_id: segundaId, precio: 30, update_at: new Date() },
      ],
    });
  });

  afterAll(async () => {
    await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
    await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
    await prisma.producto.deleteMany({ where: { id: productoId } });
    await prisma.sucursal.deleteMany({ where: { id: segundaId } });
  });

  it('rechaza sin sesión (401)', async () => {
    const res = await DELETE(pedido(productoId, { sucursal_id: segundaId }), {
      params: Promise.resolve({ id: String(productoId) }),
    });
    expect(res.status).toBe(401);
  });

  it('valida el cuerpo: sucursal_id es obligatorio (422, como el resto de la API)', async () => {
    const res = await DELETE(pedido(productoId, {}, token), {
      params: Promise.resolve({ id: String(productoId) }),
    });
    expect(res.status).toBe(422);
  });

  it('quita el producto de esa sucursal y deja la otra intacta', async () => {
    const res = await DELETE(pedido(productoId, { sucursal_id: segundaId }, token), {
      params: Promise.resolve({ id: String(productoId) }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ modo: 'ELIMINADO', ventas: 0 });

    expect(await prisma.productoSucursal.count({
      where: { producto_id: productoId, sucursal_id: segundaId },
    })).toBe(0);
    expect(await prisma.productoSucursal.count({
      where: { producto_id: productoId, sucursal_id: principalId },
    })).toBe(1);
    // El producto del catálogo no se toca: es del negocio, no del local.
    expect(await prisma.producto.count({ where: { id: productoId } })).toBe(1);
  });

  it('404 si el producto no estaba en esa sucursal', async () => {
    const res = await DELETE(pedido(productoId, { sucursal_id: segundaId }, token), {
      params: Promise.resolve({ id: String(productoId) }),
    });
    expect(res.status).toBe(404);
  });

  it('con quitar:false solo lo marca no disponible, conservando la habilitación', async () => {
    await POST(pedido(productoId, { sucursal_id: segundaId, precio: 30 }, token, 'POST'), {
      params: Promise.resolve({ id: String(productoId) }),
    });

    const res = await DELETE(pedido(productoId, { sucursal_id: segundaId, quitar: false }, token), {
      params: Promise.resolve({ id: String(productoId) }),
    });
    expect(res.status).toBe(200);

    const fila = await prisma.productoSucursal.findUnique({
      where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: segundaId } },
    });
    expect(fila).not.toBeNull();
    expect(fila?.disponible).toBe(false);
  });
});
