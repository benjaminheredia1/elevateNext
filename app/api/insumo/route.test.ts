import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * El listado de insumos en modo consolidado (sin ?sucursal=) no puede ofrecer
 * insumos que solo viven en el Centro de Producción.
 *
 * Por qué importa: ese listado alimenta el selector de insumos del wizard de
 * productos. Si un insumo del Centro aparece ahí, alguien puede armarle la
 * ficha técnica a un plato con él; al vender, el descuento golpea StockSucursal
 * —que para ese insumo no existe— y el local queda con un negativo fantasma que
 * nadie sabe de dónde salió.
 */
describe('GET /api/insumo — insumos del Centro en consolidado', () => {
  let centroId: number;
  let soloCentroId: number;
  let enSucursalId: number;
  let huerfanoId: number;
  let sucursalId: number;
  // Los tres insumos de este bloque son ESPEJOS (cada uno con su producto).
  // Desde que la sucursal solo ve producto terminado, un insumo bruto no
  // aparecería nunca y estos casos no distinguirían nada: lo que se prueba acá
  // es la otra regla, la de visibilidad del Centro, que sigue vigente.
  const productoIds: number[] = [];

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const listar = async (query = '') => {
    const access_token = await token();
    const res = await GET(new NextRequest(`http://localhost/api/insumo${query}`, {
      headers: { authorization: `Bearer ${access_token}` },
    }));
    const cuerpo = await res.json();
    return (Array.isArray(cuerpo) ? cuerpo : cuerpo.items ?? cuerpo.data ?? []) as { id: number }[];
  };

  beforeAll(async () => {
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;
    const centro = await prisma.centroProduccion.create({ data: { nombre: `Centro visibilidad ${Date.now()}` } });
    centroId = centro.id;

    // (a) Vive SOLO en el centro: no tiene que aparecer.
    const soloCentro = await prisma.insumo.create({
      data: { nombre: `Solo centro ${Date.now()}`, unidad_medida: 'KG', stock_actual: 0, stock_minimo: 0 },
    });
    soloCentroId = soloCentro.id;
    productoIds.push((await prisma.producto.create({
      data: { nombre: `Prod solo centro ${Date.now()}`, descripcion: 'x', precio: 1, tipo: 'REVENTA', insumo_reventa_id: soloCentroId },
    })).id);
    await prisma.stockCentro.create({
      data: { centro_id: centroId, insumo_id: soloCentroId, stock_actual: 10, costo_promedio: 5 },
    });

    // (b) Está en el centro Y en una sucursal: sí tiene que aparecer.
    const enSucursal = await prisma.insumo.create({
      data: { nombre: `Centro y sucursal ${Date.now()}`, unidad_medida: 'KG', stock_actual: 0, stock_minimo: 0 },
    });
    enSucursalId = enSucursal.id;
    productoIds.push((await prisma.producto.create({
      data: { nombre: `Prod centro y sucursal ${Date.now()}`, descripcion: 'x', precio: 1, tipo: 'REVENTA', insumo_reventa_id: enSucursalId },
    })).id);
    await prisma.stockCentro.create({
      data: { centro_id: centroId, insumo_id: enSucursalId, stock_actual: 5, costo_promedio: 3 },
    });
    await prisma.stockSucursal.create({
      data: { insumo_id: enSucursalId, sucursal_id: sucursalId, stock_actual: 2, costo_promedio: 3 },
    });

    // (c) Sin filas en ningún lado (insumo anterior a multi-sucursal): tiene
    // que seguir viéndose, o el arreglo rompería el catálogo histórico.
    const huerfano = await prisma.insumo.create({
      data: { nombre: `Huerfano ${Date.now()}`, unidad_medida: 'KG', stock_actual: 0, stock_minimo: 0 },
    });
    huerfanoId = huerfano.id;
    productoIds.push((await prisma.producto.create({
      data: { nombre: `Prod huerfano ${Date.now()}`, descripcion: 'x', precio: 1, tipo: 'REVENTA', insumo_reventa_id: huerfanoId },
    })).id);
  });

  afterAll(async () => {
    if (centroId == null) return;
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: [soloCentroId, enSucursalId] } } });
    await prisma.producto.updateMany({ where: { id: { in: productoIds } }, data: { insumo_reventa_id: null } });
    await prisma.producto.deleteMany({ where: { id: { in: productoIds } } });
    await prisma.insumo.deleteMany({ where: { id: { in: [soloCentroId, enSucursalId, huerfanoId] } } });
  });

  it('el insumo que solo vive en el Centro no aparece en el consolidado', async () => {
    const ids = (await listar()).map(i => i.id);
    expect(ids).not.toContain(soloCentroId);
  });

  it('el que también está en una sucursal sí aparece', async () => {
    const ids = (await listar()).map(i => i.id);
    expect(ids).toContain(enSucursalId);
  });

  it('un insumo sin stock en ninguna parte sigue apareciendo', async () => {
    const ids = (await listar()).map(i => i.id);
    expect(ids).toContain(huerfanoId);
  });

  it('filtrando por sucursal tampoco aparece el del Centro', async () => {
    const ids = (await listar(`?sucursal=${sucursalId}`)).map(i => i.id);
    expect(ids).not.toContain(soloCentroId);
    expect(ids).toContain(enSucursalId);
  });
});

/**
 * Desde el corte, la sucursal solo maneja producto TERMINADO: el insumo bruto
 * vive en el Centro de Producción. El listado tiene que reflejar eso, o el
 * panel de inventario del local seguiría mostrando harina y cebolla que ese
 * local ya no compra, no cuenta y no puede mermar.
 *
 * "Terminado" se deriva de la relación —tener un producto que lo apunte como
 * insumo_reventa_id— y no de un flag, para que no pueda quedar desincronizado.
 */
describe('GET /api/insumo — la sucursal solo ve producto terminado', () => {
  const sufijo = Date.now();
  let sucursalId: number;
  let brutoId: number;
  let espejoId: number;
  let productoId: number;

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const listar = async (query: string, access_token: string) => {
    const res = await GET(new NextRequest(`http://localhost/api/insumo${query}`, {
      headers: { authorization: `Bearer ${access_token}` },
    }));
    const cuerpo = await res.json();
    return (Array.isArray(cuerpo) ? cuerpo : cuerpo?.data ?? []) as { id: number }[];
  };

  beforeAll(async () => {
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;

    const bruto = await prisma.insumo.create({
      data: { nombre: `Harina oculta ${sufijo}`, unidad_medida: 'GR', stock_actual: 100, stock_minimo: 0 },
    });
    brutoId = bruto.id;
    await prisma.stockSucursal.create({
      data: { insumo_id: bruto.id, sucursal_id: sucursalId, stock_actual: 100, costo_promedio: 1 },
    });

    const espejo = await prisma.insumo.create({
      data: { nombre: `Brownie visible ${sufijo}`, unidad_medida: 'UNIDAD', stock_actual: 5, stock_minimo: 0 },
    });
    espejoId = espejo.id;
    await prisma.stockSucursal.create({
      data: { insumo_id: espejo.id, sucursal_id: sucursalId, stock_actual: 5, costo_promedio: 12 },
    });
    productoId = (await prisma.producto.create({
      data: {
        nombre: `Brownie visible ${sufijo}`, descripcion: 'x', precio: 20,
        tipo: 'ELABORADO', insumo_reventa_id: espejo.id,
      },
    })).id;
  });

  afterAll(async () => {
    await prisma.producto.update({ where: { id: productoId }, data: { insumo_reventa_id: null } });
    await prisma.producto.delete({ where: { id: productoId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: [brutoId, espejoId] } } });
    await prisma.insumo.deleteMany({ where: { id: { in: [brutoId, espejoId] } } });
  });

  it('no devuelve insumo bruto a la sucursal', async () => {
    const ids = (await listar(`?sucursal=${sucursalId}`, await token())).map(i => i.id);
    expect(ids).toContain(espejoId);
    expect(ids).not.toContain(brutoId);
  });

  it('tampoco lo devuelve en consolidado', async () => {
    // El consolidado alimenta el selector de insumos del wizard: si el bruto
    // apareciera ahí, alguien podría armar una ficha técnica con harina que la
    // sucursal ya no tiene.
    const ids = (await listar('', await token())).map(i => i.id);
    expect(ids).not.toContain(brutoId);
  });

  it('el dueño puede pedirlo explícitamente para diagnóstico', async () => {
    // Escotilla de salida: el bruto no desapareció, solo dejó de ofrecerse por
    // defecto. Sin esto, revisar qué quedó mal después del corte obligaría a
    // entrar a la base a mano.
    const ids = (await listar(`?sucursal=${sucursalId}&incluir_brutos=1`, await token())).map(i => i.id);
    expect(ids).toContain(brutoId);
  });

  it('un CAJERO no puede saltarse el filtro con incluir_brutos', async () => {
    const cajero = (await login('cajero@elevate.com', 'cajero123')).access_token;
    const ids = (await listar(`?sucursal=${sucursalId}&incluir_brutos=1`, cajero)).map(i => i.id);
    expect(ids).not.toContain(brutoId);
  });
});
