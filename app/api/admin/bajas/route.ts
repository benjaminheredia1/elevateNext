import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const [productos, insumos] = await Promise.all([
      prisma.producto.findMany({
        where: { estado_publicacion: 'BAJA' },
        orderBy: { fecha_baja: 'desc' },
      }),
      prisma.insumo.findMany({
        where: { activo: false },
        orderBy: { fecha_baja: 'desc' },
      }),
    ]);

    return NextResponse.json({ data: { productos, insumos } });
  } catch (error) {
    return handleApiError(error);
  }
}
