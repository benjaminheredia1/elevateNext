import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import type { Session } from '@/lib/server/auth/session';
import { altaInsumoEnCentro, registrarCompraCentro } from './insumos-centro.service';
import { definirRecetaCentro, registrarProduccion } from './produccion.service';
import { crearEnvio, recibirTraslado, valorEnTransito } from './traslados.service';
import { abrirTurno, registrarVentaFisica, cerrarTurno } from '@/lib/server/caja/caja.service';
import { flujoCaja } from '@/lib/server/finanzas/flujo.service';
import { estadoResultados } from '@/lib/server/finanzas/contabilidad.service';
import { rangoDiaNegocio, hoyISO } from '@/lib/server/fechas';

/**
 * E2E contable de la cadena completa:
 *
 *   compra de insumo bruto → producción → traslado → recepción → venta → cierre
 *
 * No verifica que "no explote": verifica que la PLATA cuadre en cada eslabón y
 * que lo que muestran flujo de caja y estado de resultados sea consistente con
 * lo que realmente pasó. Cada eslabón tiene su invariante:
 *
 *  1. Comprar: sale plata de caja, entra valor al inventario del Centro.
 *  2. Producir: el valor del Centro no cambia, cambia de forma.
 *  3. Trasladar: el valor sale del Centro y queda en tránsito.
 *  4. Recibir: el valor entra a la sucursal; el total del negocio no cambia.
 *  5. Vender: baja el inventario por el costo, sube la caja por el precio, y la
 *     diferencia es exactamente el margen bruto del estado de resultados.
 *  6. Cerrar: el esperado del arqueo es apertura + lo cobrado en el turno.
 */
describe('cadena contable centro → sucursal → caja', () => {
  let centroId: number;
  let sucursalId: number;
  let productoId: number;
  let harinaId: number;
  let espejoId: number;
  let turnoId: number;
  let admin: Session;
  let cajero: Session;
  const insumosCreados: number[] = [];

  const PRECIO_VENTA = 15;
  const APERTURA_EFECTIVO = 100;

  const valorCentro = async () => {
    const filas = await prisma.stockCentro.findMany({ where: { centro_id: centroId } });
    return filas.reduce((acc, f) => acc + f.stock_actual * f.costo_promedio, 0);
  };

  const valorSucursal = async () => {
    const filas = await prisma.stockSucursal.findMany({
      where: { sucursal_id: sucursalId, insumo_id: { in: [harinaId, espejoId] } },
    });
    return filas.reduce((acc, f) => acc + f.stock_actual * f.costo_promedio, 0);
  };

  const valorNegocio = async () =>
    (await valorCentro()) + (await valorSucursal()) + (await valorEnTransito({ centroId }));

  beforeAll(async () => {
    const usuarioAdmin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;

    admin = {
      id: usuarioAdmin.id, email: usuarioAdmin.email, rol: 'DUENO',
      sucursal_id: sucursalId, sucursales: [], nombre: usuarioAdmin.nombre,
    };
    // El cajero opera la caja de ESTA sucursal, que es donde va a llegar la
    // mercadería del centro.
    cajero = { ...admin, rol: 'CAJERO', sucursal_id: sucursalId };

    // Un turno abierto de otra prueba haría fallar la apertura: el modelo
    // permite uno solo por sucursal.
    await prisma.cajaTurno.updateMany({
      where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
      data: { estado: 'CERRADO', fecha_cierre: new Date() },
    });

    const centro = await prisma.centroProduccion.create({ data: { nombre: `Centro cadena e2e ${Date.now()}` } });
    centroId = centro.id;

    const producto = await prisma.producto.create({
      data: {
        nombre: `Empanada cadena e2e ${Date.now()}`,
        descripcion: 'Producto de la cadena contable',
        precio: PRECIO_VENTA,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
      },
    });
    productoId = producto.id;
    await prisma.productoSucursal.create({
      data: { producto_id: productoId, sucursal_id: sucursalId, precio: PRECIO_VENTA, disponible: true },
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

    const ids = [harinaId, espejoId, ...insumosCreados].filter(Boolean);
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: { in: ids } } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: { in: ids } } });
    await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
    await prisma.producto.update({ where: { id: productoId }, data: { insumo_reventa_id: null } });
    await prisma.transaccionesDetalles.deleteMany({ where: { producto_id: productoId } });
    await prisma.producto.delete({ where: { id: productoId } });
    await prisma.insumo.deleteMany({ where: { id: { in: ids } } });
  });

  it('1. comprar insumo bruto sube el valor del Centro por el monto comprado', async () => {
    const alta = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Harina cadena e2e ${Date.now()}`, unidad_medida: 'KG',
      stock_inicial: 0, costo_unitario: 0, stock_minimo: 0, punto_critico: 0,
    }, admin.id, 'DUENO'));
    harinaId = alta.insumo.id;

    expect(await valorCentro()).toBeCloseTo(0, 6);

    // 100 kg a Bs 6 = Bs 600.
    await prisma.$transaction((tx) =>
      registrarCompraCentro(tx, centroId, harinaId, 100, 6, 'Compra de la cadena e2e', admin.id, 'DUENO'));

    expect(await valorCentro()).toBeCloseTo(600, 6);
  });

  it('2. producir no cambia el valor del Centro: lo transforma', async () => {
    await definirRecetaCentro(centroId, productoId, [
      { insumo_id: harinaId, cantidad_utilizada: 0.25 },
    ], admin.id, 'DUENO');

    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: productoId } });
    espejoId = producto.insumo_reventa_id!;

    const valorAntes = await valorCentro();

    // 200 empanadas × 0.25 kg = 50 kg de harina, a Bs 6 = Bs 300 → Bs 1.50 c/u.
    const res = await prisma.$transaction((tx) =>
      registrarProduccion(tx, centroId, productoId, 200, undefined, admin.id, 'DUENO'));

    expect(res.costo_unitario).toBeCloseTo(1.5, 6);
    expect(await valorCentro()).toBeCloseTo(valorAntes, 6);
  });

  it('3 y 4. trasladar mueve el valor de columna sin cambiar el total del negocio', async () => {
    const totalAntes = await valorNegocio();

    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: espejoId, cantidad: 100 }], 'Reparto e2e', admin.id, 'DUENO'));

    expect(await valorEnTransito({ centroId })).toBeCloseTo(150, 6); // 100 × 1.50
    expect(await valorNegocio()).toBeCloseTo(totalAntes, 6);

    await prisma.$transaction((tx) => recibirTraslado(tx, traslado.id, [], admin.id, 'DUENO'));

    expect(await valorEnTransito({ centroId })).toBe(0);
    expect(await valorNegocio()).toBeCloseTo(totalAntes, 6);

    // Llegó con el costo del Centro, no con uno inventado.
    const enSucursal = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: espejoId, sucursal_id: sucursalId } },
    });
    expect(enSucursal.stock_actual).toBe(100);
    expect(enSucursal.costo_promedio).toBeCloseTo(1.5, 6);
  });

  it('5. vender descuenta el inventario por el costo y sube la caja por el precio', async () => {
    const turno = await abrirTurno(cajero, {
      apertura_efectivo: APERTURA_EFECTIVO, apertura_qr: 0, observaciones: 'Turno e2e',
    });
    turnoId = turno.id;

    const inventarioAntes = await valorSucursal();

    // 10 empanadas a Bs 15 = Bs 150 de venta, con Bs 15 de costo (10 × 1.50).
    const venta = await registrarVentaFisica(cajero, {
      items: [{ producto_id: productoId, cantidad: 10 }],
      combos: [], metodo_pago: 'EFECTIVO',
      es_cortesia: false, es_fiado: false, cliente_anonimo: true, es_pedido_web: false,
    });
    expect(Number(venta.total)).toBeCloseTo(150, 2);

    const stockDespues = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: espejoId, sucursal_id: sucursalId } },
    });
    expect(stockDespues.stock_actual).toBe(90);

    // El inventario bajó exactamente el costo de lo vendido: 10 × 1.50 = 15.
    expect(await valorSucursal()).toBeCloseTo(inventarioAntes - 15, 6);

    // Y el costo quedó CONGELADO en la línea de venta: si mañana cambia el
    // costo del insumo, el CMV de hoy no se mueve.
    const detalle = await prisma.transaccionesDetalles.findFirstOrThrow({
      where: { producto_id: productoId }, orderBy: { id: 'desc' },
    });
    expect(Number(detalle.costo_unitario)).toBeCloseTo(1.5, 2);
  });

  it('6. el flujo de caja muestra la venta como entrada de efectivo', async () => {
    const rango = rangoDiaNegocio(hoyISO());
    const flujo = await flujoCaja(rango, sucursalId);

    const ventasEnCaja = flujo.movimientos.filter(m => m.tipo === 'VENTA' && m.turno_id === turnoId);
    expect(ventasEnCaja).toHaveLength(1);
    expect(ventasEnCaja[0].monto).toBeCloseTo(150, 2);
    expect(ventasEnCaja[0].metodo_pago).toBe('EFECTIVO');

    // La venta aparece del lado de las entradas, no neteada contra nada.
    const efectivo = flujo.por_metodo.find(m => m.metodo === 'EFECTIVO');
    expect(efectivo!.monto).toBeGreaterThanOrEqual(150);
  });

  it('7. el estado de resultados refleja ingreso, CMV y margen de esta venta', async () => {
    const rango = rangoDiaNegocio(hoyISO());
    const er = await estadoResultados(rango, sucursalId);

    // Puede haber otras ventas del día en la base de tests, así que se verifica
    // la coherencia interna del estado y no un valor absoluto: la utilidad
    // bruta tiene que ser exactamente ingresos − CMV.
    expect(er.utilidad_bruta).toBeCloseTo(er.ingresos.total - er.cmv, 2);
    expect(er.ingresos.total).toBeGreaterThanOrEqual(150);

    // Lo cobrado en efectivo de esta venta está adentro del ingreso del día.
    expect(er.ingresos.cobrado.efectivo).toBeGreaterThanOrEqual(150);

    // El CMV de esta venta es 15 sobre 150 de ingreso: food cost del 10%. Con
    // otras ventas en la base el porcentaje global cambia, pero el CMV total
    // nunca puede ser mayor al ingreso en un negocio sano.
    expect(er.cmv).toBeLessThan(er.ingresos.total);
    expect(er.margen_bruto).toBeGreaterThan(0);
  });

  it('8. el cierre de turno espera apertura + lo cobrado, y el arqueo cuadra', async () => {
    const cerrado = await cerrarTurno(cajero, {
      real_efectivo: APERTURA_EFECTIVO + 150, real_qr: 0, observaciones: 'Cierre e2e',
    });

    expect(Number(cerrado.esperado_efectivo)).toBeCloseTo(APERTURA_EFECTIVO + 150, 2);
    expect(Number(cerrado.diferencia_efectivo)).toBeCloseTo(0, 2);
    expect(cerrado.estado).toBe('CERRADO');
  });

  it('9. ninguna operación del Centro tocó el inventario de otra sucursal', async () => {
    // El invariante que sostiene todo el subsistema: lo del Centro es del
    // Centro hasta que un traslado explícito lo mueva.
    const otrasSucursales = await prisma.stockSucursal.findMany({
      where: { insumo_id: { in: [harinaId, espejoId] }, sucursal_id: { not: sucursalId } },
    });
    expect(otrasSucursales).toHaveLength(0);

    // La harina nunca salió del Centro: no existe en ninguna sucursal.
    const harinaEnSucursales = await prisma.stockSucursal.findMany({ where: { insumo_id: harinaId } });
    expect(harinaEnSucursales).toHaveLength(0);
  });
});
