import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const sucursales = await prisma.sucursal.findMany({
      where: { activa: true },
      select: { id: true, nombre: true, direccion: true },
      orderBy: { nombre: 'asc' },
    });

    return NextResponse.json({ items: sucursales });
  } catch (e) {
    return handleApiError(e);
  }
}
