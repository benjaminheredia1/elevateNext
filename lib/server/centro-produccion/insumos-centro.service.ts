/**
 * insumos-centro.service.ts
 *
 * Operaciones de inventario del Centro de Producción: alta, compra, merma,
 * conteo físico, baja y reactivación de insumo bruto. Equivalente a
 * insumos.service.ts / inventario.service.ts pero para el Centro; nunca toca
 * Insumo.stock_actual (ver stock-centro.service.ts).
 */
import { Prisma } from '@prisma/client';
import type { Rol, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import {
  ajustarStock,
  fijarStock,
  registrarCompra as registrarCompraEnCentro,
} from './stock-centro.service';

interface AltaInsumoInput {
  nombre: string;
  unidad_medida: string;
  stock_inicial: number;
  costo_unitario: number;
  stock_minimo: number;
  punto_critico: number;
}

/**
 * Da de alta un insumo en el Centro. Si ya existe un insumo con ese nombre en
 * el catálogo del negocio, lo reutiliza (evita duplicar el catálogo); si no,
 * lo crea. Rechaza si ese insumo ya está en el inventario de este centro.
 */
export async function altaInsumoEnCentro(
  tx: Prisma.TransactionClient,
  centroId: number,
  input: AltaInsumoInput,
  userId: number,
  rol: Rol,
) {
  const nombre = input.nombre.trim();

  let insumo = await tx.insumo.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
  if (insumo) {
    const yaEnCentro = await tx.stockCentro.findUnique({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumo.id } },
    });
    if (yaEnCentro) throw new ConflictError(`"${insumo.nombre}" ya está en el inventario de este centro`);

    // Reutilizar el insumo del catálogo es el camino común acá (fideo, avena y
    // carne ya vienen cargados desde las sucursales). Aceptar en silencio una
    // unidad distinta a la catalogada dejaría al Centro sumando litros sobre
    // mililitros en el mismo promedio ponderado móvil: el stock y el costo
    // quedan mal por un factor de 1000 y nada avisa. Mejor frenar acá.
    // Comparación normalizada: `Insumo.unidad_medida` es texto libre alimentado
    // por el catálogo administrable de unidades, así que "kg" y "KG" son la
    // misma unidad y no deben disparar un 409 falso.
    const misma = insumo.unidad_medida.trim().toUpperCase() === input.unidad_medida.trim().toUpperCase();
    if (!misma) {
      throw new ConflictError(
        `"${insumo.nombre}" ya existe en el catálogo con unidad ${insumo.unidad_medida}, no ${input.unidad_medida}. ` +
        `Dalo de alta en ${insumo.unidad_medida} o corregí la unidad del insumo en el catálogo.`,
      );
    }
  } else {
    insumo = await tx.insumo.create({
      data: {
        nombre,
        unidad_medida: input.unidad_medida,
        stock_actual: 0,
        stock_minimo: input.stock_minimo,
        punto_critico: input.punto_critico,
        costo_promedio: input.costo_unitario,
      },
    });
  }

  const stock = await tx.stockCentro.create({
    data: {
      centro_id: centroId,
      insumo_id: insumo.id,
      stock_actual: input.stock_inicial,
      costo_promedio: input.costo_unitario,
      stock_minimo: input.stock_minimo,
      punto_critico: input.punto_critico,
    },
  });

  if (input.stock_inicial > 0) {
    await tx.movimientoCentro.create({
      data: {
        centro_id: centroId,
        insumo_id: insumo.id,
        tipo_movimiento: 'INGRESO',
        cantidad: input.stock_inicial,
        descripcion: `Alta inicial de "${insumo.nombre}" en el centro`,
        costo_unitario: input.costo_unitario,
        responsable: String(userId),
      },
    });
  }

  await logAudit({
    usuarioId: userId, rol, accion: 'CREO',
    entidad: 'StockCentro', entidadId: stock.id,
    detalle: `Dio de alta "${insumo.nombre}" en el centro #${centroId} con stock inicial ${input.stock_inicial}`,
  }, tx);

  return { insumo, stock };
}

async function requireEnCentro(tx: Prisma.TransactionClient, centroId: number, insumoId: number) {
  const stock = await tx.stockCentro.findUnique({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
  });
  if (!stock) throw new NotFoundError('El insumo no está en el inventario de este centro');
  return stock;
}

export async function registrarCompraCentro(
  tx: Prisma.TransactionClient,
  centroId: number,
  insumoId: number,
  cantidad: number,
  costoUnitario: number,
  nota: string | undefined,
  userId: number,
  rol: Rol,
  idempotencyKey?: string | null,
) {
  if (cantidad <= 0) throw new ValidationError('La cantidad debe ser positiva');
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');
  await requireEnCentro(tx, centroId, insumoId);

  const nuevoCosto = await registrarCompraEnCentro(tx, insumoId, centroId, cantidad, costoUnitario);

  const mov = await tx.movimientoCentro.create({
    data: {
      centro_id: centroId,
      insumo_id: insumoId,
      tipo_movimiento: 'INGRESO',
      cantidad,
      descripcion: nota ?? `Compra de ${insumo.nombre}`,
      costo_unitario: costoUnitario,
      responsable: String(userId),
      idempotency_key: idempotencyKey ?? null,
    },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'CREO',
    entidad: 'MovimientoCentro', entidadId: mov.id,
    detalle: `Compra ${cantidad} ${insumo.unidad_medida} de "${insumo.nombre}" @ ${costoUnitario} en el centro #${centroId}. Nuevo costo promedio: ${nuevoCosto}`,
    monto: cantidad * costoUnitario,
  }, tx);

  const stock = await tx.stockCentro.findUniqueOrThrow({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
  });
  return { stock, movimiento: mov };
}

export async function registrarMermaCentro(
  tx: Prisma.TransactionClient,
  centroId: number,
  insumoId: number,
  cantidad: number,
  descripcion: string,
  userId: number,
  rol: Rol,
  idempotencyKey?: string | null,
) {
  if (cantidad <= 0) throw new ValidationError('La cantidad debe ser positiva');
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');
  await requireEnCentro(tx, centroId, insumoId);

  await ajustarStock(tx, insumoId, centroId, -cantidad);

  const mov = await tx.movimientoCentro.create({
    data: {
      centro_id: centroId,
      insumo_id: insumoId,
      tipo_movimiento: 'MERMA',
      cantidad: -cantidad,
      descripcion,
      responsable: String(userId),
      idempotency_key: idempotencyKey ?? null,
    },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'MovimientoCentro', entidadId: mov.id,
    detalle: `Merma ${cantidad} ${insumo.unidad_medida} de "${insumo.nombre}" en el centro #${centroId}`,
  }, tx);

  const stock = await tx.stockCentro.findUniqueOrThrow({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
  });
  return { stock, movimiento: mov };
}

export async function registrarConteoFisicoCentro(
  tx: Prisma.TransactionClient,
  centroId: number,
  insumoId: number,
  nuevoStock: number,
  descripcion: string | undefined,
  userId: number,
  rol: Rol,
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');
  await requireEnCentro(tx, centroId, insumoId);

  const { delta: varianza } = await fijarStock(tx, insumoId, centroId, nuevoStock);

  const mov = await tx.movimientoCentro.create({
    data: {
      centro_id: centroId,
      insumo_id: insumoId,
      tipo_movimiento: 'AJUSTE',
      cantidad: varianza,
      descripcion: descripcion ?? `Conteo físico. Varianza: ${varianza >= 0 ? '+' : ''}${varianza}`,
      responsable: String(userId),
    },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'MovimientoCentro', entidadId: mov.id,
    detalle: `Conteo físico "${insumo.nombre}" (centro #${centroId}): varianza ${varianza >= 0 ? '+' : ''}${varianza}`,
  }, tx);

  const stock = await tx.stockCentro.findUniqueOrThrow({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
  });
  return { stock, movimiento: mov, varianza };
}

export async function darDeBajaInsumoCentro(
  centroId: number,
  insumoId: number,
  motivo: string,
  userId: number,
  rol: Rol,
  db: PrismaClient = prisma,
) {
  const insumo = await db.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  const stock = await db.stockCentro.findUnique({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
  });
  if (!stock) throw new NotFoundError('El insumo no está en el inventario de este centro');
  if (!stock.activo) throw new ConflictError('El insumo ya está de baja en este centro');

  return db.$transaction(async (tx) => {
    const actualizado = await tx.stockCentro.update({
      where: { id: stock.id },
      data: { activo: false, fecha_baja: new Date(), motivo_baja: motivo },
    });

    await logAudit({
      usuarioId: userId, rol, accion: 'MODIFICO',
      entidad: 'StockCentro', entidadId: actualizado.id,
      detalle: `Insumo "${insumo.nombre}" dado de baja en el centro #${centroId}. Motivo: ${motivo}`,
    }, tx);

    return { insumo, stock: actualizado };
  });
}

/**
 * Cambia los umbrales de alerta (stock mínimo, punto crítico) de un insumo
 * EN ESTE CENTRO. Viven en StockCentro y no en Insumo (catálogo compartido con
 * las sucursales) por la misma razón que StockSucursal tiene los suyos propios:
 * cada ubicación decide cuándo quiere que le avisen, según su propio ritmo de
 * consumo — el mínimo del Centro no tiene por qué coincidir con el de un local.
 * No toca stock_actual ni costo_promedio.
 */
export async function editarUmbralesCentro(
  centroId: number,
  insumoId: number,
  umbrales: { stock_minimo: number; punto_critico: number },
  userId: number,
  rol: Rol,
  db: PrismaClient = prisma,
) {
  const insumo = await db.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  const stock = await db.stockCentro.findUnique({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
  });
  if (!stock) throw new NotFoundError('El insumo no está en el inventario de este centro');

  return db.$transaction(async (tx) => {
    const actualizado = await tx.stockCentro.update({
      where: { id: stock.id },
      data: { stock_minimo: umbrales.stock_minimo, punto_critico: umbrales.punto_critico },
    });

    await logAudit({
      usuarioId: userId, rol, accion: 'MODIFICO',
      entidad: 'StockCentro', entidadId: actualizado.id,
      detalle: `Umbrales de "${insumo.nombre}" en el centro #${centroId} actualizados: mínimo ${umbrales.stock_minimo}, crítico ${umbrales.punto_critico}`,
    }, tx);

    return { insumo, stock: actualizado };
  });
}

export async function reactivarInsumoCentro(
  centroId: number,
  insumoId: number,
  userId: number,
  rol: Rol,
  db: PrismaClient = prisma,
) {
  const insumo = await db.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  const stock = await db.stockCentro.findUnique({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
  });
  if (!stock) throw new NotFoundError('El insumo no está en el inventario de este centro');
  if (stock.activo) throw new ConflictError('El insumo ya está activo en este centro');

  return db.$transaction(async (tx) => {
    const actualizado = await tx.stockCentro.update({
      where: { id: stock.id },
      data: { activo: true, fecha_baja: null, motivo_baja: null },
    });

    await logAudit({
      usuarioId: userId, rol, accion: 'MODIFICO',
      entidad: 'StockCentro', entidadId: actualizado.id,
      detalle: `Insumo "${insumo.nombre}" reactivado en el centro #${centroId}`,
    }, tx);

    return { insumo, stock: actualizado };
  });
}
