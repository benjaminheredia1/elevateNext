import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT, PATCH, DELETE } from './route';
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
      await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: createdInsumoIds } } });
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

describe('PUT /api/admin/productos/[id] — stock del insumo de reventa', () => {
  const createdIds: number[] = [];
  const createdInsumoIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.producto.deleteMany({ where: { id: { in: createdIds } } });
    }
    if (createdInsumoIds.length > 0) {
      await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: createdInsumoIds } } });
      await prisma.insumo.deleteMany({ where: { id: { in: createdInsumoIds } } });
    }
  });

  it('no pisa el stock_actual del insumo al editar el producto (las ventas concurrentes no se pierden)', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const marca = await prisma.marca.findFirstOrThrow();

    // Stock real actual: 42 (hubo ventas después de que el usuario abrió el wizard)
    const insumo = await prisma.insumo.create({
      data: {
        nombre: 'Insumo reventa stock (test)',
        unidad_medida: 'UNIDAD',
        stock_actual: 42,
        stock_minimo: 5,
        costo_promedio: 8,
      },
    });
    createdInsumoIds.push(insumo.id);

    const producto = await prisma.producto.create({
      data: {
        nombre: 'Producto reventa stock (test)',
        descripcion: 'x',
        precio: 10,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        insumo_reventa_id: insumo.id,
      },
    });
    createdIds.push(producto.id);

    // El formulario envía el stock viejo (50) que leyó antes de las ventas
    const request = new NextRequest(`http://localhost/api/admin/productos/${producto.id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        precio: 12,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        marcas: [marca.id],
        insumo_reventa_id: insumo.id,
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 50, costo_unitario: 9, punto_reorden: 6 },
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(producto.id) }) });
    expect(response.status).toBe(200);

    const insumoDespues = await prisma.insumo.findUniqueOrThrow({ where: { id: insumo.id } });
    // El stock NO debe cambiar por editar el producto…
    expect(insumoDespues.stock_actual).toBe(42);
    // …pero los demás datos del insumo sí se actualizan
    expect(insumoDespues.costo_promedio).toBe(9);
    expect(insumoDespues.stock_minimo).toBe(6);
  });

  it('renombrar el producto sincroniza el nombre del insumo vinculado', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const marca = await prisma.marca.findFirstOrThrow();

    const insumo = await prisma.insumo.create({
      data: { nombre: 'Amaricano (test typo)', unidad_medida: 'UNIDAD', stock_actual: 10, stock_minimo: 0, costo_promedio: 5 },
    });
    createdInsumoIds.push(insumo.id);
    const producto = await prisma.producto.create({
      data: { nombre: 'Amaricano (test typo)', descripcion: 'x', precio: 10, tipo: 'REVENTA', estado_publicacion: 'PUBLICADO', insumo_reventa_id: insumo.id },
    });
    createdIds.push(producto.id);

    const request = new NextRequest(`http://localhost/api/admin/productos/${producto.id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Americano (test typo)',
        descripcion: 'x',
        precio: 10,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        marcas: [marca.id],
        insumo_reventa_id: insumo.id,
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 10, costo_unitario: 5 },
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(producto.id) }) });
    expect(response.status).toBe(200);

    const insumoDespues = await prisma.insumo.findUniqueOrThrow({ where: { id: insumo.id } });
    expect(insumoDespues.nombre).toBe('Americano (test typo)');
  });
});

describe('PATCH /api/admin/productos/[id] — baja espejada del insumo de reventa', () => {
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

  async function crearReventa(nombre: string, insumoId?: number) {
    let insumo_reventa_id = insumoId;
    if (!insumo_reventa_id) {
      const insumo = await prisma.insumo.create({
        data: { nombre: `Insumo ${nombre}`, unidad_medida: 'UNIDAD', stock_actual: 10, stock_minimo: 0 },
      });
      createdInsumoIds.push(insumo.id);
      insumo_reventa_id = insumo.id;
    }
    const producto = await prisma.producto.create({
      data: { nombre, descripcion: 'x', precio: 10, tipo: 'REVENTA', estado_publicacion: 'PUBLICADO', insumo_reventa_id },
    });
    createdIds.push(producto.id);
    return { producto, insumoId: insumo_reventa_id };
  }

  async function patch(productoId: number, body: object) {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const request = new NextRequest(`http://localhost/api/admin/productos/${productoId}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return PATCH(request, { params: Promise.resolve({ id: String(productoId) }) });
  }

  it('al dar de baja el producto, da de baja también su insumo de uso exclusivo', async () => {
    const { producto, insumoId } = await crearReventa('Reventa baja exclusiva (test)');

    const response = await patch(producto.id, { estado_publicacion: 'BAJA', motivo: 'ya no se vende' });
    expect(response.status).toBe(200);

    const insumo = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    expect(insumo.activo).toBe(false);
    expect(insumo.fecha_baja).not.toBeNull();
    expect(insumo.motivo_baja).toMatch(/ya no se vende/);
  });

  it('al restaurar el producto, reactiva el insumo que se dio de baja en cascada', async () => {
    const { producto, insumoId } = await crearReventa('Reventa restaurar (test)');

    await patch(producto.id, { estado_publicacion: 'BAJA', motivo: 'pausa temporal' });
    const response = await patch(producto.id, { estado_publicacion: 'BORRADOR' });
    expect(response.status).toBe(200);

    const insumo = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    expect(insumo.activo).toBe(true);
    expect(insumo.motivo_baja).toBeNull();
  });

  it('NO da de baja el insumo si otro producto activo lo comparte', async () => {
    const { insumoId } = await crearReventa('Reventa compartida A (test)');
    const { producto: productoB } = await crearReventa('Reventa compartida B (test)', insumoId);

    const response = await patch(productoB.id, { estado_publicacion: 'BAJA', motivo: 'duplicado' });
    expect(response.status).toBe(200);

    const insumo = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    expect(insumo.activo).toBe(true);
  });

  it('NO reactiva un insumo cuya baja fue manual (no en cascada)', async () => {
    const { producto, insumoId } = await crearReventa('Reventa baja manual (test)');
    await prisma.producto.update({
      where: { id: producto.id },
      data: { estado_publicacion: 'BAJA', motivo_baja: 'baja previa', fecha_baja: new Date() },
    });
    await prisma.insumo.update({
      where: { id: insumoId },
      data: { activo: false, fecha_baja: new Date(), motivo_baja: 'Vencido — baja manual del inventario' },
    });

    const response = await patch(producto.id, { estado_publicacion: 'BORRADOR' });
    expect(response.status).toBe(200);

    const insumo = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    expect(insumo.activo).toBe(false);
    expect(insumo.motivo_baja).toMatch(/baja manual/);
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
