/**
 * descuento-stock.service.ts
 * Descuenta el stock de insumos al registrar una venta/pedido, y congela en
 * cada línea el costo de su ficha técnica al momento de vender — el CMV de
 * un período ya cerrado no debe cambiar si después se edita el costo de un
 * insumo (ver docs/superpowers/specs/2026-08-25-costo-congelado-venta-design.md).
 * Anti-doble-descuento: si ya existe un MovimientoInterno de tipo VENTA
 * con ese transaccion_id, no hace nada.
 */
import { Prisma } from '@prisma/client';
import { resolverConsumoInsumos, evaluarAlertas, costoFichaTecnica } from './inventario.service';
import { ajustarStock } from './stock-sucursal.service';

/**
 * Descuenta stock por todos los productos de una transacción y congela el
 * costo de cada línea.
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

  // La receta a aplicar es la de la sucursal donde se hizo la venta: cada local
  // puede tener gramajes distintos para el mismo plato.
  const venta = await tx.transaccion.findUnique({
    where: { id: transaccionId },
    select: { sucursal_id: true },
  });
  if (!venta) return [];

  // ── Acumular consumo total de insumos crudos y congelar costo por línea ──
  const consumoTotal = new Map<number, number>();
  // Costo de ficha técnica AL MOMENTO de esta venta, una vez por producto
  // distinto (varias líneas del mismo producto comparten el mismo costo).
  const costoPorProducto = new Map<number, number>();
  for (const detalle of detalles) {
    if (!costoPorProducto.has(detalle.producto_id)) {
      costoPorProducto.set(
        detalle.producto_id,
        await costoFichaTecnica(detalle.producto_id, tx, venta.sucursal_id),
      );
    }
    await tx.transaccionesDetalles.update({
      where: { id: detalle.id },
      data: { costo_unitario: costoPorProducto.get(detalle.producto_id)! },
    });

    const consumo = await resolverConsumoInsumos(detalle.producto_id, detalle.cantidad, tx, venta.sucursal_id);
    for (const [insumoId, cant] of consumo.entries()) {
      consumoTotal.set(insumoId, (consumoTotal.get(insumoId) ?? 0) + cant);
    }
  }

  if (consumoTotal.size === 0) return [];

  const insumoIds = Array.from(consumoTotal.keys());

  // ── Actualizar stock y crear MovimientoInterno por cada insumo ─
  // El descuento golpea el stock de la sucursal donde se vendió.
  const sucursalId = venta.sucursal_id;
  for (const [insumoId, cantidad] of consumoTotal.entries()) {
    const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
    if (!insumo) continue;

    await ajustarStock(tx, insumoId, sucursalId, -cantidad);

    await tx.movimientoInterno.create({
      data: {
        insumo_id:       insumoId,
        sucursal_id:     sucursalId,
        tipo_movimiento: 'VENTA',
        cantidad:        -cantidad,
        descripcion:     `Descuento por transacción #${transaccionId}`,
        transaccion_id:  transaccionId,
      },
    });
  }

  // ── Evaluar alertas (fire-and-forget dentro de la misma tx) ───
  // Solo interesa el faltante del local que acaba de vender.
  await evaluarAlertas(insumoIds, tx, sucursalId);

  return insumoIds;
}
