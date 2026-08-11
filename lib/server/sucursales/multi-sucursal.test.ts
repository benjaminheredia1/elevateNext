/**
 * Núcleo multi-sucursal: alcance por rol, catálogo/receta por sucursal y stock
 * por local con transferencias. Cubre las reglas que, si se rompen, mezclan
 * datos entre sucursales sin que ningún test existente lo note.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { alcanceSucursal, resolverSucursal, sucursalPorDefectoId, SIN_ALCANCE } from './sucursal.service';
import { ForbiddenError } from '@/lib/server/auth/session';
import {
  habilitarProductoEnSucursal,
  precioEnSucursal,
  catalogoDeSucursal,
} from '@/lib/server/productos/catalogo-sucursal.service';
import {
  ajustarStock,
  transferirStock,
  obtenerOCrearStock,
} from '@/lib/server/inventario/stock-sucursal.service';
import { calcularRinde } from '@/lib/server/inventario/disponibilidad';
import { costoFichaTecnica } from '@/lib/server/inventario/inventario.service';

const MARCADOR = `multi-sucursal-${Date.now()}`;
let principalId: number;
let segundaId: number;
let productoId: number;
let insumoId: number;

beforeAll(async () => {
  principalId = await sucursalPorDefectoId();

  const segunda = await prisma.sucursal.create({
    data: { nombre: `${MARCADOR} Sucursal B`, activa: true },
  });
  segundaId = segunda.id;

  const insumo = await prisma.insumo.create({
    data: { nombre: `${MARCADOR} insumo`, stock_actual: 0, stock_minimo: 1, unidad_medida: 'KG', costo_promedio: 10 },
  });
  insumoId = insumo.id;

  const producto = await prisma.producto.create({
    data: {
      nombre: `${MARCADOR} producto`,
      descripcion: 'fixture',
      precio: 30,
      estado_publicacion: 'PUBLICADO',
      recetaProducto_id: {
        create: [{ insumo_id: insumo.id, sucursal_id: principalId, cantidad_utilizada: 0.2 }],
      },
    },
  });
  productoId = producto.id;
  await habilitarProductoEnSucursal(producto.id, principalId, { precio: 30 });
});

afterAll(async () => {
  await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
  await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.movimientoInterno.deleteMany({ where: { insumo_id: insumoId } });
  await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
  await prisma.insumo.deleteMany({ where: { id: insumoId } });
  await prisma.sucursal.deleteMany({ where: { id: segundaId } });
});

describe('alcance por rol', () => {
  it('solo el dueño ve la sucursal que pida, o todas', () => {
    expect(alcanceSucursal({ rol: 'DUENO', sucursal_id: 1 }, 7)).toBe(7);
    expect(alcanceSucursal({ rol: 'DUENO', sucursal_id: 1 }, undefined)).toBeUndefined();
  });

  it('el admin con una sola sucursal solo puede verla a ella', () => {
    expect(alcanceSucursal({ rol: 'ADMIN', sucursal_id: 2, sucursales: [2] }, undefined)).toBe(2);
    // Pedir el local de al lado se corta acá, no se ignora en silencio.
    expect(() => alcanceSucursal({ rol: 'ADMIN', sucursal_id: 2, sucursales: [2] }, 99)).toThrow(ForbiddenError);
  });

  it('el admin con varias sucursales elige entre las suyas, y solo entre esas', () => {
    const admin = { rol: 'ADMIN', sucursal_id: 2, sucursales: [2, 5, 8] };
    expect(alcanceSucursal(admin, 5)).toBe(5);
    expect(alcanceSucursal(admin, 8)).toBe(8);
    // Sin pedir nada cae a su principal: nunca al agregado de todo el negocio.
    expect(alcanceSucursal(admin, undefined)).toBe(2);
    expect(() => alcanceSucursal(admin, 99)).toThrow(ForbiddenError);
  });

  it('la sucursal principal cuenta como alcance aunque no esté en la lista', () => {
    // Usuario dado de alta antes de la tabla puente: no puede quedarse ciego.
    expect(alcanceSucursal({ rol: 'ADMIN', sucursal_id: 4, sucursales: [] }, 4)).toBe(4);
  });

  it('el cajero queda encerrado en su sucursal aunque pida otra', () => {
    expect(alcanceSucursal({ rol: 'CAJERO', sucursal_id: 3, sucursales: [3] }, undefined)).toBe(3);
    expect(() => alcanceSucursal({ rol: 'CAJERO', sucursal_id: 3, sucursales: [3] }, 99)).toThrow(ForbiddenError);
  });

  it('sin sucursal asignada no ve nada, en vez de ver todo el negocio', () => {
    expect(alcanceSucursal({ rol: 'ADMIN', sucursal_id: null, sucursales: [] })).toBe(SIN_ALCANCE);
    expect(alcanceSucursal({ rol: 'CAJERO', sucursal_id: null, sucursales: [] })).toBe(SIN_ALCANCE);
  });
});

describe('resolverSucursal', () => {
  it('cae a la principal cuando no se indica ninguna', async () => {
    expect(await resolverSucursal(undefined)).toBe(principalId);
  });

  it('rechaza una sucursal inexistente', async () => {
    await expect(resolverSucursal(999999)).rejects.toThrow();
  });

  it('rechaza una sucursal desactivada', async () => {
    const inactiva = await prisma.sucursal.create({
      data: { nombre: `${MARCADOR} inactiva`, activa: false },
    });
    await expect(resolverSucursal(inactiva.id)).rejects.toThrow(/desactivada/i);
    await prisma.sucursal.delete({ where: { id: inactiva.id } });
  });
});

describe('catálogo por sucursal', () => {
  it('un producto no habilitado no se vende en esa sucursal', async () => {
    expect(await precioEnSucursal(productoId, segundaId)).toBeNull();
  });

  it('al habilitarlo copia la receta de origen y respeta su propio precio', async () => {
    await habilitarProductoEnSucursal(productoId, segundaId, {
      precio: 38,
      copiar_receta_de: principalId,
    });

    expect(await precioEnSucursal(productoId, segundaId)).toBe(38);
    // El precio de la sucursal original no se toca.
    expect(await precioEnSucursal(productoId, principalId)).toBe(30);

    const recetaB = await prisma.recetasProducto.findMany({
      where: { producto_id: productoId, sucursal_id: segundaId },
    });
    expect(recetaB).toHaveLength(1);
    expect(recetaB[0].cantidad_utilizada).toBe(0.2);
  });

  it('editar la receta de una sucursal no afecta a la otra', async () => {
    await prisma.recetasProducto.updateMany({
      where: { producto_id: productoId, sucursal_id: segundaId },
      data: { cantidad_utilizada: 0.35 },
    });

    const enPrincipal = await prisma.recetasProducto.findFirst({
      where: { producto_id: productoId, sucursal_id: principalId },
    });
    expect(enPrincipal?.cantidad_utilizada).toBe(0.2);
  });

  it('el nombre propio de la sucursal se impone sobre el del catálogo', async () => {
    await habilitarProductoEnSucursal(productoId, segundaId, { nombre: 'Nombre local B' });
    const catalogo = await catalogoDeSucursal(segundaId);
    const fila = catalogo.find(p => p.producto_id === productoId);
    expect(fila?.nombre).toBe('Nombre local B');
    expect(fila?.personalizado).toBe(true);
  });
});

describe('stock por sucursal', () => {
  it('cada sucursal arranca en cero y el agregado suma ambas', async () => {
    await ajustarStock(prisma, insumoId, principalId, 10);
    await ajustarStock(prisma, insumoId, segundaId, 4);

    const enA = await obtenerOCrearStock(insumoId, principalId);
    const enB = await obtenerOCrearStock(insumoId, segundaId);
    expect(enA.stock_actual).toBe(10);
    expect(enB.stock_actual).toBe(4);

    const insumo = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    expect(insumo.stock_actual).toBe(14);
  });

  it('la transferencia mueve stock entre locales sin cambiar el total del negocio', async () => {
    const antes = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });

    await transferirStock({
      insumoId,
      desdeSucursal: principalId,
      haciaSucursal: segundaId,
      cantidad: 3,
    });

    const enA = await obtenerOCrearStock(insumoId, principalId);
    const enB = await obtenerOCrearStock(insumoId, segundaId);
    expect(enA.stock_actual).toBe(7);
    expect(enB.stock_actual).toBe(7);

    const despues = await prisma.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    expect(despues.stock_actual).toBe(antes.stock_actual);

    // Queda rastro en ambos locales.
    const movimientos = await prisma.movimientoInterno.findMany({ where: { insumo_id: insumoId } });
    expect(movimientos.filter(m => m.sucursal_id === principalId && m.cantidad < 0)).not.toHaveLength(0);
    expect(movimientos.filter(m => m.sucursal_id === segundaId && m.cantidad > 0)).not.toHaveLength(0);
  });

  it('no deja transferir más de lo que hay en el origen', async () => {
    await expect(transferirStock({
      insumoId,
      desdeSucursal: principalId,
      haciaSucursal: segundaId,
      cantidad: 9999,
    })).rejects.toThrow(/insuficiente/i);
  });

  it('no deja transferir a la misma sucursal', async () => {
    await expect(transferirStock({
      insumoId,
      desdeSucursal: principalId,
      haciaSucursal: principalId,
      cantidad: 1,
    })).rejects.toThrow(/distintas/i);
  });
});

describe('disponibilidad por local (el escenario peligroso)', () => {
  it('un producto sin stock en su sucursal sale agotado aunque la otra tenga de sobra', async () => {
    // A abastecida, B en cero: con el stock agregado del negocio (50 + 0) el
    // producto parecía disponible en B y se podía vender lo que no había.
    await prisma.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: principalId } },
      data: { stock_actual: 50 },
    });
    await prisma.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: segundaId } },
      data: { stock_actual: 0 },
    });

    const paraSucursal = (sucursal: number) => prisma.producto.findUniqueOrThrow({
      where: { id: productoId },
      include: {
        recetaProducto_id: {
          where: { sucursal_id: sucursal },
          include: { insumo: { include: { stocks: { where: { sucursal_id: sucursal } } } } },
        },
      },
    });

    const enB = calcularRinde(await paraSucursal(segundaId));
    expect(enB.stockTracked).toBe(true);
    expect(enB.agotado).toBe(true);

    // Y en A, que sí tiene stock, sigue disponible.
    const enA = calcularRinde(await paraSucursal(principalId));
    expect(enA.agotado).toBe(false);
    expect(enA.rinde).toBeGreaterThan(0);
  });

  it('el costo de receta usa el costo del local, no el promedio del negocio', async () => {
    // Mismo insumo, distinto proveedor en cada local.
    await prisma.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: principalId } },
      data: { costo_promedio: 10 },
    });
    await prisma.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: segundaId } },
      data: { costo_promedio: 30 },
    });

    const costoA = await costoFichaTecnica(productoId, undefined, principalId);
    const costoB = await costoFichaTecnica(productoId, undefined, segundaId);

    // A: 0.2 kg × 10 = 2. B: 0.35 kg × 30 = 10.5 (receta y costo propios).
    expect(costoA).toBeCloseTo(2, 5);
    expect(costoB).toBeCloseTo(10.5, 5);
    expect(costoB).toBeGreaterThan(costoA);
  });
});

describe('alertas de stock por local', () => {
  it('detecta el faltante de una sucursal aunque el total del negocio alcance', async () => {
    // A con stock de sobra, B en cero: con el agregado (7 + 7 = 14) el insumo
    // parecía sano y la alerta nunca saltaba para B.
    await prisma.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: principalId } },
      data: { stock_actual: 50, stock_minimo: 1 },
    });
    await prisma.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: segundaId } },
      data: { stock_actual: 0, stock_minimo: 5 },
    });

    const filas = await prisma.stockSucursal.findMany({ where: { insumo_id: insumoId } });
    const enFalta = filas.filter(f => f.stock_actual <= f.stock_minimo);

    expect(enFalta).toHaveLength(1);
    expect(enFalta[0].sucursal_id).toBe(segundaId);

    // El agregado del negocio, en cambio, no delataría el problema.
    const total = filas.reduce((acc, f) => acc + f.stock_actual, 0);
    expect(total).toBeGreaterThan(enFalta[0].stock_minimo);
  });
});
