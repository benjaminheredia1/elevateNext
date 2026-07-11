import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT, DELETE } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

describe('PUT /api/admin/productos/[id]', () => {
  const createdIds: number[] = [];
  const createdInsumoIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.producto.deleteMany({ where: { id: { in: createdIds } } });
    }
    if (createdInsumoIds.length > 0) {
      await prisma.insumo.deleteMany({ where: { id: { in: createdInsumoIds } } });
    }
  });

  it('publica un producto existente sin imagen_url', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const marca = await prisma.marca.findFirstOrThrow();

    const existente = await prisma.producto.create({
      data: {
        nombre: 'Producto de test para editar',
        descripcion: 'Borrador inicial',
        precio: 15,
        tipo: 'REVENTA',
        estado_publicacion: 'BORRADOR',
      },
    });
    createdIds.push(existente.id);

    const request = new NextRequest(`http://localhost/api/admin/productos/${existente.id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: existente.nombre,
        descripcion: existente.descripcion,
        precio: 15,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        marcas: [marca.id],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 3, costo_unitario: 8 },
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(existente.id) }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.estado_publicacion).toBe('PUBLICADO');
    expect(body.data.imagen_url).toBeNull();

    if (body.data.insumo_reventa_id) {
      createdInsumoIds.push(body.data.insumo_reventa_id);
    }
  });
});

describe('DELETE /api/admin/productos/[id]', () => {
  const createdIds: number[] = [];
  const createdTransaccionIds: number[] = [];

  afterAll(async () => {
    if (createdTransaccionIds.length > 0) {
      await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: createdTransaccionIds } } });
      await prisma.transaccion.deleteMany({ where: { id: { in: createdTransaccionIds } } });
    }
    if (createdIds.length > 0) {
      await prisma.producto.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it('elimina un producto sin pedidos asociados', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');

    const producto = await prisma.producto.create({
      data: { nombre: 'Producto de test para eliminar', descripcion: 'x', precio: 10, tipo: 'REVENTA', estado_publicacion: 'BORRADOR' },
    });

    const request = new NextRequest(`http://localhost/api/admin/productos/${producto.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${access_token}` },
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: String(producto.id) }) });
    expect(response.status).toBe(200);

    const stillThere = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(stillThere).toBeNull();
  });

  it('rechaza con 409 la eliminacion de un producto con pedidos asociados', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');

    const producto = await prisma.producto.create({
      data: { nombre: 'Producto de test con pedidos', descripcion: 'x', precio: 10, tipo: 'REVENTA', estado_publicacion: 'BORRADOR' },
    });
    createdIds.push(producto.id);

    const transaccion = await prisma.transaccion.create({ data: { total: 10 } });
    createdTransaccionIds.push(transaccion.id);
    await prisma.transaccionesDetalles.create({
      data: { transaccion_id: transaccion.id, producto_id: producto.id, precio_unitario: 10, cantidad: 1 },
    });

    const request = new NextRequest(`http://localhost/api/admin/productos/${producto.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${access_token}` },
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: String(producto.id) }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/pedidos asociados/);

    const stillThere = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(stillThere).not.toBeNull();
  });
});
