import prisma from '@/lib/prisma';
import { enviarOEncolar } from './cola';

/** Datos del pedido que entran en el aviso. Nada de precios ni productos. */
export interface PedidoNotificable {
  codigo: string | null;
  tipo_entrega: 'DELIVERY' | 'RECOJO' | null;
  cliente_direccion: string | null;
  cliente_lat: number | null;
  cliente_lng: number | null;
}

export interface SucursalOrigen {
  sucursal_nombre: string;
  sucursal_lat: number;
  sucursal_lng: number;
}

/** Mismo fallback que usa GET /api/configuracion cuando no hay fila. */
export const SUCURSAL_POR_DEFECTO: SucursalOrigen = {
  sucursal_nombre: 'Sucursal Principal',
  sucursal_lat: -17.771,
  sucursal_lng: -63.19,
};

function linkMaps(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/**
 * Arma el aviso "pedido #X de tal lugar a tal lugar".
 * Función pura: sin BD ni red, para poder testearla.
 */
export function construirMensajePedido(pedido: PedidoNotificable, sucursal: SucursalOrigen): string {
  const esRecojo = pedido.tipo_entrega === 'RECOJO';

  const destino = esRecojo
    ? 'Recojo en tienda'
    : pedido.cliente_direccion?.trim() || 'Dirección no especificada';

  // En recojo el punto en el mapa es la tienda; en delivery, donde está el cliente.
  const coordenadas = esRecojo
    ? { lat: sucursal.sucursal_lat, lng: sucursal.sucursal_lng }
    : pedido.cliente_lat != null && pedido.cliente_lng != null
      ? { lat: pedido.cliente_lat, lng: pedido.cliente_lng }
      : null;

  const lineas = [
    `🛎️ Pedido #${pedido.codigo ?? 'sin código'}`,
    `De: ${sucursal.sucursal_nombre}`,
    `A: ${destino}`,
  ];
  if (coordenadas) {
    lineas.push(`📍 ${linkMaps(coordenadas.lat, coordenadas.lng)}`);
  }

  return lineas.join('\n');
}

/**
 * Avisa al grupo/chat configurado que entró un pedido.
 *
 * Si la sesión está caída el aviso no se pierde: queda encolado y sale apenas
 * WhatsApp vuelve. No-op solo si nadie eligió grupo destino todavía.
 * **Nunca lanza**: el aviso no es dato crítico y no debe romper el checkout.
 */
export async function notificarPedidoWhatsapp(pedido: PedidoNotificable): Promise<void> {
  try {
    const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
    const jid = config?.whatsapp_grupo_jid;
    // Sin destino no hay a dónde encolar: encolarlo sería guardar basura.
    if (!jid) return;

    const sucursal: SucursalOrigen = config
      ? {
          sucursal_nombre: config.sucursal_nombre,
          sucursal_lat: config.sucursal_lat,
          sucursal_lng: config.sucursal_lng,
        }
      : SUCURSAL_POR_DEFECTO;

    await enviarOEncolar(jid, construirMensajePedido(pedido, sucursal));
  } catch (error) {
    console.error('[WhatsApp] No se pudo avisar del pedido:', error);
  }
}
