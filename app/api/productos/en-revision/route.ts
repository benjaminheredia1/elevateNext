import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { listarProductosEnRevision } from '@/lib/server/insumos/insumos.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const productos = await listarProductosEnRevision();

    return NextResponse.json({
      data: productos,
      total: productos.length,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
