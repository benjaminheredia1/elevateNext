/**
 * mudanza.service.ts
 *
 * Helpers del corte que muda el insumo bruto de las sucursales al Centro.
 * Viven separados del script para poder testearlos sin mover datos: el script
 * se corre una sola vez y a mano, pero estas reglas —qué es bruto y a qué
 * costo queda— tienen que poder verificarse todas las veces que haga falta.
 */
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ConflictError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import { costoFichaTecnica } from '@/lib/server/inventario/inventario.service';
import { valorEnTransito } from './traslados.service';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Marca de idempotencia del corte. Va dentro de la `descripcion` del kardex:
 * MovimientoCentro y MovimientoInterno no tienen un campo `motivo`, y agregar
 * una columna para esto sería estructura nueva para un evento que ocurre una
 * sola vez. Además queda visible para quien lea el historial, que es donde se
 * va a preguntar "¿y esto de dónde salió?".
 */
export const MOTIVO_MUDANZA = 'MUDANZA_CENTRO';

/**
 * Marca de los movimientos que deshacen el corte. No contiene a MOTIVO_MUDANZA
 * como subcadena a propósito: si lo contuviera, la reversión se leería a sí
 * misma como una mudanza ya hecha y el corte no podría volver a correr.
 */
export const MOTIVO_REVERSION = 'REVERSION_MUDANZA';

/**
 * Promedio ponderado por cantidad. Promediar los costos a secas haría que el
 * local que compró 2 kg caros pese lo mismo que el que compró 10 kg baratos, y
 * el valorizado del Centro no cerraría contra el de las sucursales.
 *
 * Se acumula en Decimal y se convierte a Number recién al final: sumar floats
 * intermedios arrastra centavos, y acá el resultado es el costo con el que se
 * va a costear todo desde el corte en adelante.
 */
export function consolidarCosto(lotes: { cantidad: number; costo: number }[]): number {
  let cantidadTotal = new Prisma.Decimal(0);
  let valorTotal = new Prisma.Decimal(0);

  for (const lote of lotes) {
    // Un lote en cero no aporta valor y sí ensuciaría el divisor.
    if (lote.cantidad === 0) continue;
    cantidadTotal = cantidadTotal.plus(lote.cantidad);
    valorTotal = valorTotal.plus(new Prisma.Decimal(lote.cantidad).times(lote.costo));
  }

  // Sin cantidad neta no hay costo que promediar. Pasa con un local en
  // negativo que cancela a otro en positivo: devolver el cociente daría
  // Infinity o NaN y envenenaría el valorizado del Centro.
  if (cantidadTotal.isZero()) return 0;

  return valorTotal.dividedBy(cantidadTotal).toNumber();
}

/**
 * Un insumo es "espejo" si algún producto lo apunta con `insumo_reventa_id`: es
 * el stock de un producto terminado, no un ingrediente. Se deriva de la
 * relación en vez de guardarse en una columna para que no pueda quedar
 * desincronizado con la realidad.
 */
export async function esInsumoEspejo(insumoId: number, db: Db = prisma): Promise<boolean> {
  const producto = await db.producto.findFirst({
    where: { insumo_reventa_id: insumoId },
    select: { id: true },
  });
  return producto !== null;
}

/**
 * Los insumos que ningún producto usa como espejo: el insumo bruto a mudar.
 *
 * Es la lista que define el alcance del corte. Un espejo que se colara acá
 * mudaría al Centro el stock de un producto terminado que la sucursal tiene
 * para vender hoy, y la dejaría sin poder venderlo.
 */
export async function listarInsumosBrutos(db: Db = prisma): Promise<{ id: number; nombre: string }[]> {
  return db.insumo.findMany({
    where: { productos_reventa: { none: {} } },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
}

/**
 * Toda la mercadería del negocio, mire donde mire: el stock de las sucursales,
 * el del Centro y lo que viaja entre ambos.
 *
 * Es el invariante del corte. La mudanza cambia la plata de casillero, no de
 * monto: si este número se mueve, algo se perdió o se duplicó en el camino.
 */
export async function valorizadoTotal(db: Db = prisma): Promise<number> {
  const [enSucursales, enCentros] = await Promise.all([
    db.stockSucursal.findMany({ select: { stock_actual: true, costo_promedio: true } }),
    db.stockCentro.findMany({ select: { stock_actual: true, costo_promedio: true } }),
  ]);

  let total = new Prisma.Decimal(0);
  for (const f of [...enSucursales, ...enCentros]) {
    total = total.plus(new Prisma.Decimal(f.stock_actual).times(f.costo_promedio));
  }
  // El tránsito ya salió de un lado y no llegó al otro: sin sumarlo, un envío
  // en curso se leería como mercadería evaporada.
  total = total.plus(await valorEnTransito({}, db));

  return total.toNumber();
}

/**
 * EL CORTE: muda el insumo bruto de las sucursales al Centro de Producción.
 *
 * NO abre transacción propia: la abre quien llama, igual que
 * `definirRecetaCentro`. Son cientos de escrituras que tienen que vivir o morir
 * juntas —un corte a medias deja el inventario partido en dos— y dejar la
 * transacción afuera permite además ejercerla en los tests y revertirla, sin
 * mudar de verdad la base de pruebas.
 *
 * El orden de los pasos NO es intercambiable: ver el comentario de cada uno.
 */
export async function ejecutarMudanza(centroId: number, usuarioId: number, db: Db = prisma) {
  // ── Idempotencia: la marca es el propio kardex ──────────────────────
  // No hace falta una tabla de control: si el Centro ya recibió un ingreso
  // marcado como mudanza, el corte ya ocurrió.
  const yaHecha = await db.movimientoCentro.findFirst({
    where: { descripcion: { contains: MOTIVO_MUDANZA } },
    select: { id: true },
  });
  if (yaHecha) {
    return { insumosMudados: 0, espejosCreados: 0, recetasCopiadas: 0, yaEjecutada: true };
  }

  // ── Precondición: nada en movimiento ───────────────────────────────
  // Con la caja abierta puede entrar una venta a mitad del corte: descontaría
  // stock de un lado que ya quedó en cero y el arqueo cerraría contra un
  // inventario que cambió por debajo.
  const turnoAbierto = await db.cajaTurno.findFirst({ where: { estado: 'ABIERTO' }, select: { id: true } });
  if (turnoAbierto) {
    throw new ConflictError('Hay un turno de caja abierto: cerrá la caja antes de mudar el inventario.');
  }

  const valorAntes = await valorizadoTotal(db);

  // ── Paso 1: calcular ANTES de mover ────────────────────────────────
  // Con el stock ya mudado, costoFichaTecnica devolvería 0 y el costo real del
  // producto se perdería para siempre. Por eso se calcula primero.
  const elaborados = await db.producto.findMany({
    where: { insumo_reventa_id: null, estado_publicacion: { not: 'BAJA' } },
    select: { id: true, nombre: true },
  });
  const sucursales = await db.sucursal.findMany({ where: { activa: true }, select: { id: true } });
  const costoPrevio = new Map<number, number>();
  // El costo de ficha NO es uno solo por producto: cada sucursal tiene su
  // receta y sus costos, y el CMV histórico lo pide POR sucursal. Guardar un
  // costo global en el espejo haría que las ventas viejas de un local pasen a
  // costearse con el costo de otro, y el estado de resultados de meses ya
  // cerrados cambiaría solo por haber mudado el inventario.
  const costoPrevioPorSucursal = new Map<string, number>();
  for (const p of elaborados) {
    costoPrevio.set(p.id, await costoFichaTecnica(p.id, db as Prisma.TransactionClient));
    for (const s of sucursales) {
      costoPrevioPorSucursal.set(
        `${p.id}:${s.id}`,
        await costoFichaTecnica(p.id, db as Prisma.TransactionClient, s.id),
      );
    }
  }

  // ── Paso 2: crear los espejos faltantes ────────────────────────────
  // Desde el corte, la sucursal no arma nada: vende unidades de producto
  // terminado, y para tener stock propio cada producto necesita su espejo.
  let espejosCreados = 0;
  for (const p of elaborados) {
    const costo = costoPrevio.get(p.id) ?? 0;
    const espejo = await db.insumo.create({
      data: {
        nombre: p.nombre,
        unidad_medida: 'UNIDAD',
        stock_actual: 0,
        stock_minimo: 0,
        // El agregado del catálogo se queda con el costo global; el que se usa
        // para costear es el de cada fila de sucursal, acá abajo.
        costo_promedio: costo,
        es_mixto: false,
      },
    });
    await db.producto.update({ where: { id: p.id }, data: { insumo_reventa_id: espejo.id } });
    for (const s of sucursales) {
      await db.stockSucursal.create({
        data: {
          insumo_id: espejo.id,
          sucursal_id: s.id,
          stock_actual: 0,
          costo_promedio: costoPrevioPorSucursal.get(`${p.id}:${s.id}`) ?? costo,
        },
      });
    }
    espejosCreados++;
  }

  // ── Paso 3: mudar el insumo bruto ──────────────────────────────────
  // Después del paso 2 a propósito: listarInsumosBrutos excluye los espejos, y
  // los espejos recién creados no deben mudarse — son el stock de la sucursal.
  const brutos = await listarInsumosBrutos(db);
  let insumosMudados = 0;
  for (const bruto of brutos) {
    const filas = await db.stockSucursal.findMany({
      where: { insumo_id: bruto.id, stock_actual: { not: 0 } },
    });
    if (filas.length === 0) continue;

    const costo = consolidarCosto(filas.map(f => ({ cantidad: f.stock_actual, costo: f.costo_promedio })));
    const total = filas.reduce((acc, f) => acc + f.stock_actual, 0);

    for (const fila of filas) {
      await db.movimientoInterno.create({
        data: {
          insumo_id: bruto.id,
          sucursal_id: fila.sucursal_id,
          tipo_movimiento: 'EGRESO',
          cantidad: fila.stock_actual,
          descripcion: `${MOTIVO_MUDANZA}: ${bruto.nombre} pasa al Centro de Producción`,
          costo_unitario: fila.costo_promedio,
          responsable: String(usuarioId),
        },
      });
      await db.stockSucursal.update({ where: { id: fila.id }, data: { stock_actual: 0 } });
    }

    await db.movimientoCentro.create({
      data: {
        centro_id: centroId,
        insumo_id: bruto.id,
        tipo_movimiento: 'INGRESO',
        cantidad: total,
        descripcion: `${MOTIVO_MUDANZA}: ${bruto.nombre} recibido de las sucursales`,
        costo_unitario: costo,
        responsable: String(usuarioId),
      },
    });
    await db.stockCentro.upsert({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: bruto.id } },
      create: { centro_id: centroId, insumo_id: bruto.id, stock_actual: total, costo_promedio: costo },
      update: { stock_actual: { increment: total }, costo_promedio: costo },
    });
    insumosMudados++;
  }

  // ── Paso 4: recetas al Centro y TERCIADO → ELABORADO ───────────────
  // La receta local NO se borra: queda como histórico de cómo se costeó lo que
  // ya se vendió. Desde acá la que manda para producir es la del Centro.
  const recetasLocales = await db.recetasProducto.findMany();
  let recetasCopiadas = 0;
  for (const r of recetasLocales) {
    await db.recetaCentro.upsert({
      where: {
        centro_id_producto_id_insumo_id: {
          centro_id: centroId, producto_id: r.producto_id, insumo_id: r.insumo_id,
        },
      },
      create: {
        centro_id: centroId, producto_id: r.producto_id,
        insumo_id: r.insumo_id, cantidad_utilizada: r.cantidad_utilizada,
      },
      update: { cantidad_utilizada: r.cantidad_utilizada },
    });
    recetasCopiadas++;
  }
  // Ya no hay diferencia entre "lo hago yo" y "me lo hacen": todo lo que la
  // sucursal vende viene terminado del Centro.
  await db.producto.updateMany({ where: { tipo: 'TERCIADO' }, data: { tipo: 'ELABORADO' } });

  // ── Verificación: la plata cambia de casillero, no de monto ────────
  const valorDespues = await valorizadoTotal(db);
  const diferencia = Math.abs(valorDespues - valorAntes);
  if (diferencia > 0.01) {
    throw new ConflictError(
      `La mudanza no conserva el valorizado: antes ${valorAntes.toFixed(2)}, después ${valorDespues.toFixed(2)}. Se revirtió todo.`,
    );
  }

  await logAudit({
    usuarioId,
    rol: 'DUENO',
    accion: 'MODIFICO',
    entidad: 'CentroProduccion',
    entidadId: centroId,
    detalle: `Mudanza de insumo bruto al Centro: ${insumosMudados} insumos, ${espejosCreados} espejos, ${recetasCopiadas} recetas`,
  }, db as Prisma.TransactionClient);

  return { insumosMudados, espejosCreados, recetasCopiadas, yaEjecutada: false };
}

/**
 * Deshace la mudanza usando su propio kardex al revés.
 *
 * Solo tiene sentido la MISMA NOCHE del corte: apenas empiezan las ventas del
 * día siguiente el stock ya se movió por otras razones, y devolver las
 * cantidades originales pisaría esos movimientos.
 *
 * No es una reversión perfecta y no pretende serlo: las RecetaCentro copiadas
 * quedan (no hay forma de distinguir las que copió el corte de las que ya
 * existían) y los TERCIADO convertidos a ELABORADO no vuelven. Lo que sí queda
 * exacto es lo que importa: el stock y la plata.
 *
 * Como `ejecutarMudanza`, no abre transacción propia: la abre quien llama.
 */
export async function revertirMudanza(centroId: number, usuarioId: number, db: Db = prisma) {
  const movimientos = await db.movimientoInterno.findMany({
    where: { descripcion: { contains: MOTIVO_MUDANZA } },
  });
  if (movimientos.length === 0) {
    throw new ConflictError('No hay ninguna mudanza que revertir.');
  }

  // Devolver a cada sucursal exactamente lo que se le sacó.
  for (const mov of movimientos) {
    await db.stockSucursal.updateMany({
      where: { insumo_id: mov.insumo_id, sucursal_id: mov.sucursal_id },
      data: { stock_actual: { increment: mov.cantidad } },
    });
    await db.movimientoInterno.create({
      data: {
        insumo_id: mov.insumo_id,
        sucursal_id: mov.sucursal_id,
        tipo_movimiento: 'INGRESO',
        cantidad: mov.cantidad,
        descripcion: `${MOTIVO_REVERSION}: devuelto a la sucursal`,
        costo_unitario: mov.costo_unitario,
        responsable: String(usuarioId),
      },
    });
  }

  // Descontar del Centro lo que había entrado.
  const enCentro = await db.movimientoCentro.findMany({
    where: { descripcion: { contains: MOTIVO_MUDANZA } },
  });
  for (const mov of enCentro) {
    await db.stockCentro.updateMany({
      where: { centro_id: centroId, insumo_id: mov.insumo_id },
      data: { stock_actual: { decrement: mov.cantidad } },
    });
    await db.movimientoCentro.create({
      data: {
        centro_id: centroId,
        insumo_id: mov.insumo_id,
        tipo_movimiento: 'EGRESO',
        cantidad: mov.cantidad,
        descripcion: `${MOTIVO_REVERSION}: devuelto a las sucursales`,
        costo_unitario: mov.costo_unitario,
        responsable: String(usuarioId),
      },
    });
  }

  // Desvincular los espejos que creó el corte: sin el vínculo,
  // resolverConsumoInsumos vuelve a usar la receta local. El Insumo espejo se
  // deja (stock 0, no molesta): borrarlo sería borrado físico de algo con
  // kardex, y el proyecto no hace eso.
  //
  // El filtro es aproximado a propósito. Si el corte ya generó ventas, esos
  // espejos tienen stock distinto de 0 y NO se desvinculan — que es lo que se
  // quiere: a esa altura revertir ya no es limpio y conviene que se note.
  const espejosDelCorte = await db.insumo.findMany({
    where: {
      unidad_medida: 'UNIDAD',
      stock_actual: 0,
      productos_reventa: { some: { tipo: 'ELABORADO' } },
    },
    select: { id: true },
  });
  await db.producto.updateMany({
    where: { insumo_reventa_id: { in: espejosDelCorte.map(e => e.id) }, tipo: 'ELABORADO' },
    data: { insumo_reventa_id: null },
  });

  // Liberar la marca de idempotencia. Es el único borrado físico admisible
  // acá, y solo sobre las filas que la propia mudanza creó: sin esto el corte
  // no podría volver a correr, que es justamente para lo que se revierte.
  await db.movimientoInterno.deleteMany({ where: { descripcion: { contains: MOTIVO_MUDANZA } } });
  await db.movimientoCentro.deleteMany({ where: { descripcion: { contains: MOTIVO_MUDANZA } } });

  await logAudit({
    usuarioId,
    rol: 'DUENO',
    accion: 'MODIFICO',
    entidad: 'CentroProduccion',
    entidadId: centroId,
    detalle: `Reversión de la mudanza: ${movimientos.length} movimientos devueltos a sus sucursales`,
  }, db as Prisma.TransactionClient);

  return { insumosDevueltos: enCentro.length };
}
