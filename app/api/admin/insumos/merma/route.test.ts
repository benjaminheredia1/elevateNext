import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { POST as POST_COMPRA } from '../compra/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * Desde que la sucursal solo maneja producto terminado, el cajero es quien ve
 * caerse el brownie y quien cuenta la vitrina al cerrar turno. Si tuviera que
 * llamar al admin por 3 unidades no lo haría, y el stock derivaría hasta que
 * nadie confíe en él.
 *
 * El control no es el permiso sino la auditoría: la merma deja `logAudit` con
 * el usuario que la registró. Y comprar sigue sin ser suyo: eso mueve plata a
 * un proveedor.
 */
describe('POST /api/admin/insumos/merma — alcance del cajero', () => {
  const sufijo = Date.now();
  let sucursalCajero: number;
  let otraSucursal: number;
  let espejoId: number;
  let productoId: number;

  const pedir = (access_token: string, cuerpo: Record<string, unknown>) =>
    new NextRequest('http://localhost/api/admin/insumos/merma', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });

  beforeAll(async () => {
    const cajero = await prisma.usuario.findFirstOrThrow({ where: { email: 'cajero@elevate.com' } });
    sucursalCajero = cajero.sucursal_id!;
    otraSucursal = (await prisma.sucursal.create({ data: { nombre: `Sucursal ajena merma ${sufijo}` } })).id;

    // Un espejo: producto terminado con stock en la sucursal del cajero.
    const espejo = await prisma.insumo.create({
      data: { nombre: `Brownie merma ${sufijo}`, unidad_medida: 'UNIDAD', stock_actual: 10, stock_minimo: 0, costo_promedio: 5 },
    });
    espejoId = espejo.id;
    productoId = (await prisma.producto.create({
      data: {
        nombre: `Brownie merma ${sufijo}`, descripcion: 'x', precio: 12,
        tipo: 'REVENTA', estado_publicacion: 'BORRADOR', insumo_reventa_id: espejo.id,
      },
    })).id;
    await prisma.stockSucursal.create({
      data: { insumo_id: espejoId, sucursal_id: sucursalCajero, stock_actual: 10, costo_promedio: 5 },
    });
    await prisma.stockSucursal.create({
      data: { insumo_id: espejoId, sucursal_id: otraSucursal, stock_actual: 10, costo_promedio: 5 },
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

  it('el cajero puede registrar una merma en su sucursal', async () => {
    const { access_token } = await login('cajero@elevate.com', 'cajero123');

    const response = await POST(pedir(access_token, {
      insumo_id: espejoId, cantidad: 3,
      descripcion: 'Se cayó una bandeja', sucursal_id: sucursalCajero,
    }));
    expect(response.status).toBe(201);

    const stock = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: espejoId, sucursal_id: sucursalCajero } },
    });
    expect(stock.stock_actual).toBe(7);
  });

  it('el cajero no puede tocar el stock de otra sucursal', async () => {
    const { access_token } = await login('cajero@elevate.com', 'cajero123');

    const response = await POST(pedir(access_token, {
      insumo_id: espejoId, cantidad: 1,
      descripcion: 'Merma en un local ajeno', sucursal_id: otraSucursal,
    }));
    expect(response.status).toBe(403);

    // Y no se movió nada: el rechazo es antes de escribir.
    const stock = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: espejoId, sucursal_id: otraSucursal } },
    });
    expect(stock.stock_actual).toBe(10);
  });

  it('el cajero NO puede registrar una compra', async () => {
    // Comprar mueve plata a un proveedor y, desde el corte, ni siquiera es de
    // la sucursal: la hace el Centro.
    const { access_token } = await login('cajero@elevate.com', 'cajero123');

    const response = await POST_COMPRA(new NextRequest('http://localhost/api/admin/insumos/compra', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        insumo_id: espejoId, cantidad: 10, costo_unitario: 5, sucursal_id: sucursalCajero,
      }),
    }));
    expect(response.status).toBe(403);
  });

  it('el dueño sigue pudiendo mermar en cualquier sucursal', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');

    const response = await POST(pedir(access_token, {
      insumo_id: espejoId, cantidad: 2,
      descripcion: 'Merma del dueño en otro local', sucursal_id: otraSucursal,
    }));
    expect(response.status).toBe(201);

    const stock = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: espejoId, sucursal_id: otraSucursal } },
    });
    expect(stock.stock_actual).toBe(8);
  });
});
