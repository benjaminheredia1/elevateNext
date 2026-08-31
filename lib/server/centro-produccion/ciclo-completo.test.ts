import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import type { Session } from '@/lib/server/auth/session';
import { altaInsumoEnCentro, registrarCompraCentro } from './insumos-centro.service';
import { definirRecetaCentro, registrarProduccion } from './produccion.service';
import { crearEnvio, recibirTraslado } from './traslados.service';
import { abrirTurno, registrarVentaFisica } from '@/lib/server/caja/caja.service';

/**
 * El ciclo completo en CANTIDADES:
 *
 *   comprar bruto → producir → despachar → recibir → vender
 *
 * `cadena-contable.test.ts` ya verifica que la PLATA cuadre en cada eslabón, y
 * no se duplica acá. Lo que este archivo fija es el invariante que da sentido a
 * todo el rediseño y que aquel no mide: **el insumo bruto se consume al
 * PRODUCIR, no al vender**.
 *
 * Es la diferencia entre el modelo viejo y el nuevo. Antes, vender una empanada
 * descontaba harina del local. Ahora la harina ya se gastó en el Centro cuando
 * se produjo, y vender solo baja una unidad de producto terminado. Si algún día
 * alguien reconecta la receta local al descuento de venta, la harina se
 * descontaría DOS veces y este test es el que lo caza.
 */
describe('ciclo completo en cantidades: comprar → producir → despachar → vender', () => {
  let centroId: number;
  let sucursalId: number;
  let otraSucursalId: number;
  let productoId: number;
  let harinaId: number;
  let espejoId: number;
  let turnoId: number;
  let admin: Session;
  let cajero: Session;

  const PRECIO = 15;
  const HARINA_COMPRADA = 1000;   // GR
  const POR_UNIDAD = 100;         // GR por empanada
  const PRODUCIDAS = 5;

  const stockEnCentro = async (insumoId: number) =>
    (await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
    })).stock_actual;

  const stockEnSucursal = async (insumoId: number, suc: number) =>
    (await prisma.stockSucursal.findUnique({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: suc } },
    }))?.stock_actual ?? 0;

  beforeAll(async () => {
    const usuarioAdmin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;

    admin = {
      id: usuarioAdmin.id, email: usuarioAdmin.email, rol: 'DUENO',
      sucursal_id: sucursalId, sucursales: [], nombre: usuarioAdmin.nombre,
    };
    cajero = { ...admin, rol: 'CAJERO', sucursal_id: sucursalId };

    // Un turno abierto de otra prueba haría fallar la apertura: el modelo
    // permite uno solo por sucursal.
    await prisma.cajaTurno.updateMany({
      where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
      data: { estado: 'CERRADO', fecha_cierre: new Date() },
    });

    const sufijo = Date.now();
    centroId = (await prisma.centroProduccion.create({ data: { nombre: `Centro ciclo ${sufijo}` } })).id;
    // La segunda sucursal existe solo para comprobar que no recibe nada.
    otraSucursalId = (await prisma.sucursal.create({ data: { nombre: `Sucursal ajena ciclo ${sufijo}` } })).id;

    productoId = (await prisma.producto.create({
      data: {
        nombre: `Empanada ciclo ${sufijo}`,
        descripcion: 'Producto del ciclo completo',
        precio: PRECIO,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
      },
    })).id;
    await prisma.productoSucursal.create({
      data: { producto_id: productoId, sucursal_id: sucursalId, precio: PRECIO, disponible: true },
    });
  });

  afterAll(async () => {
    if (centroId == null) return;
    if (turnoId != null) {
      await prisma.cajaTurno.updateMany({ where: { id: turnoId, estado: 'ABIERTO' }, data: { estado: 'CERRADO' } });
    }
    await prisma.trasladoDetalle.deleteMany({ where: { traslado: { centro_id: centroId } } });
    await prisma.traslado.deleteMany({ where: { centro_id: centroId } });
    await prisma.recetaCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });

    const ids = [harinaId, espejoId].filter(Boolean);
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: ids } } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: ids } } });
    await prisma.transaccionesDetalles.deleteMany({ where: { producto_id: productoId } });
    await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
    await prisma.producto.update({ where: { id: productoId }, data: { insumo_reventa_id: null } });
    await prisma.producto.delete({ where: { id: productoId } });
    await prisma.insumo.deleteMany({ where: { id: { in: ids } } });
    await prisma.sucursal.delete({ where: { id: otraSucursalId } });
  });

  it('1. el Centro compra harina y la harina queda en el Centro', async () => {
    const alta = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Harina ciclo ${Date.now()}`, unidad_medida: 'GR',
      stock_inicial: 0, costo_unitario: 0, stock_minimo: 0, punto_critico: 0,
    }, admin.id, 'DUENO'));
    harinaId = alta.insumo.id;

    await prisma.$transaction((tx) =>
      registrarCompraCentro(tx, centroId, harinaId, HARINA_COMPRADA, 0.02, 'Compra del ciclo', admin.id, 'DUENO'));

    expect(await stockEnCentro(harinaId)).toBe(HARINA_COMPRADA);
    // Y no aparece en ninguna sucursal: el bruto es del Centro.
    expect(await prisma.stockSucursal.count({ where: { insumo_id: harinaId } })).toBe(0);
  });

  it('2. producir consume la harina EN EL CENTRO y acredita el terminado', async () => {
    await definirRecetaCentro(centroId, productoId, [
      { insumo_id: harinaId, cantidad_utilizada: POR_UNIDAD },
    ], admin.id, 'DUENO');

    espejoId = (await prisma.producto.findUniqueOrThrow({ where: { id: productoId } })).insumo_reventa_id!;

    await prisma.$transaction((tx) =>
      registrarProduccion(tx, centroId, productoId, PRODUCIDAS, undefined, admin.id, 'DUENO'));

    // 5 × 100 GR = 500 GR consumidos: acá es donde el bruto se gasta.
    expect(await stockEnCentro(harinaId)).toBe(HARINA_COMPRADA - PRODUCIDAS * POR_UNIDAD);
    expect(await stockEnCentro(espejoId)).toBe(PRODUCIDAS);
    // La sucursal todavía no tiene nada: producir no despacha.
    expect(await stockEnSucursal(espejoId, sucursalId)).toBe(0);
  });

  it('3. despachar y recibir deja las unidades en la sucursal', async () => {
    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoId, cantidad: PRODUCIDAS }], 'Envío del ciclo', admin.id, 'DUENO'));
    await prisma.$transaction((tx) => recibirTraslado(tx, traslado.id, [], admin.id, 'DUENO'));

    expect(await stockEnSucursal(espejoId, sucursalId)).toBe(PRODUCIDAS);
    expect(await stockEnCentro(espejoId)).toBe(0);
  });

  it('4. vender baja el terminado de la sucursal y NO mueve la harina del Centro', async () => {
    const harinaAntes = await stockEnCentro(harinaId);

    const turno = await abrirTurno(cajero, {
      apertura_efectivo: 100, apertura_qr: 0, observaciones: 'Turno ciclo',
    });
    turnoId = turno.id;

    await registrarVentaFisica(cajero, {
      items: [{ producto_id: productoId, cantidad: 2 }],
      combos: [], metodo_pago: 'EFECTIVO',
      es_cortesia: false, es_fiado: false, cliente_anonimo: true, es_pedido_web: false,
    });

    expect(await stockEnSucursal(espejoId, sucursalId)).toBe(PRODUCIDAS - 2);

    // El corazón del rediseño: la harina ya se gastó al producir. Si la venta
    // la volviera a descontar, el insumo se consumiría dos veces por la misma
    // empanada y el CMV quedaría inflado al doble.
    expect(await stockEnCentro(harinaId)).toBe(harinaAntes);
  });

  it('5. nada de esto llegó a la otra sucursal', async () => {
    expect(await stockEnSucursal(espejoId, otraSucursalId)).toBe(0);
    expect(await stockEnSucursal(harinaId, otraSucursalId)).toBe(0);
    // Ni siquiera existe la fila: el traslado fue a un local concreto.
    expect(await prisma.stockSucursal.count({
      where: { insumo_id: { in: [harinaId, espejoId] }, sucursal_id: otraSucursalId },
    })).toBe(0);
  });
});
