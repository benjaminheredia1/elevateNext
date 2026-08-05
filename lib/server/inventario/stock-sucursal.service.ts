/**
 * stock-sucursal.service.ts
 *
 * Punto único de escritura del stock. Cada movimiento afecta a la vez:
 *   - StockSucursal: el stock real del local donde ocurrió (fuente de verdad).
 *   - Insumo.stock_actual: el agregado del negocio, que siguen leyendo los
 *     reportes globales todavía no migrados a multi-sucursal.
 *
 * Mantener los dos en el mismo lugar evita que se desincronicen: si alguien
 * escribe stock por fuera de aquí, el agregado deja de cuadrar.
 */
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@/lib/server/errors';

type Db = Prisma.TransactionClient | typeof prisma;

export interface StockDeSucursal {
  insumo_id: number;
  sucursal_id: number;
  stock_actual: number;
  costo_promedio: number;
  stock_minimo: number;
  punto_critico: number;
}

/**
 * Fila de stock del insumo en la sucursal. Si el local todavía no maneja ese
 * insumo, la crea en cero heredando los niveles de alerta del catálogo — así
 * una sucursal nueva arranca sin stock pero con los mínimos ya configurados.
 */
export async function obtenerOCrearStock(
  insumoId: number,
  sucursalId: number,
  db: Db = prisma,
): Promise<StockDeSucursal> {
  const existente = await db.stockSucursal.findUnique({
    where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
  });
  if (existente) return existente;

  const insumo = await db.insumo.findUnique({
    where: { id: insumoId },
    select: { costo_promedio: true, stock_minimo: true, punto_critico: true },
  });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  return db.stockSucursal.create({
    data: {
      insumo_id: insumoId,
      sucursal_id: sucursalId,
      stock_actual: 0,
      costo_promedio: insumo.costo_promedio,
      stock_minimo: insumo.stock_minimo,
      punto_critico: insumo.punto_critico,
    },
  });
}

/**
 * Suma (o resta, con delta negativo) stock en una sucursal y actualiza el
 * agregado del insumo en la misma operación.
 */
export async function ajustarStock(
  db: Db,
  insumoId: number,
  sucursalId: number,
  delta: number,
): Promise<StockDeSucursal> {
  await obtenerOCrearStock(insumoId, sucursalId, db);

  const [fila] = await Promise.all([
    db.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
      data: { stock_actual: { increment: delta } },
    }),
    db.insumo.update({
      where: { id: insumoId },
      data: { stock_actual: { increment: delta } },
    }),
  ]);
  return fila;
}

/** Fija el stock de una sucursal a un valor exacto (conteo físico). */
export async function fijarStock(
  db: Db,
  insumoId: number,
  sucursalId: number,
  nuevoStock: number,
): Promise<{ anterior: number; delta: number }> {
  const actual = await obtenerOCrearStock(insumoId, sucursalId, db);
  const delta = nuevoStock - actual.stock_actual;
  if (delta !== 0) await ajustarStock(db, insumoId, sucursalId, delta);
  return { anterior: actual.stock_actual, delta };
}

/**
 * Costo promedio ponderado de una compra, calculado sobre el stock del local:
 * cada sucursal puede comprarle a otro proveedor y a otro precio.
 */
export async function registrarCompra(
  db: Db,
  insumoId: number,
  sucursalId: number,
  cantidad: number,
  costoUnitario: number,
): Promise<number> {
  if (cantidad <= 0) throw new ValidationError('La cantidad de la compra debe ser mayor a cero');

  const actual = await obtenerOCrearStock(insumoId, sucursalId, db);
  const stockPrevio = Math.max(actual.stock_actual, 0);
  const valorPrevio = stockPrevio * actual.costo_promedio;
  const valorNuevo = cantidad * costoUnitario;
  const stockFinal = stockPrevio + cantidad;
  const nuevoPromedio = stockFinal > 0
    ? Number(((valorPrevio + valorNuevo) / stockFinal).toFixed(6))
    : costoUnitario;

  await ajustarStock(db, insumoId, sucursalId, cantidad);
  await db.stockSucursal.update({
    where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
    data: { costo_promedio: nuevoPromedio },
  });

  return nuevoPromedio;
}

/**
 * Transferencia entre sucursales: sale de una y entra en la otra, dejando dos
 * movimientos trazables. El stock global del negocio no cambia.
 */
export async function transferirStock(args: {
  insumoId: number;
  desdeSucursal: number;
  haciaSucursal: number;
  cantidad: number;
  responsable?: string;
  nota?: string;
}) {
  const { insumoId, desdeSucursal, haciaSucursal, cantidad } = args;
  if (desdeSucursal === haciaSucursal) throw new ValidationError('El origen y el destino deben ser sucursales distintas');
  if (!(cantidad > 0)) throw new ValidationError('La cantidad a transferir debe ser mayor a cero');

  return prisma.$transaction(async (tx) => {
    const origen = await obtenerOCrearStock(insumoId, desdeSucursal, tx);
    if (origen.stock_actual < cantidad) {
      throw new ValidationError(
        `Stock insuficiente en la sucursal de origen (disponible: ${origen.stock_actual})`,
      );
    }

    const insumo = await tx.insumo.findUnique({ where: { id: insumoId }, select: { nombre: true } });
    const nombre = insumo?.nombre ?? `insumo #${insumoId}`;
    const nota = args.nota?.trim() ? ` — ${args.nota.trim()}` : '';

    // El agregado del insumo no debe moverse: la mercadería sigue en el negocio,
    // solo cambia de local. Por eso se ajusta cada sucursal y se compensa.
    await tx.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: desdeSucursal } },
      data: { stock_actual: { decrement: cantidad } },
    });
    await obtenerOCrearStock(insumoId, haciaSucursal, tx);
    await tx.stockSucursal.update({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: haciaSucursal } },
      data: { stock_actual: { increment: cantidad } },
    });

    await tx.movimientoInterno.createMany({
      data: [
        {
          insumo_id: insumoId,
          sucursal_id: desdeSucursal,
          tipo_movimiento: 'AJUSTE',
          cantidad: -cantidad,
          descripcion: `Transferencia de ${nombre} hacia sucursal #${haciaSucursal}${nota}`,
          responsable: args.responsable ?? null,
        },
        {
          insumo_id: insumoId,
          sucursal_id: haciaSucursal,
          tipo_movimiento: 'AJUSTE',
          cantidad,
          descripcion: `Transferencia de ${nombre} desde sucursal #${desdeSucursal}${nota}`,
          responsable: args.responsable ?? null,
        },
      ],
    });

    return { insumo_id: insumoId, cantidad, desde: desdeSucursal, hacia: haciaSucursal };
  }, { maxWait: 10000, timeout: 20000 });
}

/**
 * Habilita insumos de una sucursal en otra: el destino empieza a manejarlos con
 * stock en CERO y los niveles de alerta del origen.
 *
 * Es el equivalente de copiar productos entre locales, y por el mismo motivo:
 * recrear los insumos a mano duplicaría el catálogo con nombres repetidos y
 * partiría el kardex y los costos de recetas entre dos filas distintas. El
 * stock no se copia nunca — la mercadería no se teletransporta; para mover
 * existencias está `transferirStock`.
 */
export async function copiarInsumosASucursal(args: {
  origen: number;
  destino: number;
  insumos: number[];
}): Promise<{ copiados: number; yaEstaban: number }> {
  const { origen, destino, insumos } = args;
  if (origen === destino) throw new ValidationError('El origen y el destino deben ser sucursales distintas');
  if (insumos.length === 0) throw new ValidationError('Elegí al menos un insumo');

  const sucursal = await prisma.sucursal.findUnique({ where: { id: destino }, select: { activa: true } });
  if (!sucursal) throw new ValidationError('La sucursal indicada no existe');
  if (!sucursal.activa) throw new ValidationError('La sucursal indicada está desactivada');

  const enOrigen = await prisma.stockSucursal.findMany({
    where: { sucursal_id: origen, insumo_id: { in: insumos } },
    select: { insumo_id: true, stock_minimo: true, punto_critico: true, costo_promedio: true },
  });
  if (enOrigen.length === 0) {
    throw new ValidationError('Ninguno de los insumos elegidos está en el inventario de la sucursal de origen');
  }

  const yaEnDestino = new Set(
    (await prisma.stockSucursal.findMany({
      where: { sucursal_id: destino, insumo_id: { in: enOrigen.map(f => f.insumo_id) } },
      select: { insumo_id: true },
    })).map(f => f.insumo_id),
  );

  // Los que ya estaban no se tocan: sus mínimos y su costo son del local y
  // pisarlos con los del origen borraría una configuración propia.
  const nuevos = enOrigen.filter(f => !yaEnDestino.has(f.insumo_id));
  if (nuevos.length > 0) {
    await prisma.stockSucursal.createMany({
      data: nuevos.map(f => ({
        insumo_id: f.insumo_id,
        sucursal_id: destino,
        stock_actual: 0,
        costo_promedio: f.costo_promedio,
        stock_minimo: f.stock_minimo,
        punto_critico: f.punto_critico,
      })),
      skipDuplicates: true,
    });
  }

  return { copiados: nuevos.length, yaEstaban: yaEnDestino.size };
}

export interface ResultadoQuitarInsumo {
  /** Movimientos del insumo en ESE local; > 0 impide sacarlo del inventario. */
  movimientos: number;
  stock: number;
}

/**
 * Saca un insumo del inventario de UNA sucursal. Nunca borra el insumo: la fila
 * de `Insumo` es del negocio y la comparten las recetas y el histórico de todos
 * los locales.
 *
 * Solo se permite si ese local nunca movió el insumo y no le queda stock; con
 * movimientos o con existencias se rechaza, porque borrar la fila dejaría un
 * kardex apuntando a un stock que ya no existe. Para el resto de los casos está
 * la baja del insumo (que tampoco lo elimina) o una transferencia.
 */
export async function quitarInsumoDeSucursal(
  insumoId: number,
  sucursalId: number,
): Promise<ResultadoQuitarInsumo> {
  const fila = await prisma.stockSucursal.findUnique({
    where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
  });
  if (!fila) throw new NotFoundError('El insumo no está en el inventario de esa sucursal');

  const movimientos = await prisma.movimientoInterno.count({
    where: { insumo_id: insumoId, sucursal_id: sucursalId },
  });
  if (movimientos > 0) {
    throw new ValidationError(
      `No se puede quitar: este local ya registró ${movimientos} movimiento(s) de este insumo. Su historial quedaría sin respaldo.`,
    );
  }
  if (fila.stock_actual !== 0) {
    throw new ValidationError(
      `No se puede quitar: quedan ${fila.stock_actual} en stock acá. Transferí las existencias a otra sucursal primero.`,
    );
  }

  // El agregado del negocio no se toca: la fila estaba en cero, así que no hay
  // existencias que descontar.
  await prisma.stockSucursal.delete({ where: { id: fila.id } });
  return { movimientos: 0, stock: 0 };
}

/** Inventario de una sucursal, con los datos del catálogo ya resueltos. */
export async function inventarioDeSucursal(sucursalId: number, db: Db = prisma) {
  const filas = await db.stockSucursal.findMany({
    where: { sucursal_id: sucursalId, insumo: { activo: true } },
    include: { insumo: { select: { id: true, nombre: true, unidad_medida: true, categoria_insumo: true, proveedor: true } } },
    orderBy: { insumo: { nombre: 'asc' } },
  });

  return filas.map(fila => ({
    insumo_id: fila.insumo_id,
    sucursal_id: fila.sucursal_id,
    nombre: fila.insumo.nombre,
    unidad_medida: fila.insumo.unidad_medida,
    categoria_insumo: fila.insumo.categoria_insumo,
    proveedor: fila.insumo.proveedor,
    stock_actual: fila.stock_actual,
    costo_promedio: fila.costo_promedio,
    stock_minimo: fila.stock_minimo,
    punto_critico: fila.punto_critico,
    nivel: fila.stock_actual <= fila.punto_critico ? 'critico'
      : fila.stock_actual <= fila.stock_minimo ? 'bajo'
      : 'ok',
  }));
}
