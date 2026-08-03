import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import { cerrarSesionWhatsapp, conectarWhatsapp, estadoWhatsapp } from '@/lib/server/whatsapp/cliente';
import { contarPendientes } from '@/lib/server/whatsapp/cola';

/** Estado de la sesión + grupo elegido. La UI lo consulta en bucle mientras se escanea el QR. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const [config, pendientes] = await Promise.all([
      prisma.configuracion.findUnique({
        where: { id: 1 },
        select: { whatsapp_grupo_jid: true, whatsapp_grupo_nombre: true },
      }),
      contarPendientes(),
    ]);

    return NextResponse.json({
      data: {
        ...estadoWhatsapp(),
        pendientes,
        grupo: config?.whatsapp_grupo_jid
          ? { jid: config.whatsapp_grupo_jid, nombre: config.whatsapp_grupo_nombre }
          : null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Abre la sesión: si no hay credenciales guardadas, empieza a emitir el QR. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    await conectarWhatsapp();

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'WhatsApp',
      detalle: 'Inició la conexión de WhatsApp',
    });

    return NextResponse.json({ data: estadoWhatsapp() });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Cierra la sesión en WhatsApp y borra las credenciales locales. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    await cerrarSesionWhatsapp();

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'ELIMINO',
      entidad: 'WhatsApp',
      detalle: 'Cerró la sesión de WhatsApp (hay que volver a escanear el QR)',
    });

    return NextResponse.json({ data: estadoWhatsapp() });
  } catch (error) {
    return handleApiError(error);
  }
}
