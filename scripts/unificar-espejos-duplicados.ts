/**
 * unificar-espejos-duplicados.ts
 *
 * Corrección de datos por el incidente del 2026-09-03: entre el 31/08 y el
 * 02/09 se recrearon en el Centro productos que ya existían en la carta del
 * snack. Cada duplicado nació con su propio insumo espejo, así que el traslado
 * acreditaba un insumo y la venta descontaba otro: el stock que llegaba al
 * local no bajaba nunca y el del producto vendido se iba a negativo.
 *
 * Sobrevive el producto VIEJO de la carta: conserva su histórico de ventas, su
 * precio, su foto y sus categorías, y es el que la cajera ya conoce. El
 * duplicado se da de baja y su mercadería —que está físicamente en el local—
 * se muda al espejo canónico con movimientos AJUSTE trazables, nunca con un
 * UPDATE crudo: el valor del negocio no puede cambiar por una corrección de
 * datos, solo cambiar de fila.
 *
 * Idempotente: un par ya unificado (duplicado en BAJA) se saltea. Corre en
 * dry-run salvo que se le pase --aplicar.
 *
 *   npx dotenv -e .env.dev -- npx tsx scripts/unificar-espejos-duplicados.ts
 *   npx dotenv -e .env.dev -- npx tsx scripts/unificar-espejos-duplicados.ts --aplicar
 */
import prisma from '@/lib/prisma';
import {
  unificarEspejoDuplicado,
  type ParDuplicado,
} from '@/lib/server/centro-produccion/unificar-espejos.service';

/**
 * Mapeo revisado a mano. Se declaran los cuatro ids —producto y espejo de cada
 * lado— y el service aborta el par si la base no coincide: un id corrido
 * convertiría una corrección en una pérdida de stock.
 */
const MAPEO: ParDuplicado[] = [
  // ── Grupo A: mismo nombre, el canónico está publicado y en la carta ──
  { dupProducto: 188, dupEspejo: 323, canonProducto: 58,  canonEspejo: 173, nota: 'Marinated Chicken' },
  { dupProducto: 190, dupEspejo: 325, canonProducto: 34,  canonEspejo: 153, nota: 'Infusión Elevate' },
  { dupProducto: 191, dupEspejo: 326, canonProducto: 61,  canonEspejo: 176, nota: 'Chicken Milanese' },
  { dupProducto: 192, dupEspejo: 327, canonProducto: 3,   canonEspejo: 313, nota: 'Mozzarella Steak Panini' },
  { dupProducto: 193, dupEspejo: 328, canonProducto: 4,   canonEspejo: 184, nota: 'Panini Pesto Pollo' },
  { dupProducto: 194, dupEspejo: 329, canonProducto: 156, canonEspejo: 269, nota: 'Bolitas Proteicas de avena' },
  { dupProducto: 195, dupEspejo: 330, canonProducto: 155, canonEspejo: 268, nota: 'Bolitas Proteicas de brownie' },
  { dupProducto: 196, dupEspejo: 331, canonProducto: 154, canonEspejo: 267, nota: 'Bolitas Proteicas de Coco' },
  { dupProducto: 197, dupEspejo: 332, canonProducto: 172, canonEspejo: 285, nota: 'Bolitas Proteicas de Pistacho' },
  { dupProducto: 198, dupEspejo: 333, canonProducto: 43,  canonEspejo: 162, nota: 'Sandwich pollo' },
  { dupProducto: 199, dupEspejo: 334, canonProducto: 44,  canonEspejo: 163, nota: 'Sandwich mixto' },
  { dupProducto: 201, dupEspejo: 336, canonProducto: 2,   canonEspejo: 315, nota: 'Chicken Quesadilla (1/2)' },
  { dupProducto: 207, dupEspejo: 342, canonProducto: 2,   canonEspejo: 315, nota: 'Chicken Quesadilla (2/2)' },
  { dupProducto: 202, dupEspejo: 337, canonProducto: 38,  canonEspejo: 157, nota: 'Brownie (1/3)' },
  { dupProducto: 210, dupEspejo: 345, canonProducto: 38,  canonEspejo: 157, nota: 'Brownie (2/3)' },
  { dupProducto: 211, dupEspejo: 346, canonProducto: 38,  canonEspejo: 157, nota: 'Brownie (3/3)' },
  { dupProducto: 204, dupEspejo: 339, canonProducto: 69,  canonEspejo: 185, nota: 'parfait (1/2)' },
  { dupProducto: 209, dupEspejo: 344, canonProducto: 69,  canonEspejo: 185, nota: 'parfait (2/2)' },
  // ── Grupo B: mismo producto con typo o variante de nombre ──
  { dupProducto: 189, dupEspejo: 324, canonProducto: 171, canonEspejo: 284, nota: 'Steak Fetuccini ← "Seak Fetuccini"' },
  { dupProducto: 203, dupEspejo: 338, canonProducto: 28,  canonEspejo: 147, nota: 'Agua Vital 1lt' },
  { dupProducto: 208, dupEspejo: 343, canonProducto: 64,  canonEspejo: 179, nota: 'Overnight Oats' },
  { dupProducto: 212, dupEspejo: 347, canonProducto: 56,  canonEspejo: 171, nota: 'Cuñape Camote' },
  // Grupo C (187, 200, 205, 206, 213) queda fuera a propósito: son productos
  // que no existían antes y hoy descuentan bien.
];

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  console.log(`DB   => ${process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':***@')}`);
  console.log(`MODO => ${APLICAR ? '*** APLICANDO CAMBIOS ***' : 'dry-run (nada se escribe)'}\n`);

  const operador = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' }, orderBy: { id: 'asc' } });
  const resumen: Record<string, unknown>[] = [];

  for (const par of MAPEO) {
    const linea: Record<string, unknown> = { par: par.nota, dup: par.dupProducto, canon: par.canonProducto };

    // El dry-run muestra lo que se movería sin abrir ninguna escritura: la
    // transacción del service solo se abre con --aplicar.
    if (!APLICAR) {
      const dup = await prisma.producto.findUnique({ where: { id: par.dupProducto } });
      const [enSucursales, enCentros] = await Promise.all([
        prisma.stockSucursal.findMany({ where: { insumo_id: par.dupEspejo, stock_actual: { not: 0 } } }),
        prisma.stockCentro.findMany({ where: { insumo_id: par.dupEspejo, stock_actual: { not: 0 } } }),
      ]);
      resumen.push({
        ...linea,
        mueve: enSucursales.map(f => `suc${f.sucursal_id}:${f.stock_actual}`).join(' ') || '—',
        centro: enCentros.map(f => `c${f.centro_id}:${f.stock_actual}`).join(' ') || '—',
        estado: dup?.estado_publicacion === 'BAJA' ? 'ya unificado (se saltea)' : 'listo para aplicar',
      });
      continue;
    }

    const res = await prisma.$transaction(
      (tx) => unificarEspejoDuplicado(tx, par, { id: operador.id, rol: operador.rol }),
      { maxWait: 15000, timeout: 60000 },
    );
    resumen.push({
      ...linea,
      mueve: res.movido.map(m => `suc${m.sucursal_id}:${m.cantidad}`).join(' ') || '—',
      centro: res.movidoEnCentro.map(m => `c${m.centro_id}:${m.cantidad}`).join(' ') || '—',
      espejo_bajado: res.espejoBajado,
      estado: res.motivo ? `${res.estado}: ${res.motivo}` : res.estado,
    });
  }

  console.table(resumen);
  if (!APLICAR) console.log('\nDry-run: no se escribió nada. Volvé a correr con --aplicar para ejecutar.');
}

main().finally(() => prisma.$disconnect());
