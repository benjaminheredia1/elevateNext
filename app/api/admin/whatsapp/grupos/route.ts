import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import { listarGrupos } from '@/lib/server/whatsapp/cliente';
import { SUCURSAL_POR_DEFECTO } from '@/lib/server/whatsapp/pedido.service';

const SeleccionGrupoSchema = z.object({
  // Grupo (`...@g.us`) o chat individual (`...@s.whatsapp.net`).
  jid: z.string().min(1).regex(/@(g\.us|s\.whatsapp\.net)$/, 'JID de WhatsApp inválido'),
  nombre: z.string().min(1).max(120),
});

/** Grupos donde participa el número pareado. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    return NextResponse.json({ data: await listarGrupos() });
  } catch (error) {
    if (error instanceof Error && error.message === 'WhatsApp no está conectado') {
      return handleApiError(new ValidationError('WhatsApp no está conectado. Escaneá el QR primero.'));
    }
    return handleApiError(error);
  }
}

/** Fija a qué grupo/chat se avisan los pedidos nuevos. */
export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { jid, nombre } = SeleccionGrupoSchema.parse(await req.json());

    const config = await prisma.configuracion.upsert({
      where: { id: 1 },
      update: { whatsapp_grupo_jid: jid, whatsapp_grupo_nombre: nombre },
      create: { id: 1, ...SUCURSAL_POR_DEFECTO, whatsapp_grupo_jid: jid, whatsapp_grupo_nombre: nombre },
      select: { whatsapp_grupo_jid: true, whatsapp_grupo_nombre: true },
    });

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'WhatsApp',
      detalle: `Los pedidos nuevos se avisarán al grupo "${nombre}"`,
    });

    return NextResponse.json({ data: config });
  } catch (error) {
    return handleApiError(error);
  }
}
