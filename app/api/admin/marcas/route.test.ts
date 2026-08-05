import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';
import { PUT, DELETE } from './[id]/route';
import { GET as GET_PUBLICOS } from '../../menus/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * Menús (cartas). Lo que se cuida acá es la regla del rubro: una carta con
 * productos adentro no se borra, se archiva, porque el histórico de ventas
 * cuelga de esos productos.
 */
describe('/api/admin/marcas — menús', () => {
  const creados: number[] = [];

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const pedir = (url: string, method: string, access_token: string, body?: unknown) =>
    new NextRequest(`http://localhost${url}`, {
      method,
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  const crear = async (nombre: string, extra: Record<string, unknown> = {}) => {
    const access_token = await token();
    const res = await POST(pedir('/api/admin/marcas', 'POST', access_token, { nombre, ...extra }));
    const body = await res.json();
    if (body?.data?.id) creados.push(body.data.id);
    return { res, body };
  };

  afterAll(async () => {
    if (creados.length > 0) {
      await prisma.productoMarca.deleteMany({ where: { marca_id: { in: creados } } });
      await prisma.marca.deleteMany({ where: { id: { in: creados } } });
    }
  });

  it('nace en borrador y con el slug derivado del nombre', async () => {
    const { res, body } = await crear('Menú de Prueba Ñandú');

    expect(res.status).toBe(201);
    expect(body.data.estado).toBe('BORRADOR');
    expect(body.data.slug).toBe('menu-de-prueba-nandu');
  });

  it('desambigua el slug cuando otro menú ya lo usa', async () => {
    const primero = await crear('Carta Repetida Test');
    const segundo = await crear('Carta Repetida Test');

    expect(primero.body.data.slug).toBe('carta-repetida-test');
    expect(segundo.body.data.slug).toBe('carta-repetida-test-2');
  });

  it('un borrador no sale en el listado público, y publicarlo lo hace aparecer', async () => {
    const { body } = await crear('Carta Solo Interna Test');

    const antes = await (await GET_PUBLICOS()).json();
    expect(antes.data.some((m: { id: number }) => m.id === body.data.id)).toBe(false);

    const access_token = await token();
    const publicada = await PUT(
      pedir(`/api/admin/marcas/${body.data.id}`, 'PUT', access_token, { estado: 'PUBLICADO' }),
      { params: Promise.resolve({ id: String(body.data.id) }) },
    );
    expect(publicada.status).toBe(200);

    const despues = await (await GET_PUBLICOS()).json();
    expect(despues.data.some((m: { id: number }) => m.id === body.data.id)).toBe(true);
  });

  it('se puede eliminar una carta vacía', async () => {
    const { body } = await crear('Carta Vacía Test');
    const access_token = await token();

    const res = await DELETE(
      pedir(`/api/admin/marcas/${body.data.id}`, 'DELETE', access_token),
      { params: Promise.resolve({ id: String(body.data.id) }) },
    );

    expect(res.status).toBe(200);
    expect(await prisma.marca.findUnique({ where: { id: body.data.id } })).toBeNull();
  });

  it('no elimina una carta con productos: responde 409 y no la borra', async () => {
    const { body } = await crear('Carta Con Productos Test');
    const producto = await prisma.producto.findFirstOrThrow();
    await prisma.productoMarca.create({
      data: { producto_id: producto.id, marca_id: body.data.id },
    });
    const access_token = await token();

    const res = await DELETE(
      pedir(`/api/admin/marcas/${body.data.id}`, 'DELETE', access_token),
      { params: Promise.resolve({ id: String(body.data.id) }) },
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/archiv/i);
    expect(await prisma.marca.findUnique({ where: { id: body.data.id } })).not.toBeNull();
  });

  it('el listado del admin cuenta los productos de cada carta una sola vez por producto', async () => {
    const { body } = await crear('Carta Conteo Test');
    const producto = await prisma.producto.findFirstOrThrow();
    const sucursal = await prisma.sucursal.findFirstOrThrow();
    // El mismo producto con la fila del catálogo y la de una sucursal: son dos
    // filas de ProductoMarca pero un solo producto en la carta.
    await prisma.productoMarca.createMany({
      data: [
        { producto_id: producto.id, marca_id: body.data.id },
        { producto_id: producto.id, marca_id: body.data.id, sucursal_id: sucursal.id },
      ],
    });

    const access_token = await token();
    const listado = await (await GET(pedir('/api/admin/marcas', 'GET', access_token))).json();
    const carta = listado.data.find((m: { id: number }) => m.id === body.data.id);

    expect(carta.productos).toBe(1);
  });
});
