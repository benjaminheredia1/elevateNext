import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';
import { ejecutarMudanza, revertirMudanza, valorizadoTotal, MOTIVO_MUDANZA } from './mudanza.service';

/**
 * La mudanza es GLOBAL: toca todos los insumos, todas las recetas y todos los
 * productos de la base. Correrla de verdad contra la BD de tests dejaría al
 * resto de la suite trabajando sobre un inventario ya mudado.
 *
 * Por eso cada caso corre dentro de una transacción que se revierte siempre: se
 * ejerce el camino real —incluida la verificación de valorizado que hace
 * `ejecutarMudanza` por dentro— y no queda nada escrito. Es también la razón de
 * que `ejecutarMudanza` no abra su propia transacción: la abre quien la llama.
 */
class Revertir extends Error {}

async function enTransaccionRevertida<T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
  let salida: T | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      salida = await fn(tx);
      throw new Revertir();
    }, { timeout: 120_000 });
  } catch (e) {
    if (!(e instanceof Revertir)) throw e;
  }
  return salida as T;
}

describe('mudanza del insumo bruto al Centro', () => {
  let centroId: number;
  let usuarioId: number;
  let sucursalId: number;

  beforeAll(async () => {
    const dueno = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    usuarioId = dueno.id;
    sucursalId = await sucursalPorDefectoId();
    const centro = await prisma.centroProduccion.findFirst({ where: { activo: true } });
    centroId = centro
      ? centro.id
      : (await prisma.centroProduccion.create({ data: { nombre: `Centro mudanza ${Date.now()}` } })).id;
  });

  /** Insumo bruto con stock en la sucursal + un elaborado que lo usa. */
  async function sembrar(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], sufijo: number) {
    const harina = await tx.insumo.create({
      data: { nombre: `Harina mudanza ${sufijo}`, unidad_medida: 'GR', stock_actual: 1000, stock_minimo: 0, costo_promedio: 0.02 },
    });
    await tx.stockSucursal.create({
      data: { insumo_id: harina.id, sucursal_id: sucursalId, stock_actual: 1000, costo_promedio: 0.02 },
    });
    const producto = await tx.producto.create({
      data: { nombre: `Brownie mudanza ${sufijo}`, descripcion: 'x', precio: 20, tipo: 'ELABORADO', estado_publicacion: 'PUBLICADO' },
    });
    await tx.recetasProducto.create({
      data: { producto_id: producto.id, insumo_id: harina.id, cantidad_utilizada: 100, sucursal_id: sucursalId },
    });
    return { harina, producto };
  }

  it('muda el bruto, crea el espejo con el costo previo y mantiene el valorizado', async () => {
    await enTransaccionRevertida(async (tx) => {
      const sufijo = Date.now();
      const { harina, producto } = await sembrar(tx, sufijo);

      const valorAntes = await valorizadoTotal(tx);
      const resultado = await ejecutarMudanza(centroId, usuarioId, tx);
      const valorDespues = await valorizadoTotal(tx);

      expect(resultado.yaEjecutada).toBe(false);
      expect(valorDespues).toBeCloseTo(valorAntes, 2);

      // El bruto se fue de la sucursal y está en el Centro.
      const enSucursal = await tx.stockSucursal.findFirstOrThrow({
        where: { insumo_id: harina.id, sucursal_id: sucursalId },
      });
      expect(enSucursal.stock_actual).toBe(0);
      const enCentro = await tx.stockCentro.findFirstOrThrow({
        where: { insumo_id: harina.id, centro_id: centroId },
      });
      expect(enCentro.stock_actual).toBe(1000);
      expect(enCentro.costo_promedio).toBeCloseTo(0.02, 6);

      // El elaborado nació con espejo, al costo de su ficha previa (100 × 0,02 = 2).
      const despues = await tx.producto.findUniqueOrThrow({ where: { id: producto.id } });
      expect(despues.insumo_reventa_id).not.toBeNull();
      const espejo = await tx.insumo.findUniqueOrThrow({ where: { id: despues.insumo_reventa_id! } });
      expect(espejo.unidad_medida).toBe('UNIDAD');
      expect(espejo.costo_promedio).toBeCloseTo(2, 2);

      // La receta quedó en el Centro y la local sigue como histórico.
      expect(await tx.recetaCentro.count({ where: { producto_id: producto.id, centro_id: centroId } })).toBe(1);
      expect(await tx.recetasProducto.count({ where: { producto_id: producto.id } })).toBe(1);

      // El kardex de los dos lados cuenta la misma historia.
      const egreso = await tx.movimientoInterno.findFirstOrThrow({
        where: { insumo_id: harina.id, descripcion: { contains: MOTIVO_MUDANZA } },
      });
      expect(egreso.tipo_movimiento).toBe('EGRESO');
      expect(egreso.cantidad).toBe(1000);
      const ingreso = await tx.movimientoCentro.findFirstOrThrow({
        where: { insumo_id: harina.id, descripcion: { contains: MOTIVO_MUDANZA } },
      });
      expect(ingreso.tipo_movimiento).toBe('INGRESO');
      expect(ingreso.cantidad).toBe(1000);
    });
  }, 60_000);

  it('correrla dos veces no duplica nada', async () => {
    await enTransaccionRevertida(async (tx) => {
      await sembrar(tx, Date.now() + 1);

      const primera = await ejecutarMudanza(centroId, usuarioId, tx);
      const valorTrasPrimera = await valorizadoTotal(tx);

      const segunda = await ejecutarMudanza(centroId, usuarioId, tx);
      const valorTrasSegunda = await valorizadoTotal(tx);

      expect(primera.yaEjecutada).toBe(false);
      expect(primera.insumosMudados).toBeGreaterThan(0);
      expect(segunda.yaEjecutada).toBe(true);
      expect(segunda.insumosMudados).toBe(0);
      expect(segunda.espejosCreados).toBe(0);
      expect(valorTrasSegunda).toBeCloseTo(valorTrasPrimera, 2);
    });
  }, 60_000);

  it('aborta si hay un turno de caja abierto', async () => {
    await enTransaccionRevertida(async (tx) => {
      const cajero = await tx.usuario.findFirstOrThrow({ where: { rol: 'CAJERO' } });
      await tx.cajaTurno.create({
        data: { sucursal_id: sucursalId, cajero_id: cajero.id, estado: 'ABIERTO' },
      });

      // Con la caja abierta puede entrar una venta a mitad de la mudanza: el
      // stock que se está moviendo se descontaría de un lado que ya quedó en
      // cero, y el arqueo del turno cerraría contra un inventario que cambió
      // por debajo.
      await expect(ejecutarMudanza(centroId, usuarioId, tx)).rejects.toThrow(/turno/i);
    });
  });

  it('la reversión deja el stock como estaba antes de la mudanza', async () => {
    await enTransaccionRevertida(async (tx) => {
      const sufijo = Date.now() + 2;
      const harina = await tx.insumo.create({
        data: { nombre: `Harina revert ${sufijo}`, unidad_medida: 'GR', stock_actual: 800, stock_minimo: 0, costo_promedio: 0.05 },
      });
      await tx.stockSucursal.create({
        data: { insumo_id: harina.id, sucursal_id: sucursalId, stock_actual: 800, costo_promedio: 0.05 },
      });

      const valorAntes = await valorizadoTotal(tx);
      await ejecutarMudanza(centroId, usuarioId, tx);
      const devuelto = await revertirMudanza(centroId, usuarioId, tx);
      const valorDespues = await valorizadoTotal(tx);

      expect(devuelto.insumosDevueltos).toBeGreaterThan(0);

      const enSucursal = await tx.stockSucursal.findFirstOrThrow({
        where: { insumo_id: harina.id, sucursal_id: sucursalId },
      });
      expect(enSucursal.stock_actual).toBe(800);
      const enCentro = await tx.stockCentro.findFirst({
        where: { insumo_id: harina.id, centro_id: centroId },
      });
      expect(enCentro?.stock_actual ?? 0).toBe(0);
      expect(valorDespues).toBeCloseTo(valorAntes, 2);

      // Y se puede volver a mudar: la reversión libera la marca de idempotencia.
      const otra = await ejecutarMudanza(centroId, usuarioId, tx);
      expect(otra.yaEjecutada).toBe(false);
    });
  }, 120_000);

  it('revertir sin una mudanza previa avisa en vez de tocar nada', async () => {
    await enTransaccionRevertida(async (tx) => {
      await expect(revertirMudanza(centroId, usuarioId, tx)).rejects.toThrow(/no hay ninguna mudanza/i);
    });
  });
});
