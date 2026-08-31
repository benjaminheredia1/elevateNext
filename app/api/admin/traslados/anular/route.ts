import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { AnularTrasladoSchema } from '@/lib/server/dto/centro-produccion.dto';
import { anularTraslado } from '@/lib/server/centro-produccion/traslados.service';

/** Anular es del Centro, que es quien recupera la mercadería: solo administración. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const parsed = AnularTrasladoSchema.parse(await req.json());

    const result = await prisma.$transaction((tx) =>
      anularTraslado(tx, parsed.traslado_id, parsed.motivo, session.id, session.rol),
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
