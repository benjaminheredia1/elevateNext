import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * Kardex del Centro. A diferencia del de sucursal —que devuelve los últimos 50
 * movimientos del negocio entero sin filtrar por local—, este SÍ filtra por
 * centro: la pantalla se abre siempre parada en un centro concreto y mezclar
 * los movimientos de dos centros haría ilegible el historial de cada uno.
 */
describe('GET /api/admin/centros-produccion/[id]/movimientos', () => {
  const sufijo = Date.now();
  let centroId: number;
  let otroCentroId: number;
  let insumoId: number;

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const pedir = (centro: number, access_token: string) => ({
    req: new NextRequest(`http://localhost/api/admin/centros-produccion/${centro}/movimientos`, {
      headers: { authorization: `Bearer ${access_token}` },
    }),
    ctx: { params: Promise.resolve({ id: String(centro) }) },
  });

  beforeAll(async () => {
    const centro = await prisma.centroProduccion.create({ data: { nombre: `Centro kardex ${sufijo}` } });
    centroId = centro.id;
    const otro = await prisma.centroProduccion.create({ data: { nombre: `Centro kardex ajeno ${sufijo}` } });
    otroCentroId = otro.id;

    const insumo = await prisma.insumo.create({
      data: { nombre: `Harina kardex ${sufijo}`, unidad_medida: 'GR', stock_actual: 0, stock_minimo: 0, costo_promedio: 0 },
    });
    insumoId = insumo.id;

    // Dos movimientos en el centro que se consulta y uno en el otro: el tercero
    // no puede aparecer en la respuesta.
    await prisma.movimientoCentro.create({
      data: { centro_id: centroId, insumo_id: insumoId, tipo_movimiento: 'INGRESO', cantidad: 500, descripcion: `Compra ${sufijo}`, costo_unitario: 0.02 },
    });
    await prisma.movimientoCentro.create({
      data: { centro_id: centroId, insumo_id: insumoId, tipo_movimiento: 'EGRESO', cantidad: 30, descripcion: `Merma ${sufijo}` },
    });
    await prisma.movimientoCentro.create({
      data: { centro_id: otroCentroId, insumo_id: insumoId, tipo_movimiento: 'INGRESO', cantidad: 999, descripcion: `Ajeno ${sufijo}` },
    });
  });

  afterAll(async () => {
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: { in: [centroId, otroCentroId] } } });
    await prisma.insumo.delete({ where: { id: insumoId } });
    await prisma.centroProduccion.deleteMany({ where: { id: { in: [centroId, otroCentroId] } } });
  });

  it('devuelve los movimientos del centro con los campos que el kardex necesita', async () => {
    const { req, ctx } = pedir(centroId, await token());
    const response = await GET(req, ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);

    // El más reciente primero: el kardex se lee de arriba hacia abajo.
    expect(body.data[0].descripcion).toBe(`Merma ${sufijo}`);
    expect(body.data[1]).toMatchObject({
      tipo_movimiento: 'INGRESO',
      cantidad: 500,
      descripcion: `Compra ${sufijo}`,
      costo_unitario: 0.02,
      insumo: { nombre: `Harina kardex ${sufijo}`, unidad_medida: 'GR' },
    });
  });

  it('no devuelve los movimientos de otro centro', async () => {
    const { req, ctx } = pedir(centroId, await token());
    const body = await (await GET(req, ctx)).json();

    expect(body.data.some((m: { descripcion: string }) => m.descripcion === `Ajeno ${sufijo}`)).toBe(false);
  });

  it('un CAJERO no puede leer el kardex del centro: 403', async () => {
    const cajero = (await login('cajero@elevate.com', 'cajero123')).access_token;
    const { req, ctx } = pedir(centroId, cajero);

    expect((await GET(req, ctx)).status).toBe(403);
  });

  it('sin sesión: 401', async () => {
    const req = new NextRequest(`http://localhost/api/admin/centros-produccion/${centroId}/movimientos`);

    expect((await GET(req, { params: Promise.resolve({ id: String(centroId) }) })).status).toBe(401);
  });

  it('id de centro inválido: 422', async () => {
    const access_token = await token();
    const req = new NextRequest('http://localhost/api/admin/centros-produccion/abc/movimientos', {
      headers: { authorization: `Bearer ${access_token}` },
    });

    expect((await GET(req, { params: Promise.resolve({ id: 'abc' }) })).status).toBe(422);
  });

  it('centro inexistente: 404', async () => {
    const access_token = await token();
    const req = new NextRequest('http://localhost/api/admin/centros-produccion/99999999/movimientos', {
      headers: { authorization: `Bearer ${access_token}` },
    });

    expect((await GET(req, { params: Promise.resolve({ id: '99999999' }) })).status).toBe(404);
  });
});
