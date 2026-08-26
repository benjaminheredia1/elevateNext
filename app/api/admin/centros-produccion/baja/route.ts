import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { RegistrarBajaCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { darDeBajaInsumoCentro } from '@/lib/server/centro-produccion/insumos-centro.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const parsed = RegistrarBajaCentroSchema.parse(await req.json());

    const result = await darDeBajaInsumoCentro(parsed.centro_id, parsed.insumo_id, parsed.motivo, session.id, session.rol);

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
