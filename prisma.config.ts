import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgres://sistema:sistema@localhost:5432/sistema',
  },
  migrations: {
    seed: 'npx tsx prisma/seed.ts',
  }
});
