import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

describe('POST /api/admin/productos', () => {
  const createdIds: number[] = [];
  const createdInsumoIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.producto.deleteMany({ where: { id: { in: createdIds } } });
    }
    if (createdInsumoIds.length > 0) {
      await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: createdInsumoIds } } });
      await prisma.insumo.deleteMany({ where: { id: { in: createdInsumoIds } } });
    }
  });

  it('publica un producto sin imagen_url', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const marca = await prisma.marca.findFirstOrThrow();

    const request = new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Producto de test sin foto',
        descripcion: 'Creado por el test de integracion',
        precio: 20,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        marcas: [marca.id],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 5, costo_unitario: 10 },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.estado_publicacion).toBe('PUBLICADO');
    expect(body.data.imagen_url).toBeNull();

    createdIds.push(body.data.id);
    if (body.data.insumo_reventa_id) {
      createdInsumoIds.push(body.data.insumo_reventa_id);
    }
  });

  it('registra un movimiento INGRESO por el stock inicial del insumo de reventa', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const marca = await prisma.marca.findFirstOrThrow();

    const request = new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Producto reventa con stock inicial (test)',
        descripcion: 'x',
        precio: 15,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        marcas: [marca.id],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 20, costo_unitario: 7 },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    createdIds.push(body.data.id);
    createdInsumoIds.push(body.data.insumo_reventa_id);

    const movimientos = await prisma.movimientoInterno.findMany({
      where: { insumo_id: body.data.insumo_reventa_id },
    });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].tipo_movimiento).toBe('INGRESO');
    expect(movimientos[0].cantidad).toBe(20);
    expect(movimientos[0].costo_unitario).toBe(7);
  });

  it('rechaza con 422 un producto REVENTA que trae receta (exclusión de tipos)', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const nombreUnico = `Reventa con receta invalida (test ${Date.now()})`;
    const insumo = await prisma.insumo.create({
      data: { nombre: `Insumo ${nombreUnico}`, unidad_medida: 'UNIDAD', stock_actual: 10, stock_minimo: 0 },
    });
    createdInsumoIds.push(insumo.id);

    const request = new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: nombreUnico,
        precio: 10,
        tipo: 'REVENTA',
        estado_publicacion: 'BORRADOR',
        receta: [{ insumo_id: insumo.id, cantidad_utilizada: 1 }],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 5, costo_unitario: 3 },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(422);

    const noCreado = await prisma.producto.findFirst({ where: { nombre: nombreUnico } });
    expect(noCreado).toBeNull();
  });

  it('crea un borrador sin descripcion', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');

    const request = new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Producto de test sin descripcion',
        precio: 20,
        tipo: 'REVENTA',
        estado_publicacion: 'BORRADOR',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.descripcion).toBe('');

    createdIds.push(body.data.id);
  });
});

/**
 * Alta de producto desde el Centro de Producción.
 *
 * Lo que se guarda es la receta de PRODUCCIÓN (RecetaCentro), no la de venta:
 * un producto que nace en el Centro no lleva receta en la sucursal, que lo
 * descuenta 1:1 contra su insumo espejo.
 */
describe('POST /api/admin/productos — alta desde el Centro', () => {
  const sufijo = Date.now();
  let centroId: number;
  const productoIds: number[] = [];
  const insumoIds: number[] = [];

  const token = async () => (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;

  const alta = async (access_token: string, cuerpo: Record<string, unknown>) =>
    POST(new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }));

  beforeAll(async () => {
    const centro = await prisma.centroProduccion.create({ data: { nombre: `Centro alta producto ${sufijo}` } });
    centroId = centro.id;
  });

  afterAll(async () => {
    await prisma.recetaCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    // El insumo espejo lo crea el alta, así que se busca por el producto en vez
    // de darlo por conocido.
    const espejos = await prisma.producto.findMany({
      where: { id: { in: productoIds } },
      select: { insumo_reventa_id: true },
    });
    await prisma.producto.deleteMany({ where: { id: { in: productoIds } } });
    const espejoIds = espejos.map(e => e.insumo_reventa_id).filter((id): id is number => id != null);
    await prisma.insumo.deleteMany({ where: { id: { in: [...insumoIds, ...espejoIds] } } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
  });

  it('un alta con centro_id crea la receta en el Centro, no en la sucursal', async () => {
    const access_token = await token();
    const marca = await prisma.marca.findFirstOrThrow();

    const harina = await prisma.insumo.create({
      data: { nombre: `Harina alta ${sufijo}`, unidad_medida: 'GR', stock_actual: 5000, stock_minimo: 0, costo_promedio: 0.01 },
    });
    insumoIds.push(harina.id);
    await prisma.stockCentro.create({
      data: { centro_id: centroId, insumo_id: harina.id, stock_actual: 5000, costo_promedio: 0.01 },
    });

    const response = await alta(access_token, {
      nombre: `Brownie centro ${sufijo}`,
      descripcion: 'x',
      precio: 20,
      tipo: 'ELABORADO',
      estado_publicacion: 'BORRADOR',
      marcas: [marca.id],
      permitir_duplicado: true,
      centro_id: centroId,
      receta_centro: [{ insumo_id: harina.id, cantidad_utilizada: 80 }],
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    productoIds.push(body.data.id);

    const recetaCentro = await prisma.recetaCentro.findMany({ where: { producto_id: body.data.id } });
    expect(recetaCentro).toHaveLength(1);
    expect(recetaCentro[0].cantidad_utilizada).toBe(80);
    expect(recetaCentro[0].centro_id).toBe(centroId);

    // La sucursal no recibe receta: el producto le llega ya terminado.
    const recetaLocal = await prisma.recetasProducto.findMany({ where: { producto_id: body.data.id } });
    expect(recetaLocal).toHaveLength(0);
  });

  /**
   * El motivo por el que el alta y la receta van en la MISMA transacción.
   *
   * El servicio rechaza una receta con insumos que el centro no maneja. Si esa
   * validación corriera después de crear el producto, el operador vería un
   * error y el producto quedaría igual creado, sin receta: al corregir el
   * insumo y reintentar se chocaría con "ya existe un producto llamado así"
   * por un producto que él mismo acaba de crear sin enterarse.
   */
  it('si un insumo de la receta no está en el centro, no queda producto creado', async () => {
    const access_token = await token();
    const marca = await prisma.marca.findFirstOrThrow();
    const nombre = `Brownie huerfano ${sufijo}`;

    // Insumo del catálogo que el centro NO tiene en su inventario.
    const ajeno = await prisma.insumo.create({
      data: { nombre: `Cacao ajeno ${sufijo}`, unidad_medida: 'GR', stock_actual: 100, stock_minimo: 0, costo_promedio: 0.05 },
    });
    insumoIds.push(ajeno.id);

    const response = await alta(access_token, {
      nombre,
      descripcion: 'x',
      precio: 20,
      tipo: 'ELABORADO',
      estado_publicacion: 'BORRADOR',
      marcas: [marca.id],
      permitir_duplicado: true,
      centro_id: centroId,
      receta_centro: [{ insumo_id: ajeno.id, cantidad_utilizada: 10 }],
    });

    expect(response.status).toBe(409);

    const huerfano = await prisma.producto.findFirst({ where: { nombre } });
    expect(huerfano).toBeNull();
  });

  it('una receta de producción sin centro_id se rechaza con 422', async () => {
    const access_token = await token();
    const marca = await prisma.marca.findFirstOrThrow();

    const response = await alta(access_token, {
      nombre: `Brownie sin centro ${sufijo}`,
      descripcion: 'x',
      precio: 20,
      tipo: 'ELABORADO',
      estado_publicacion: 'BORRADOR',
      marcas: [marca.id],
      permitir_duplicado: true,
      receta_centro: [{ insumo_id: 1, cantidad_utilizada: 10 }],
    });

    expect(response.status).toBe(422);
  });
});
