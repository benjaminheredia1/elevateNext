import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { GET, POST } from './route';
import { POST as POST_RECIBIR } from './recibir/route';
import { POST as POST_ANULAR } from './anular/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { altaInsumoEnCentro } from '@/lib/server/centro-produccion/insumos-centro.service';

describe('/api/admin/traslados', () => {
  let centroId: number;
  let sucursalId: number;
  let insumoId: number;

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const pedir = (url: string, method: string, access_token: string, body?: unknown, clave?: string) =>
    new NextRequest(`http://localhost${url}`, {
      method,
      headers: {
        authorization: `Bearer ${access_token}`,
        'content-type': 'application/json',
        ...(clave ? { 'Idempotency-Key': clave } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  beforeAll(async () => {
    const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;

    const centro = await prisma.centroProduccion.create({ data: { nombre: `Centro ruta traslado ${Date.now()}` } });
    centroId = centro.id;

    const alta = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Terminado ruta traslado ${Date.now()}`, unidad_medida: 'UNIDAD',
      stock_inicial: 50, costo_unitario: 4, stock_minimo: 0, punto_critico: 0,
    }, admin.id, 'DUENO'));
    insumoId = alta.insumo.id;
  });

  afterAll(async () => {
    if (centroId == null || insumoId == null) return;
    await prisma.trasladoDetalle.deleteMany({ where: { traslado: { centro_id: centroId } } });
    await prisma.traslado.deleteMany({ where: { centro_id: centroId } });
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.insumo.delete({ where: { id: insumoId } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
  });

  it('despacha un envío y lo lista con su valor en tránsito', async () => {
    const access_token = await token();
    const res = await POST(pedir('/api/admin/traslados', 'POST', access_token, {
      centro_id: centroId, sucursal_id: sucursalId,
      lineas: [{ insumo_id: insumoId, cantidad: 10 }],
    }));
    expect(res.status).toBe(201);

    const listado = await (await GET(pedir(`/api/admin/traslados?centro_id=${centroId}&estado=EN_TRANSITO`, 'GET', access_token))).json();
    expect(listado.items).toHaveLength(1);
    expect(listado.valor_en_transito).toBeCloseTo(40, 6); // 10 × 4
  });

  it('un envío reenviado con la misma clave no despacha dos veces', async () => {
    const access_token = await token();
    const clave = randomUUID();
    const cuerpo = {
      centro_id: centroId, sucursal_id: sucursalId,
      lineas: [{ insumo_id: insumoId, cantidad: 5 }],
    };

    expect((await POST(pedir('/api/admin/traslados', 'POST', access_token, cuerpo, clave))).status).toBe(201);
    expect((await POST(pedir('/api/admin/traslados', 'POST', access_token, cuerpo, clave))).status).toBe(409);

    // 50 − 10 − 5 = 35: el reintento no descontó del centro.
    const stock = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
    });
    expect(stock.stock_actual).toBe(35);
  });

  it('un CAJERO puede recibir en su sucursal pero no despachar', async () => {
    const cajero = await prisma.usuario.findFirstOrThrow({ where: { rol: 'CAJERO' } });
    const cajero_token = (await login('cajero@elevate.com', 'cajero123')).access_token;

    const despacho = await POST(pedir('/api/admin/traslados', 'POST', cajero_token, {
      centro_id: centroId, sucursal_id: sucursalId,
      lineas: [{ insumo_id: insumoId, cantidad: 1 }],
    }));
    expect(despacho.status).toBe(403);

    // Solo tiene sentido probar la recepción si el cajero de prueba pertenece a
    // la sucursal destino; si no, el 403 de alcance sería lo correcto.
    const enTransito = await prisma.traslado.findFirstOrThrow({
      where: { centro_id: centroId, estado: 'EN_TRANSITO' },
    });
    const recepcion = await POST_RECIBIR(pedir('/api/admin/traslados/recibir', 'POST', cajero_token, {
      traslado_id: enTransito.id, recibido: [],
    }));
    expect(recepcion.status).toBe(cajero.sucursal_id === sucursalId ? 200 : 403);
  });

  it('anular devuelve la mercadería al centro', async () => {
    const access_token = await token();
    const enTransito = await prisma.traslado.findFirst({
      where: { centro_id: centroId, estado: 'EN_TRANSITO' },
    });
    if (!enTransito) return; // el cajero ya recibió el único pendiente

    const antes = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
    });
    const detalles = await prisma.trasladoDetalle.findMany({ where: { traslado_id: enTransito.id } });
    const devuelto = detalles.reduce((acc, d) => acc + d.cantidad_enviada, 0);

    const res = await POST_ANULAR(pedir('/api/admin/traslados/anular', 'POST', access_token, {
      traslado_id: enTransito.id, motivo: 'Prueba de anulación',
    }));
    expect(res.status).toBe(200);

    const despues = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
    });
    expect(despues.stock_actual).toBeCloseTo(antes.stock_actual + devuelto, 6);
  });

  it('sin sesión: 401', async () => {
    const res = await GET(new NextRequest('http://localhost/api/admin/traslados', { method: 'GET' }));
    expect(res.status).toBe(401);
  });

  it('estado inválido en el filtro: 422', async () => {
    const access_token = await token();
    const res = await GET(pedir('/api/admin/traslados?estado=INVENTADO', 'GET', access_token));
    expect(res.status).toBe(422);
  });
});
