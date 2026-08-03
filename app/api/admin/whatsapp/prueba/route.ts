import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { enviarTexto } from '@/lib/server/whatsapp/cliente';
import { construirMensajePedido, SUCURSAL_POR_DEFECTO } from '@/lib/server/whatsapp/pedido.service';

/**
 * Manda al grupo elegido un pedido de ejemplo, con el mismo formato que el real,
 * para confirmar que la sesión y el destino quedaron bien configurados.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
    if (!config?.whatsapp_grupo_jid) {
      throw new ValidationError('Primero elegí a qué grupo se avisan los pedidos.');
    }

    const mensaje = construirMensajePedido(
      {
        codigo: 'PRUEBA',
        tipo_entrega: 'DELIVERY',
        cliente_direccion: 'Dirección de ejemplo',
        cliente_lat: config.sucursal_lat,
        cliente_lng: config.sucursal_lng,
      },
      {
        sucursal_nombre: config.sucursal_nombre || SUCURSAL_POR_DEFECTO.sucursal_nombre,
        sucursal_lat: config.sucursal_lat,
        sucursal_lng: config.sucursal_lng,
      },
    );

    await enviarTexto(config.whatsapp_grupo_jid, mensaje);

    return NextResponse.json({ data: { enviado: true, preview: mensaje } });
  } catch (error) {
    if (error instanceof Error && error.message === 'WhatsApp no está conectado') {
      return handleApiError(new ValidationError('WhatsApp no está conectado. Escaneá el QR primero.'));
    }
    return handleApiError(error);
  }
}
