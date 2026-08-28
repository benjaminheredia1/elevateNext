import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * El conteo físico es la operación de cierre de turno: el cajero cuenta lo que
 * hay en la vitrina y corrige la diferencia. Sin este permiso, cada descuadre
 * quedaría esperando a que pase un admin, y para entonces ya nadie recuerda
 * cuánto había.
 */
describe('POST /api/admin/insumos/conteo — alcance del cajero', () => {
  const sufijo = Date.now();
  let sucursalCajero: number;
  let otraSucursal: number;
  let espejoId: number;
  let productoId: number;

  const pedir = (access_token: string, cuerpo: Record<string, unknown>) =>
    new NextRequest('http://localhost/api/admin/insumos/conteo', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });

  beforeAll(async () => {
    const cajero = await prisma.usuario.findFirstOrThrow({ where: { email: 'cajero@elevate.com' } });
    sucursalCajero = cajero.sucursal_id!;
    otraSucursal = (await prisma.sucursal.create({ data: { nombre: `Sucursal ajena conteo ${sufijo}` } })).id;

    const espejo = await prisma.insumo.create({
      data: { nombre: `Alfajor conteo ${sufijo}`, unidad_medida: 'UNIDAD', stock_actual: 20, stock_minimo: 0, costo_promedio: 4 },
    });
    espejoId = espejo.id;
    productoId = (await prisma.producto.create({
      data: {
        nombre: `Alfajor conteo ${sufijo}`, descripcion: 'x', precio: 9,
        tipo: 'REVENTA', estado_publicacion: 'BORRADOR', insumo_reventa_id: espejo.id,
      },
    })).id;
    await prisma.stockSucursal.create({
      data: { insumo_id: espejoId, sucursal_id: sucursalCajero, stock_actual: 20, costo_promedio: 4 },
    });
    await prisma.stockSucursal.create({
      data: { insumo_id: espejoId, sucursal_id: otraSucursal, stock_actual: 20, costo_promedio: 4 },
    });
  });

  afterAll(async () => {
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: espejoId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: espejoId } });
    await prisma.producto.update({ where: { id: productoId }, data: { insumo_reventa_id: null } });
    await prisma.producto.delete({ where: { id: productoId } });
    await prisma.insumo.delete({ where: { id: espejoId } });
    await prisma.sucursal.delete({ where: { id: otraSucursal } });
  });

  it('el cajero puede corregir el stock contado de su sucursal', async () => {
    const { access_token } = await login('cajero@elevate.com', 'cajero123');

    const response = await POST(pedir(access_token, {
      insumo_id: espejoId, nuevo_stock: 17,
      descripcion: 'Conteo de cierre de turno', sucursal_id: sucursalCajero,
    }));
    expect(response.status).toBe(201);

    const stock = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: espejoId, sucursal_id: sucursalCajero } },
    });
    expect(stock.stock_actual).toBe(17);
  });

  it('el conteo del cajero queda auditado con su usuario', async () => {
    // El permiso se sostiene en que el movimiento tiene nombre y apellido.
    const cajero = await prisma.usuario.findFirstOrThrow({ where: { email: 'cajero@elevate.com' } });
    const movimiento = await prisma.movimientoInterno.findFirstOrThrow({
      where: { insumo_id: espejoId, sucursal_id: sucursalCajero },
      orderBy: { id: 'desc' },
    });
    expect(movimiento.responsable).toBe(String(cajero.id));
  });

  it('el cajero no puede contar el stock de otra sucursal', async () => {
    const { access_token } = await login('cajero@elevate.com', 'cajero123');

    const response = await POST(pedir(access_token, {
      insumo_id: espejoId, nuevo_stock: 1,
      descripcion: 'Conteo en un local ajeno', sucursal_id: otraSucursal,
    }));
    expect(response.status).toBe(403);

    const stock = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: espejoId, sucursal_id: otraSucursal } },
    });
    expect(stock.stock_actual).toBe(20);
  });
});
