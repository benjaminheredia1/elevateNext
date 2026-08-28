/**
 * produccion.service.ts
 *
 * Fase 2 del Centro de Producción: transformar insumo bruto en producto
 * terminado. La receta de producción (RecetaCentro) es a este servicio lo que
 * RecetasProducto es a la venta, con una diferencia importante: acá la receta
 * no se consume al vender sino al PRODUCIR, y lo que queda acreditado es el
 * "insumo espejo" del producto (Producto.insumo_reventa_id), que es la misma
 * pieza que ya usa un producto de reventa para tener stock propio.
 *
 * Igual que el resto del subsistema, no toca StockSucursal ni
 * Insumo.stock_actual: el producto terminado vive en el Centro hasta que un
 * traslado lo mueva a una sucursal.
 */
import { Prisma } from '@prisma/client';
import type { Rol, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import { ajustarStock, registrarCompra as acreditarEnCentro } from './stock-centro.service';

type Db = PrismaClient | Prisma.TransactionClient;

export interface LineaRecetaCentro {
  insumo_id: number;
  cantidad_utilizada: number;
}

export interface ItemRecetaCentro extends LineaRecetaCentro {
  nombre: string;
  unidad_medida: string;
  costo_promedio: number;
  stock_actual: number;
}

/**
 * Resuelve el insumo espejo del producto, creándolo si todavía no existe.
 *
 * Un producto no tiene stock propio: lo que tiene stock es un insumo. Para un
 * producto de reventa ese insumo lo crea el alta del producto; para uno que se
 * produce en el Centro puede no existir todavía, y sin él la producción no
 * tendría dónde acreditar lo fabricado. Se crea con unidad UNIDAD y costo 0: el
 * costo real lo fija la primera producción, ponderado como cualquier ingreso.
 */
async function resolverInsumoEspejo(db: Db, productoId: number) {
  const producto = await db.producto.findUnique({
    where: { id: productoId },
    select: { id: true, nombre: true, insumo_reventa_id: true },
  });
  if (!producto) throw new NotFoundError('Producto no encontrado');

  if (producto.insumo_reventa_id) {
    return db.insumo.findUniqueOrThrow({ where: { id: producto.insumo_reventa_id } });
  }

  const espejo = await db.insumo.create({
    data: {
      nombre: producto.nombre,
      unidad_medida: 'UNIDAD',
      stock_actual: 0,
      stock_minimo: 0,
      costo_promedio: 0,
      es_mixto: false,
    },
  });
  await db.producto.update({ where: { id: productoId }, data: { insumo_reventa_id: espejo.id } });
  return espejo;
}

/**
 * Define (reemplaza) la receta de producción de un producto en un centro.
 *
 * Se reemplaza entera y no se hace merge: una receta a medio actualizar es peor
 * que una vieja, porque produce con gramajes que nadie eligió.
 *
 * NO abre transacción propia: la abre quien llama. Escribe en tres tablas
 * (insumo espejo, StockCentro y RecetaCentro) más la auditoría, así que
 * llamarla suelta deja esas escrituras sin atomicidad — las dos rutas que la
 * usan la envuelven. Es a propósito: el alta de producto desde el Centro
 * necesita crear el producto y su receta en la MISMA transacción, y si el
 * servicio abriera la suya no podría participar de la de afuera.
 */
export async function definirRecetaCentro(
  centroId: number,
  productoId: number,
  lineas: LineaRecetaCentro[],
  userId: number,
  rol: Rol,
  db: Db = prisma,
) {
  if (lineas.length === 0) throw new ValidationError('La receta necesita al menos un insumo');

  const insumoIds = lineas.map(l => l.insumo_id);
  if (new Set(insumoIds).size !== insumoIds.length) {
    throw new ValidationError('La receta tiene el mismo insumo repetido');
  }

  const centro = await db.centroProduccion.findUnique({ where: { id: centroId } });
  if (!centro) throw new NotFoundError('Centro de producción no encontrado');

  const producto = await db.producto.findUnique({ where: { id: productoId }, select: { id: true, nombre: true } });
  if (!producto) throw new NotFoundError('Producto no encontrado');

  // Los insumos de la receta tienen que estar en el inventario del centro: una
  // receta que pide un insumo que el centro no maneja no se puede producir
  // nunca, y el error aparecería recién al intentar producir.
  const enCentro = await db.stockCentro.findMany({
    where: { centro_id: centroId, insumo_id: { in: insumoIds } },
    select: { insumo_id: true },
  });
  const faltantes = insumoIds.filter(id => !enCentro.some(e => e.insumo_id === id));
  if (faltantes.length > 0) {
    throw new ConflictError(`Estos insumos no están en el inventario del centro: ${faltantes.join(', ')}`);
  }

  const espejo = await resolverInsumoEspejo(db, productoId);

  // El insumo espejo tiene que existir en el inventario del centro para poder
  // recibir lo producido.
  await db.stockCentro.upsert({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: espejo.id } },
    create: { centro_id: centroId, insumo_id: espejo.id, stock_actual: 0, costo_promedio: 0 },
    update: {},
  });

  await db.recetaCentro.deleteMany({ where: { centro_id: centroId, producto_id: productoId } });
  await db.recetaCentro.createMany({
    data: lineas.map(l => ({
      centro_id: centroId,
      producto_id: productoId,
      insumo_id: l.insumo_id,
      cantidad_utilizada: l.cantidad_utilizada,
    })),
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'RecetaCentro', entidadId: productoId,
    detalle: `Receta de producción de "${producto.nombre}" en el centro #${centroId}: ${lineas.length} insumo(s)`,
  }, db);

  return obtenerRecetaCentro(centroId, productoId, db);
}

export async function obtenerRecetaCentro(
  centroId: number,
  productoId: number,
  db: Db = prisma,
): Promise<ItemRecetaCentro[]> {
  const lineas = await db.recetaCentro.findMany({
    where: { centro_id: centroId, producto_id: productoId },
    include: { insumo: { select: { id: true, nombre: true, unidad_medida: true } } },
    orderBy: { id: 'asc' },
  });
  if (lineas.length === 0) return [];

  const stocks = await db.stockCentro.findMany({
    where: { centro_id: centroId, insumo_id: { in: lineas.map(l => l.insumo_id) } },
  });

  return lineas.map((l) => {
    const stock = stocks.find(s => s.insumo_id === l.insumo_id);
    return {
      insumo_id: l.insumo_id,
      cantidad_utilizada: l.cantidad_utilizada,
      nombre: l.insumo.nombre,
      unidad_medida: l.insumo.unidad_medida,
      costo_promedio: stock?.costo_promedio ?? 0,
      stock_actual: stock?.stock_actual ?? 0,
    };
  });
}

/**
 * Costo de producir UNA unidad, con los costos promedio de hoy en este centro.
 * Es el equivalente de costoFichaTecnica para la producción.
 */
export function costoUnitarioProduccion(receta: ItemRecetaCentro[]): number {
  const total = receta.reduce((acc, l) => acc + l.cantidad_utilizada * l.costo_promedio, 0);
  // Seis decimales, el mismo redondeo que usa el promedio ponderado del centro.
  return Number(total.toFixed(6));
}

/**
 * Cuántas unidades alcanza a producir el insumo bruto disponible. Misma fórmula
 * que el rinde de una ficha técnica: el mínimo entre los insumos de la receta.
 */
export function rindeDeReceta(receta: ItemRecetaCentro[]): number {
  if (receta.length === 0) return 0;
  return Math.min(...receta.map(l =>
    l.cantidad_utilizada > 0 ? Math.floor(l.stock_actual / l.cantidad_utilizada) : 0,
  ));
}

export interface RindeProducto {
  producto_id: number;
  nombre: string;
  unidades_posibles: number;
  costo_unitario: number;
  insumos: ItemRecetaCentro[];
}

/** Rinde de todos los productos con receta en este centro. */
export async function rindeDelCentro(centroId: number, db: Db = prisma): Promise<RindeProducto[]> {
  const productos = await db.recetaCentro.findMany({
    where: { centro_id: centroId },
    distinct: ['producto_id'],
    select: { producto_id: true, producto: { select: { nombre: true } } },
    orderBy: { producto_id: 'asc' },
  });

  const salida: RindeProducto[] = [];
  for (const p of productos) {
    const receta = await obtenerRecetaCentro(centroId, p.producto_id, db);
    salida.push({
      producto_id: p.producto_id,
      nombre: p.producto.nombre,
      unidades_posibles: rindeDeReceta(receta),
      costo_unitario: costoUnitarioProduccion(receta),
      insumos: receta,
    });
  }
  return salida;
}

/**
 * Registra una producción: consume el insumo bruto de la receta y acredita las
 * unidades terminadas al insumo espejo del producto, en el mismo centro.
 *
 * El costo con el que entra lo producido es la suma de lo que costó el insumo
 * consumido — así el valor total del inventario del centro no cambia por
 * producir, solo cambia de forma. Es la misma idea que el costeo por absorción
 * de materiales: transformar no crea ni destruye valor, lo traslada.
 */
export async function registrarProduccion(
  tx: Prisma.TransactionClient,
  centroId: number,
  productoId: number,
  cantidad: number,
  nota: string | undefined,
  userId: number,
  rol: Rol,
  idempotencyKey?: string | null,
) {
  if (cantidad <= 0) throw new ValidationError('La cantidad a producir debe ser positiva');

  const producto = await tx.producto.findUnique({
    where: { id: productoId },
    select: { id: true, nombre: true, insumo_reventa_id: true },
  });
  if (!producto) throw new NotFoundError('Producto no encontrado');

  const receta = await obtenerRecetaCentro(centroId, productoId, tx);
  if (receta.length === 0) {
    throw new ConflictError(`"${producto.nombre}" no tiene receta de producción en este centro`);
  }

  // Se valida TODO el insumo antes de descontar nada: una producción a medio
  // aplicar dejaría insumo consumido sin producto terminado. La transacción lo
  // revertiría igual, pero el mensaje de error tiene que decir qué faltó.
  const insuficientes = receta
    .filter(l => l.stock_actual < l.cantidad_utilizada * cantidad)
    .map(l => `${l.nombre} (hay ${l.stock_actual} ${l.unidad_medida}, hacen falta ${l.cantidad_utilizada * cantidad})`);
  if (insuficientes.length > 0) {
    throw new ValidationError(`Insumo insuficiente para producir ${cantidad}: ${insuficientes.join('; ')}`);
  }

  const espejo = await resolverInsumoEspejo(tx, productoId);
  const costoUnitario = costoUnitarioProduccion(receta);

  for (const linea of receta) {
    const consumo = linea.cantidad_utilizada * cantidad;
    await ajustarStock(tx, linea.insumo_id, centroId, -consumo);
    await tx.movimientoCentro.create({
      data: {
        centro_id: centroId,
        insumo_id: linea.insumo_id,
        tipo_movimiento: 'PRODUCCION',
        cantidad: -consumo,
        descripcion: `Consumo por producción de ${cantidad} × "${producto.nombre}"`,
        costo_unitario: linea.costo_promedio,
        responsable: String(userId),
      },
    });
  }

  // Lo producido entra ponderado, como cualquier ingreso de stock.
  const nuevoPromedio = await acreditarEnCentro(tx, espejo.id, centroId, cantidad, costoUnitario);

  // La clave de idempotencia va en el movimiento de crédito y no en los de
  // consumo: es una sola por operación (el índice es único en toda la tabla) y
  // este es el movimiento que define la producción. Si el reintento choca acá,
  // la transacción revierte también los consumos.
  const movimiento = await tx.movimientoCentro.create({
    data: {
      centro_id: centroId,
      insumo_id: espejo.id,
      tipo_movimiento: 'PRODUCCION',
      cantidad,
      descripcion: nota ?? `Producción de ${cantidad} × "${producto.nombre}"`,
      costo_unitario: costoUnitario,
      responsable: String(userId),
      idempotency_key: idempotencyKey ?? null,
    },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'CREO',
    entidad: 'MovimientoCentro', entidadId: movimiento.id,
    detalle: `Producción de ${cantidad} × "${producto.nombre}" en el centro #${centroId} @ ${costoUnitario} c/u. Nuevo costo promedio del terminado: ${nuevoPromedio}`,
    monto: cantidad * costoUnitario,
  }, tx);

  const stock = await tx.stockCentro.findUniqueOrThrow({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: espejo.id } },
  });

  return {
    producto: { id: producto.id, nombre: producto.nombre },
    insumo_espejo_id: espejo.id,
    cantidad,
    costo_unitario: costoUnitario,
    costo_total: Number((cantidad * costoUnitario).toFixed(6)),
    stock,
    movimiento,
  };
}
