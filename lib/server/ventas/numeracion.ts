/**
 * numeracion.ts
 *
 * Correlativo de pedido propio de cada sucursal: #1, #2, #3… sin reiniciar.
 *
 * El `id` de la transacción es un contador compartido por todo el negocio, así
 * que una sucursal nueva mostraba "#2101" en su primera venta solo porque las
 * otras ya llevaban 2100. Este número es el que se le dice al cliente.
 *
 * Lo usan los dos caminos que crean ventas —el POS y el checkout web—, y por
 * eso vive acá y no dentro de uno de ellos.
 */
import { Prisma } from '@prisma/client';

/**
 * Siguiente número para la sucursal, dentro de la transacción de la venta.
 *
 * Toma un lock de Postgres por sucursal que se libera al cerrar la transacción:
 * dos cajas cobrando a la vez se serializan acá en vez de calcular las dos el
 * mismo número y chocar contra el índice único. El lock es por sucursal, así
 * que las ventas de locales distintos no se estorban.
 */
export async function siguienteNumeroSucursal(
  tx: Prisma.TransactionClient,
  sucursalId: number,
): Promise<number> {
  // 8123 es un discriminador arbitrario pero fijo: evita que este lock choque
  // con otro que use el mismo id de sucursal para otra cosa.
  // Va por $executeRaw porque la función devuelve void y $queryRaw no sabe
  // deserializar ese tipo.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(8123, ${sucursalId})`;

  const max = await tx.transaccion.aggregate({
    _max: { numero_sucursal: true },
    where: { sucursal_id: sucursalId },
  });
  return (max._max.numero_sucursal ?? 0) + 1;
}

/**
 * Número visible de un pedido. Cae al id global solo en filas anteriores a la
 * numeración por sucursal, que el backfill ya debería haber cubierto.
 */
export function numeroVisible(venta: { numero_sucursal?: number | null; id: number }): string {
  return `#${venta.numero_sucursal ?? venta.id}`;
}
