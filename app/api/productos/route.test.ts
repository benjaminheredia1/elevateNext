import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import prisma from '@/lib/prisma';

describe('GET /api/productos (tienda)', () => {
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
});
