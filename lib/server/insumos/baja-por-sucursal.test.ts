/**
 * Baja de insumo y revisión de producto POR SUCURSAL.
 *
 * El escenario que se cuida: traigo un producto elaborado de A a B y doy de
 * baja en B uno de los insumos de su receta. En B el insumo queda de baja y el
 * producto pasa a revisión; en A no cambia absolutamente nada, aunque sea el
 * mismo producto y el mismo insumo.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import {
  darDeBajaInsumo,
  reactivarInsumo,
  resolverProductoEnRevision,
  listarProductosEnRevision,
} from './insumos.service';
import { habilitarProductoEnSucursal } from '@/lib/server/productos/catalogo-sucursal.service';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const MARCADOR = `baja-sucursal-${Date.now()}`;

let sucursalA: number;
let sucursalB: number;
let insumoId: number;
let productoId: number;

const enA = () => prisma.stockSucursal.findUniqueOrThrow({
  where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalA } },
});
const enB = () => prisma.stockSucursal.findUniqueOrThrow({
  where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalB } },
});
const productoEnA = () => prisma.productoSucursal.findUniqueOrThrow({
  where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalA } },
});
const productoEnB = () => prisma.productoSucursal.findUniqueOrThrow({
  where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalB } },
});

beforeAll(async () => {
  sucursalA = await sucursalPorDefectoId();
  sucursalB = (await prisma.sucursal.create({ data: { nombre: `${MARCADOR} B`, activa: true } })).id;

  const insumo = await prisma.insumo.create({
    data: { nombre: `${MARCADOR} harina`, stock_actual: 10, stock_minimo: 1, punto_critico: 0, unidad_medida: 'KG', costo_promedio: 5 },
  });
  insumoId = insumo.id;
  await prisma.stockSucursal.create({
    data: { insumo_id: insumoId, sucursal_id: sucursalA, stock_actual: 10, costo_promedio: 5, stock_minimo: 1, punto_critico: 0 },
  });

  productoId = (await prisma.producto.create({
    data: {
      nombre: `${MARCADOR} pan`,
      descripcion: 'fixture',
      precio: 20,
      tipo: 'ELABORADO',
      estado_publicacion: 'PUBLICADO',
      recetaProducto_id: { create: [{ insumo_id: insumoId, sucursal_id: sucursalA, cantidad_utilizada: 0.2 }] },
    },
  })).id;

  await habilitarProductoEnSucursal(productoId, sucursalA, { precio: 20 });
  // Se trae a B: copia la receta y mete el insumo en el inventario de B en cero.
  await habilitarProductoEnSucursal(productoId, sucursalB, { precio: 25, copiar_receta_de: sucursalA });
});

afterAll(async () => {
  await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
  await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
  await prisma.insumo.deleteMany({ where: { id: insumoId } });
  await prisma.sucursal.deleteMany({ where: { id: sucursalB } });
});

describe('dar de baja un insumo en B', () => {
  it('lo deja de baja en B y activo en A', async () => {
    const resultado = await darDeBajaInsumo(insumoId, 'Ya no se usa acá', sucursalB);

    expect((await enB()).activo).toBe(false);
    expect((await enB()).motivo_baja).toBe('Ya no se usa acá');
    expect((await enA()).activo).toBe(true);
    expect((await enA()).motivo_baja).toBeNull();
    expect(resultado.productosEnRevision).toBe(1);
  });

  it('manda a revisión el producto de B pero no el de A', async () => {
    expect((await productoEnB()).en_revision).toBe(true);
    expect((await productoEnB()).insumo_causa_revision_id).toBe(insumoId);
    expect((await productoEnA()).en_revision).toBe(false);
  });

  it('el insumo sigue activo para el negocio mientras algún local lo use', async () => {
    // El agregado solo se apaga cuando ninguna sucursal lo usa.
    expect((await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } })).activo).toBe(true);
  });

  it('la lista de revisión es la del local', async () => {
    const deB = await listarProductosEnRevision(sucursalB);
    const deA = await listarProductosEnRevision(sucursalA);

    expect(deB.map(p => p.id)).toContain(productoId);
    expect(deA.map(p => p.id)).not.toContain(productoId);
  });

  it('no se puede dar de baja dos veces en el mismo local', async () => {
    await expect(darDeBajaInsumo(insumoId, 'otra vez', sucursalB)).rejects.toThrow(/ya está de baja/i);
  });

  it('no se puede dar de baja donde el local no maneja el insumo', async () => {
    const sinInsumo = await prisma.sucursal.create({ data: { nombre: `${MARCADOR} C`, activa: true } });
    await expect(darDeBajaInsumo(insumoId, 'no lo tengo', sinInsumo.id)).rejects.toThrow(/inventario de esa sucursal/i);
    await prisma.sucursal.delete({ where: { id: sinInsumo.id } });
  });
});

describe('resolver y reactivar, también por local', () => {
  it('resolver la revisión en B no toca a A', async () => {
    await resolverProductoEnRevision(productoId, sucursalB);

    expect((await productoEnB()).en_revision).toBe(false);
    expect((await productoEnA()).en_revision).toBe(false);
    // El agregado se apaga porque ya ningún local está en revisión.
    expect((await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).en_revision).toBe(false);
  });

  it('reactivar en B devuelve el insumo solo a B', async () => {
    await reactivarInsumo(insumoId, sucursalB);

    expect((await enB()).activo).toBe(true);
    expect((await enB()).motivo_baja).toBeNull();
    expect((await enA()).activo).toBe(true);
  });

  it('con todos los locales de baja, el insumo queda de baja para el negocio', async () => {
    await darDeBajaInsumo(insumoId, 'fuera de B', sucursalB);
    await darDeBajaInsumo(insumoId, 'fuera de A', sucursalA);

    expect((await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } })).activo).toBe(false);

    // Y vuelve a estar activo apenas un local lo recupera.
    await reactivarInsumo(insumoId, sucursalA);
    expect((await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } })).activo).toBe(true);
  });
});
