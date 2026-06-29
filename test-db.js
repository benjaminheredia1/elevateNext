require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL?.replace('localhost', '127.0.0.1')
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('Connecting via Prisma...');
  try {
    const sucursal = await prisma.sucursal.findFirst();
    console.log('Sucursal:', sucursal);
  } catch (err) {
    console.error('Prisma Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
