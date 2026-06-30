import * as dotenv from 'dotenv';
dotenv.config();
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL_PRISMA_DATABASE_URL'),
  },
  migrations: {
    seed: 'npx tsx prisma/seed.ts',
  }
});
