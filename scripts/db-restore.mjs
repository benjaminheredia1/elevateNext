// Restaura un backup JSON (generado por db-backup.mjs) en la BD apuntada por DATABASE_URL.
// Inserta en orden padre -> hijo para respetar FKs y luego resetea las secuencias.
// Requiere que el esquema ya exista (correr `prisma migrate deploy` antes).
// Uso: node --env-file=.env scripts/db-restore.mjs backups/backup-XXXX.json
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Uso: node --env-file=.env scripts/db-restore.mjs <archivo.json>');
  process.exit(1);
}

const connectionString = (process.env.DATABASE_URL ?? '').replace(/\?.*$/, '');
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// Orden padre -> hijo (inverso al DELETES de db-clean.mjs).
const ORDER = [
  'Sucursal',
  'Usuario',
  'Cliente',
  'Categoria',
  'UnidadMedida',
  'Insumo',
  'Producto',
  'CategoriasProducto',
  'InsumoMixtoDetalle',
  'RecetasProducto',
  'Marca',
  'ProductoMarca',
  'Privilegio',
  'ClientePrivilegio',
  'PromocionesDescuentos',
  'PromocionProducto',
  'ReglasHorarias',
  'Configuracion',
  'ConfiguracionAlertas',
  'CuentaFinanciera',
  'CajaTurno',
  'Caja',
  'Gasto',
  'GastoFijo',
  'GastoOperativo',
  'ActivoFijo',
  'HorarioTrabajador',
  'DiaFeriado',
  'Transaccion',
  'TransaccionesDetalles',
  'MovimientoCaja',
  'MovimientoInterno',
  'CuentaCorriente',
  'RegistroAuditoria',
  'RegistroAlerta',
];

const dump = JSON.parse(readFileSync(file, 'utf8'));

async function insertTable(client, table) {
  const rows = dump[table];
  if (!rows || rows.length === 0) return 0;

  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(', ');

  for (const row of rows) {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map((c) => row[c]);
    await client.query(
      `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
      values,
    );
  }

  // Recoloca la secuencia del PK (asume PK "id" serial, como en todo el schema).
  await client.query(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), (SELECT MAX(id) IS NOT NULL FROM "${table}"))`,
  );

  return rows.length;
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  let total = 0;
  for (const table of ORDER) {
    const n = await insertTable(client, table);
    if (n > 0) console.log(`  INSERT ${table.padEnd(24)} ${n}`);
    total += n;
  }

  // Tablas presentes en el dump pero no contempladas en ORDER (por si el schema creció).
  const faltantes = Object.keys(dump).filter((k) => k !== '_meta' && !ORDER.includes(k));
  if (faltantes.length > 0) {
    console.warn('\nADVERTENCIA: tablas en el backup no incluidas en ORDER (revisar script):', faltantes);
  }

  await client.query('COMMIT');
  console.log(`\nCOMMIT ok — ${total} filas restauradas desde ${file}`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('\nROLLBACK — no se insertó nada. Error:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
