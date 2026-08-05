/**
 * Mensaje de WhatsApp con el pedido, listo para que el cliente lo envíe al
 * número del local.
 *
 * El pedido igual queda registrado en la base: esto es el aviso al local, que
 * en la práctica es cómo se enteran de que entró algo. Sirve para delivery y
 * para retiro; lo único que cambia son las líneas de entrega.
 */

export interface LineaPedidoWhatsApp {
  nombre: string;
  cantidad: number;
  /** Total de la línea (precio unitario × cantidad). */
  total: number;
}

export interface PedidoWhatsApp {
  /** Nombre del negocio o del menú, para el encabezado. */
  negocio: string;
  /** Correlativo que ve el cliente, si el servidor ya lo devolvió. */
  numero?: number | null;
  sucursal: string;
  entrega: 'delivery' | 'recojo';
  lineas: LineaPedidoWhatsApp[];
  subtotal: number;
  /** Costo del envío. 0 o ausente = no se cobra. */
  envio?: number;
  /** Distancia usada para cotizar el envío, en km. */
  distanciaKm?: number | null;
  /** Indicaciones que escribió el cliente para el repartidor. */
  indicaciones?: string;
  lat?: number | null;
  lng?: number | null;
  pago: 'cash' | 'qr';
  cliente: string;
  telefono: string;
  notas?: string;
}

const PAGO_LABEL: Record<PedidoWhatsApp['pago'], string> = {
  cash: 'Efectivo',
  qr: 'QR',
};

/** Bs sin decimales cuando es entero: "Bs 40", no "Bs 40.00". */
function bs(monto: number): string {
  return `Bs ${Number.isInteger(monto) ? monto : monto.toFixed(2)}`;
}

/** Enlace que abre el punto exacto en Google Maps desde cualquier teléfono. */
export function linkMapa(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Número en formato internacional para wa.me: solo dígitos y con código de
 * país. Un celular boliviano de 8 dígitos se manda como 591XXXXXXXX; sin el
 * código, WhatsApp abre un chat vacío con un número inválido.
 */
export function normalizarWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 8) return `591${digitos}`;
  if (digitos.startsWith('591') && digitos.length === 11) return digitos;
  // Otro largo: ya viene con código de país (o es un fijo). Se manda tal cual.
  return digitos.length >= 8 ? digitos : null;
}

/** El texto del mensaje, tal como lo va a ver quien atiende el local. */
export function mensajePedido(p: PedidoWhatsApp): string {
  const total = p.subtotal + (p.envio ?? 0);
  const lineas: string[] = [];

  lineas.push(`*Nuevo pedido — ${p.negocio}*`);
  if (p.numero) lineas.push(`Pedido #${p.numero}`);
  lineas.push('');

  for (const item of p.lineas) {
    lineas.push(`• ${item.cantidad}x ${item.nombre} — ${bs(item.total)}`);
  }
  lineas.push('');

  lineas.push(`Subtotal: ${bs(p.subtotal)}`);
  if (p.envio && p.envio > 0) {
    const km = p.distanciaKm != null ? ` (${p.distanciaKm.toFixed(1)} km)` : '';
    lineas.push(`Envío${km}: ${bs(p.envio)}`);
  }
  lineas.push(`*TOTAL: ${bs(total)}*`);
  lineas.push('');

  lineas.push(`Sucursal: ${p.sucursal}`);
  if (p.entrega === 'delivery') {
    lineas.push('Entrega: Delivery 🛵');
    if (p.indicaciones?.trim()) lineas.push(`Indicaciones: ${p.indicaciones.trim()}`);
    if (p.distanciaKm != null) lineas.push(`Distancia: ${p.distanciaKm.toFixed(1)} km`);
    if (p.lat != null && p.lng != null) lineas.push(`Ubicación en mapa: ${linkMapa(p.lat, p.lng)}`);
  } else {
    // Retiro: no hay dirección ni mapa, pero el resto del pedido va igual.
    lineas.push('Entrega: Retiro en el local 🏪');
  }
  lineas.push(`Pago: ${PAGO_LABEL[p.pago]}`);
  lineas.push('');

  lineas.push(`Cliente: ${p.cliente}`);
  lineas.push(`Tel: ${p.telefono}`);
  if (p.notas?.trim()) lineas.push(`Notas: ${p.notas.trim()}`);

  return lineas.join('\n');
}

/** URL de wa.me con el mensaje ya cargado. null si el local no tiene número. */
export function linkWhatsAppPedido(telefonoLocal: string | null | undefined, pedido: PedidoWhatsApp): string | null {
  const numero = normalizarWhatsApp(telefonoLocal);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajePedido(pedido))}`;
}
