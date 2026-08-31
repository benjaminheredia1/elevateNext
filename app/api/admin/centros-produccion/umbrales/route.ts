import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { EditarUmbralesCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { editarUmbralesCentro } from '@/lib/server/centro-produccion/insumos-centro.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const parsed = EditarUmbralesCentroSchema.parse(await req.json());

    const result = await editarUmbralesCentro(
      parsed.centro_id, parsed.insumo_id,
      { stock_minimo: parsed.stock_minimo, punto_critico: parsed.punto_critico },
      session.id, session.rol,
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
