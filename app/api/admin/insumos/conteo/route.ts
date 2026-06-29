import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ConteoFisicoSchema } from '@/lib/server/dto/inventario.dto';
import { registrarConteoFisico } from '@/lib/server/inventario/inventario.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const body   = await req.json();
    const parsed = ConteoFisicoSchema.parse(body);

    const result = await prisma.$transaction(async (tx) =>
      registrarConteoFisico(
        tx,
        parsed.insumo_id,
        parsed.nuevo_stock,
        parsed.descripcion,
        session.id,
        session.rol,
      ),
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
