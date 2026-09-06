import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { crearEnvio } from './traslados.service';

/**
 * El freno que faltaba el 2026-09-01.
 *
 * Despachar un insumo cuando el local destino ya maneja OTRO con el mismo
 * nombre es lo que partió el inventario del snack en dos: el Centro abastecía
 * un renglón y la caja descontaba el otro. Nadie se enteró hasta que el stock
 * enviado dejó de bajar.
 *
 * El envío es el último punto donde el sistema sabe a qué sucursal va la
 * mercadería, así que es acá donde tiene que frenarse.
 */
describe('crearEnvio — homónimos en la sucursal destino', () => {
  const ts = Date.now();
  const NOMBRE = `Brownie homónimo ${ts}`;
  let centroId: number;
  let sucursalId: number;
  let operador: { id: number; rol: 'DUENO' | 'ADMIN' };

  let espejoDelCentro: number;   // el que se quiere despachar
  let espejoDeLaCarta: number;   // el que el local ya vende, mismo nombre
  const creados = { insumos: [] as number[], productos: [] as number[] };

  async function crearEspejoYProducto(nombre: string) {
    const insumo = await prisma.insumo.create({
      data: { nombre, stock_actual: 0, stock_minimo: 0, unidad_medida: 'UNIDAD', costo_promedio: 10 },
    });
    const producto = await prisma.producto.create({
      data: {
        nombre, descripcion: 'fixture homónimos', precio: 20, tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO', insumo_reventa_id: insumo.id,
      },
    });
    creados.insumos.push(insumo.id);
    creados.productos.push(producto.id);
    return { insumoId: insumo.id, productoId: producto.id };
  }

  beforeAll(async () => {
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;
    const centro = await prisma.centroProduccion.findFirst()
      ?? await prisma.centroProduccion.create({ data: { nombre: `Centro homónimos ${ts}` } });
    centroId = centro.id;
    const usuario = await prisma.usuario.findFirstOrThrow({ where: { rol: { in: ['DUENO', 'ADMIN'] } } });
    operador = { id: usuario.id, rol: usuario.rol as 'DUENO' | 'ADMIN' };

    // El renglón que el local ya vende (con su fila de inventario).
    const carta = await crearEspejoYProducto(NOMBRE);
    espejoDeLaCarta = carta.insumoId;
    await prisma.stockSucursal.create({
      data: { insumo_id: espejoDeLaCarta, sucursal_id: sucursalId, stock_actual: 3, costo_promedio: 10 },
    });

    // El renglón recién dado de alta en el Centro, con el mismo nombre.
    const centroProd = await crearEspejoYProducto(NOMBRE);
    espejoDelCentro = centroProd.insumoId;
    await prisma.stockCentro.create({
      data: { centro_id: centroId, insumo_id: espejoDelCentro, stock_actual: 20, costo_promedio: 10 },
    });
  });

  afterAll(async () => {
    await prisma.trasladoDetalle.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.movimientoCentro.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.stockCentro.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.producto.updateMany({
      where: { id: { in: creados.productos } }, data: { insumo_reventa_id: null },
    });
    await prisma.productoSucursal.deleteMany({ where: { producto_id: { in: creados.productos } } });
    await prisma.producto.deleteMany({ where: { id: { in: creados.productos } } });
    await prisma.insumo.deleteMany({ where: { id: { in: creados.insumos } } });
  });

  it('frena el despacho y nombra el renglón que el local ya vende', async () => {
    await expect(
      prisma.$transaction((tx) =>
        crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoDelCentro, cantidad: 5 }],
          undefined, operador.id, operador.rol)),
    ).rejects.toThrow(new RegExp(`ya maneja .*${espejoDeLaCarta}`));
  });

  it('no descuenta nada del Centro cuando frena', async () => {
    const stock = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: espejoDelCentro } },
    });
    expect(stock.stock_actual).toBe(20);
    const traslados = await prisma.trasladoDetalle.count({ where: { insumo_id: espejoDelCentro } });
    expect(traslados).toBe(0);
  });

  it('ignora mayúsculas, tildes y espacios de más: "Sandwich pollo" y "Sándwich  Pollo" son el mismo', async () => {
    // Es exactamente la diferencia que tenían los duplicados reales.
    await prisma.insumo.update({
      where: { id: espejoDeLaCarta }, data: { nombre: NOMBRE.replace('Brownie', 'brównie  ').toUpperCase() },
    });
    await expect(
      prisma.$transaction((tx) =>
        crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoDelCentro, cantidad: 5 }],
          undefined, operador.id, operador.rol)),
    ).rejects.toThrow(/ya maneja/);
    await prisma.insumo.update({ where: { id: espejoDeLaCarta }, data: { nombre: NOMBRE } });
  });

  it('deja pasar la reposición normal: el mismo insumo que el local ya tiene', async () => {
    // Sin homónimo, despachar el renglón que el local ya maneja es el caso sano
    // y no se puede frenar: es reponer.
    await prisma.stockSucursal.create({
      data: { insumo_id: espejoDelCentro, sucursal_id: sucursalId, stock_actual: 0, costo_promedio: 10 },
    });
    await prisma.insumo.update({
      where: { id: espejoDeLaCarta }, data: { nombre: `Otro producto ${ts}` },
    });

    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoDelCentro, cantidad: 5 }],
        undefined, operador.id, operador.rol));
    expect(traslado.estado).toBe('EN_TRANSITO');

    await prisma.insumo.update({ where: { id: espejoDeLaCarta }, data: { nombre: NOMBRE } });
  });

  it('no frena por un homónimo que el local dio de baja', async () => {
    // Una baja lógica es "este local ya no lo maneja": no puede bloquear para
    // siempre el despacho del que sí quedó vigente.
    await prisma.stockSucursal.updateMany({
      where: { insumo_id: espejoDeLaCarta, sucursal_id: sucursalId },
      data: { activo: false, fecha_baja: new Date(), motivo_baja: 'fixture' },
    });

    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoDelCentro, cantidad: 3 }],
        undefined, operador.id, operador.rol));
    expect(traslado.estado).toBe('EN_TRANSITO');
  });
});
