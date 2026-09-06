import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { PUT } from './[id]/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * El aviso de producto duplicado, que en septiembre de 2026 no alcanzó.
 *
 * Comparaba el nombre crudo, así que "Sándwich pollo" y "Sandwich pollo"
 * entraban como productos distintos y el aviso ni aparecía. Cada duplicado
 * arrastró un insumo espejo propio, y de ahí salió el inventario partido en dos.
 *
 * El chequeo mira productos contra productos: que un insumo se llame igual es
 * otra cosa —puede ser el ingrediente de una receta— y no tiene por qué frenar
 * el alta de un producto.
 */
describe('alta y edición de productos — homónimos', () => {
  const ts = Date.now();
  const NOMBRE = `Brownie duplicado ${ts}`;
  let centroId: number;
  let marcaId: number;
  let token: string;
  let productoExistente: number;
  const creados = { insumos: [] as number[], productos: [] as number[] };

  const alta = (nombre: string, extra: Record<string, unknown> = {}) =>
    new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        centro_id: centroId,
        nombre,
        descripcion: 'fixture homónimos',
        precio: 20,
        tipo: 'REVENTA',
        estado_publicacion: 'BORRADOR',
        marcas: [marcaId],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 5, costo_unitario: 10 },
        ...extra,
      }),
    });

  const registrar = (body: { data?: { id?: number; insumo_reventa_id?: number | null } }) => {
    if (body.data?.id) creados.productos.push(body.data.id);
    if (body.data?.insumo_reventa_id) creados.insumos.push(body.data.insumo_reventa_id);
  };

  beforeAll(async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    token = access_token;
    const centro = await prisma.centroProduccion.findFirst({ where: { activo: true } })
      ?? await prisma.centroProduccion.create({ data: { nombre: `Centro homónimos ${ts}` } });
    centroId = centro.id;
    marcaId = (await prisma.marca.findFirstOrThrow()).id;

    // El producto que ya está en la carta, con su renglón de inventario.
    const insumo = await prisma.insumo.create({
      data: { nombre: NOMBRE, stock_actual: 0, stock_minimo: 0, unidad_medida: 'UNIDAD', costo_promedio: 10 },
    });
    creados.insumos.push(insumo.id);
    const producto = await prisma.producto.create({
      data: {
        nombre: NOMBRE, descripcion: 'el de la carta', precio: 20, tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO', insumo_reventa_id: insumo.id,
      },
    });
    productoExistente = producto.id;
    creados.productos.push(producto.id);
  });

  afterAll(async () => {
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.movimientoCentro.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.stockCentro.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.producto.updateMany({
      where: { id: { in: creados.productos } }, data: { insumo_reventa_id: null },
    });
    await prisma.productoSucursal.deleteMany({ where: { producto_id: { in: creados.productos } } });
    await prisma.producto.deleteMany({ where: { id: { in: creados.productos } } });
    await prisma.insumo.deleteMany({ where: { id: { in: creados.insumos } } });
  });

  it('avisa del producto que ya existe y ofrece el que está en la carta', async () => {
    const res = await POST(alta(NOMBRE));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('PRODUCTO_DUPLICADO');
    expect(body.producto.id).toBe(productoExistente);
  });

  it('avisa aunque cambien tildes, mayúsculas y espacios', async () => {
    // Exactamente las variantes que pasaban limpio: los duplicados reales
    // difieren en una tilde ("Sándwich pollo") o en un espacio ("Brownie ").
    const res = await POST(alta(`  BRÓWNIE   DUPLICADO ${ts} `));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('PRODUCTO_DUPLICADO');
  });

  it('no crea nada cuando avisa', async () => {
    const cuantos = await prisma.producto.count({
      where: { nombre: { contains: `duplicado ${ts}`, mode: 'insensitive' } },
    });
    expect(cuantos).toBe(1);
  });

  it('deja pasar un nombre distinto', async () => {
    const res = await POST(alta(`Brownie distinto ${ts}`));
    const body = await res.json();
    expect(res.status).toBe(201);
    registrar(body);
  });

  it('no mira los insumos: un producto puede llamarse como un insumo de receta', async () => {
    // "Miel" como producto envasado y "Miel" como ingrediente a granel son dos
    // cosas legítimas. El chequeo de productos no tiene por qué impedirlo.
    const ingrediente = await prisma.insumo.create({
      data: { nombre: `Miel granel ${ts}`, stock_actual: 0, stock_minimo: 0, unidad_medida: 'GR', costo_promedio: 1 },
    });
    creados.insumos.push(ingrediente.id);

    const res = await POST(alta(`Miel granel ${ts}`));
    const body = await res.json();
    expect(res.status).toBe(201);
    registrar(body);
  });

  it('también avisa al renombrar un producto para que se llame como otro', async () => {
    const suelto = await prisma.producto.create({
      data: { nombre: `Producto suelto ${ts}`, descripcion: 'x', precio: 10, tipo: 'REVENTA', estado_publicacion: 'BORRADOR' },
    });
    creados.productos.push(suelto.id);

    const req = new NextRequest(`http://localhost/api/admin/productos/${suelto.id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: NOMBRE,
        descripcion: 'intenta robarle el nombre al de la carta',
        precio: 20,
        tipo: 'REVENTA',
        estado_publicacion: 'BORRADOR',
        marcas: [marcaId],
      }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: String(suelto.id) }) });
    expect(res.status).toBe(409);
  });

  it('renombrar un producto sin cambiarle el nombre no se bloquea a sí mismo', async () => {
    const req = new NextRequest(`http://localhost/api/admin/productos/${productoExistente}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: NOMBRE,
        descripcion: 'se edita a sí mismo',
        precio: 25,
        tipo: 'REVENTA',
        // BORRADOR a propósito: publicar exige la ficha completa y acá lo que
        // se verifica es que el chequeo de homónimos se excluya a sí mismo.
        estado_publicacion: 'BORRADOR',
        marcas: [marcaId],
      }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: String(productoExistente) }) });
    expect(res.status).toBe(200);
  });
});
