/**
 * diagnostico-numeracion.ts — SOLO LECTURA.
 *
 * Responde dos preguntas sobre la numeración de pedidos:
 *
 *  1. ¿Por qué el primer pedido de un turno a veces sale #2?
 *  2. ¿Por qué el número salta (87 → 89) durante el turno?
 *
 * Por cada turno reciente lista sus transacciones con su correlativo y si
 * dejaron o no movimiento en el libro de caja: un pedido que consume número
 * pero no genera movimiento es, exactamente, un "salto" visible para el cajero.
 *
 * Va con SQL crudo y detectando columnas porque producción puede ir una
 * migración atrás que el schema local (ej. `numero_sucursal`).
 *
 * Uso: npx dotenv -e .env -- npx tsx scripts/diagnostico-numeracion.ts [turnos]
 */
import prisma from '../lib/prisma';

const TURNOS = Number(process.argv[2] ?? 5);

type Fila = {
  id: number;
  numero_turno: number | null;
  numero_sucursal: number | null;
  canal: string | null;
  tipo_entrega: string | null;
  estado: string;
  payment_status: string;
  es_cortesia: boolean;
  total: string;
  created_at: Date;
  movimientos: number;
  fiado: number;
};

async function tieneColumna(tabla: string, columna: string) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM information_schema.columns
    WHERE table_name = ${tabla} AND column_name = ${columna}
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

async function main() {
  const conNumeroSucursal = await tieneColumna('Transaccion', 'numero_sucursal');
  console.log(`esquema: numero_sucursal ${conNumeroSucursal ? 'presente' : 'AUSENTE (prod va una migración atrás)'}\n`);

  const turnos = await prisma.$queryRawUnsafe<{
    id: number; sucursal_id: number; estado: string; fecha_apertura: Date;
  }[]>(`
    SELECT id, sucursal_id, estado, fecha_apertura
    FROM "CajaTurno" ORDER BY id DESC LIMIT ${TURNOS}
  `);

  for (const turno of turnos.reverse()) {
    const pedidos = await prisma.$queryRawUnsafe<Fila[]>(`
      SELECT t.id,
             t.numero_turno,
             ${conNumeroSucursal ? 't.numero_sucursal' : 'NULL::int AS numero_sucursal'},
             t.canal::text AS canal,
             t.tipo_entrega::text AS tipo_entrega,
             t.estado::text AS estado,
             t.payment_status::text AS payment_status,
             t.es_cortesia,
             t.total::text AS total,
             t.created_at,
             (SELECT count(*) FROM "MovimientoCaja" m WHERE m.transaccion_id = t.id)::int AS movimientos,
             (SELECT count(*) FROM "CuentaCorriente" c WHERE c.transaccion_id = t.id)::int AS fiado
      FROM "Transaccion" t
      WHERE t.turno_id = ${turno.id}
      ORDER BY t.numero_turno NULLS LAST, t.created_at
    `);

    console.log(`\n===== TURNO ${turno.id} · sucursal ${turno.sucursal_id} · ${turno.estado} · abierto ${turno.fecha_apertura.toISOString()} =====`);
    console.log(`pedidos del turno: ${pedidos.length}`);

    let esperado = 1;
    let sinMovimiento = 0;
    for (const p of pedidos) {
      const marcas: string[] = [];
      if (p.numero_turno !== esperado) marcas.push(`HUECO: se esperaba #${esperado}`);
      if (p.movimientos === 0) { marcas.push('SIN MOVIMIENTO (no sale en el libro)'); sinMovimiento++; }
      if (p.fiado > 0) marcas.push('FIADO');
      if (p.es_cortesia) marcas.push('CORTESIA');
      if (p.canal == null) marcas.push('WEB');
      if (p.numero_turno != null) esperado = p.numero_turno + 1;

      console.log(
        `  turno#${p.numero_turno ?? '-'}  suc#${p.numero_sucursal ?? '-'}  global#${p.id}  ` +
        `${p.canal ?? 'WEB'}/${p.tipo_entrega ?? 'SALON'}  ${p.estado}/${p.payment_status}  ` +
        `Bs ${Number(p.total).toFixed(2)}  ${new Date(p.created_at).toISOString()}` +
        (marcas.length ? `  << ${marcas.join(' · ')}` : ''),
      );
    }
    console.log(`  → ${sinMovimiento} pedido(s) del turno no aparecen en el libro de caja`);
  }

  // Pedidos web que quedaron colgados: no llegaron a ningún turno.
  console.log('\n\n===== PEDIDOS SIN TURNO (últimos 25) =====');
  const conSucursal = await tieneColumna('Transaccion', 'sucursal_id');
  const huerfanos = await prisma.$queryRawUnsafe<{
    id: number; sucursal_id: number | null; estado: string; payment_status: string;
    tipo_entrega: string | null; created_at: Date;
  }[]>(`
    SELECT id, ${conSucursal ? 'sucursal_id' : 'NULL::int AS sucursal_id'},
           estado::text AS estado, payment_status::text AS payment_status,
           tipo_entrega::text AS tipo_entrega, created_at
    FROM "Transaccion"
    WHERE turno_id IS NULL
    ORDER BY id DESC LIMIT 25
  `);
  for (const p of huerfanos) {
    console.log(`  global#${p.id}  sucursal ${p.sucursal_id ?? '-'}  ${p.tipo_entrega ?? 'SALON'}  ${p.estado}/${p.payment_status}  ${new Date(p.created_at).toISOString()}`);
  }
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
