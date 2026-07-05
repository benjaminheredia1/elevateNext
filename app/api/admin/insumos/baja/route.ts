import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { RegistrarBajaSchema } from '@/lib/server/dto/inventario.dto';
import { registrarBaja } from '@/lib/server/inventario/inventario.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const body   = await req.json();
    const parsed = RegistrarBajaSchema.parse(body);

    const result = await prisma.$transaction(async (tx) =>
      registrarBaja(
        tx,
        parsed.insumo_id,
        parsed.motivo,
        session.id,
        session.rol,
      ),
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
