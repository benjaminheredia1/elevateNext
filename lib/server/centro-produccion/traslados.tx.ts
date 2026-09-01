/**
 * Margen de la transacción de un traslado.
 *
 * El default de Prisma (maxWait 2 s, timeout 5 s) alcanza contra el sandbox
 * local y NO alcanza contra la base remota de producción: una recepción emite
 * 9 + 12 consultas por línea, todas secuenciales, y cada una paga ida y vuelta
 * de red. Con 45 consultas (3 líneas) y ~120 ms de latencia se pasa de los 5 s,
 * Prisma aborta con P2028 y el operador ve un 500 sin explicación.
 *
 * Es más generoso que los 20 s del resto del sistema (caja, inventario) a
 * propósito: acá la cantidad de líneas la elige el operador y no puede ser un
 * impedimento — el Centro tiene que poder despachar lo que necesite. Con 60 s
 * entran ~40 líneas a 120 ms de latencia. La función de Vercel corta a los
 * 300 s, así que el techo real sigue siendo este número, no la plataforma.
 *
 * Lo que de verdad saca el techo es bajar esas 12 consultas por línea; esto
 * compra el tiempo para hacerlo sin la sucursal bloqueada.
 */
export const OPCIONES_TX_TRASLADO: { maxWait: number; timeout: number } = {
  maxWait: 15_000,
  timeout: 60_000,
};
