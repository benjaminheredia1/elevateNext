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
    await prisma.stockCentro.create({
      data: { centro_id: centroId, insumo_id: soloCentroId, stock_actual: 10, costo_promedio: 5 },
    });

    // (b) Está en el centro Y en una sucursal: sí tiene que aparecer.
    const enSucursal = await prisma.insumo.create({
      data: { nombre: `Centro y sucursal ${Date.now()}`, unidad_medida: 'KG', stock_actual: 0, stock_minimo: 0 },
    });
    enSucursalId = enSucursal.id;
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
  });

  afterAll(async () => {
    if (centroId == null) return;
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: [soloCentroId, enSucursalId] } } });
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
