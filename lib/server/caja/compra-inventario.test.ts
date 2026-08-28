import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import type { Session } from '@/lib/server/auth/session';
import { abrirTurno, registrarMovimientoManual, cerrarTurno } from '@/lib/server/caja/caja.service';
import { registrarCompra, registrarMerma } from '@/lib/server/inventario/inventario.service';
import { flujoCaja } from '@/lib/server/finanzas/flujo.service';
import { rangoDiaNegocio, hoyISO } from '@/lib/server/fechas';

/**
 * Compra de insumo pagada desde la caja.
 *
 * Hoy son DOS operaciones distintas y el sistema no las vincula: `registrarCompra`
 * mueve inventario y `registrarMovimientoManual` mueve plata. Estos tests fijan
 * las dos mitades y, sobre todo, dejan aseverado el hueco: la compra sola no
 * toca la caja. Si algún día se conectan, este archivo es el que avisa que el
 * comportamiento cambió — que es exactamente lo que se quiere de un test sobre
 * una decisión contable pendiente.
 */
describe('compra de insumo y su efecto en caja e inventario', () => {
  let sucursalId: number;
  let insumoId: number;
  let turnoId: number;
  let cajero: Session;
  // El saldo de la cuenta EFECTIVO es acumulativo del local, no arranca en la
  // apertura del turno: por eso todo se mide como variación, no como absoluto.
  let efectivoAlAbrir: number;

  const APERTURA = 500;
  const COSTO_COMPRA = 6;
  const CANTIDAD_COMPRA = 20;   // 20 × 6 = Bs 120

  const stock = () => prisma.stockSucursal.findUniqueOrThrow({
    where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
  });

  const efectivoEnCaja = async () => {
    const cuenta = await prisma.cuentaFinanciera.findFirstOrThrow({
      where: { sucursal_id: sucursalId, tipo: 'EFECTIVO' },
    });
    return Number(cuenta.saldo);
  };

  beforeAll(async () => {
    const usuario = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;
    cajero = {
      id: usuario.id, email: usuario.email, rol: 'CAJERO',
      sucursal_id: sucursalId, sucursales: [sucursalId], nombre: usuario.nombre,
    };

    await prisma.cajaTurno.updateMany({
      where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
      data: { estado: 'CERRADO', fecha_cierre: new Date() },
    });

    const insumo = await prisma.insumo.create({
      data: { nombre: `Aceite compra test ${Date.now()}`, unidad_medida: 'LT', stock_actual: 0, stock_minimo: 0 },
    });
    insumoId = insumo.id;
    await prisma.stockSucursal.create({
      data: { insumo_id: insumoId, sucursal_id: sucursalId, stock_actual: 0, costo_promedio: 0 },
    });

    const turno = await abrirTurno(cajero, { apertura_efectivo: APERTURA, apertura_qr: 0 });
    turnoId = turno.id;
    efectivoAlAbrir = await efectivoEnCaja();
  });

  afterAll(async () => {
    if (insumoId == null) return;
    if (turnoId != null) {
      await prisma.cajaTurno.updateMany({ where: { id: turnoId, estado: 'ABIERTO' }, data: { estado: 'CERRADO' } });
    }
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.insumo.delete({ where: { id: insumoId } });
  });

  it('la compra sube el stock y fija el costo promedio del local', async () => {
    await prisma.$transaction((tx) =>
      registrarCompra(tx, insumoId, CANTIDAD_COMPRA, COSTO_COMPRA, 'Compra de prueba', cajero.id, 'DUENO', sucursalId));

    const fila = await stock();
    expect(fila.stock_actual).toBe(CANTIDAD_COMPRA);
    expect(fila.costo_promedio).toBeCloseTo(COSTO_COMPRA, 6);

    // Queda el rastro en el kardex del local.
    const mov = await prisma.movimientoInterno.findFirstOrThrow({
      where: { insumo_id: insumoId, tipo_movimiento: 'INGRESO' },
    });
    expect(mov.cantidad).toBe(CANTIDAD_COMPRA);
    expect(mov.costo_unitario).toBeCloseTo(COSTO_COMPRA, 6);
  });

  it('HUECO CONOCIDO: la compra por sí sola no mueve un peso de la caja', async () => {
    // Este test NO valida un comportamiento deseable: documenta el que hay.
    // Comprar inventario no genera MovimientoCaja, así que la plata que sale
    // por comprar no aparece en el flujo de caja salvo que alguien cargue el
    // egreso a mano (lo que hace el test siguiente). Cuando se decida el modelo
    // contable —egreso automático, cuenta por pagar o carga manual— este test
    // se cae y hay que actualizarlo a propósito.
    const movimientosDeCaja = await prisma.movimientoCaja.count({
      where: { turno_id: turnoId, concepto: { contains: 'Compra de prueba' } },
    });
    expect(movimientosDeCaja).toBe(0);
    expect(await efectivoEnCaja()).toBeCloseTo(efectivoAlAbrir, 2);
  });

  it('registrando el egreso, la plata sale de la caja y aparece en el flujo del día', async () => {
    const antes = await efectivoEnCaja();

    await registrarMovimientoManual(cajero, 'GASTO_OPERATIVO', {
      concepto: `Compra de insumo (${CANTIDAD_COMPRA} LT)`,
      monto: CANTIDAD_COMPRA * COSTO_COMPRA,
      metodo_pago: 'EFECTIVO',
      categoria: 'Insumos',
    });

    expect(await efectivoEnCaja()).toBeCloseTo(antes - 120, 2);

    const flujo = await flujoCaja(rangoDiaNegocio(hoyISO()), sucursalId);
    const salidaInsumos = flujo.salidas_por_categoria.find(c => c.categoria === 'Insumos');
    expect(salidaInsumos).toBeTruthy();
    expect(salidaInsumos!.monto).toBeGreaterThanOrEqual(120);

    // El movimiento se registra con monto negativo y del lado de las salidas.
    const enLibro = flujo.movimientos.find(m => m.concepto.startsWith('Compra de insumo'));
    expect(enLibro!.monto).toBeCloseTo(-120, 2);
  });

  it('el efectivo no puede quedar negativo por un gasto: primero hay que declarar de dónde salió', async () => {
    await expect(
      registrarMovimientoManual(cajero, 'GASTO_OPERATIVO', {
        concepto: 'Compra imposible', monto: 999_999, metodo_pago: 'EFECTIVO', categoria: 'Insumos',
      }),
    ).rejects.toThrow(/Saldo insuficiente/);
  });

  it('la merma baja el stock sin tocar la caja: no se paga nada por perder mercadería', async () => {
    const efectivoAntes = await efectivoEnCaja();
    const stockAntes = (await stock()).stock_actual;

    await prisma.$transaction((tx) =>
      registrarMerma(tx, insumoId, 5, 'Se derramó', cajero.id, 'DUENO', sucursalId));

    expect((await stock()).stock_actual).toBeCloseTo(stockAntes - 5, 6);
    expect(await efectivoEnCaja()).toBeCloseTo(efectivoAntes, 2);
  });

  it('el arqueo espera la apertura menos el gasto registrado', async () => {
    const cerrado = await cerrarTurno(cajero, {
      real_efectivo: APERTURA - 120, real_qr: 0, observaciones: 'Cierre compra test',
    });

    expect(Number(cerrado.esperado_efectivo)).toBeCloseTo(APERTURA - 120, 2);
    expect(Number(cerrado.diferencia_efectivo)).toBeCloseTo(0, 2);
  });
});
