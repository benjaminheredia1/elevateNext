import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { contarPendientes, drenarCola } from '@/lib/server/whatsapp/cola';
import prisma from '@/lib/prisma';

/** Avisos que quedaron esperando, para verlos desde el panel. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const mensajes = await prisma.whatsappPendiente.findMany({
      where: { estado: { in: ['PENDIENTE', 'FALLIDO'] } },
      orderBy: { created_at: 'asc' },
      take: 50,
    });

    return NextResponse.json({ data: mensajes });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Fuerza el envío de lo encolado, sin esperar al reintento automático. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const resultado = await drenarCola();
    return NextResponse.json({ data: { ...resultado, total: await contarPendientes() } });
  } catch (error) {
    return handleApiError(error);
  }
}
