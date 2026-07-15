import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

describe('POST /api/admin/productos', () => {
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

  it('publica un producto sin imagen_url', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const marca = await prisma.marca.findFirstOrThrow();

    const request = new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Producto de test sin foto',
        descripcion: 'Creado por el test de integracion',
        precio: 20,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        marcas: [marca.id],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 5, costo_unitario: 10 },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.estado_publicacion).toBe('PUBLICADO');
    expect(body.data.imagen_url).toBeNull();

    createdIds.push(body.data.id);
    if (body.data.insumo_reventa_id) {
      createdInsumoIds.push(body.data.insumo_reventa_id);
    }
  });

  it('registra un movimiento INGRESO por el stock inicial del insumo de reventa', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const marca = await prisma.marca.findFirstOrThrow();

    const request = new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Producto reventa con stock inicial (test)',
        descripcion: 'x',
        precio: 15,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        marcas: [marca.id],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 20, costo_unitario: 7 },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    createdIds.push(body.data.id);
    createdInsumoIds.push(body.data.insumo_reventa_id);

    const movimientos = await prisma.movimientoInterno.findMany({
      where: { insumo_id: body.data.insumo_reventa_id },
    });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].tipo_movimiento).toBe('INGRESO');
    expect(movimientos[0].cantidad).toBe(20);
    expect(movimientos[0].costo_unitario).toBe(7);
  });

  it('rechaza con 422 un producto REVENTA que trae receta (exclusión de tipos)', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const nombreUnico = `Reventa con receta invalida (test ${Date.now()})`;
    const insumo = await prisma.insumo.create({
      data: { nombre: `Insumo ${nombreUnico}`, unidad_medida: 'UNIDAD', stock_actual: 10, stock_minimo: 0 },
    });
    createdInsumoIds.push(insumo.id);

    const request = new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: nombreUnico,
        precio: 10,
        tipo: 'REVENTA',
        estado_publicacion: 'BORRADOR',
        receta: [{ insumo_id: insumo.id, cantidad_utilizada: 1 }],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 5, costo_unitario: 3 },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(422);

    const noCreado = await prisma.producto.findFirst({ where: { nombre: nombreUnico } });
    expect(noCreado).toBeNull();
  });

  it('crea un borrador sin descripcion', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');

    const request = new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Producto de test sin descripcion',
        precio: 20,
        tipo: 'REVENTA',
        estado_publicacion: 'BORRADOR',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.descripcion).toBe('');

    createdIds.push(body.data.id);
  });
});
