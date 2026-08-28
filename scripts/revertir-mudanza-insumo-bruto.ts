/**
 * Deshace el corte: devuelve a cada sucursal el insumo bruto que se mudó al
 * Centro de Producción.
 *
 *   npx dotenv -e .env.dev -- npx tsx scripts/revertir-mudanza-insumo-bruto.ts
 *
 * ⚠️ Solo tiene sentido la MISMA NOCHE de la mudanza, antes de que empiecen las
 * ventas del día siguiente. Después el stock ya se movió por otras razones y
 * devolver las cantidades originales pisaría esos movimientos.
 *
 * No es una reversión perfecta: las recetas copiadas al Centro quedan, y los
 * productos TERCIADO que pasaron a ELABORADO no vuelven atrás. Lo que sí queda
 * exacto es el stock y la plata, que es lo que permite volver a intentar.
 *
 * ⚠️ NUNCA correrlo contra `.env` (producción) sin autorización explícita en
 * ese momento.
 */
import prisma from '@/lib/prisma';
import { revertirMudanza, valorizadoTotal } from '@/lib/server/centro-produccion/mudanza.service';

async function main() {
  const centro = await prisma.centroProduccion.findFirstOrThrow({ where: { activo: true } });
  const dueno = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });

  console.log(`Base:    ${(process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':****@')}`);
  console.log(`Centro:  ${centro.nombre} (id ${centro.id})`);
  console.log(`Valorizado antes: Bs ${(await valorizadoTotal()).toFixed(2)}`);
  console.log('');

  const r = await prisma.$transaction(
    (tx) => revertirMudanza(centro.id, dueno.id, tx),
    { timeout: 120_000 },
  );

  console.log(`Insumos devueltos: ${r.insumosDevueltos}`);
  console.log(`Valorizado después: Bs ${(await valorizadoTotal()).toFixed(2)}`);
  console.log('La mudanza se puede volver a ejecutar.');
}

main()
  .catch((e) => {
    console.error('La reversión falló y no se aplicó nada:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
