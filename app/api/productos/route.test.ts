import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import prisma from '@/lib/prisma';

describe('GET /api/productos (tienda)', () => {
  const createdIds: number[] = [];
  const createdInsumoIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.recetasProducto.deleteMany({ where: { producto_id: { in: createdIds } } });
      await prisma.producto.deleteMany({ where: { id: { in: createdIds } } });
    }
    if (createdInsumoIds.length > 0) {
      await prisma.insumo.deleteMany({ where: { id: { in: createdInsumoIds } } });
    }
  });

  it('marca como agotado un producto REVENTA cuyo insumo fue dado de baja (aunque tenga stock)', async () => {
    const insumo = await prisma.insumo.create({
      data: {
        nombre: 'Insumo reventa inactivo (test tienda)',
        unidad_medida: 'UNIDAD',
        stock_actual: 30,
        stock_minimo: 0,
        activo: false,
        fecha_baja: new Date(),
        motivo_baja: 'test',
      },
    });
    createdInsumoIds.push(insumo.id);

    const producto = await prisma.producto.create({
      data: {
        nombre: 'Producto reventa insumo inactivo (test tienda)',
        descripcion: 'x',
        precio: 10,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        disponible: true,
        insumo_reventa_id: insumo.id,
      },
    });
    createdIds.push(producto.id);

    const response = await GET(new NextRequest('http://localhost/api/productos'));
    const body = await response.json();

    expect(response.status).toBe(200);
    const enTienda = body.data.find((p: { id: number }) => p.id === producto.id);
    expect(enTienda).toBeDefined();
    expect(enTienda.agotado).toBe(true);
    expect(enTienda.rinde).toBe(0);
  });

  it('no expone receta, insumos (costos/proveedor) ni config de promociones al público', async () => {
    const insumo = await prisma.insumo.create({
      data: {
        nombre: 'Insumo Secreto Catalogo E2E',
        unidad_medida: 'GR',
        stock_actual: 1000,
        stock_minimo: 10,
        costo_promedio: 0.5,
        proveedor: 'Proveedor Secreto E2E',
      },
    });
    createdInsumoIds.push(insumo.id);

    const producto = await prisma.producto.create({
      data: {
        nombre: 'Producto Catalogo Publico E2E',
        descripcion: 'Fixture catálogo',
        precio: 25,
        estado_publicacion: 'PUBLICADO',
        disponible: true,
        recetaProducto_id: { create: [{ insumo_id: insumo.id, cantidad_utilizada: 100 }] },
      },
    });
    createdIds.push(producto.id);

    const response = await GET(new NextRequest('http://localhost/api/productos'));
    expect(response.status).toBe(200);
    const body = await response.json();
    const item = body.data.find((p: { id: number }) => p.id === producto.id);
    expect(item).toBeDefined();
    expect(Number(item.precio)).toBe(25);
    expect(item.rinde).toBeDefined();

    // Nada interno en el payload público
    expect(item.recetaProducto_id).toBeUndefined();
    expect(item.insumo_reventa).toBeUndefined();
    expect(item.promocionProducto_id).toBeUndefined();
    const raw = JSON.stringify(item);
    expect(raw).not.toContain('costo_promedio');
    expect(raw).not.toContain('Proveedor Secreto E2E');
    expect(raw).not.toContain('Insumo Secreto Catalogo E2E');
  });
});
