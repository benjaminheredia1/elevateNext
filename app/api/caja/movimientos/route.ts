import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import * as caja from '@/lib/server/caja/caja.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO']);
    const data = await caja.getMovimientos(session);
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
