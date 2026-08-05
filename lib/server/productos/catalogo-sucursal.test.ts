/**
 * Quitar un producto del catálogo de una sucursal.
 *
 * Lo que se protege acá es que la operación sea SIEMPRE local: sacar un plato
 * del menú de un local no puede afectar al otro ni romper su histórico.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import {
  habilitarProductoEnSucursal,
  quitarProductoDeSucursal,
  darDeBajaEnSucursal,
  restaurarEnSucursal,
} from './catalogo-sucursal.service';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

describe('quitarProductoDeSucursal', () => {
  let principalId: number;
  let segundaId: number;
  let productoId: number;
  let insumoId: number;

  beforeAll(async () => {
    principalId = await sucursalPorDefectoId();
    const segunda = await prisma.sucursal.create({
      data: { nombre: `Sucursal test quitar ${Date.now()}` },
    });
    segundaId = segunda.id;

    const insumo = await prisma.insumo.create({
      data: {
        nombre: `Insumo test quitar ${Date.now()}`,
        unidad_medida: 'KG',
        stock_actual: 10,
        stock_minimo: 1,
        punto_critico: 0.5,
        costo_promedio: 5,
      },
    });
    insumoId = insumo.id;

    const producto = await prisma.producto.create({
      data: { nombre: `Producto test quitar ${Date.now()}`, descripcion: 'test', precio: 20 },
    });
    productoId = producto.id;

    // Habilitado en las dos, con receta propia en cada una.
    for (const sucursalId of [principalId, segundaId]) {
      await habilitarProductoEnSucursal(productoId, sucursalId, { precio: 20 });
      await prisma.recetasProducto.create({
        data: { producto_id: productoId, insumo_id: insumoId, sucursal_id: sucursalId, cantidad_utilizada: 0.1 },
      });
    }
  });

  afterAll(async () => {
    // Los detalles de venta referencian al producto: se limpian primero o la
    // baja del producto choca con la clave foránea.
    const ventas = await prisma.transaccionesDetalles.findMany({
      where: { producto_id: productoId }, select: { transaccion_id: true },
    });
    await prisma.transaccionesDetalles.deleteMany({ where: { producto_id: productoId } });
    await prisma.transaccion.deleteMany({ where: { id: { in: ventas.map(v => v.transaccion_id) } } });
    await prisma.recetasProducto.deleteMany({ where: { producto_id: productoId } });
    await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
    await prisma.producto.deleteMany({ where: { id: productoId } });
    await prisma.insumo.deleteMany({ where: { id: insumoId } });
    await prisma.sucursal.deleteMany({ where: { id: segundaId } });
  });

  it('sin ventas en esa sucursal, borra su habilitación y su receta local', async () => {
    const resultado = await quitarProductoDeSucursal(productoId, segundaId);

    expect(resultado).toEqual({ modo: 'ELIMINADO', ventas: 0 });

    const enSegunda = await prisma.productoSucursal.findUnique({
      where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: segundaId } },
    });
    expect(enSegunda).toBeNull();

    const recetaSegunda = await prisma.recetasProducto.count({
      where: { producto_id: productoId, sucursal_id: segundaId },
    });
    expect(recetaSegunda).toBe(0);
  });

  it('deja intacta la otra sucursal: el producto sigue en su menú y con su receta', async () => {
    const enPrincipal = await prisma.productoSucursal.findUnique({
      where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: principalId } },
    });
    expect(enPrincipal).not.toBeNull();
    expect(enPrincipal?.disponible).toBe(true);

    const recetaPrincipal = await prisma.recetasProducto.count({
      where: { producto_id: productoId, sucursal_id: principalId },
    });
    expect(recetaPrincipal).toBe(1);

    // Y el producto del catálogo sigue existiendo: es del negocio, no del local.
    expect(await prisma.producto.count({ where: { id: productoId } })).toBe(1);
  });

  it('la baja es del local: saca del menú de esa sucursal y deja la otra publicada', async () => {
    // El producto quedó solo en la principal tras la prueba anterior; se
    // rehabilita en la segunda para dar de baja ahí.
    await habilitarProductoEnSucursal(productoId, segundaId, { precio: 20 });

    const baja = await darDeBajaEnSucursal(productoId, segundaId, 'No se vende en este local');

    expect(baja.disponible).toBe(false);
    expect(baja.motivo_baja).toBe('No se vende en este local');
    expect(baja.fecha_baja).toBeInstanceOf(Date);

    const enPrincipal = await prisma.productoSucursal.findUnique({
      where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: principalId } },
    });
    expect(enPrincipal?.disponible).toBe(true);
    expect(enPrincipal?.motivo_baja).toBeNull();

    // El catálogo del negocio no se entera: la baja fue de un local.
    const producto = await prisma.producto.findUnique({ where: { id: productoId } });
    expect(producto?.estado_publicacion).not.toBe('BAJA');
  });

  it('restaurar en la sucursal lo devuelve al menú y limpia el motivo', async () => {
    const restaurado = await restaurarEnSucursal(productoId, segundaId);

    expect(restaurado.disponible).toBe(true);
    expect(restaurado.motivo_baja).toBeNull();
    expect(restaurado.fecha_baja).toBeNull();

    // Se deja como estaba para las pruebas siguientes.
    await quitarProductoDeSucursal(productoId, segundaId);
  });

  it('falla si el producto no estaba habilitado en esa sucursal', async () => {
    await expect(quitarProductoDeSucursal(productoId, segundaId)).rejects.toThrow(
      /no está habilitado/i,
    );
  });

  it('con ventas en la sucursal no borra nada: solo lo marca no disponible', async () => {
    const cajero = await prisma.usuario.findFirstOrThrow();
    const venta = await prisma.transaccion.create({
      data: {
        sucursal_id: principalId,
        usuario_id: cajero.id,
        total: 20,
        estado: 'PAGADO',
        transaccionesDetalles_id: {
          create: [{ producto_id: productoId, cantidad: 1, precio_unitario: 20 }],
        },
      },
    });

    try {
      const resultado = await quitarProductoDeSucursal(productoId, principalId);

      expect(resultado.modo).toBe('DESHABILITADO');
      expect(resultado.ventas).toBe(1);

      const enPrincipal = await prisma.productoSucursal.findUnique({
        where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: principalId } },
      });
      // La habilitación sigue existiendo: borrarla dejaría el detalle de venta
      // apuntando a una ficha que ya no existe.
      expect(enPrincipal).not.toBeNull();
      expect(enPrincipal?.disponible).toBe(false);
    } finally {
      await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: venta.id } });
      await prisma.transaccion.deleteMany({ where: { id: venta.id } });
    }
  });
});
