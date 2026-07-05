import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ReactivarInsumoSchema } from '@/lib/server/dto/inventario.dto';
import { reactivarInsumo } from '@/lib/server/inventario/inventario.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const body   = await req.json();
    const parsed = ReactivarInsumoSchema.parse(body);

    const result = await prisma.$transaction(async (tx) =>
      reactivarInsumo(
        tx,
        parsed.insumo_id,
        session.id,
        session.rol,
      ),
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
