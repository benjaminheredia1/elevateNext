import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ReactivarInsumoCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { reactivarInsumoCentro } from '@/lib/server/centro-produccion/insumos-centro.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const parsed = ReactivarInsumoCentroSchema.parse(await req.json());

    const result = await reactivarInsumoCentro(parsed.centro_id, parsed.insumo_id, session.id, session.rol);

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
