/**
 * inventario.service.ts
 * Motor de inventario: movimientos, costos, alertas.
 * Todas las mutaciones reciben un `Prisma.TransactionClient` para
 * participar en transacciones externas ($transaction).
 */
import { Prisma } from '@prisma/client';
import type { Rol } from '@prisma/client';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/server/audit/audit.service';
import { NotFoundError, ValidationError } from '@/lib/server/errors';
import { enviarAlerta } from '@/lib/server/alertas/whatsapp.service';

// ─────────────────────────────────────────────
// Tipos auxiliares
// ─────────────────────────────────────────────
export type EstadoInsumo = 'ok' | 'bajo' | 'critico' | 'agotado';

export interface InsumoBasico {
  stock_actual: number;
  stock_minimo: number;
  punto_critico: number;
}

// ─────────────────────────────────────────────
// Estado derivado de un insumo
// ─────────────────────────────────────────────
export function estadoInsumo(insumo: InsumoBasico): EstadoInsumo {
  if (insumo.stock_actual <= 0) return 'agotado';
  if (insumo.stock_actual <= insumo.punto_critico) return 'critico';
  if (insumo.stock_actual <= insumo.stock_minimo) return 'bajo';
  return 'ok';
}

// ─────────────────────────────────────────────
// Registrar compra (costo promedio ponderado)
// ─────────────────────────────────────────────
export async function registrarCompra(
  tx: Prisma.TransactionClient,
  insumoId: number,
  cantidad: number,
  costoUnitario: number,
  nota: string | undefined,
  userId: number,
  rol: Rol,
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');
  if (cantidad <= 0) throw new ValidationError('La cantidad debe ser positiva');

  // Costo promedio ponderado
  const stockActual = insumo.stock_actual;
  const costoActual = insumo.costo_promedio;
  const nuevoCosto =
    stockActual + cantidad > 0
      ? (stockActual * costoActual + cantidad * costoUnitario) / (stockActual + cantidad)
      : costoUnitario;

  const insumoActualizado = await tx.insumo.update({
    where: { id: insumoId },
    data: {
      stock_actual:   { increment: cantidad },
      costo_promedio: nuevoCosto,
    },
  });

  const mov = await tx.movimientoInterno.create({
    data: {
      insumo_id:       insumoId,
      tipo_movimiento: 'INGRESO',
      cantidad,
      descripcion:     nota ?? `Compra de ${insumo.nombre}`,
      costo_unitario:  costoUnitario,
      responsable:     String(userId),
    },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'CREO',
    entidad: 'MovimientoInterno', entidadId: mov.id,
    detalle: `Compra ${cantidad} ${insumo.unidad_medida} de "${insumo.nombre}" @ ${costoUnitario}. Nuevo stock: ${insumoActualizado.stock_actual}`,
    monto: cantidad * costoUnitario,
  }, tx);

  return { insumo: insumoActualizado, movimiento: mov };
}

// ─────────────────────────────────────────────
// Registrar merma
// ─────────────────────────────────────────────
export async function registrarMerma(
  tx: Prisma.TransactionClient,
  insumoId: number,
  cantidad: number,
  descripcion: string,
  userId: number,
  rol: Rol,
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');
  if (cantidad <= 0) throw new ValidationError('La cantidad debe ser positiva');

  const insumoActualizado = await tx.insumo.update({
    where: { id: insumoId },
    data: { stock_actual: { decrement: cantidad } },
  });

  const mov = await tx.movimientoInterno.create({
    data: {
      insumo_id:       insumoId,
      tipo_movimiento: 'MERMA',
      cantidad:        -cantidad,
      descripcion,
      responsable:     String(userId),
    },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'MovimientoInterno', entidadId: mov.id,
    detalle: `Merma ${cantidad} ${insumo.unidad_medida} de "${insumo.nombre}". Nuevo stock: ${insumoActualizado.stock_actual}`,
  }, tx);

  return { insumo: insumoActualizado, movimiento: mov };
}

// ─────────────────────────────────────────────
// Dar de baja un insumo (retiro definitivo)
// ─────────────────────────────────────────────
export async function registrarBaja(
  tx: Prisma.TransactionClient,
  insumoId: number,
  motivo: string,
  userId: number,
  rol: Rol,
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  const stockPerdido = insumo.stock_actual;

  if (stockPerdido > 0) {
    await tx.movimientoInterno.create({
      data: {
        insumo_id:       insumoId,
        tipo_movimiento: 'BAJA',
        cantidad:        -stockPerdido,
        descripcion:     motivo,
        responsable:     String(userId),
      },
    });
  }

  const insumoActualizado = await tx.insumo.update({
    where: { id: insumoId },
    data: {
      stock_actual: 0,
      activo:       false,
      fecha_baja:   new Date(),
      motivo_baja:  motivo,
    },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'Insumo', entidadId: insumoId,
    detalle: `Insumo "${insumo.nombre}" dado de baja. Motivo: ${motivo}. Stock perdido: ${stockPerdido} ${insumo.unidad_medida}`,
  }, tx);

  return insumoActualizado;
}

// ─────────────────────────────────────────────
// Reactivar un insumo dado de baja
// ─────────────────────────────────────────────
export async function reactivarInsumo(
  tx: Prisma.TransactionClient,
  insumoId: number,
  userId: number,
  rol: Rol,
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  const insumoActualizado = await tx.insumo.update({
    where: { id: insumoId },
    data: { activo: true, fecha_baja: null, motivo_baja: null },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'Insumo', entidadId: insumoId,
    detalle: `Insumo "${insumo.nombre}" reactivado`,
  }, tx);

  return insumoActualizado;
}

// ─────────────────────────────────────────────
// Registrar conteo físico (ajuste)
// ─────────────────────────────────────────────
export async function registrarConteoFisico(
  tx: Prisma.TransactionClient,
  insumoId: number,
  nuevoStock: number,
  descripcion: string | undefined,
  userId: number,
  rol: Rol,
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  const varianza = nuevoStock - insumo.stock_actual;

  const insumoActualizado = await tx.insumo.update({
    where: { id: insumoId },
    data: { stock_actual: nuevoStock },
  });

  const mov = await tx.movimientoInterno.create({
    data: {
      insumo_id:       insumoId,
      tipo_movimiento: 'AJUSTE',
      cantidad:        varianza,
      descripcion:     descripcion ?? `Conteo físico. Varianza: ${varianza >= 0 ? '+' : ''}${varianza}`,
      responsable:     String(userId),
    },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'MovimientoInterno', entidadId: mov.id,
    detalle: `Conteo físico "${insumo.nombre}": ${insumo.stock_actual} → ${nuevoStock} (varianza ${varianza >= 0 ? '+' : ''}${varianza})`,
  }, tx);

  return { insumo: insumoActualizado, movimiento: mov, varianza };
}

// ─────────────────────────────────────────────
// Resolver consumo real de insumos crudos de un producto
// (con cascada de insumos mixtos y rendimiento)
// Devuelve Map<insumo_id, cantidad_neta_requerida>
// ─────────────────────────────────────────────
export async function resolverConsumoInsumos(
  productoId: number,
  cantidad: number,
  tx: Prisma.TransactionClient = prisma,
): Promise<Map<number, number>> {
  const receta = await tx.recetasProducto.findMany({
    where: { producto_id: productoId },
    include: {
      insumo: {
        include: {
          insumos_mixtos_hijo: {
            include: { insumo_hijo: true },
          },
        },
      },
    },
  });

  const consumo = new Map<number, number>();

  function acumular(insumoId: number, cant: number) {
    consumo.set(insumoId, (consumo.get(insumoId) ?? 0) + cant);
  }

  function consumirInsumo(
    insumo: { id: number; es_mixto: boolean; rendimiento: number | null; insumos_mixtos_hijo: { insumo_hijo_id: number; cantidad: number }[] },
    cantTotal: number,
  ) {
    if (insumo.es_mixto && insumo.insumos_mixtos_hijo.length > 0) {
      // Cascada: distribuir proporcionalmente con rendimiento
      const rendimiento = insumo.rendimiento ?? 1;
      const cantAjustada = cantTotal / rendimiento;
      for (const detalle of insumo.insumos_mixtos_hijo) {
        acumular(detalle.insumo_hijo_id, detalle.cantidad * cantAjustada);
      }
    } else {
      acumular(insumo.id, cantTotal);
    }
  }

  for (const item of receta) {
    consumirInsumo(item.insumo, item.cantidad_utilizada * cantidad);
  }

  // Productos de REVENTA: no tienen receta, mapean 1:1 a un insumo (1 producto = 1 unidad).
  if (receta.length === 0) {
    const producto = await tx.producto.findUnique({
      where: { id: productoId },
      select: { insumo_reventa_id: true },
    });
    if (producto?.insumo_reventa_id) {
      const insumo = await tx.insumo.findUnique({
        where: { id: producto.insumo_reventa_id },
        include: { insumos_mixtos_hijo: { include: { insumo_hijo: true } } },
      });
      if (insumo) consumirInsumo(insumo, cantidad);
    }
  }

  return consumo;
}

// ─────────────────────────────────────────────
// Costo de ficha técnica de un producto
// ─────────────────────────────────────────────
export async function costoFichaTecnica(
  productoId: number,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const consumo = await resolverConsumoInsumos(productoId, 1, tx);
  if (consumo.size === 0) return 0;

  const ids = Array.from(consumo.keys());
  const insumos = await tx.insumo.findMany({ where: { id: { in: ids } } });

  let costo = 0;
  for (const ins of insumos) {
    costo += ins.costo_promedio * (consumo.get(ins.id) ?? 0);
  }
  return costo;
}

// ─────────────────────────────────────────────
// Food cost % de un producto
// ─────────────────────────────────────────────
export async function foodCostPct(
  productoId: number,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const producto = await tx.producto.findUnique({ where: { id: productoId } });
  if (!producto || Number(producto.precio) <= 0) return 0;
  const costo = await costoFichaTecnica(productoId, tx);
  return (costo / Number(producto.precio)) * 100;
}

// ─────────────────────────────────────────────
// Porciones armables (stock disponible)
// ─────────────────────────────────────────────
export async function porcionesArmables(
  productoId: number,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const consumo = await resolverConsumoInsumos(productoId, 1, tx);
  if (consumo.size === 0) return Infinity;

  const ids = Array.from(consumo.keys());
  const insumos = await tx.insumo.findMany({ where: { id: { in: ids } } });

  let minPorciones = Infinity;
  for (const ins of insumos) {
    const cantRequerida = consumo.get(ins.id) ?? 0;
    if (cantRequerida > 0) {
      minPorciones = Math.min(minPorciones, Math.floor(ins.stock_actual / cantRequerida));
    }
  }
  return minPorciones === Infinity ? 0 : minPorciones;
}

// ─────────────────────────────────────────────
// Evaluar alertas post-descuento
// ─────────────────────────────────────────────
export async function evaluarAlertas(
  insumoIds: number[],
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  if (insumoIds.length === 0) return;

  const insumos = await tx.insumo.findMany({ where: { id: { in: insumoIds } } });
  const bajoUmbral = insumos.filter(
    (i) => estadoInsumo({ stock_actual: i.stock_actual, stock_minimo: i.stock_minimo, punto_critico: i.punto_critico }) !== 'ok',
  );

  if (bajoUmbral.length === 0) return;

  const config = await tx.configuracionAlertas.findUnique({ where: { id: 1 } });
  if (!config) return;

  const ids = bajoUmbral.map((i) => i.id);
  // Llamamos al servicio real en lugar de sólo simular
  // Como hace llamadas externas, no le pasamos 'tx' (usa el cliente Prisma global)
  await enviarAlerta({ insumos: bajoUmbral, cfg: config });
}
