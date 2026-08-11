/**
 * Integración: traer productos de otra sucursal.
 *
 * Lo que se prueba es la independencia económica: la receta viaja (los gramajes
 * son la definición del plato), pero el precio, el stock y el costo del origen
 * NO. Heredar el costo promedio del otro local le mete su plata al CMV y al food
 * cost de una sucursal que todavía no compró nada.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const MARCA = `copiar-prod-${Date.now()}`;
let token: string;
let origenId: number;
let destinoId: number;
let elaboradoId: number;
let reventaId: number;
let insumoRecetaId: number;
let insumoReventaId: number;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/admin/productos/copiar-sucursal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  token = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
  origenId = await sucursalPorDefectoId();
  destinoId = (await prisma.sucursal.create({ data: { nombre: `${MARCA}-destino`, activa: true } })).id;

  insumoRecetaId = (await prisma.insumo.create({
    data: { nombre: `${MARCA}-carne`, unidad_medida: 'GR', stock_actual: 0, costo_promedio: 55, stock_minimo: 10, punto_critico: 4 },
  })).id;
  insumoReventaId = (await prisma.insumo.create({
    data: { nombre: `${MARCA}-gaseosa`, unidad_medida: 'GR', stock_actual: 0, costo_promedio: 7, stock_minimo: 24, punto_critico: 6 },
  })).id;

  // En el ORIGEN los insumos tienen stock y costo reales: nada de eso debe viajar.
  await prisma.stockSucursal.createMany({
    data: [insumoRecetaId, insumoReventaId].map(insumo_id => ({
      insumo_id, sucursal_id: origenId,
      stock_actual: 120, costo_promedio: 55, stock_minimo: 10, punto_critico: 4,
    })),
  });

  elaboradoId = (await prisma.producto.create({
    data: { nombre: `${MARCA}-hamburguesa`, descripcion: 'Fixture de copia', precio: 45, tipo: 'ELABORADO' },
  })).id;
  reventaId = (await prisma.producto.create({
    data: { nombre: `${MARCA}-gaseosa-prod`, descripcion: 'Fixture de copia', precio: 12, tipo: 'REVENTA', insumo_reventa_id: insumoReventaId },
  })).id;

  await prisma.recetasProducto.create({
    data: { producto_id: elaboradoId, sucursal_id: origenId, insumo_id: insumoRecetaId, cantidad_utilizada: 0.18 },
  });
  await prisma.productoSucursal.createMany({
    data: [
      { producto_id: elaboradoId, sucursal_id: origenId, precio: 45, disponible: true, estado_publicacion: 'PUBLICADO' },
      { producto_id: reventaId, sucursal_id: origenId, precio: 12, disponible: true, estado_publicacion: 'PUBLICADO' },
    ],
  });
});

afterAll(async () => {
  const productos = [elaboradoId, reventaId];
  const insumos = [insumoRecetaId, insumoReventaId];
  await prisma.recetasProducto.deleteMany({ where: { producto_id: { in: productos } } });
  await prisma.productoSucursal.deleteMany({ where: { producto_id: { in: productos } } });
  await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: insumos } } });
  await prisma.producto.deleteMany({ where: { id: { in: productos } } });
  await prisma.insumo.deleteMany({ where: { id: { in: insumos } } });
  await prisma.cuentaFinanciera.deleteMany({ where: { sucursal_id: destinoId } });
  await prisma.sucursal.deleteMany({ where: { id: destinoId } });
});

describe('POST /api/admin/productos/copiar-sucursal', () => {
  it('copia producto y receta, pero sin precio, stock ni costo del origen', async () => {
    const res = await POST(req({ origen: origenId, destino: destinoId, productos: [elaboradoId, reventaId] }));
    expect(res.status).toBe(201);
    expect((await res.json()).copiados).toBe(2);

    // La receta viaja con sus gramajes: es la definición del plato.
    const receta = await prisma.recetasProducto.findMany({
      where: { producto_id: elaboradoId, sucursal_id: destinoId },
    });
    expect(receta).toHaveLength(1);
    expect(receta[0].insumo_id).toBe(insumoRecetaId);
    expect(receta[0].cantidad_utilizada).toBeCloseTo(0.18);

    // La economía NO viaja: todo en cero en el destino.
    const stock = await prisma.stockSucursal.findMany({
      where: { sucursal_id: destinoId, insumo_id: { in: [insumoRecetaId, insumoReventaId] } },
    });
    expect(stock).toHaveLength(2);
    for (const fila of stock) {
      expect(fila.stock_actual).toBe(0);
      expect(fila.costo_promedio).toBe(0);
      expect(fila.stock_minimo).toBe(0);
      expect(fila.punto_critico).toBe(0);
    }

    // El origen queda intacto: su stock y su costo son suyos.
    const enOrigen = await prisma.stockSucursal.findFirstOrThrow({
      where: { sucursal_id: origenId, insumo_id: insumoRecetaId },
    });
    expect(enOrigen.stock_actual).toBe(120);
    expect(enOrigen.costo_promedio).toBe(55);
  });

  it('el producto entra sin precio y como borrador, para no venderse a Bs 0', async () => {
    const habilitaciones = await prisma.productoSucursal.findMany({
      where: { sucursal_id: destinoId, producto_id: { in: [elaboradoId, reventaId] } },
    });
    expect(habilitaciones).toHaveLength(2);
    for (const h of habilitaciones) {
      expect(Number(h.precio)).toBe(0);
      expect(h.disponible).toBe(false);
      expect(h.estado_publicacion).toBe('BORRADOR');
    }
  });

  it('un producto de REVENTA da de alta su insumo en el destino', async () => {
    // Sin esta fila, el local lo vendía sin descontar nada de su inventario.
    const fila = await prisma.stockSucursal.findFirst({
      where: { sucursal_id: destinoId, insumo_id: insumoReventaId },
    });
    expect(fila).not.toBeNull();
    expect(fila!.costo_promedio).toBe(0);
  });

  it('rechaza copiar de una sucursal a sí misma', async () => {
    const res = await POST(req({ origen: origenId, destino: origenId, productos: [elaboradoId] }));
    expect(res.status).toBe(422);
  });
});
