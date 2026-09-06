/**
 * corregir-duplicados-produccion.mjs
 *
 * Un solo comando para la ventana de mantenimiento del incidente de traslados
 * (duplicados del Centro, 2026-09). Encadena, en orden y frenando ante el
 * primer problema:
 *
 *   1. Verifica que la caja esté cerrada (ningún turno abierto).
 *   2. Backup de la base de producción.
 *   3. Dry-run de la unificación, para ver qué va a pasar.
 *   4. Pide confirmación escrita.
 *   5. Aplica la unificación.
 *   6. Verifica el resultado y deja el listado de reconteo para el local.
 *
 * Uso (desde la raíz del proyecto):
 *   npx dotenv -e .env -- node scripts/corregir-duplicados-produccion.mjs
 *
 * Es idempotente: si se corta a la mitad, se vuelve a correr y los pares ya
 * unificados se saltean.
 */
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { writeFileSync } from 'node:fs';
import pg from 'pg';

const ROJO = '\x1b[31m', VERDE = '\x1b[32m', AMARILLO = '\x1b[33m', NEGRITA = '\x1b[1m', FIN = '\x1b[0m';
const paso = (n, t) => console.log(`\n${NEGRITA}━━ Paso ${n}: ${t}${FIN}`);
const ok = (t) => console.log(`${VERDE}✓${FIN} ${t}`);
const aviso = (t) => console.log(`${AMARILLO}!${FIN} ${t}`);
const morir = (t) => { console.error(`\n${ROJO}✗ ${t}${FIN}\n`); process.exit(1); };

const correr = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0;
};

const db = async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  return c;
};

if (!process.env.DATABASE_URL) morir('Falta DATABASE_URL. Corré con: npx dotenv -e .env -- node scripts/corregir-duplicados-produccion.mjs');

console.log(`\n${NEGRITA}Corrección de productos duplicados del Centro${FIN}`);
console.log(`Base: ${process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@')}`);

// ── 1. La caja tiene que estar cerrada ────────────────────────────────
paso(1, 'Verificar que no haya caja abierta');
{
  const c = await db();
  const { rows } = await c.query(`
    select t.id, s.nombre sucursal, u.nombre cajero, t.fecha_apertura
    from "CajaTurno" t
    join "Sucursal" s on s.id = t.sucursal_id
    left join "Usuario" u on u.id = t.cajero_id
    where t.estado = 'ABIERTO'`);
  // La diferencia se calcula en SQL: `created_at` es timestamp sin zona
  // guardado en UTC, y el cliente pg lo leería como hora local (UTC−4 acá),
  // dando "hace −233 minutos".
  const { rows: [reciente] } = await c.query(`
    select round(extract(epoch from ((now() at time zone 'utc') - max(created_at))) / 60) minutos
    from "Transaccion"`);
  await c.end();

  if (rows.length > 0) {
    console.table(rows);
    morir('Hay caja abierta. Esperá al cierre: si se vende durante la corrección, el stock que mueve el script queda desactualizado.');
  }
  ok('Ninguna caja abierta');

  const minutos = Number(reciente.minutos);
  if (minutos < 10) aviso(`La última venta fue hace ${minutos} minuto(s). Confirmá que ya no están vendiendo.`);
  else ok(`Última venta hace ${minutos} minutos`);
}

// ── 2. Backup ──────────────────────────────────────────────────────────
paso(2, 'Backup de la base');
if (!correr('node', ['scripts/db-backup.mjs'])) {
  morir('El backup falló. No se sigue sin backup.');
}
ok('Backup hecho');

// ── 3. Dry-run ─────────────────────────────────────────────────────────
paso(3, 'Simulación (no escribe nada)');
if (!correr('npx', ['tsx', 'scripts/unificar-espejos-duplicados.ts'])) {
  morir('El dry-run falló. Revisá el error antes de aplicar.');
}

// ── 4. Confirmación ────────────────────────────────────────────────────
paso(4, 'Confirmación');
console.log('Lo de arriba es lo que se va a aplicar sobre PRODUCCIÓN.');
const rl = createInterface({ input: stdin, output: stdout });
const respuesta = await rl.question(`\nEscribí ${NEGRITA}APLICAR${FIN} para continuar (cualquier otra cosa cancela): `);
rl.close();
if (respuesta.trim() !== 'APLICAR') morir('Cancelado. No se escribió nada.');

// ── 5. Aplicar ─────────────────────────────────────────────────────────
paso(5, 'Aplicando la unificación');
if (!correr('npx', ['tsx', 'scripts/unificar-espejos-duplicados.ts', '--aplicar'])) {
  morir('La unificación falló. Cada par corre en su propia transacción, así que los que se aplicaron quedaron bien y los demás no se tocaron. Volvé a correr este script: los ya hechos se saltean.');
}
ok('Unificación aplicada');

// ── 6. Verificación y listado de reconteo ──────────────────────────────
paso(6, 'Verificación');
{
  const c = await db();

  const { rows: pendientes } = await c.query(`
    select p.id, p.nombre, p.estado_publicacion
    from "Producto" p
    where p.id in (188,189,190,191,192,193,194,195,196,197,198,199,201,202,203,204,207,208,209,210,211,212)
      and p.estado_publicacion <> 'BAJA'`);
  if (pendientes.length > 0) {
    console.table(pendientes);
    aviso('Quedaron duplicados sin dar de baja. Revisá la salida del paso 5.');
  } else {
    ok('Los 22 duplicados quedaron dados de baja');
  }

  const { rows: sobrantes } = await c.query(`
    select i.id, i.nombre, ss.stock_actual
    from "StockSucursal" ss join "Insumo" i on i.id = ss.insumo_id
    where ss.insumo_id in (323,324,325,326,327,328,329,330,331,332,333,334,336,337,338,339,342,343,344,345,346,347)
      and ss.stock_actual <> 0`);
  if (sobrantes.length > 0) {
    console.table(sobrantes);
    aviso('Quedó stock en renglones duplicados.');
  } else {
    ok('No quedó stock parado en los renglones duplicados');
  }

  // Listado para que el local haga el reconteo: una fila por producto vivo.
  const { rows: recuento } = await c.query(`
    select p.id producto, p.nombre, i.id insumo, ss.stock_actual "stock del sistema"
    from "Producto" p
    join "Insumo" i on i.id = p.insumo_reventa_id
    join "StockSucursal" ss on ss.insumo_id = i.id and ss.sucursal_id = 1 and ss.activo
    where p.id in (58,34,61,3,4,156,155,154,172,43,44,2,38,69,171,28,64,56)
    order by p.nombre`);
  console.log('\n── Listado para el reconteo del local ──');
  console.table(recuento);

  const csv = ['producto_id,nombre,insumo_id,stock_del_sistema,conteo_real']
    .concat(recuento.map(r => `${r.producto},"${r.nombre.replace(/"/g, '""')}",${r.insumo},${r['stock del sistema']},`))
    .join('\n');
  writeFileSync('reconteo-sucursal.csv', csv, 'utf8');
  ok('Listado guardado en reconteo-sucursal.csv');

  await c.end();
}

console.log(`\n${VERDE}${NEGRITA}Listo.${FIN} Queda un solo renglón por producto.`);
console.log('Siguiente paso: que el local haga el reconteo de esos productos en la plataforma.\n');
