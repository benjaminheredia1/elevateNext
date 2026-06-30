import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const createPrismaClient = () => {
  // En producción se usa DIRECT_URL (URL estándar de PostgreSQL para el adaptador pg).
  // En desarrollo se usa DATABASE_URL con el parche localhost→127.0.0.1.
  const connectionString = (process.env.DIRECT_URL ?? process.env.DATABASE_URL)
    ?.replace('localhost', '127.0.0.1');
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

const prisma = global.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
