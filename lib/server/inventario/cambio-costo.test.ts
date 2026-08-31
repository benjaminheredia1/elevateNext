import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { Session } from '@/lib/server/auth/session';
import { PUT as PUT_INSUMO } from '@/app/api/insumo/[id]/route';
import { costoFichaTecnica, foodCostPct, registrarCompra } from '@/lib/server/inventario/inventario.service';
import { abrirTurno, registrarVentaFisica, cerrarTurno } from '@/lib/server/caja/caja.service';
import { cmvPorReceta } from '@/lib/server/finanzas/metricas.service';
import { rangoDiaNegocio, hoyISO } from '@/lib/server/fechas';
import { login } from '@/lib/auth';

/**
 * Qué pasa cuando cambia el costo de un insumo.
 *
 * Es la pregunta que más se equivoca en un sistema de costeo, porque tiene dos
 * respuestas correctas al mismo tiempo:
 *
 *  - HACIA ADELANTE el costo nuevo manda: la ficha técnica y el food cost de
 *    hoy tienen que reflejar lo que cuesta hoy producir el plato.
 *  - HACIA ATRÁS no cambia nada: el CMV de una venta ya hecha quedó asentado
 *    al vender. Si se recalculara, editar un costo hoy cambiaría el resultado
 *    de meses ya cerrados.
 *
 * Estos tests fijan las dos mitades a la vez, que es la única forma de que no
 * se rompa una arreglando la otra.
 */
describe('cambio del costo de un insumo', () => {
  let sucursalId: number;
  let insumoId: number;
  let productoId: number;
  let turnoId: number;
  let cajero: Session;
  let adminId: number;

  const PRECIO = 20;
  const COSTO_INICIAL = 4;   // 0.5 kg × 4 = Bs 2 de costo por plato
  const COSTO_NUEVO = 10;    // 0.5 kg × 10 = Bs 5 de costo por plato

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const editarInsumo = async (costo: number) => {
    const access_token = await token();
    const req = new NextRequest(`http://localhost/api/insumo/${insumoId}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Insumo costo test',
        unidad_medida: 'KG',
        costo_promedio: costo,
        stock_minimo: 0,
        punto_critico: 0,
        sucursal_id: sucursalId,
      }),
    });
    return PUT_INSUMO(req, { params: Promise.resolve({ id: String(insumoId) }) });
  };

  beforeAll(async () => {
    const usuario = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    adminId = usuario.id;
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;
    cajero = {
      id: usuario.id, email: usuario.email, rol: 'CAJERO',
      sucursal_id: sucursalId, sucursales: [sucursalId], nombre: usuario.nombre,
    };

    await prisma.cajaTurno.updateMany({
      where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
      data: { estado: 'CERRADO', fecha_cierre: new Date() },
    });

    const insumo = await prisma.insumo.create({
      data: { nombre: `Insumo costo test ${Date.now()}`, unidad_medida: 'KG', stock_actual: 0, stock_minimo: 0 },
    });
    insumoId = insumo.id;

    // 100 kg a Bs 4: el costo con el que arranca el local.
    await prisma.$transaction((tx) =>
      registrarCompra(tx, insumoId, 100, COSTO_INICIAL, 'Stock inicial', adminId, 'DUENO', sucursalId));

    const producto = await prisma.producto.create({
      data: { nombre: `Plato costo test ${Date.now()}`, descripcion: 'x', precio: PRECIO, estado_publicacion: 'PUBLICADO' },
    });
    productoId = producto.id;
    await prisma.productoSucursal.create({
      data: { producto_id: productoId, sucursal_id: sucursalId, precio: PRECIO, disponible: true },
    });
    await prisma.recetasProducto.create({
      data: { producto_id: productoId, insumo_id: insumoId, sucursal_id: sucursalId, cantidad_utilizada: 0.5 },
    });
  });

  afterAll(async () => {
    if (insumoId == null) return;
    if (turnoId != null) {
      await prisma.cajaTurno.updateMany({ where: { id: turnoId, estado: 'ABIERTO' }, data: { estado: 'CERRADO' } });
    }
    await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
    await prisma.transaccionesDetalles.deleteMany({ where: { producto_id: productoId } });
    await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
    await prisma.producto.delete({ where: { id: productoId } });
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.insumo.delete({ where: { id: insumoId } });
  });

  it('la ficha técnica parte del costo del local, no del catálogo', async () => {
    expect(await costoFichaTecnica(productoId, prisma, sucursalId)).toBeCloseTo(2, 6);
    expect(await foodCostPct(productoId, prisma, sucursalId)).toBeCloseTo(10, 4); // 2 / 20
  });

  it('editar el insumo cambia el costo de la RECETA, no solo el del catálogo', async () => {
    // Este es el bug que se reportó en producción: se cambiaba el costo y la
    // receta seguía calculando con el viejo, porque el PUT solo escribía el
    // agregado Insumo.costo_promedio y no StockSucursal.
    const res = await editarInsumo(COSTO_NUEVO);
    expect(res.status).toBe(200);

    const enSucursal = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
    });
    expect(enSucursal.costo_promedio).toBeCloseTo(COSTO_NUEVO, 6);

    expect(await costoFichaTecnica(productoId, prisma, sucursalId)).toBeCloseTo(5, 6);
    expect(await foodCostPct(productoId, prisma, sucursalId)).toBeCloseTo(25, 4); // 5 / 20
  });

  it('editar el costo NO altera el stock: cambiar un precio no hace aparecer mercadería', async () => {
    const fila = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
    });
    expect(fila.stock_actual).toBe(100);
  });

  it('una venta congela su costo: subir el insumo después no reescribe el CMV pasado', async () => {
    // Se vuelve al costo inicial para vender "en el mundo de antes".
    await editarInsumo(COSTO_INICIAL);

    const turno = await abrirTurno(cajero, { apertura_efectivo: 0, apertura_qr: 0 });
    turnoId = turno.id;

    await registrarVentaFisica(cajero, {
      items: [{ producto_id: productoId, cantidad: 10 }],
      combos: [], metodo_pago: 'EFECTIVO',
      es_cortesia: false, es_fiado: false, cliente_anonimo: true, es_pedido_web: false,
    });

    const rango = rangoDiaNegocio(hoyISO());
    const cmvAntes = await cmvPorReceta(rango, sucursalId);

    // 10 platos × Bs 2 de costo = Bs 20 de CMV para esta venta.
    const detalles = await prisma.transaccionesDetalles.findMany({ where: { producto_id: productoId } });
    expect(detalles).toHaveLength(1);
    expect(Number(detalles[0].costo_unitario)).toBeCloseTo(2, 2);

    // Ahora el insumo se encarece a más del doble.
    await editarInsumo(COSTO_NUEVO);

    // Hacia adelante, el costo nuevo manda…
    expect(await costoFichaTecnica(productoId, prisma, sucursalId)).toBeCloseTo(5, 6);

    // …pero el CMV del período no se movió ni un centavo.
    expect(await cmvPorReceta(rango, sucursalId)).toBeCloseTo(cmvAntes, 2);
    const detalleDespues = await prisma.transaccionesDetalles.findFirstOrThrow({ where: { producto_id: productoId } });
    expect(Number(detalleDespues.costo_unitario)).toBeCloseTo(2, 2);

    await cerrarTurno(cajero, { real_efectivo: 200, real_qr: 0 });
  });

  it('el cambio de costo queda auditado con la sucursal a la que se aplicó', async () => {
    const auditoria = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'Insumo', entidad_id: String(insumoId) },
      orderBy: { id: 'desc' },
    });
    expect(auditoria?.detalle).toMatch(new RegExp(`sucursal #${sucursalId}`));
  });
});
