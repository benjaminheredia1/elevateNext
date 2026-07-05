// Backup completo de la BD (todas las tablas de public) a un JSON con marca de tiempo.
// Uso: node --env-file=.env scripts/db-backup.mjs
import { Pool } from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const connectionString = (process.env.DATABASE_URL ?? '').replace(/\?.*$/, '');
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function withRetry(fn, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (/ENOTFOUND|ECONNRESET|DatabaseNotReachable|ETIMEDOUT/.test(e.message)) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

const { rows: tables } = await withRetry(() => pool.query(
  `select table_name from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
     and table_name not like '\\_prisma%'
   order by table_name`
));

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = join(process.cwd(), 'backups');
mkdirSync(dir, { recursive: true });
const outFile = join(dir, `backup-${ts}.json`);

const dump = { _meta: { created_at: new Date().toISOString(), rows: {} } };
let total = 0;
for (const { table_name } of tables) {
  const { rows } = await withRetry(() => pool.query(`select * from "${table_name}"`));
  dump[table_name] = rows;
  dump._meta.rows[table_name] = rows.length;
  total += rows.length;
  console.log(`  ${table_name.padEnd(24)} ${rows.length}`);
}

writeFileSync(outFile, JSON.stringify(dump, null, 2), 'utf8');
console.log(`\nBackup: ${outFile}`);
console.log(`   ${total} filas en ${tables.length} tablas`);
await pool.end();
