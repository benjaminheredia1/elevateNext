import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { RegistrarCompraCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { registrarCompraCentro } from '@/lib/server/centro-produccion/insumos-centro.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const parsed = RegistrarCompraCentroSchema.parse(await req.json());

    const result = await prisma.$transaction((tx) =>
      registrarCompraCentro(
        tx, parsed.centro_id, parsed.insumo_id, parsed.cantidad, parsed.costo_unitario,
        parsed.nota, session.id, session.rol,
      ),
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
