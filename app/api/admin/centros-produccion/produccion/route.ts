import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { leerClaveIdempotencia } from '@/lib/server/idempotencia';
import { RegistrarProduccionSchema } from '@/lib/server/dto/centro-produccion.dto';
import { registrarProduccion } from '@/lib/server/centro-produccion/produccion.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const parsed = RegistrarProduccionSchema.parse(await req.json());
    const clave = leerClaveIdempotencia(req);

    const result = await prisma.$transaction((tx) =>
      registrarProduccion(
        tx, parsed.centro_id, parsed.producto_id, parsed.cantidad,
        parsed.nota, session.id, session.rol, clave,
      ),
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
