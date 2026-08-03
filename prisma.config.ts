import * as dotenv from 'dotenv';
/**
 * Los comandos de Prisma apuntan a la base LOCAL por defecto.
 *
 * `dotenv` nunca pisa una variable ya definida, así que el orden es la regla:
 *
 *   1. Lo que ya venga en el entorno (por ejemplo `dotenv -e .env --`, que es
 *      como `db:deploy` apunta a producción a propósito) manda sobre todo.
 *   2. `.env.dev` — la base local de desarrollo.
 *   3. `.env` — producción, que queda como último recurso.
 *
 * Antes se cargaba solo `.env`, así que un `npx prisma studio` suelto abría
 * producción con permisos de edición sin avisar. Ahora apuntar a producción es
 * algo que hay que pedir explícitamente.
 */
dotenv.config({ path: '.env.dev' });
dotenv.config();

import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// A qué base quedó apuntando, sin exponer credenciales: es barato y evita
// correr una migración creyendo que era el otro entorno.
try {
  const url = process.env.DATABASE_URL_PRISMA_DATABASE_URL ?? process.env.DATABASE_URL;
  if (url) console.log(`[prisma] base de datos: ${new URL(url).host}`);
} catch { /* URL mal formada: que falle Prisma con su propio mensaje */ }

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'npx tsx prisma/seed.ts',
  }
});