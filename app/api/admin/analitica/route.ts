import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { getAnalitica } from '@/lib/server/inventario/analitica.service';
import { RangoSchema } from '@/lib/server/dto/inventario.dto';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const rango = RangoSchema.parse(
      req.nextUrl.searchParams.get('rango') ?? '30d',
    );

    const data = await getAnalitica(rango);
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
