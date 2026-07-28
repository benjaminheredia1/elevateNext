// Auditoría de CMV (solo lectura): reproduce el CMV del mes producto por
// producto e identifica qué insumos/costos lo inflan.
// Uso: node scripts/audit-cmv.mjs
// Uso: node --env-file=.env scripts/audit-cmv.mjs
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = (process.env.DIRECT_URL ?? process.env.DATABASE_URL)?.replace('localhost', '127.0.0.1');
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const desde = new Date('2026-07-01T00:00:00-04:00');
const hasta = new Date('2026-07-20T23:59:59-04:00');

const whereVentas = {
  created_at: { gte: desde, lte: hasta },
  estado: { in: ['ENTREGADO', 'PAGADO'] },
  es_cortesia: false,
};

async function resolverConsumo(productoId, cantidad, recetasByProducto, insumosById, productosById) {
  const consumo = new Map();
  const acumular = (id, c) => consumo.set(id, (consumo.get(id) ?? 0) + c);
  const consumir = (insumo, cantTotal) => {
    if (insumo.es_mixto && insumo.insumos_mixtos_hijo.length > 0) {
      const rend = insumo.rendimiento ?? 1;
      const cantAjustada = cantTotal / rend;
      for (const d of insumo.insumos_mixtos_hijo) acumular(d.insumo_hijo_id, d.cantidad * cantAjustada);
    } else {
      acumular(insumo.id, cantTotal);
    }
  };
  const receta = recetasByProducto.get(productoId) ?? [];
  for (const item of receta) consumir(insumosById.get(item.insumo_id), item.cantidad_utilizada * cantidad);
  if (receta.length === 0) {
    const prod = productosById.get(productoId);
    if (prod?.insumo_reventa_id) consumir(insumosById.get(prod.insumo_reventa_id), cantidad);
  }
  return consumo;
}

const detalles = await prisma.transaccionesDetalles.findMany({
  where: { transaccion: whereVentas },
  select: { producto_id: true, cantidad: true, precio_unitario: true },
});

const recetas = await prisma.recetasProducto.findMany({});
const insumos = await prisma.insumo.findMany({
  include: { insumos_mixtos_hijo: true },
});
const productos = await prisma.producto.findMany({
  select: { id: true, nombre: true, precio: true, insumo_reventa_id: true },
});

const recetasByProducto = new Map();
for (const r of recetas) {
  if (!recetasByProducto.has(r.producto_id)) recetasByProducto.set(r.producto_id, []);
  recetasByProducto.get(r.producto_id).push(r);
}
const insumosById = new Map(insumos.map(i => [i.id, i]));
const productosById = new Map(productos.map(p => [p.id, p]));

// Agregar ventas por producto
const vendidos = new Map();
for (const d of detalles) {
  const v = vendidos.get(d.producto_id) ?? { cantidad: 0, ingreso: 0 };
  v.cantidad += Number(d.cantidad);
  v.ingreso += Number(d.precio_unitario) * Number(d.cantidad);
  vendidos.set(d.producto_id, v);
}

// CMV por producto + aporte por insumo
const filas = [];
const aporteInsumo = new Map(); // insumo_id -> cmv aportado
for (const [productoId, v] of vendidos) {
  const consumo = await resolverConsumo(productoId, v.cantidad, recetasByProducto, insumosById, productosById);
  let cmv = 0;
  for (const [insumoId, cant] of consumo) {
    const ins = insumosById.get(insumoId);
    const aporte = (ins?.costo_promedio ?? 0) * cant;
    cmv += aporte;
    aporteInsumo.set(insumoId, (aporteInsumo.get(insumoId) ?? 0) + aporte);
  }
  const p = productosById.get(productoId);
  filas.push({
    producto: p?.nombre ?? `#${productoId}`,
    und: v.cantidad,
    ingreso: v.ingreso,
    precio: Number(p?.precio ?? 0),
    costo_unit: v.cantidad ? cmv / v.cantidad : 0,
    cmv,
    food_pct: v.ingreso > 0 ? (cmv / v.ingreso) * 100 : 0,
  });
}

filas.sort((a, b) => b.cmv - a.cmv);
const totalCMV = filas.reduce((s, f) => s + f.cmv, 0);
const totalIngreso = filas.reduce((s, f) => s + f.ingreso, 0);

console.log(`\n== CMV reproducido ${desde.toISOString().slice(0, 10)} → ${hasta.toISOString().slice(0, 10)} ==`);
console.log(`Ingresos: ${totalIngreso.toFixed(2)} | CMV: ${totalCMV.toFixed(2)} | FoodCost: ${(totalCMV / totalIngreso * 100).toFixed(1)}%\n`);

console.log('-- TOP 15 productos por CMV --');
console.log('producto | und | precio | costo_unit | cmv | food%');
for (const f of filas.slice(0, 15)) {
  console.log(`${f.producto} | ${f.und} | ${f.precio.toFixed(2)} | ${f.costo_unit.toFixed(2)} | ${f.cmv.toFixed(2)} | ${f.food_pct.toFixed(0)}%`);
}

// Insumos culpables
const insumosTop = Array.from(aporteInsumo.entries())
  .map(([id, cmv]) => ({ ins: insumosById.get(id), cmv }))
  .sort((a, b) => b.cmv - a.cmv)
  .slice(0, 15);

console.log('\n-- TOP 15 insumos por aporte al CMV --');
console.log('insumo | unidad | costo_promedio | stock_actual | aporte_cmv');
for (const { ins, cmv } of insumosTop) {
  console.log(`${ins.nombre} | ${ins.unidad_medida} | ${ins.costo_promedio} | ${ins.stock_actual} | ${cmv.toFixed(2)}`);
}

// Historial de compras de los 8 insumos más culpables (para ver costo_unitario real)
console.log('\n-- Últimas compras (INGRESO) de los insumos top --');
for (const { ins } of insumosTop.slice(0, 8)) {
  const compras = await prisma.movimientoInterno.findMany({
    where: { insumo_id: ins.id, tipo_movimiento: 'INGRESO' },
    orderBy: { created_at: 'desc' },
    take: 3,
    select: { created_at: true, cantidad: true, costo_unitario: true, descripcion: true },
  });
  console.log(`\n${ins.nombre} (costo_promedio actual: ${ins.costo_promedio} /${ins.unidad_medida})`);
  for (const c of compras) {
    console.log(`  ${c.created_at.toISOString().slice(0, 10)} cant=${c.cantidad} costo_unit=${c.costo_unitario} "${(c.descripcion ?? '').slice(0, 50)}"`);
  }
}

await prisma.$disconnect();
