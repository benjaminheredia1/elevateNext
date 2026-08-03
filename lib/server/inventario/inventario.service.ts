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
// El stock real vive por sucursal; estas funciones lo escriben y mantienen
// sincronizado el agregado de Insumo. Ver stock-sucursal.service.ts.
import {
  ajustarStock,
  fijarStock,
  registrarCompra as registrarCompraEnSucursal,
} from './stock-sucursal.service';

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
  sucursalId?: number,
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');
  if (cantidad <= 0) throw new ValidationError('La cantidad debe ser positiva');
  const sucursal = sucursalId ?? (await sucursalRecetaPorDefecto(tx));

  // Costo promedio ponderado. El stock negativo NO participa en la ponderación
  // (estilo Odoo AVCO): ponderar contra un faltante produce costos absurdos
  // (ej. stock -3 @ 5, compra 10 @ 8 → 9.29). El faltante es varianza a
  // corregir con conteo físico, no valor de inventario.
  const stockPonderable = Math.max(insumo.stock_actual, 0);
  const costoActual = insumo.costo_promedio;
  const nuevoCosto =
    stockPonderable + cantidad > 0
      ? (stockPonderable * costoActual + cantidad * costoUnitario) / (stockPonderable + cantidad)
      : costoUnitario;

  // El stock y el costo promedio de la compra son del local que compró; el
  // agregado del insumo se actualiza dentro de registrarCompraEnSucursal.
  await registrarCompraEnSucursal(tx, insumoId, sucursal, cantidad, costoUnitario);
  const insumoActualizado = await tx.insumo.update({
    where: { id: insumoId },
    data: { costo_promedio: nuevoCosto },
  });

  const mov = await tx.movimientoInterno.create({
    data: {
      insumo_id:       insumoId,
      sucursal_id:     sucursal,
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
  sucursalId?: number,
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');
  if (cantidad <= 0) throw new ValidationError('La cantidad debe ser positiva');
  const sucursal = sucursalId ?? (await sucursalRecetaPorDefecto(tx));

  // La merma sale del stock del local donde se produjo.
  await ajustarStock(tx, insumoId, sucursal, -cantidad);
  const insumoActualizado = await tx.insumo.findUniqueOrThrow({ where: { id: insumoId } });

  const mov = await tx.movimientoInterno.create({
    data: {
      insumo_id:       insumoId,
      sucursal_id:     sucursal,
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
    // La baja retira el insumo del negocio entero: se deja en cero el stock de
    // cada sucursal y queda un movimiento por local para poder auditarlo.
    const porSucursal = await tx.stockSucursal.findMany({
      where: { insumo_id: insumoId, stock_actual: { not: 0 } },
      select: { sucursal_id: true, stock_actual: true },
    });
    for (const fila of porSucursal) {
      await tx.movimientoInterno.create({
        data: {
          insumo_id:       insumoId,
          sucursal_id:     fila.sucursal_id,
          tipo_movimiento: 'BAJA',
          cantidad:        -fila.stock_actual,
          descripcion:     motivo,
          responsable:     String(userId),
        },
      });
    }
    await tx.stockSucursal.updateMany({ where: { insumo_id: insumoId }, data: { stock_actual: 0 } });
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
  sucursalId?: number,
) {
  const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');
  const sucursal = sucursalId ?? (await sucursalRecetaPorDefecto(tx));

  // El conteo físico se hace en un local: fija el stock de esa sucursal y la
  // varianza se propaga al agregado del insumo.
  const { delta: varianza } = await fijarStock(tx, insumoId, sucursal, nuevoStock);
  const insumoActualizado = await tx.insumo.findUniqueOrThrow({ where: { id: insumoId } });

  const mov = await tx.movimientoInterno.create({
    data: {
      insumo_id:       insumoId,
      sucursal_id:     sucursal,
      tipo_movimiento: 'AJUSTE',
      cantidad:        varianza,
      descripcion:     descripcion ?? `Conteo físico. Varianza: ${varianza >= 0 ? '+' : ''}${varianza}`,
      responsable:     String(userId),
    },
  });

  await logAudit({
    usuarioId: userId, rol, accion: 'MODIFICO',
    entidad: 'MovimientoInterno', entidadId: mov.id,
    // El antes/después del conteo es el del local, no el agregado del negocio.
    detalle: `Conteo físico "${insumo.nombre}" (sucursal #${sucursal}): ${nuevoStock - varianza} → ${nuevoStock} (varianza ${varianza >= 0 ? '+' : ''}${varianza})`,
  }, tx);

  return { insumo: insumoActualizado, movimiento: mov, varianza };
}


/** Sucursal principal, usada cuando quien llama no indica una explícitamente. */
async function sucursalRecetaPorDefecto(tx: Prisma.TransactionClient | typeof prisma): Promise<number> {
  const sucursal = await tx.sucursal.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  return sucursal?.id ?? 0;
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
  // Ficha técnica de esta sucursal. Sin ella se toma la de la sucursal más
  // antigua, que es la principal: cada local puede tener gramajes distintos y
  // resolver el consumo mezclando recetas daría costos y descuentos erróneos.
  sucursalId?: number,
): Promise<Map<number, number>> {
  const sucursal = sucursalId ?? (await sucursalRecetaPorDefecto(tx));
  const receta = await tx.recetasProducto.findMany({
    where: { producto_id: productoId, sucursal_id: sucursal },
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
  sucursalId?: number,
): Promise<number> {
  const consumo = await resolverConsumoInsumos(productoId, 1, tx, sucursalId);
  if (consumo.size === 0) return 0;

  const ids = Array.from(consumo.keys());
  const sucursal = sucursalId ?? (await sucursalRecetaPorDefecto(tx));
  // El costo es el que pagó ESTE local: dos sucursales pueden comprarle el mismo
  // insumo a proveedores distintos, y su food cost debe reflejarlo.
  const costosLocales = await tx.stockSucursal.findMany({
    where: { insumo_id: { in: ids }, sucursal_id: sucursal },
    select: { insumo_id: true, costo_promedio: true },
  });
  const porInsumo = new Map(costosLocales.map(c => [c.insumo_id, c.costo_promedio]));

  // Si el local todavía no maneja el insumo se usa el costo del catálogo como
  // referencia: un food cost aproximado informa más que uno en 0%.
  const insumos = await tx.insumo.findMany({ where: { id: { in: ids } } });

  let costo = 0;
  for (const ins of insumos) {
    const costoUnitario = porInsumo.get(ins.id) ?? ins.costo_promedio;
    costo += costoUnitario * (consumo.get(ins.id) ?? 0);
  }
  return costo;
}

// ─────────────────────────────────────────────
// Food cost % de un producto
// ─────────────────────────────────────────────
export async function foodCostPct(
  productoId: number,
  tx: Prisma.TransactionClient = prisma,
  sucursalId?: number,
): Promise<number> {
  const producto = await tx.producto.findUnique({ where: { id: productoId } });
  if (!producto) return 0;

  // El precio es el del local cuando se pide por sucursal: con el del catálogo,
  // un plato que acá se cobra más caro mostraría el food cost de otra sucursal.
  const enSucursal = sucursalId != null
    ? await tx.productoSucursal.findUnique({
        where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
        select: { precio: true },
      })
    : null;
  const precio = Number(enSucursal?.precio ?? producto.precio);
  if (precio <= 0) return 0;

  const costo = await costoFichaTecnica(productoId, tx, sucursalId);
  return (costo / precio) * 100;
}

// ─────────────────────────────────────────────
// Porciones armables (stock disponible)
// ─────────────────────────────────────────────
export async function porcionesArmables(
  productoId: number,
  tx: Prisma.TransactionClient = prisma,
  sucursalId?: number,
): Promise<number> {
  const consumo = await resolverConsumoInsumos(productoId, 1, tx, sucursalId);
  if (consumo.size === 0) return Infinity;

  const ids = Array.from(consumo.keys());
  const sucursal = sucursalId ?? (await sucursalRecetaPorDefecto(tx));
  // Se arma con lo que hay EN ESTE LOCAL. Un insumo sin fila de stock en la
  // sucursal cuenta como cero: no se hereda el stock del negocio.
  const stocks = await tx.stockSucursal.findMany({
    where: { insumo_id: { in: ids }, sucursal_id: sucursal },
    select: { insumo_id: true, stock_actual: true },
  });
  const porInsumo = new Map(stocks.map(s => [s.insumo_id, s.stock_actual]));

  let minPorciones = Infinity;
  for (const insumoId of ids) {
    const cantRequerida = consumo.get(insumoId) ?? 0;
    if (cantRequerida > 0) {
      minPorciones = Math.min(minPorciones, Math.floor((porInsumo.get(insumoId) ?? 0) / cantRequerida));
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
  // Local en el que evaluar el faltante. Sin sucursal se revisan todas: lo que
  // importa es que a NINGÚN local le falte, no el total del negocio — con el
  // agregado, un local en cero quedaba tapado por el stock del otro.
  sucursalId?: number,
): Promise<void> {
  if (insumoIds.length === 0) return;

  const filas = await tx.stockSucursal.findMany({
    where: {
      insumo_id: { in: insumoIds },
      ...(sucursalId ? { sucursal_id: sucursalId } : {}),
      insumo: { activo: true },
    },
    include: {
      insumo: { select: { id: true, nombre: true, unidad_medida: true } },
      sucursal: { select: { nombre: true } },
    },
  });

  const bajoUmbral = filas
    .filter(f => estadoInsumo({
      stock_actual: f.stock_actual,
      stock_minimo: f.stock_minimo,
      punto_critico: f.punto_critico,
    }) !== 'ok')
    // El aviso lleva la sucursal en el nombre: "Palta (Sucursal Norte)".
    .map(f => ({
      id: f.insumo.id,
      nombre: `${f.insumo.nombre} (${f.sucursal.nombre})`,
      stock_actual: f.stock_actual,
      stock_minimo: f.stock_minimo,
      punto_critico: f.punto_critico,
      unidad_medida: f.insumo.unidad_medida,
    }));

  if (bajoUmbral.length === 0) return;

  const config = await tx.configuracionAlertas.findUnique({ where: { id: 1 } });
  if (!config) return;

  // Llamamos al servicio real en lugar de sólo simular
  // Como hace llamadas externas, no le pasamos 'tx' (usa el cliente Prisma global)
  await enviarAlerta({ insumos: bajoUmbral, cfg: config });
}
