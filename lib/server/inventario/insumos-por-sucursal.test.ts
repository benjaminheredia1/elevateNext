/**
 * El inventario es de cada sucursal: qué insumos maneja, con qué mínimos y con
 * cuánto stock. Tener fila en StockSucursal es lo que define que el local
 * maneja el insumo — el equivalente de la habilitación de un producto.
 *
 * Lo que se cuida acá: que traer insumos de otro local no mueva mercadería, que
 * sacarlos nunca borre el insumo del negocio, y que traer un producto elaborado
 * arrastre los insumos de su receta al inventario del destino.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { login } from '@/lib/auth';
import { GET as LISTAR_INSUMOS } from '@/app/api/insumo/route';
import { copiarInsumosASucursal, quitarInsumoDeSucursal } from './stock-sucursal.service';
import { habilitarProductoEnSucursal } from '@/lib/server/productos/catalogo-sucursal.service';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const MARCADOR = `insumos-sucursal-${Date.now()}`;

let token: string;
let sucursalA: number;
let sucursalB: number;
let insumoA: number;
let insumoReceta: number;
let productoId: number;

/** Ids de insumo que la API devuelve para una sucursal. */
async function inventarioDe(sucursalId: number, extra = '') {
  const req = new NextRequest(`http://localhost/api/insumo?sucursal=${sucursalId}${extra}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await (await LISTAR_INSUMOS(req)).json();
  return (body as { id: number }[]).map(i => i.id);
}

beforeAll(async () => {
  token = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
  sucursalA = await sucursalPorDefectoId();
  sucursalB = (await prisma.sucursal.create({ data: { nombre: `${MARCADOR} B`, activa: true } })).id;

  const crearInsumo = async (nombre: string, stock: number) => {
    const insumo = await prisma.insumo.create({
      data: { nombre, stock_actual: stock, stock_minimo: 5, punto_critico: 2, unidad_medida: 'KG', costo_promedio: 7 },
    });
    await prisma.stockSucursal.create({
      data: { insumo_id: insumo.id, sucursal_id: sucursalA, stock_actual: stock, costo_promedio: 7, stock_minimo: 5, punto_critico: 2 },
    });
    return insumo.id;
  };

  insumoA = await crearInsumo(`${MARCADOR} solo en A`, 40);
  insumoReceta = await crearInsumo(`${MARCADOR} de receta`, 25);

  productoId = (await prisma.producto.create({
    data: {
      nombre: `${MARCADOR} elaborado`,
      descripcion: 'fixture',
      precio: 50,
      tipo: 'ELABORADO',
      estado_publicacion: 'PUBLICADO',
      recetaProducto_id: { create: [{ insumo_id: insumoReceta, sucursal_id: sucursalA, cantidad_utilizada: 0.3 }] },
    },
  })).id;
  await habilitarProductoEnSucursal(productoId, sucursalA, { precio: 50 });
});

afterAll(async () => {
  await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
  await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: [insumoA, insumoReceta] } } });
  await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: [insumoA, insumoReceta] } } });
  await prisma.insumo.deleteMany({ where: { id: { in: [insumoA, insumoReceta] } } });
  await prisma.sucursal.deleteMany({ where: { id: sucursalB } });
});

describe('listado de insumos por sucursal', () => {
  it('cada local ve solo los insumos que maneja', async () => {
    expect(await inventarioDe(sucursalA)).toContain(insumoA);
    expect(await inventarioDe(sucursalB)).not.toContain(insumoA);
  });

  it('`incluir_ids` deja ver un insumo que el local no maneja, marcándolo', async () => {
    const req = new NextRequest(
      `http://localhost/api/insumo?sucursal=${sucursalB}&incluir_ids=${insumoA}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    const body = await (await LISTAR_INSUMOS(req)).json();
    const fila = (body as { id: number; en_sucursal: boolean; stock_actual: number }[]).find(i => i.id === insumoA);

    expect(fila).toBeTruthy();
    // Se muestra para no romper la receta que lo usa, pero el local no lo tiene.
    expect(fila!.en_sucursal).toBe(false);
    expect(fila!.stock_actual).toBe(0);
  });
});

describe('traer insumos de otra sucursal', () => {
  it('entran con stock en cero: la mercadería no se mueve', async () => {
    const { copiados } = await copiarInsumosASucursal({
      origen: sucursalA, destino: sucursalB, insumos: [insumoA],
    });
    expect(copiados).toBe(1);

    const enB = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: insumoA, sucursal_id: sucursalB } },
    });
    expect(enB.stock_actual).toBe(0);
    // Los mínimos se heredan del origen y A no pierde su stock.
    expect(enB.stock_minimo).toBe(5);
    const enA = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: insumoA, sucursal_id: sucursalA } },
    });
    expect(enA.stock_actual).toBe(40);
  });
});

describe('quitar un insumo del inventario de un local', () => {
  it('saca la fila del local sin eliminar el insumo del negocio', async () => {
    await quitarInsumoDeSucursal(insumoA, sucursalB);

    expect(await prisma.stockSucursal.findUnique({
      where: { insumo_id_sucursal_id: { insumo_id: insumoA, sucursal_id: sucursalB } },
    })).toBeNull();
    // El insumo sigue existiendo, y A lo sigue manejando con su stock.
    expect(await prisma.insumo.findUnique({ where: { id: insumoA } })).not.toBeNull();
    expect(await inventarioDe(sucursalA)).toContain(insumoA);
  });

  it('se niega si el local tiene stock, en vez de perder existencias', async () => {
    await copiarInsumosASucursal({ origen: sucursalA, destino: sucursalB, insumos: [insumoA] });
    await prisma.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoA, sucursal_id: sucursalB } },
      data: { stock_actual: 3 },
    });

    await expect(quitarInsumoDeSucursal(insumoA, sucursalB)).rejects.toThrow(/stock/i);
    // Nada se borró.
    expect(await prisma.stockSucursal.findUnique({
      where: { insumo_id_sucursal_id: { insumo_id: insumoA, sucursal_id: sucursalB } },
    })).not.toBeNull();
  });

  it('se niega si el local ya movió ese insumo', async () => {
    await prisma.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoA, sucursal_id: sucursalB } },
      data: { stock_actual: 0 },
    });
    const movimiento = await prisma.movimientoInterno.create({
      data: {
        insumo_id: insumoA, sucursal_id: sucursalB, tipo_movimiento: 'AJUSTE',
        cantidad: 1, descripcion: `${MARCADOR} movimiento`,
      },
    });

    await expect(quitarInsumoDeSucursal(insumoA, sucursalB)).rejects.toThrow(/movimiento/i);

    await prisma.movimientoInterno.delete({ where: { id: movimiento.id } });
  });
});

describe('traer un producto elaborado de A a B', () => {
  it('arrastra los insumos de su receta al inventario de B, en cero', async () => {
    expect(await inventarioDe(sucursalB)).not.toContain(insumoReceta);

    await habilitarProductoEnSucursal(productoId, sucursalB, { precio: 50, copiar_receta_de: sucursalA });

    // La receta llegó…
    const recetaB = await prisma.recetasProducto.findMany({
      where: { producto_id: productoId, sucursal_id: sucursalB },
    });
    expect(recetaB).toHaveLength(1);

    // …y sus insumos ahora están en el inventario de B, con stock en cero.
    const enB = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: insumoReceta, sucursal_id: sucursalB } },
    });
    expect(enB.stock_actual).toBe(0);
    expect(await inventarioDe(sucursalB)).toContain(insumoReceta);

    // A conserva su stock intacto.
    const enA = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: insumoReceta, sucursal_id: sucursalA } },
    });
    expect(enA.stock_actual).toBe(25);
  });
});
