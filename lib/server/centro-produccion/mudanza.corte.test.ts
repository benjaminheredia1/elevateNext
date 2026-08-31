import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';
import { costoFichaTecnica } from '@/lib/server/inventario/inventario.service';
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
      // La mudanza aborta con un turno de caja abierto, y la BD de tests es
      // compartida: un E2E de caja deja el suyo abierto y haria fallar a todos
      // los casos de este archivo por una razon que no es la que prueban. Se
      // cierran DENTRO de la transaccion, que se revierte igual: en la base no
      // queda cerrado nada. La guarda en si tiene su propio test, mas abajo,
      // que abre uno a proposito.
      await tx.cajaTurno.updateMany({ where: { estado: 'ABIERTO' }, data: { estado: 'CERRADO' } });
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

  /**
   * El costo de ficha NO es uno solo por producto: cada sucursal tiene su
   * receta y sus costos. El CMV de las ventas sin costo congelado se recalcula
   * en vivo y POR sucursal, asi que si el espejo guardara un costo global, las
   * ventas viejas de un local pasarian a costearse con el costo de otro y el
   * estado de resultados de meses ya cerrados cambiaria solo por haber mudado
   * el inventario. Medido en el sandbox antes de arreglarlo: Bs 3.500.
   */
  it('el espejo hereda el costo de ficha DE CADA sucursal, no uno global', async () => {
    await enTransaccionRevertida(async (tx) => {
      const sufijo = Date.now() + 3;
      const otra = await tx.sucursal.create({ data: { nombre: `Sucursal costo distinto ${sufijo}` } });

      const harina = await tx.insumo.create({
        data: { nombre: `Harina dos costos ${sufijo}`, unidad_medida: 'GR', stock_actual: 0, stock_minimo: 0, costo_promedio: 0.02 },
      });
      // El mismo insumo cuesta el doble en el otro local.
      await tx.stockSucursal.create({
        data: { insumo_id: harina.id, sucursal_id: sucursalId, stock_actual: 500, costo_promedio: 0.02 },
      });
      await tx.stockSucursal.create({
        data: { insumo_id: harina.id, sucursal_id: otra.id, stock_actual: 500, costo_promedio: 0.04 },
      });

      const producto = await tx.producto.create({
        data: { nombre: `Torta dos costos ${sufijo}`, descripcion: 'x', precio: 30, tipo: 'ELABORADO', estado_publicacion: 'PUBLICADO' },
      });
      // Misma receta en los dos locales: 100 GR.
      await tx.recetasProducto.create({
        data: { producto_id: producto.id, insumo_id: harina.id, cantidad_utilizada: 100, sucursal_id: sucursalId },
      });
      await tx.recetasProducto.create({
        data: { producto_id: producto.id, insumo_id: harina.id, cantidad_utilizada: 100, sucursal_id: otra.id },
      });

      // Lo que costaba en cada local ANTES del corte.
      const costoAqui = await costoFichaTecnica(producto.id, tx, sucursalId);
      const costoAlla = await costoFichaTecnica(producto.id, tx, otra.id);
      expect(costoAqui).toBeCloseTo(2, 4);   // 100 × 0,02
      expect(costoAlla).toBeCloseTo(4, 4);   // 100 × 0,04
      expect(costoAlla).not.toBeCloseTo(costoAqui, 4);

      await ejecutarMudanza(centroId, usuarioId, tx);

      const conEspejo = await tx.producto.findUniqueOrThrow({ where: { id: producto.id } });
      expect(conEspejo.insumo_reventa_id).not.toBeNull();

      const filaAqui = await tx.stockSucursal.findUniqueOrThrow({
        where: { insumo_id_sucursal_id: { insumo_id: conEspejo.insumo_reventa_id!, sucursal_id: sucursalId } },
      });
      const filaAlla = await tx.stockSucursal.findUniqueOrThrow({
        where: { insumo_id_sucursal_id: { insumo_id: conEspejo.insumo_reventa_id!, sucursal_id: otra.id } },
      });

      // Cada local conserva SU costo: el CMV historico de cada uno no se mueve.
      expect(filaAqui.costo_promedio).toBeCloseTo(costoAqui, 4);
      expect(filaAlla.costo_promedio).toBeCloseTo(costoAlla, 4);
    });
  }, 120_000);

  /**
   * El agujero que encontro el usuario mirando /admin/centro-produccion: el
   * corte movia el insumo bruto, pero dejaba al Centro SIN NINGUNA forma de
   * abastecer los productos de reventa. Medido sobre el sandbox: de 75
   * productos vivos, el Centro podia producir 19 y despachar 0. Los otros 56
   * —Coca Cola, alfajores, brownies— se venderian hasta agotar el stock de la
   * sucursal y nadie podria reponerlos: la sucursal perdio la compra en la
   * fase 3 y el Centro no los tenia.
   *
   * Despues del corte, TODO producto vivo tiene que tener fila en el Centro,
   * aunque sea en cero, para que el Centro pueda producirlo o comprarlo y
   * despacharlo.
   */
  it('deja a TODO producto vivo con origen en el Centro', async () => {
    await enTransaccionRevertida(async (tx) => {
      const sufijo = Date.now() + 4;

      // Un elaborado con receta: el Centro lo produce.
      const harina = await tx.insumo.create({
        data: { nombre: `Harina origen ${sufijo}`, unidad_medida: 'GR', stock_actual: 500, stock_minimo: 0, costo_promedio: 0.02 },
      });
      await tx.stockSucursal.create({
        data: { insumo_id: harina.id, sucursal_id: sucursalId, stock_actual: 500, costo_promedio: 0.02 },
      });
      const elaborado = await tx.producto.create({
        data: { nombre: `Torta origen ${sufijo}`, descripcion: 'x', precio: 30, tipo: 'ELABORADO', estado_publicacion: 'PUBLICADO' },
      });
      await tx.recetasProducto.create({
        data: { producto_id: elaborado.id, insumo_id: harina.id, cantidad_utilizada: 100, sucursal_id: sucursalId },
      });

      // Un producto de reventa con su espejo y stock en la sucursal: el Centro
      // no lo produce, lo compra.
      const espejoReventa = await tx.insumo.create({
        data: { nombre: `Gaseosa origen ${sufijo}`, unidad_medida: 'UNIDAD', stock_actual: 12, stock_minimo: 0, costo_promedio: 7 },
      });
      const reventa = await tx.producto.create({
        data: {
          nombre: `Gaseosa origen ${sufijo}`, descripcion: 'x', precio: 12,
          tipo: 'REVENTA', estado_publicacion: 'PUBLICADO', insumo_reventa_id: espejoReventa.id,
        },
      });
      await tx.stockSucursal.create({
        data: { insumo_id: espejoReventa.id, sucursal_id: sucursalId, stock_actual: 12, costo_promedio: 7 },
      });

      await ejecutarMudanza(centroId, usuarioId, tx);

      // Ni un producto vivo puede quedar sin forma de reponerse.
      const vivos = await tx.producto.findMany({
        where: { estado_publicacion: { not: 'BAJA' } },
        select: { id: true, nombre: true, tipo: true, insumo_reventa_id: true },
      });
      const enCentro = new Set((await tx.stockCentro.findMany({
        where: { centro_id: centroId }, select: { insumo_id: true },
      })).map(f => f.insumo_id));

      const sinOrigen = vivos.filter(p => p.insumo_reventa_id == null || !enCentro.has(p.insumo_reventa_id));
      expect(sinOrigen.map(p => p.nombre)).toEqual([]);

      // La sucursal NO se queda sin nada que vender: lo que tenia en gondola
      // sigue siendo suyo. El Centro arranca en cero y repone.
      const gondola = await tx.stockSucursal.findUniqueOrThrow({
        where: { insumo_id_sucursal_id: { insumo_id: espejoReventa.id, sucursal_id: sucursalId } },
      });
      expect(gondola.stock_actual).toBe(12);

      // El tipo en la BD es la verdad DEL CENTRO —si lo compra o lo produce—:
      // el corte no convierte lo elaborado en otra cosa. Lo unico que normaliza
      // es TERCIADO, que desde el Centro no existe (ver el caso siguiente).
      const elaboradoDespues = await tx.producto.findUniqueOrThrow({ where: { id: elaborado.id } });
      const reventaDespues = await tx.producto.findUniqueOrThrow({ where: { id: reventa.id } });
      expect(elaboradoDespues.tipo).toBe('ELABORADO');
      expect(reventaDespues.tipo).toBe('REVENTA');
    });
  }, 120_000);

  it('el corte normaliza los TERCIADO: desde el Centro eso no existe', async () => {
    await enTransaccionRevertida(async (tx) => {
      const sufijo = Date.now() + 5;
      const espejo = await tx.insumo.create({
        data: { nombre: `Espejo terciado ${sufijo}`, unidad_medida: 'UNIDAD', stock_actual: 0, stock_minimo: 0, costo_promedio: 3 },
      });
      const terciado = await tx.producto.create({
        data: {
          nombre: `Terciado viejo ${sufijo}`, descripcion: 'x', precio: 10,
          tipo: 'TERCIADO', estado_publicacion: 'PUBLICADO', insumo_reventa_id: espejo.id,
        },
      });

      await ejecutarMudanza(centroId, usuarioId, tx);

      // El Centro solo produce o compra. Un terciado es algo que alguien mas
      // hace y el Centro compra hecho: reventa.
      const despues = await tx.producto.findUniqueOrThrow({ where: { id: terciado.id } });
      expect(despues.tipo).toBe('REVENTA');
      expect(await tx.producto.count({ where: { tipo: 'TERCIADO' } })).toBe(0);
    });
  }, 120_000);
});
