/**
 * EL CORTE: muda el insumo bruto de las sucursales al Centro de Producción.
 *
 * Se ejecuta A MANO, UNA VEZ, con la caja cerrada y backup previo:
 *   npx dotenv -e .env.dev -- npx tsx scripts/mudar-insumo-bruto-al-centro.ts
 *
 * Es idempotente: si ya se corrió, avisa y no hace nada. Y es todo o nada — la
 * transacción la abre este script, así que cualquier error deja la base
 * exactamente como estaba.
 *
 * ⚠️ NUNCA correrlo contra `.env` (producción) sin autorización explícita en
 * ese momento. Sin `dotenv -e .env.dev` por delante, `.env` manda y `.env`
 * apunta a la base con la que trabaja la cajera.
 */
import prisma from '@/lib/prisma';
import { ejecutarMudanza, valorizadoTotal } from '@/lib/server/centro-produccion/mudanza.service';

async function main() {
  const centro = await prisma.centroProduccion.findFirstOrThrow({ where: { activo: true } });
  const dueno = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });

  console.log(`Base:    ${(process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':****@')}`);
  console.log(`Centro:  ${centro.nombre} (id ${centro.id})`);
  console.log(`Usuario: ${dueno.nombre ?? dueno.email} (id ${dueno.id})`);
  console.log(`Valorizado antes: Bs ${(await valorizadoTotal()).toFixed(2)}`);
  console.log('');

  // El timeout largo es porque el corte recorre todo el inventario del negocio
  // insumo por insumo; con el de 5 s por defecto, una base real no entra.
  //
  // Y contra producción hay que ser mucho más generoso que contra el sandbox:
  // la base es remota y cada una de esas consultas paga ida y vuelta de red.
  // Con 120 s alcanzaba de sobra en local y se quedó corto en el primer
  // intento real, que se revirtió entero a mitad de los espejos.
  //
  // Se puede subir por entorno para no tener que tocar el script:
  //   MUDANZA_TIMEOUT_MS=1800000 npx dotenv -e .env -- npx tsx scripts/...
  const timeoutMs = Number(process.env.MUDANZA_TIMEOUT_MS) || 1_200_000;
  console.log(`Timeout de la transacción: ${Math.round(timeoutMs / 1000)} s`);

  const r = await prisma.$transaction(
    (tx) => ejecutarMudanza(centro.id, dueno.id, tx),
    // `maxWait` es lo que espera para TOMAR la transacción, no lo que dura.
    { timeout: timeoutMs, maxWait: 60_000 },
  );

  if (r.yaEjecutada) {
    console.log('La mudanza ya se había ejecutado. No se hizo nada.');
    return;
  }

  console.log(`Insumos mudados:   ${r.insumosMudados}`);
  console.log(`Espejos creados:   ${r.espejosCreados}`);
  console.log(`Recetas copiadas:  ${r.recetasCopiadas}`);
  console.log(`Productos con origen en el Centro: ${r.productosConOrigen}`);
  console.log(`Valorizado después: Bs ${(await valorizadoTotal()).toFixed(2)}`);
}

main()
  .catch((e) => {
    console.error('La mudanza falló y se revirtió entera:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
