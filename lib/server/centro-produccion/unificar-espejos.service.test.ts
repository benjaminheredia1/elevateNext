import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { recibirTraslado } from './traslados.service';
import { descontarStockPorTransaccion } from '@/lib/server/inventario/descuento-stock.service';
import { unificarEspejoDuplicado, type ParDuplicado } from './unificar-espejos.service';

/**
 * Incidente del 2026-09-03: el Centro recreó productos que ya existían en la
 * carta del snack. Cada duplicado nació con su propio insumo espejo, así que
 * el traslado acreditaba un insumo y la venta descontaba otro. El cliente lo
 * vio como "la cajera vende y el inventario del snack no baja".
 *
 * El primer test reproduce el bug tal cual pasó en producción; el resto
 * verifica que la unificación lo repara sin inventar ni perder mercadería.
 */
describe('unificarEspejoDuplicado', () => {
  const ts = Date.now();
  let centroId: number;
  let sucursalId: number;
  let operador: { id: number; rol: 'DUENO' | 'ADMIN' };

  // Producto de la carta (sobrevive) y su clon creado en el Centro.
  let canonProducto: number, canonEspejo: number;
  let dupProducto: number, dupEspejo: number;
  let par: ParDuplicado;

  const creados = { insumos: [] as number[], productos: [] as number[] };

  const stockEnSucursal = async (insumoId: number) => {
    const fila = await prisma.stockSucursal.findUnique({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
    });
    return fila?.stock_actual ?? null;
  };

  async function crearEspejoYProducto(nombre: string) {
    const insumo = await prisma.insumo.create({
      data: { nombre, stock_actual: 0, stock_minimo: 0, unidad_medida: 'UNIDAD', costo_promedio: 10 },
    });
    const producto = await prisma.producto.create({
      data: {
        nombre, descripcion: 'fixture unificación', precio: 20, tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO', insumo_reventa_id: insumo.id,
      },
    });
    creados.insumos.push(insumo.id);
    creados.productos.push(producto.id);
    return { insumoId: insumo.id, productoId: producto.id };
  }

  /** Venta de mostrador mínima: lo único que importa acá es qué stock descuenta. */
  async function venderEnSucursal(productoId: number, cantidad: number) {
    const venta = await prisma.transaccion.create({
      data: {
        total: 20 * cantidad, estado: 'PAGADO', payment_status: 'PAGADO', canal: 'SALON',
        sucursal_id: sucursalId, cliente_nombre: `Fixture ${ts}`,
        transaccionesDetalles_id: { create: [{ producto_id: productoId, cantidad, precio_unitario: 20 }] },
      },
    });
    await prisma.$transaction((tx) => descontarStockPorTransaccion(tx, venta.id));
    return venta.id;
  }

  beforeAll(async () => {
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;
    const centro = await prisma.centroProduccion.findFirst()
      ?? await prisma.centroProduccion.create({ data: { nombre: `Centro unificación ${ts}` } });
    centroId = centro.id;
    const usuario = await prisma.usuario.findFirstOrThrow({ where: { rol: { in: ['DUENO', 'ADMIN'] } } });
    operador = { id: usuario.id, rol: usuario.rol as 'DUENO' | 'ADMIN' };

    // El producto que la cajera vende: está en la carta y ya tiene stock propio.
    const canon = await crearEspejoYProducto(`Brownie unif ${ts}`);
    canonProducto = canon.productoId;
    canonEspejo = canon.insumoId;
    await prisma.productoSucursal.create({
      data: { producto_id: canonProducto, sucursal_id: sucursalId, precio: 20, disponible: true },
    });
    await prisma.stockSucursal.create({
      data: { insumo_id: canonEspejo, sucursal_id: sucursalId, stock_actual: 0, costo_promedio: 10 },
    });

    // El clon creado en el Centro: mismo nombre, espejo propio, con existencias.
    const dup = await crearEspejoYProducto(`Brownie unif ${ts}`);
    dupProducto = dup.productoId;
    dupEspejo = dup.insumoId;
    await prisma.stockCentro.create({
      data: { centro_id: centroId, insumo_id: dupEspejo, stock_actual: 20, costo_promedio: 10 },
    });

    par = { dupProducto, dupEspejo, canonProducto, canonEspejo, nota: 'fixture' };
  });

  afterAll(async () => {
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.movimientoCentro.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.trasladoDetalle.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.traslado.deleteMany({ where: { centro_id: centroId, detalles: { none: {} } } });
    await prisma.transaccionesDetalles.deleteMany({ where: { producto_id: { in: creados.productos } } });
    await prisma.transaccion.deleteMany({ where: { cliente_nombre: `Fixture ${ts}` } });
    await prisma.stockCentro.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: creados.insumos } } });
    await prisma.producto.updateMany({
      where: { id: { in: creados.productos } }, data: { insumo_reventa_id: null },
    });
    await prisma.productoSucursal.deleteMany({ where: { producto_id: { in: creados.productos } } });
    await prisma.producto.deleteMany({ where: { id: { in: creados.productos } } });
    await prisma.insumo.deleteMany({ where: { id: { in: creados.insumos } } });
  });

  it('reproduce el bug: el traslado acredita un espejo y la venta descuenta el otro', async () => {
    // El despacho se siembra a mano, sin `crearEnvio`: hoy ese camino está
    // cerrado por el freno de homónimos (ver traslados.homonimos.test.ts). Lo
    // que este archivo repara son los datos que quedaron de cuando el freno no
    // existía, así que el fixture tiene que poder llegar a ese estado.
    const traslado = await prisma.traslado.create({
      data: {
        numero: Date.now() % 100000,
        estado: 'EN_TRANSITO',
        centro_id: centroId,
        sucursal_id: sucursalId,
        enviado_por_id: operador.id,
        detalles: { create: [{ insumo_id: dupEspejo, cantidad_enviada: 5, costo_unitario: 10 }] },
      },
    });
    await prisma.stockCentro.update({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: dupEspejo } },
      data: { stock_actual: { decrement: 5 } },
    });
    await prisma.$transaction((tx) => recibirTraslado(tx, traslado.id, [], operador.id, operador.rol));

    expect(await stockEnSucursal(dupEspejo)).toBe(5);

    // La cajera vende 4 del producto que está en la carta.
    await venderEnSucursal(canonProducto, 4);

    // El síntoma que reportó el cliente: lo que llegó sigue intacto y lo que se
    // vendió se fue a negativo.
    expect(await stockEnSucursal(dupEspejo)).toBe(5);
    expect(await stockEnSucursal(canonEspejo)).toBe(-4);
  });

  it('unifica: la mercadería pasa al espejo que la venta descuenta, sin cambiar el total', async () => {
    const antes = (await stockEnSucursal(dupEspejo))! + (await stockEnSucursal(canonEspejo))!;

    const res = await prisma.$transaction((tx) => unificarEspejoDuplicado(tx, par, operador));
    expect(res.estado).toBe('unificado');

    // −4 vendidos + 5 recibidos: la mercadería no se inventa ni se pierde,
    // solo deja de estar en la fila equivocada.
    expect(await stockEnSucursal(canonEspejo)).toBe(1);
    expect(await stockEnSucursal(dupEspejo)).toBe(0);
    expect((await stockEnSucursal(dupEspejo))! + (await stockEnSucursal(canonEspejo))!).toBe(antes);
  });

  it('el stock sin despachar del Centro pasa al espejo canónico y el duplicado queda cerrado', async () => {
    const canonEnCentro = await prisma.stockCentro.findUnique({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: canonEspejo } },
    });
    // Quedaban 15 en el Centro (20 menos los 5 despachados).
    expect(canonEnCentro?.stock_actual).toBe(15);

    const dupEnCentro = await prisma.stockCentro.findUnique({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: dupEspejo } },
    });
    expect(dupEnCentro?.stock_actual).toBe(0);
    // Con la fila activa el Centro podía volver a despacharlo y reabrir el bug.
    expect(dupEnCentro?.activo).toBe(false);
  });

  it('da de baja el producto duplicado y su espejo, y deja el rastro en auditoría', async () => {
    const dup = await prisma.producto.findUniqueOrThrow({ where: { id: dupProducto } });
    expect(dup.estado_publicacion).toBe('BAJA');
    expect(dup.disponible).toBe(false);

    const espejo = await prisma.insumo.findUniqueOrThrow({ where: { id: dupEspejo } });
    expect(espejo.activo).toBe(false);

    const canon = await prisma.producto.findUniqueOrThrow({ where: { id: canonProducto } });
    expect(canon.estado_publicacion).toBe('PUBLICADO');

    const auditoria = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'Producto', entidad_id: String(dupProducto) },
      orderBy: { id: 'desc' },
    });
    expect(auditoria?.detalle).toContain('se unifica en');
  });

  it('después de unificar, la venta descuenta el stock que llegó del Centro', async () => {
    await venderEnSucursal(canonProducto, 1);
    expect(await stockEnSucursal(canonEspejo)).toBe(0);
  });

  it('es idempotente: correrlo de nuevo no vuelve a mover stock', async () => {
    const previo = await stockEnSucursal(canonEspejo);
    const res = await prisma.$transaction((tx) => unificarEspejoDuplicado(tx, par, operador));
    expect(res.estado).toBe('ya-unificado');
    expect(await stockEnSucursal(canonEspejo)).toBe(previo);
  });

  it('aborta si el espejo declarado no es el que tiene el producto', async () => {
    const res = await prisma.$transaction((tx) =>
      unificarEspejoDuplicado(tx, { ...par, dupEspejo: 999999 }, operador));
    expect(res.estado).toBe('abortado');
    expect(res.motivo).toContain('espejo del duplicado');
  });
});
