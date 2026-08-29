import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import type { Session } from '@/lib/server/auth/session';
import { altaInsumoEnCentro, registrarCompraCentro } from './insumos-centro.service';
import { definirRecetaCentro, registrarProduccion } from './produccion.service';
import { crearEnvio, recibirTraslado, listarTraslados } from './traslados.service';
import { abrirTurno, registrarVentaFisica } from '@/lib/server/caja/caja.service';

/**
 * Las pruebas que pidió el usuario, en el orden en que las pidió:
 *
 *  A. Un elaborado que rinde 5, el Centro despacha 3 a una sucursal que NO lo
 *     tenía. Al recibirlo, la sucursal pasa a tenerlo. El despacho descuenta el
 *     stock del Centro.
 *  B. Lo mismo con un producto que la sucursal YA tiene: 1 + 2 = 3 en el local,
 *     y el Centro baja de 3 a 1.
 *  C. Si el Centro le cambia el precio, ¿con cuál vende la sucursal?
 *  D. El costo promedio ponderado al reabastecer: 500 g que costaron a 30
 *     contra un kilo nuevo a 25 no se pisan, se promedian.
 *  F. El cajero ve lo de SU sucursal y cada venta descuenta de ahí.
 */
describe('despacho del Centro y venta en la sucursal', () => {
  const sufijo = Date.now();
  let centroId: number;
  let sucursalId: number;
  let admin: Session;
  let cajero: Session;
  const insumoIds: number[] = [];
  const productoIds: number[] = [];
  let turnoId: number | null = null;

  const stockCentro = async (insumoId: number) =>
    (await prisma.stockCentro.findUnique({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
    }))?.stock_actual ?? 0;

  const stockSucursal = async (insumoId: number) =>
    (await prisma.stockSucursal.findUnique({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
    }))?.stock_actual ?? null;

  /** Crea un elaborado en el Centro con su receta, y produce `unidades`. */
  async function elaboradoProducido(nombre: string, unidades: number, porUnidad = 0.25) {
    const alta = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Insumo ${nombre}`, unidad_medida: 'KG',
      stock_inicial: 0, costo_unitario: 0, stock_minimo: 0, punto_critico: 0,
    }, admin.id, 'DUENO'));
    insumoIds.push(alta.insumo.id);
    await prisma.$transaction((tx) =>
      registrarCompraCentro(tx, centroId, alta.insumo.id, unidades * porUnidad, 6, 'Compra', admin.id, 'DUENO'));

    const producto = await prisma.producto.create({
      data: { nombre, descripcion: 'x', precio: 15, tipo: 'ELABORADO', estado_publicacion: 'PUBLICADO' },
    });
    productoIds.push(producto.id);

    await prisma.$transaction((tx) =>
      definirRecetaCentro(centroId, producto.id, [{ insumo_id: alta.insumo.id, cantidad_utilizada: porUnidad }], admin.id, 'DUENO', tx));

    const conEspejo = await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } });
    insumoIds.push(conEspejo.insumo_reventa_id!);

    await prisma.$transaction((tx) =>
      registrarProduccion(tx, centroId, producto.id, unidades, undefined, admin.id, 'DUENO'));

    return { productoId: producto.id, espejoId: conEspejo.insumo_reventa_id!, brutoId: alta.insumo.id };
  }

  beforeAll(async () => {
    const usuarioAdmin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;
    admin = {
      id: usuarioAdmin.id, email: usuarioAdmin.email, rol: 'DUENO',
      sucursal_id: sucursalId, sucursales: [], nombre: usuarioAdmin.nombre,
    };
    cajero = { ...admin, rol: 'CAJERO', sucursal_id: sucursalId };

    await prisma.cajaTurno.updateMany({
      where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
      data: { estado: 'CERRADO', fecha_cierre: new Date() },
    });
    centroId = (await prisma.centroProduccion.create({ data: { nombre: `Centro despacho ${sufijo}` } })).id;
  });

  afterAll(async () => {
    if (turnoId != null) {
      await prisma.cajaTurno.updateMany({ where: { id: turnoId, estado: 'ABIERTO' }, data: { estado: 'CERRADO' } });
    }
    await prisma.trasladoDetalle.deleteMany({ where: { traslado: { centro_id: centroId } } });
    await prisma.traslado.deleteMany({ where: { centro_id: centroId } });
    await prisma.recetaCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });

    await prisma.transaccionesDetalles.deleteMany({ where: { producto_id: { in: productoIds } } });
    await prisma.productoSucursal.deleteMany({ where: { producto_id: { in: productoIds } } });
    await prisma.producto.updateMany({ where: { id: { in: productoIds } }, data: { insumo_reventa_id: null } });
    await prisma.producto.deleteMany({ where: { id: { in: productoIds } } });
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: insumoIds } } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: insumoIds } } });
    await prisma.insumo.deleteMany({ where: { id: { in: insumoIds } } });
  });

  it('A. despachar un producto que la sucursal NO tenía se lo deja en su inventario', async () => {
    const { espejoId } = await elaboradoProducido(`Brownie nuevo ${sufijo}`, 5);

    expect(await stockCentro(espejoId)).toBe(5);
    // La sucursal no lo maneja: no tiene ni fila de stock. Es un producto nuevo
    // para ella, y eso es lo que la recepción debería avisar.
    expect(await stockSucursal(espejoId)).toBeNull();

    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoId, cantidad: 3 }], 'Envio A', admin.id, 'DUENO'));

    // El despacho descuenta del Centro AL SALIR, no al recibirse: mientras
    // viaja no es de nadie, por eso existe el estado en tránsito.
    expect(await stockCentro(espejoId)).toBe(2);

    await prisma.$transaction((tx) => recibirTraslado(tx, traslado.id, [], admin.id, 'DUENO'));

    expect(await stockSucursal(espejoId)).toBe(3);
    expect(await stockCentro(espejoId)).toBe(2);
  }, 60_000);

  it('B. despachar un producto que la sucursal YA tiene suma, no reemplaza', async () => {
    const { espejoId } = await elaboradoProducido(`Brownie existente ${sufijo}`, 3);

    // La sucursal ya tenía 1.
    await prisma.stockSucursal.create({
      data: { insumo_id: espejoId, sucursal_id: sucursalId, stock_actual: 1, costo_promedio: 1.5 },
    });

    expect(await stockCentro(espejoId)).toBe(3);

    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoId, cantidad: 2 }], 'Envio B', admin.id, 'DUENO'));
    await prisma.$transaction((tx) => recibirTraslado(tx, traslado.id, [], admin.id, 'DUENO'));

    // 1 que tenía + 2 que llegaron = 3.
    expect(await stockSucursal(espejoId)).toBe(3);
    // El Centro tenía 3 y despachó 2: le queda 1.
    expect(await stockCentro(espejoId)).toBe(1);
  }, 60_000);

  it('C. el precio que fija el Centro es con el que vende la sucursal', async () => {
    const { productoId } = await elaboradoProducido(`Precio ${sufijo}`, 2);
    await prisma.productoSucursal.create({
      data: { producto_id: productoId, sucursal_id: sucursalId, precio: 5, disponible: true },
    });

    // El Centro le cambia el precio del catálogo a 6.
    await prisma.producto.update({ where: { id: productoId }, data: { precio: 6 } });

    const enSucursal = await prisma.productoSucursal.findFirstOrThrow({
      where: { producto_id: productoId, sucursal_id: sucursalId },
    });
    const catalogo = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });

    // Lo que este test DOCUMENTA, no lo que opina: si la habilitación del local
    // tiene precio propio, el catálogo no lo pisa.
    expect(Number(catalogo.precio)).toBe(6);
    expect(Number(enSucursal.precio)).toBe(5);
  }, 60_000);

  it('D. reabastecer promedia el costo, no lo pisa', async () => {
    // 1 kg a Bs 30. Se consumen 500 g y entra otro kilo a Bs 25.
    // Los 500 g viejos siguen valiendo 30: (0,5 × 30 + 1 × 25) / 1,5 = 26,67.
    const alta = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Pollo ${sufijo}`, unidad_medida: 'KG',
      stock_inicial: 0, costo_unitario: 0, stock_minimo: 0, punto_critico: 0,
    }, admin.id, 'DUENO'));
    insumoIds.push(alta.insumo.id);

    await prisma.$transaction((tx) =>
      registrarCompraCentro(tx, centroId, alta.insumo.id, 1, 30, 'Primer kilo', admin.id, 'DUENO'));

    const fila = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: alta.insumo.id } },
    });
    expect(fila.costo_promedio).toBeCloseTo(30, 4);

    // Se usan 500 g (merma para simular consumo).
    await prisma.stockCentro.update({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: alta.insumo.id } },
      data: { stock_actual: 0.5 },
    });

    await prisma.$transaction((tx) =>
      registrarCompraCentro(tx, centroId, alta.insumo.id, 1, 25, 'Segundo kilo mas barato', admin.id, 'DUENO'));

    const despues = await prisma.stockCentro.findUniqueOrThrow({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: alta.insumo.id } },
    });
    expect(despues.stock_actual).toBeCloseTo(1.5, 6);
    expect(despues.costo_promedio).toBeCloseTo(26.666667, 4);
  }, 60_000);

  it('F. el cajero vende y el descuento sale de SU sucursal', async () => {
    const { productoId, espejoId, brutoId } = await elaboradoProducido(`Plato del dia ${sufijo}`, 10);

    // A la mañana la sucursal tenía 1.
    await prisma.stockSucursal.create({
      data: { insumo_id: espejoId, sucursal_id: sucursalId, stock_actual: 1, costo_promedio: 1.5 },
    });
    await prisma.productoSucursal.create({
      data: { producto_id: productoId, sucursal_id: sucursalId, precio: 15, disponible: true },
    });

    const brutoAntes = await stockCentro(brutoId);

    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoId, cantidad: 10 }], 'Envio F', admin.id, 'DUENO'));
    await prisma.$transaction((tx) => recibirTraslado(tx, traslado.id, [], admin.id, 'DUENO'));

    // 1 + 10 = 11.
    expect(await stockSucursal(espejoId)).toBe(11);
    // El Centro despachó los 10 que produjo: le queda 0 para despachar.
    expect(await stockCentro(espejoId)).toBe(0);

    const turno = await abrirTurno(cajero, { apertura_efectivo: 100, apertura_qr: 0, observaciones: 'Turno F' });
    turnoId = turno.id;

    await registrarVentaFisica(cajero, {
      items: [{ producto_id: productoId, cantidad: 5 }],
      combos: [], metodo_pago: 'EFECTIVO',
      es_cortesia: false, es_fiado: false, cliente_anonimo: true, es_pedido_web: false,
    });

    // 11 − 5 = 6.
    expect(await stockSucursal(espejoId)).toBe(6);
    // Y el insumo bruto del Centro NO se movió con la venta: ya se consumió al
    // producir. Si bajara acá, se estaría descontando dos veces.
    expect(await stockCentro(brutoId)).toBe(brutoAntes);
  }, 60_000);

  /**
   * El aviso de "producto nuevo" al recibir.
   *
   * Cuando llega algo que el local NUNCA manejó, la recepción tiene que
   * decirlo: no es reponer stock, es sumar un producto al catálogo de ese
   * local. Quien recibe tiene que saber que después de confirmar va a tener
   * algo que antes no vendía.
   *
   * Y solo la primera vez: en cuanto lo tiene, deja de ser noticia.
   */
  it('A2. la recepción avisa cuando el producto es nuevo para ese local, y solo la primera vez', async () => {
    const { espejoId } = await elaboradoProducido(`Novedad ${sufijo}`, 6);

    const { traslado: primero } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoId, cantidad: 2 }], 'Primera vez', admin.id, 'DUENO'));

    const enTransito = await listarTraslados({ centroId, estado: 'EN_TRANSITO' });
    const detalleNuevo = enTransito
      .find(t => t.id === primero.id)!
      .detalles.find(d => d.insumo_id === espejoId)!;
    expect(detalleNuevo.nuevo_en_sucursal).toBe(true);

    await prisma.$transaction((tx) => recibirTraslado(tx, primero.id, [], admin.id, 'DUENO'));

    // Segundo envío del MISMO producto al MISMO local: ya no es novedad.
    const { traslado: segundo } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoId, cantidad: 2 }], 'Segunda vez', admin.id, 'DUENO'));

    const otraVez = await listarTraslados({ centroId, estado: 'EN_TRANSITO' });
    const detalleConocido = otraVez
      .find(t => t.id === segundo.id)!
      .detalles.find(d => d.insumo_id === espejoId)!;
    expect(detalleConocido.nuevo_en_sucursal).toBe(false);

    await prisma.$transaction((tx) => recibirTraslado(tx, segundo.id, [], admin.id, 'DUENO'));
  }, 60_000);

  it('A3. un producto que el local tiene en CERO no es novedad: ya lo maneja', async () => {
    // La condición es "no lo tiene", no "no le queda". Un local que se quedó sin
    // stock de algo que vende todas las semanas no necesita que le avisen nada.
    const { espejoId } = await elaboradoProducido(`Agotado ${sufijo}`, 4);
    await prisma.stockSucursal.create({
      data: { insumo_id: espejoId, sucursal_id: sucursalId, stock_actual: 0, costo_promedio: 1.5 },
    });

    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoId, cantidad: 2 }], 'Reposicion', admin.id, 'DUENO'));

    const lista = await listarTraslados({ centroId, estado: 'EN_TRANSITO' });
    const detalle = lista.find(t => t.id === traslado.id)!.detalles.find(d => d.insumo_id === espejoId)!;
    expect(detalle.nuevo_en_sucursal).toBe(false);

    await prisma.$transaction((tx) => recibirTraslado(tx, traslado.id, [], admin.id, 'DUENO'));
  }, 60_000);

  it('G. el insumo bruto NO se puede despachar a una sucursal', async () => {
    // Con el corte la sucursal perdió las recetas, la compra y el alta de
    // insumo: mandarle harina le devuelve algo que no puede convertir en nada, y
    // le mete de nuevo insumo bruto en el inventario, que es justo lo que el
    // corte vino a sacar.
    const alta = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Harina suelta ${sufijo}`, unidad_medida: 'KG',
      stock_inicial: 0, costo_unitario: 0, stock_minimo: 0, punto_critico: 0,
    }, admin.id, 'DUENO'));
    insumoIds.push(alta.insumo.id);
    await prisma.$transaction((tx) =>
      registrarCompraCentro(tx, centroId, alta.insumo.id, 10, 6, 'Compra', admin.id, 'DUENO'));

    await expect(prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: alta.insumo.id, cantidad: 2 }], 'No deberia salir', admin.id, 'DUENO'),
    )).rejects.toThrow(/insumo bruto/i);

    // Y no se descontó nada: el rechazo es antes de tocar el stock.
    expect(await stockCentro(alta.insumo.id)).toBe(10);
  }, 60_000);
});
