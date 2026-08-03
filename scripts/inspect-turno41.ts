import prisma from '../lib/prisma';

async function main() {
  const turnoId = 41;
  const q = (sql: string) => prisma.$queryRawUnsafe(sql);

  const turno = await q(`
    select id, sucursal_id, cajero_id, estado, apertura_efectivo, apertura_qr,
           fecha_apertura, fecha_cierre, ventas_efectivo, ventas_qr,
           esperado_efectivo, esperado_qr, real_efectivo, real_qr,
           diferencia_efectivo, diferencia_qr
    from "CajaTurno"
    where id = ${turnoId}
  `);

  const movimientos = await q(`
    select tipo, metodo_pago, count(*)::int as count, coalesce(sum(monto), 0)::numeric as suma
    from "MovimientoCaja"
    where turno_id = ${turnoId}
    group by tipo, metodo_pago
    order by tipo, metodo_pago
  `);

  const pedidos = await q(`
    select id, numero_turno, total, metodo_pago, payment_status, estado, created_at
    from "Transaccion"
    where turno_id = ${turnoId}
    order by created_at asc
  `);

  const migraciones = await q(`
    select migration_name, finished_at
    from "_prisma_migrations"
    order by migration_name desc
    limit 12
  `);

  const turnosRecientes = await q(`
    select id, estado, apertura_efectivo, apertura_qr, ventas_efectivo, ventas_qr,
           fecha_apertura, fecha_cierre
    from "CajaTurno"
    where id >= 38
    order by id asc
  `);

  const pedidosRecientes = await q(`
    select id, turno_id, numero_turno, total, metodo_pago, payment_status, estado, created_at
    from "Transaccion"
    where id >= 1445
    order by id asc
  `);

  console.log(JSON.stringify({ turno, movimientos, pedidos, turnosRecientes, pedidosRecientes, migraciones }, (_key, value) => {
    if (typeof value === 'bigint') return Number(value);
    return value;
  }, 2));
}

main().finally(() => prisma.$disconnect());
