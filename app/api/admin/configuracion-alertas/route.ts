import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ConfiguracionAlertasSchema } from '@/lib/server/dto/inventario.dto';

const DEFAULT_CONFIG = {
  whatsapp_habilitado:  false,
  destinatarios:        [] as string[],
  hora_silencio_desde:  '22:00',
  hora_silencio_hasta:  '07:00',
  intervalo_minimo_min: 60,
  plantilla_mensaje:    'Elevate - Alerta de inventario: {count} insumos bajo umbral.\n{list}',
};

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    let config = await prisma.configuracionAlertas.findUnique({ where: { id: 1 } });
    if (!config) {
      config = await prisma.configuracionAlertas.create({ data: { id: 1, ...DEFAULT_CONFIG } });
    }

    return NextResponse.json({ data: config });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const body   = await req.json();
    const parsed = ConfiguracionAlertasSchema.parse(body);

    const config = await prisma.configuracionAlertas.upsert({
      where:  { id: 1 },
      update: parsed,
      create: { id: 1, ...DEFAULT_CONFIG, ...parsed },
    });

    return NextResponse.json({ data: config });
  } catch (error) {
    return handleApiError(error);
  }
}
