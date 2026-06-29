/**
 * descuento-stock.service.ts
 * Descuenta el stock de insumos al registrar una venta/pedido.
 * Anti-doble-descuento: si ya existe un MovimientoInterno de tipo VENTA
 * con ese transaccion_id, no hace nada.
 */
import { Prisma } from '@prisma/client';
import { resolverConsumoInsumos, evaluarAlertas } from './inventario.service';

/**
 * Descuenta stock por todos los productos de una transacción.
 * Debe llamarse DENTRO de un $transaction de Prisma.
 *
 * @param tx              - TransactionClient activo
 * @param transaccionId   - ID de la Transaccion
 * @returns               - Lista de insumoIds afectados (para alertas)
 */
export async function descontarStockPorTransaccion(
  tx: Prisma.TransactionClient,
  transaccionId: number,
): Promise<number[]> {
  // ── Anti-doble-descuento ────────────────────────────────────────
  const yaDescontado = await tx.movimientoInterno.findFirst({
    where: { transaccion_id: transaccionId, tipo_movimiento: 'VENTA' },
  });
  if (yaDescontado) return []; // ya fue procesado

  // ── Cargar detalles de la transacción ──────────────────────────
  const detalles = await tx.transaccionesDetalles.findMany({
    where: { transaccion_id: transaccionId },
  });

  if (detalles.length === 0) return [];

  // ── Acumular consumo total de insumos crudos ───────────────────
  const consumoTotal = new Map<number, number>();
  for (const detalle of detalles) {
    const consumo = await resolverConsumoInsumos(detalle.producto_id, detalle.cantidad, tx);
    for (const [insumoId, cant] of consumo.entries()) {
      consumoTotal.set(insumoId, (consumoTotal.get(insumoId) ?? 0) + cant);
    }
  }

  if (consumoTotal.size === 0) return [];

  const insumoIds = Array.from(consumoTotal.keys());

  // ── Actualizar stock y crear MovimientoInterno por cada insumo ─
  for (const [insumoId, cantidad] of consumoTotal.entries()) {
    const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
    if (!insumo) continue;

    await tx.insumo.update({
      where: { id: insumoId },
      data: { stock_actual: { decrement: cantidad } },
    });

    await tx.movimientoInterno.create({
      data: {
        insumo_id:       insumoId,
        tipo_movimiento: 'VENTA',
        cantidad:        -cantidad,
        descripcion:     `Descuento por transacción #${transaccionId}`,
        transaccion_id:  transaccionId,
      },
    });
  }

  // ── Evaluar alertas (fire-and-forget dentro de la misma tx) ───
  await evaluarAlertas(insumoIds, tx);

  return insumoIds;
}
