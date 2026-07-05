// Limpieza de la BD para entrega al cliente.
// MANTIENE: Usuarios, Insumos, Productos, Categorías, Recetas, Marcas, Sucursal,
//           CuentasFinancieras (saldo reseteado a 0), Privilegios y config.
// BORRA: ventas, detalles, movimientos de caja/internos, turnos, cajas, gastos,
//        cuentas corrientes (fiados), clientes, auditoría y alertas.
// Todo dentro de UNA transacción: si algo falla, ROLLBACK y no se toca nada.
// Uso: node --env-file=.env scripts/db-clean.mjs
import { Pool } from 'pg';

const connectionString = (process.env.DATABASE_URL ?? '').replace(/\?.*$/, '');
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// Orden hijo -> padre para respetar las FKs (varias NO son cascade).
const DELETES = [
  'MovimientoCaja',
  'MovimientoInterno',
  'CuentaCorriente',
  'TransaccionesDetalles',
  'Transaccion',
  'CajaTurno',
  'Gasto',
  'Caja',
  'ClientePrivilegio',
  'Cliente',
  'GastoOperativo',
  'RegistroAuditoria',
  'RegistroAlerta',
];

async function connectWithRetry(tries = 6) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await pool.connect(); }
    catch (e) {
      lastErr = e;
      if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|DatabaseNotReachable/.test(e.message)) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

const client = await connectWithRetry();
try {
  await client.query('BEGIN');

  const borrados = {};
  for (const t of DELETES) {
    const res = await client.query(`DELETE FROM "${t}"`);
    borrados[t] = res.rowCount;
    console.log(`  DELETE ${t.padEnd(22)} ${res.rowCount}`);
  }

  // Resets de consistencia
  const r1 = await client.query('UPDATE "CuentaFinanciera" SET saldo = 0');
  const r2 = await client.query('UPDATE "Producto" SET ventas_acumuladas = 0 WHERE ventas_acumuladas <> 0');
  console.log(`\n  RESET CuentaFinanciera.saldo=0        ${r1.rowCount}`);
  console.log(`  RESET Producto.ventas_acumuladas=0    ${r2.rowCount}`);

  await client.query('COMMIT');
  console.log('\nCOMMIT ok — limpieza aplicada.');

  // Verificación de lo que se conserva
  const check = await client.query(`
    select 'Usuario' t, count(*)::int n from "Usuario"
    union all select 'Insumo', count(*)::int from "Insumo"
    union all select 'Producto', count(*)::int from "Producto"
    union all select 'Categoria', count(*)::int from "Categoria"
    union all select 'RecetasProducto', count(*)::int from "RecetasProducto"
    union all select 'Sucursal', count(*)::int from "Sucursal"
    union all select 'CuentaFinanciera', count(*)::int from "CuentaFinanciera"
    union all select 'Transaccion (debe=0)', count(*)::int from "Transaccion"
    union all select 'Cliente (debe=0)', count(*)::int from "Cliente"
  `);
  console.log('\nEstado final (conservado):');
  for (const row of check.rows) console.log(`  ${row.t.padEnd(24)} ${row.n}`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('\nROLLBACK — no se modificó nada. Error:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
