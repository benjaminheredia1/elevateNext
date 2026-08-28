/**
 * traslados.service.ts
 *
 * Fase 3 del Centro de Producción: mover mercadería del Centro a una sucursal.
 *
 * El traslado tiene dos tiempos por una razón operativa, no técnica: entre que
 * la mercadería sale del Centro y llega al local pasa tiempo real, y en ese
 * intervalo no está en ninguno de los dos inventarios. Registrarla en la
 * sucursal al despachar haría que su conteo físico nunca cuadre; dejarla en el
 * Centro haría que el Centro despache dos veces lo mismo.
 *
 * Mientras viaja, el valor vive en los TrasladoDetalle de los traslados
 * EN_TRANSITO — es plata del negocio y `valorEnTransito()` la expone para que
 * los reportes puedan cerrar la ecuación:
 *
 *   valor del negocio = inventario de centros + inventario de sucursales + en tránsito
 */
import { Prisma } from '@prisma/client';
import type { Rol, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import {
  ajustarStock as ajustarStockCentro,
  registrarCompra as acreditarEnCentro,
} from './stock-centro.service';
import {
  ajustarStock as ajustarStockSucursal,
  registrarCompra as acreditarEnSucursal,
} from '@/lib/server/inventario/stock-sucursal.service';

type Db = PrismaClient | Prisma.TransactionClient;

export interface LineaEnvio {
  insumo_id: number;
  cantidad: number;
}

/**
 * Correlativo por centro. Se calcula dentro de la transacción y lo protege el
 * índice único (centro_id, numero): si dos envíos simultáneos sacan el mismo
 * número, el segundo falla y se reintenta, en vez de quedar los dos con el
 * mismo folio.
 */
async function siguienteNumero(tx: Prisma.TransactionClient, centroId: number): Promise<number> {
  const ultimo = await tx.traslado.findFirst({
    where: { centro_id: centroId },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  });
  return (ultimo?.numero ?? 0) + 1;
}

/**
 * Despacha mercadería del Centro a una sucursal.
 *
 * Descuenta del Centro con un movimiento EGRESO por línea y congela el costo
 * unitario de salida en el detalle: si el costo del Centro cambia mientras el
 * traslado viaja, lo que entra a la sucursal tiene que ser lo que salió.
 */
export async function crearEnvio(
  tx: Prisma.TransactionClient,
  centroId: number,
  sucursalId: number,
  lineas: LineaEnvio[],
  observaciones: string | undefined,
  userId: number,
  rol: Rol,
  idempotencyKey?: string | null,
) {
  if (lineas.length === 0) throw new ValidationError('El envío necesita al menos una línea');

  const insumoIds = lineas.map(l => l.insumo_id);
  if (new Set(insumoIds).size !== insumoIds.length) {
    throw new ValidationError('El envío tiene el mismo insumo repetido');
  }
  if (lineas.some(l => l.cantidad <= 0)) {
    throw new ValidationError('Las cantidades del envío deben ser positivas');
  }

  const centro = await tx.centroProduccion.findUnique({ where: { id: centroId } });
  if (!centro) throw new NotFoundError('Centro de producción no encontrado');

  const sucursal = await tx.sucursal.findUnique({ where: { id: sucursalId } });
  if (!sucursal) throw new NotFoundError('Sucursal no encontrada');

  const stocks = await tx.stockCentro.findMany({
    where: { centro_id: centroId, insumo_id: { in: insumoIds } },
    include: { insumo: { select: { nombre: true, unidad_medida: true } } },
  });

  // Se valida todo antes de descontar: el mensaje tiene que decir qué línea
  // falló, no romperse en la mitad del despacho.
  const problemas: string[] = [];
  for (const linea of lineas) {
    const stock = stocks.find(s => s.insumo_id === linea.insumo_id);
    if (!stock) { problemas.push(`El insumo ${linea.insumo_id} no está en el inventario del centro`); continue; }
    if (stock.stock_actual < linea.cantidad) {
      problemas.push(`${stock.insumo.nombre}: hay ${stock.stock_actual} ${stock.insumo.unidad_medida} y se quieren enviar ${linea.cantidad}`);
    }
  }
  if (problemas.length > 0) throw new ValidationError(`No se puede enviar: ${problemas.join('; ')}`);

  const traslado = await tx.traslado.create({
    data: {
      numero: await siguienteNumero(tx, centroId),
      tipo: 'ENVIO',
      estado: 'EN_TRANSITO',
      centro_id: centroId,
      sucursal_id: sucursalId,
      enviado_por_id: userId,
      observaciones: observaciones ?? null,
      idempotency_key: idempotencyKey ?? null,
      detalles: {
        create: lineas.map((l) => ({
          insumo_id: l.insumo_id,
          cantidad_enviada: l.cantidad,
          costo_unitario: stocks.find(s => s.insumo_id === l.insumo_id)!.costo_promedio,
        })),
      },
    },
    include: { detalles: true },
  });

  let valorDespachado = 0;
  for (const linea of lineas) {
    const stock = stocks.find(s => s.insumo_id === linea.insumo_id)!;
    valorDespachado += linea.cantidad * stock.costo_promedio;

    await ajustarStockCentro(tx, linea.insumo_id, centroId, -linea.cantidad);
    await tx.movimientoCentro.create({
      data: {
        centro_id: centroId,
        insumo_id: linea.insumo_id,
        tipo_movimiento: 'EGRESO',
        cantidad: -linea.cantidad,
        descripcion: `Envío #${traslado.numero} a ${sucursal.nombre}`,
        costo_unitario: stock.costo_promedio,
        responsable: String(userId),
      },
    });
  }

  await logAudit({
    usuarioId: userId, rol, accion: 'CREO',
    entidad: 'Traslado', entidadId: traslado.id,
    detalle: `Envío #${traslado.numero} del centro #${centroId} a ${sucursal.nombre}: ${lineas.length} línea(s)`,
    monto: valorDespachado,
  }, tx);

  return { traslado, valor_despachado: Number(valorDespachado.toFixed(6)) };
}

/**
 * Recibe un traslado en la sucursal destino.
 *
 * La cantidad recibida puede ser menor a la enviada (se rompió, faltó, se
 * perdió): esa diferencia NO vuelve al Centro, sale del inventario del negocio
 * como merma de la sucursal, que es donde se detectó. Más de lo que salió no se
 * puede declarar: sería inventar stock.
 */
export async function recibirTraslado(
  tx: Prisma.TransactionClient,
  trasladoId: number,
  recibido: { insumo_id: number; cantidad_recibida: number }[],
  userId: number,
  rol: Rol,
) {
  const traslado = await tx.traslado.findUnique({
    where: { id: trasladoId },
    include: { detalles: { include: { insumo: { select: { nombre: true, unidad_medida: true } } } }, sucursal: true },
  });
  if (!traslado) throw new NotFoundError('Traslado no encontrado');
  if (traslado.estado !== 'EN_TRANSITO') {
    throw new ConflictError(`El traslado #${traslado.numero} ya está ${traslado.estado.toLowerCase()}`);
  }

  const problemas: string[] = [];
  for (const linea of recibido) {
    const detalle = traslado.detalles.find(d => d.insumo_id === linea.insumo_id);
    if (!detalle) { problemas.push(`El insumo ${linea.insumo_id} no viajaba en este traslado`); continue; }
    if (linea.cantidad_recibida < 0) problemas.push(`${detalle.insumo.nombre}: la cantidad recibida no puede ser negativa`);
    if (linea.cantidad_recibida > detalle.cantidad_enviada) {
      problemas.push(`${detalle.insumo.nombre}: se declaran ${linea.cantidad_recibida} y salieron ${detalle.cantidad_enviada}`);
    }
  }
  if (problemas.length > 0) throw new ValidationError(`No se puede recibir: ${problemas.join('; ')}`);

  let valorRecibido = 0;
  let valorFaltante = 0;

  // Un ENVIO entra a la sucursal; una DEVOLUCION vuelve al Centro. El resto de
  // la mecánica (costo congelado, faltante como merma de quien recibe) es la
  // misma en las dos direcciones, así que solo cambia el destino.
  const haciaSucursal = traslado.tipo === 'ENVIO';
  const rotulo = haciaSucursal ? `envío #${traslado.numero}` : `devolución #${traslado.numero}`;

  for (const detalle of traslado.detalles) {
    // Una línea que no se declara se da por recibida completa: el caso normal
    // es que llegue todo, y obligar a listar cada línea invita a que el cajero
    // confirme sin mirar.
    const declarado = recibido.find(r => r.insumo_id === detalle.insumo_id);
    const cantidad = declarado ? declarado.cantidad_recibida : detalle.cantidad_enviada;
    const faltante = detalle.cantidad_enviada - cantidad;

    if (cantidad > 0) {
      // Entra con el costo congelado del despacho, ponderado contra lo que el
      // destino ya tuviera de ese insumo.
      if (haciaSucursal) {
        await acreditarEnSucursal(tx, detalle.insumo_id, traslado.sucursal_id, cantidad, detalle.costo_unitario);
        await tx.movimientoInterno.create({
          data: {
            insumo_id: detalle.insumo_id,
            sucursal_id: traslado.sucursal_id,
            tipo_movimiento: 'INGRESO',
            cantidad,
            descripcion: `Recepción del ${rotulo} desde el centro`,
            costo_unitario: detalle.costo_unitario,
            responsable: String(userId),
          },
        });
      } else {
        await acreditarEnCentro(tx, detalle.insumo_id, traslado.centro_id, cantidad, detalle.costo_unitario);
        await tx.movimientoCentro.create({
          data: {
            centro_id: traslado.centro_id,
            insumo_id: detalle.insumo_id,
            tipo_movimiento: 'INGRESO',
            cantidad,
            descripcion: `Recepción de la ${rotulo} desde la sucursal`,
            costo_unitario: detalle.costo_unitario,
            responsable: String(userId),
          },
        });
      }
      valorRecibido += cantidad * detalle.costo_unitario;
    }

    if (faltante > 0) {
      // El faltante se registra como merma de quien recibe para que quede en su
      // kardex: la mercadería ya salió del origen, así que si no se asienta acá
      // desaparece del sistema sin rastro.
      if (haciaSucursal) {
        await tx.movimientoInterno.create({
          data: {
            insumo_id: detalle.insumo_id,
            sucursal_id: traslado.sucursal_id,
            tipo_movimiento: 'MERMA',
            cantidad: -faltante,
            descripcion: `Faltante en la recepción del ${rotulo}`,
            costo_unitario: detalle.costo_unitario,
            responsable: String(userId),
          },
        });
      } else {
        await tx.movimientoCentro.create({
          data: {
            centro_id: traslado.centro_id,
            insumo_id: detalle.insumo_id,
            tipo_movimiento: 'MERMA',
            cantidad: -faltante,
            descripcion: `Faltante en la recepción de la ${rotulo}`,
            costo_unitario: detalle.costo_unitario,
            responsable: String(userId),
          },
        });
      }
      valorFaltante += faltante * detalle.costo_unitario;
    }

    await tx.trasladoDetalle.update({
      where: { id: detalle.id },
      data: { cantidad_recibida: cantidad },
    });
  }

  const actualizado = await tx.traslado.update({
    where: { id: trasladoId },
    data: { estado: 'RECIBIDO', recibido_por_id: userId, fecha_recepcion: new Date() },
    include: { detalles: true },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'Traslado', entidadId: trasladoId,
    detalle: `Recepción del envío #${traslado.numero} en ${traslado.sucursal.nombre}` +
      (valorFaltante > 0 ? `. Faltante valorizado: ${valorFaltante.toFixed(2)}` : ''),
    monto: valorRecibido,
  }, tx);

  return {
    traslado: actualizado,
    valor_recibido: Number(valorRecibido.toFixed(6)),
    valor_faltante: Number(valorFaltante.toFixed(6)),
  };
}

/**
 * Anula un traslado que todavía no se recibió: la mercadería vuelve al stock
 * del Centro con el mismo costo con el que salió.
 *
 * Un traslado ya RECIBIDO no se anula — se corrige con un traslado en sentido
 * inverso. Deshacer una recepción implicaría descontarle a la sucursal un stock
 * que quizá ya vendió.
 */
export async function anularTraslado(
  tx: Prisma.TransactionClient,
  trasladoId: number,
  motivo: string,
  userId: number,
  rol: Rol,
) {
  const traslado = await tx.traslado.findUnique({
    where: { id: trasladoId },
    include: { detalles: true },
  });
  if (!traslado) throw new NotFoundError('Traslado no encontrado');
  if (traslado.estado === 'RECIBIDO') {
    throw new ConflictError('Un traslado ya recibido no se anula: corregilo con un traslado en sentido inverso');
  }
  if (traslado.estado === 'ANULADO') throw new ConflictError('El traslado ya estaba anulado');

  for (const detalle of traslado.detalles) {
    await ajustarStockCentro(tx, detalle.insumo_id, traslado.centro_id, detalle.cantidad_enviada);
    await tx.movimientoCentro.create({
      data: {
        centro_id: traslado.centro_id,
        insumo_id: detalle.insumo_id,
        tipo_movimiento: 'INGRESO',
        cantidad: detalle.cantidad_enviada,
        descripcion: `Anulación del envío #${traslado.numero}: ${motivo}`,
        costo_unitario: detalle.costo_unitario,
        responsable: String(userId),
      },
    });
  }

  const actualizado = await tx.traslado.update({
    where: { id: trasladoId },
    data: { estado: 'ANULADO', observaciones: motivo },
  });

  await logAudit({
    // No hay acción ANULO en el enum de auditoría; anular es una modificación
    // de estado y así lo registra el resto del sistema.
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'Traslado', entidadId: trasladoId,
    detalle: `Anulación del envío #${traslado.numero}: ${motivo}`,
  }, tx);

  return actualizado;
}

export async function listarTraslados(
  filtros: { centroId?: number; sucursalId?: number; estado?: 'EN_TRANSITO' | 'RECIBIDO' | 'ANULADO' },
  db: Db = prisma,
) {
  return db.traslado.findMany({
    where: {
      ...(filtros.centroId ? { centro_id: filtros.centroId } : {}),
      ...(filtros.sucursalId ? { sucursal_id: filtros.sucursalId } : {}),
      ...(filtros.estado ? { estado: filtros.estado } : {}),
    },
    include: {
      detalles: { include: { insumo: { select: { nombre: true, unidad_medida: true } } } },
      sucursal: { select: { id: true, nombre: true } },
      centro: { select: { id: true, nombre: true } },
    },
    orderBy: { fecha_envio: 'desc' },
  });
}

/**
 * Valor de la mercadería despachada que todavía no se recibió. Sin esto, un
 * reporte que sume inventario de centros más inventario de sucursales muestra
 * menos plata de la que el negocio tiene, y la diferencia parece un faltante.
 */
export async function valorEnTransito(
  filtros: { centroId?: number; sucursalId?: number } = {},
  db: Db = prisma,
): Promise<number> {
  const traslados = await db.traslado.findMany({
    where: {
      estado: 'EN_TRANSITO',
      ...(filtros.centroId ? { centro_id: filtros.centroId } : {}),
      ...(filtros.sucursalId ? { sucursal_id: filtros.sucursalId } : {}),
    },
    include: { detalles: true },
  });

  const total = traslados.reduce((acc, t) =>
    acc + t.detalles.reduce((sub, d) => sub + d.cantidad_enviada * d.costo_unitario, 0), 0);
  return Number(total.toFixed(6));
}

/** Devuelve el stock de la sucursal al Centro (Fase 6: devolución de turno). */
export async function devolverDesdeSucursal(
  tx: Prisma.TransactionClient,
  centroId: number,
  sucursalId: number,
  lineas: LineaEnvio[],
  turnoId: number | null,
  userId: number,
  rol: Rol,
) {
  if (lineas.length === 0) throw new ValidationError('La devolución necesita al menos una línea');

  const traslado = await tx.traslado.create({
    data: {
      numero: await siguienteNumero(tx, centroId),
      tipo: 'DEVOLUCION',
      estado: 'EN_TRANSITO',
      centro_id: centroId,
      sucursal_id: sucursalId,
      turno_id: turnoId,
      enviado_por_id: userId,
    },
  });

  for (const linea of lineas) {
    const stock = await tx.stockSucursal.findUnique({
      where: { insumo_id_sucursal_id: { insumo_id: linea.insumo_id, sucursal_id: sucursalId } },
    });
    if (!stock || stock.stock_actual < linea.cantidad) {
      throw new ValidationError(`La sucursal no tiene ${linea.cantidad} del insumo ${linea.insumo_id} para devolver`);
    }

    await ajustarStockSucursal(tx, linea.insumo_id, sucursalId, -linea.cantidad);
    await tx.movimientoInterno.create({
      data: {
        insumo_id: linea.insumo_id,
        sucursal_id: sucursalId,
        tipo_movimiento: 'EGRESO',
        cantidad: -linea.cantidad,
        descripcion: `Devolución #${traslado.numero} al centro`,
        costo_unitario: stock.costo_promedio,
        responsable: String(userId),
      },
    });
    await tx.trasladoDetalle.create({
      data: {
        traslado_id: traslado.id,
        insumo_id: linea.insumo_id,
        cantidad_enviada: linea.cantidad,
        costo_unitario: stock.costo_promedio,
      },
    });
  }

  await logAudit({
    usuarioId: userId, rol, accion: 'CREO',
    entidad: 'Traslado', entidadId: traslado.id,
    detalle: `Devolución #${traslado.numero} de la sucursal #${sucursalId} al centro #${centroId}`,
  }, tx);

  return traslado;
}
