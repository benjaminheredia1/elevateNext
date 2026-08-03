/**
 * Herencia explícita entre el catálogo y la ficha de cada sucursal.
 *
 * Antes la herencia se deducía por igualdad: un valor idéntico al del catálogo
 * se guardaba como heredado, lo que hacía imposible "congelar" un valor y no se
 * veía en pantalla. Ahora la decide el usuario campo por campo, y el mapa
 * `heredado` es lo que se lo muestra.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { login } from '@/lib/auth';
import { PUT, GET } from '@/app/api/admin/productos/[id]/route';
import { habilitarProductoEnSucursal } from '@/lib/server/productos/catalogo-sucursal.service';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';
import { mapaHerencia, resolverProducto } from './overrides';

const MARCADOR = `herencia-${Date.now()}`;

let token: string;
let sucursalA: number;
let sucursalB: number;
let productoId: number;

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

/** Guarda la ficha desde una sucursal, declarando qué queda heredado. */
async function guardarEnSucursal(body: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/admin/productos/${productoId}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      nombre: 'Pan catálogo', descripcion: 'del catálogo', precio: 30,
      tipo: 'ELABORADO', estado_publicacion: 'BORRADOR',
      categorias: [], marcas: [], receta: [],
      ...body,
    }),
  });
  const res = await PUT(req, params(productoId));
  expect(res.status).toBe(200);
  return res.json();
}

const fichaB = () => prisma.productoSucursal.findUniqueOrThrow({
  where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalB } },
});

beforeAll(async () => {
  token = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
  sucursalA = await sucursalPorDefectoId();
  sucursalB = (await prisma.sucursal.create({ data: { nombre: `${MARCADOR} B`, activa: true } })).id;

  productoId = (await prisma.producto.create({
    data: { nombre: 'Pan catálogo', descripcion: 'del catálogo', precio: 30, tipo: 'ELABORADO', estado_publicacion: 'BORRADOR' },
  })).id;
  await habilitarProductoEnSucursal(productoId, sucursalA, { precio: 30 });
  await habilitarProductoEnSucursal(productoId, sucursalB, { precio: 35 });
});

afterAll(async () => {
  await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.sucursal.deleteMany({ where: { id: sucursalB } });
});

describe('mapaHerencia', () => {
  it('marca heredado lo que está en null y propio lo escrito', () => {
    const mapa = mapaHerencia(
      { categoria_id: [], marcas: [] },
      { nombre: 'Pan de Sur', descripcion: null },
      7,
    );
    expect(mapa.nombre).toBe(false);      // propio
    expect(mapa.descripcion).toBe(true);  // heredado
    expect(mapa.categorias).toBe(true);   // sin filas propias
  });

  it('en consolidado nada se hereda: se edita el catálogo', () => {
    const mapa = mapaHerencia({ categoria_id: [], marcas: [] }, null, null);
    expect(Object.values(mapa).every(v => v === false)).toBe(true);
  });
});

describe('guardar desde una sucursal con `heredar` explícito', () => {
  it('congela un valor idéntico al del catálogo si no se declara heredado', async () => {
    await guardarEnSucursal({
      sucursal_id: sucursalB,
      nombre: 'Pan catálogo', // mismo texto que el catálogo…
      heredar: ['descripcion', 'imagen_url', 'calorias', 'proteina', 'estado_publicacion', 'categorias', 'marcas'],
    });

    // …pero queda PROPIO, porque no se declaró heredado. Esto es lo que antes
    // era imposible: la igualdad lo mandaba a null.
    expect((await fichaB()).nombre).toBe('Pan catálogo');
    expect((await fichaB()).descripcion).toBeNull();
  });

  it('un cambio del catálogo no toca el campo congelado, pero sí los heredados', async () => {
    await prisma.producto.update({
      where: { id: productoId },
      data: { nombre: 'Pan nuevo', descripcion: 'descripción nueva' },
    });

    const req = new NextRequest(`http://localhost/api/admin/productos/${productoId}?sucursal=${sucursalB}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const { data } = await (await GET(req, params(productoId))).json();

    expect(data.nombre).toBe('Pan catálogo');          // congelado
    expect(data.descripcion).toBe('descripción nueva'); // heredado, siguió al catálogo
    expect(data.heredado.nombre).toBe(false);
    expect(data.heredado.descripcion).toBe(true);
  });

  it('declarar el campo como heredado lo devuelve al catálogo', async () => {
    await guardarEnSucursal({
      sucursal_id: sucursalB,
      nombre: 'Pan catálogo',
      heredar: ['nombre', 'descripcion', 'imagen_url', 'calorias', 'proteina', 'estado_publicacion', 'categorias', 'marcas'],
    });

    expect((await fichaB()).nombre).toBeNull();
    // Y al leerlo, muestra el del catálogo.
    const prod = await prisma.producto.findUniqueOrThrow({
      where: { id: productoId },
      include: { sucursales: { where: { sucursal_id: sucursalB } } },
    });
    expect(resolverProducto(prod, sucursalB).nombre).toBe('Pan nuevo');
  });

  it('sin `heredar` (clientes viejos) sigue valiendo la regla de igualdad', async () => {
    await guardarEnSucursal({ sucursal_id: sucursalB, nombre: 'Pan nuevo' });
    // Coincide con el catálogo → hereda.
    expect((await fichaB()).nombre).toBeNull();

    await guardarEnSucursal({ sucursal_id: sucursalB, nombre: 'Pan de Sur' });
    expect((await fichaB()).nombre).toBe('Pan de Sur');
  });

  it('editar el catálogo no marca herencia y no toca a la sucursal', async () => {
    await guardarEnSucursal({ nombre: 'Pan del dueño', descripcion: 'editada por el dueño' });

    expect((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).nombre).toBe('Pan del dueño');
    // B conserva su nombre propio.
    expect((await fichaB()).nombre).toBe('Pan de Sur');
  });
});
