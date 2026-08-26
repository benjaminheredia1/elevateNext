import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ConteoFisicoCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { registrarConteoFisicoCentro } from '@/lib/server/centro-produccion/insumos-centro.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const parsed = ConteoFisicoCentroSchema.parse(await req.json());

    const result = await prisma.$transaction((tx) =>
      registrarConteoFisicoCentro(tx, parsed.centro_id, parsed.insumo_id, parsed.nuevo_stock, parsed.descripcion, session.id, session.rol),
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
