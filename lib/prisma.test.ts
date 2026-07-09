import { describe, it, expect } from 'vitest';
import prisma from '@/lib/prisma';

describe('base de datos de test', () => {
  it('esta conectada a elevate_db_test, no a la base de dev', async () => {
    expect(process.env.DATABASE_URL).toContain('elevate_db_test');
    const count = await prisma.usuario.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
