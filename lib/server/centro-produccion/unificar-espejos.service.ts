/**
 * unificar-espejos.service.ts
 *
 * Repara un producto duplicado del Centro: dos productos con el mismo nombre,
 * cada uno con su propio insumo espejo. El Centro despacha el espejo de uno y
 * la cajera vende el otro, así que el stock que llega al local no baja nunca y
 * el del producto vendido se va a negativo (incidente del 2026-09-03).
 *
 * Sobrevive el producto de la carta —tiene el histórico de ventas, el precio y
 * la foto—: la mercadería del duplicado, que está físicamente en el local, se
 * muda a su espejo con movimientos AJUSTE en ambos kardex. Nunca un UPDATE
 * crudo del stock: una corrección de datos no puede cambiar el valor del
 * negocio, solo la fila donde está parado.
 *
 * Vive como service y no dentro del script de corrección para poder probarlo:
 * es una operación que mueve plata y stock en producción.
 */
import { Prisma, type Rol } from '@prisma/client';
import { ajustarStock, registrarCompra } from '@/lib/server/inventario/stock-sucursal.service';
import { bajaInsumoExclusivoDeReventa } from '@/lib/server/insumos/insumos.service';
import { logAudit } from '@/lib/server/audit/audit.service';

export const MOTIVO_UNIFICACION =
  'Unificación de producto duplicado del Centro (incidente de traslados 2026-09-03)';

/**
 * Los cuatro ids se declaran a mano y se verifican contra la base: un id
 * corrido convertiría la corrección en una pérdida de stock, así que ante
 * cualquier desvío el par se aborta en vez de escribir.
 */
export interface ParDuplicado {
  dupProducto: number;
  dupEspejo: number;
  canonProducto: number;
  canonEspejo: number;
  nota: string;
}

export interface ResultadoUnificacion {
  estado: 'unificado' | 'ya-unificado' | 'abortado';
  motivo?: string;
  /** Movido por sucursal, para el resumen del script. */
  movido: { sucursal_id: number; cantidad: number }[];
  movidoEnCentro: { centro_id: number; cantidad: number }[];
  espejoBajado: boolean;
}

export interface Operador {
  id: number;
  rol: Rol;
}

/**
 * Une un par duplicado dentro de una transacción ya abierta. Idempotente: si
 * el duplicado ya está en BAJA no hace nada, para poder reintentar el script
 * sin duplicar los ajustes de stock.
 */
export async function unificarEspejoDuplicado(
  tx: Prisma.TransactionClient,
  par: ParDuplicado,
  operador: Operador,
): Promise<ResultadoUnificacion> {
  const vacio = { movido: [], movidoEnCentro: [], espejoBajado: false };

  const [dup, canon] = await Promise.all([
    tx.producto.findUnique({ where: { id: par.dupProducto } }),
    tx.producto.findUnique({ where: { id: par.canonProducto } }),
  ]);

  if (!dup || !canon) return { ...vacio, estado: 'abortado', motivo: 'producto inexistente' };
  if (dup.id === canon.id) return { ...vacio, estado: 'abortado', motivo: 'el duplicado y el canónico son el mismo producto' };
  if (dup.insumo_reventa_id !== par.dupEspejo) {
    return { ...vacio, estado: 'abortado', motivo: `espejo del duplicado real=${dup.insumo_reventa_id} esperado=${par.dupEspejo}` };
  }
  if (canon.insumo_reventa_id !== par.canonEspejo) {
    return { ...vacio, estado: 'abortado', motivo: `espejo del canónico real=${canon.insumo_reventa_id} esperado=${par.canonEspejo}` };
  }
  if (canon.estado_publicacion === 'BAJA') {
    return { ...vacio, estado: 'abortado', motivo: 'el canónico está dado de baja' };
  }
  if (dup.estado_publicacion === 'BAJA') return { ...vacio, estado: 'ya-unificado' };

  // ── 1. La mercadería está en el local: cambia de kardex, no de local ──
  const filasDup = await tx.stockSucursal.findMany({
    where: { insumo_id: par.dupEspejo, stock_actual: { not: 0 } },
  });
  for (const fila of filasDup) {
    await ajustarStock(tx, par.dupEspejo, fila.sucursal_id, -fila.stock_actual);
    // Entra ponderando contra lo que el local ya tuviera del canónico: es la
    // misma mercadería con el costo con el que salió del Centro.
    await registrarCompra(tx, par.canonEspejo, fila.sucursal_id, fila.stock_actual, fila.costo_promedio);
    await tx.movimientoInterno.createMany({
      data: [
        {
          insumo_id: par.dupEspejo,
          sucursal_id: fila.sucursal_id,
          tipo_movimiento: 'AJUSTE',
          cantidad: -fila.stock_actual,
          costo_unitario: fila.costo_promedio,
          descripcion: `${MOTIVO_UNIFICACION}: pasa al insumo #${par.canonEspejo} de "${canon.nombre}"`,
          responsable: String(operador.id),
        },
        {
          insumo_id: par.canonEspejo,
          sucursal_id: fila.sucursal_id,
          tipo_movimiento: 'AJUSTE',
          cantidad: fila.stock_actual,
          costo_unitario: fila.costo_promedio,
          descripcion: `${MOTIVO_UNIFICACION}: viene del insumo #${par.dupEspejo} de "${dup.nombre}"`,
          responsable: String(operador.id),
        },
      ],
    });
  }

  // ── 2. Lo mismo en el Centro: lo que todavía no se despachó tiene que
  //       salir de ahora en más por el espejo que la sucursal sí descuenta ──
  const enCentro = await tx.stockCentro.findMany({
    where: { insumo_id: par.dupEspejo, stock_actual: { not: 0 } },
  });
  for (const fila of enCentro) {
    await tx.stockCentro.update({ where: { id: fila.id }, data: { stock_actual: 0 } });

    const destino = await tx.stockCentro.findUnique({
      where: { centro_id_insumo_id: { centro_id: fila.centro_id, insumo_id: par.canonEspejo } },
    });
    if (destino) {
      const previo = Math.max(destino.stock_actual, 0);
      const total = previo + fila.stock_actual;
      const nuevoPromedio = total > 0
        ? Number(((previo * destino.costo_promedio + fila.stock_actual * fila.costo_promedio) / total).toFixed(6))
        : fila.costo_promedio;
      await tx.stockCentro.update({
        where: { id: destino.id },
        data: { stock_actual: { increment: fila.stock_actual }, costo_promedio: nuevoPromedio },
      });
    } else {
      await tx.stockCentro.create({
        data: {
          centro_id: fila.centro_id,
          insumo_id: par.canonEspejo,
          stock_actual: fila.stock_actual,
          costo_promedio: fila.costo_promedio,
          stock_minimo: fila.stock_minimo,
          punto_critico: fila.punto_critico,
        },
      });
    }

    await tx.movimientoCentro.createMany({
      data: [
        {
          centro_id: fila.centro_id,
          insumo_id: par.dupEspejo,
          tipo_movimiento: 'EGRESO',
          cantidad: -fila.stock_actual,
          costo_unitario: fila.costo_promedio,
          descripcion: `${MOTIVO_UNIFICACION}: pasa al insumo #${par.canonEspejo}`,
          responsable: String(operador.id),
        },
        {
          centro_id: fila.centro_id,
          insumo_id: par.canonEspejo,
          tipo_movimiento: 'INGRESO',
          cantidad: fila.stock_actual,
          costo_unitario: fila.costo_promedio,
          descripcion: `${MOTIVO_UNIFICACION}: viene del insumo #${par.dupEspejo}`,
          responsable: String(operador.id),
        },
      ],
    });
  }

  // ── 3. El espejo duplicado sale del inventario del Centro: mientras su fila
  //       siga activa, el Centro puede volver a despacharlo y reabrir el bug ──
  await tx.stockCentro.updateMany({
    where: { insumo_id: par.dupEspejo, activo: true },
    data: { activo: false, fecha_baja: new Date(), motivo_baja: MOTIVO_UNIFICACION },
  });

  // ── 4. Baja del duplicado, con el mismo patrón que el endpoint de productos ──
  await tx.producto.update({
    where: { id: par.dupProducto },
    data: {
      estado_publicacion: 'BAJA',
      disponible: false,
      fecha_baja: new Date(),
      motivo_baja: `${MOTIVO_UNIFICACION}. Se unifica en "${canon.nombre}" (#${canon.id})`,
      en_revision: false,
      revision_desde: null,
      motivo_revision: null,
      insumo_causa_revision_id: null,
    },
  });
  await tx.productoSucursal.updateMany({
    where: { producto_id: par.dupProducto, fecha_baja: null },
    data: {
      disponible: false,
      estado_publicacion: 'BAJA',
      fecha_baja: new Date(),
      motivo_baja: MOTIVO_UNIFICACION,
    },
  });
  const espejoBajado = await bajaInsumoExclusivoDeReventa(tx, dup, MOTIVO_UNIFICACION);

  await logAudit({
    usuarioId: operador.id,
    rol: operador.rol,
    accion: 'MODIFICO',
    entidad: 'Producto',
    entidadId: par.dupProducto,
    detalle: `${MOTIVO_UNIFICACION}. "${dup.nombre}" (#${dup.id}) se unifica en "${canon.nombre}" (#${canon.id}); ` +
      `stock movido del insumo #${par.dupEspejo} al #${par.canonEspejo}` +
      (espejoBajado ? '; espejo duplicado dado de baja' : '; espejo duplicado NO dado de baja (sigue en uso)'),
  }, tx);

  return {
    estado: 'unificado',
    movido: filasDup.map(f => ({ sucursal_id: f.sucursal_id, cantidad: f.stock_actual })),
    movidoEnCentro: enCentro.map(f => ({ centro_id: f.centro_id, cantidad: f.stock_actual })),
    espejoBajado,
  };
}
