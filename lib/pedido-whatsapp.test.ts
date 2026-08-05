import { describe, it, expect } from 'vitest';
import { mensajePedido, normalizarWhatsApp, linkWhatsAppPedido, type PedidoWhatsApp } from './pedido-whatsapp';

const base: PedidoWhatsApp = {
  negocio: 'Elevate',
  numero: 12,
  sucursal: 'Equipetrol',
  entrega: 'recojo',
  lineas: [{ nombre: 'Hamburguesa Paladar', cantidad: 1, total: 40 }],
  subtotal: 40,
  pago: 'qr',
  cliente: 'Jose Alfredo',
  telefono: '62006622',
  notas: 'Sin picante',
};

describe('mensaje de pedido por WhatsApp', () => {
  it('para retiro no manda dirección ni mapa, pero sí el resto', () => {
    const texto = mensajePedido(base);

    expect(texto).toContain('Pedido #12');
    expect(texto).toContain('• 1x Hamburguesa Paladar — Bs 40');
    expect(texto).toContain('Subtotal: Bs 40');
    expect(texto).toContain('*TOTAL: Bs 40*');
    expect(texto).toContain('Entrega: RETIRO EN EL LOCAL');
    expect(texto).toContain('Sucursal: Equipetrol');
    expect(texto).toContain('Pago: QR');
    expect(texto).toContain('Cliente: Jose Alfredo');
    expect(texto).toContain('Tel: 62006622');
    expect(texto).toContain('Notas: Sin picante');
    // Lo de delivery no aparece: en retiro no hay adónde llevar nada.
    expect(texto).not.toContain('Ubicación en mapa');
    expect(texto).not.toContain('Indicaciones:');
    expect(texto).not.toContain('Envío');
  });

  it('para delivery agrega indicaciones, distancia, mapa y el envío en el total', () => {
    const texto = mensajePedido({
      ...base,
      entrega: 'delivery',
      indicaciones: 'calle san Francisco',
      distanciaKm: 0.3,
      envio: 10,
      lat: -17.760048899822912,
      lng: -63.19987366704746,
    });

    expect(texto).toContain('Entrega: DELIVERY');
    expect(texto).toContain('Indicaciones: calle san Francisco');
    expect(texto).toContain('Distancia: 0.3 km');
    expect(texto).toContain('Envío (0.3 km): Bs 10');
    expect(texto).toContain('https://www.google.com/maps?q=-17.760048899822912,-63.19987366704746');
    // El envío suma al total sin tocar el subtotal.
    expect(texto).toContain('Subtotal: Bs 40');
    expect(texto).toContain('*TOTAL: Bs 50*');
  });

  it('avisa cuando el envío no se pudo cotizar, en vez de cobrar solo los productos', () => {
    // Pasa cuando el local todavía no tiene sus coordenadas cargadas.
    const texto = mensajePedido({
      ...base,
      entrega: 'delivery',
      envio: 0,
      envioACoordinar: true,
      lat: -17.78,
      lng: -63.13,
    });

    expect(texto).toContain('Envío: A COORDINAR con el local');
    // El total lleva la marca: quien atiende no puede leer "TOTAL" y cobrar de menos.
    expect(texto).toContain('*TOTAL: Bs 40 + envío*');
  });

  it('sin bandera de coordinar, el mensaje no inventa una línea de envío', () => {
    const texto = mensajePedido({ ...base, entrega: 'delivery', envio: 0 });
    expect(texto).not.toContain('Envío');
    expect(texto).toContain('*TOTAL: Bs 40*');
  });

  it('no usa emojis: WhatsApp Desktop los pinta como carácter roto', () => {
    const delivery = mensajePedido({ ...base, entrega: 'delivery' });
    const retiro = mensajePedido(base);
    // Rango de emojis fuera del plano básico (los que fallaban).
    const emoji = /[\u{1F000}-\u{1FAFF}]/u;
    expect(emoji.test(delivery)).toBe(false);
    expect(emoji.test(retiro)).toBe(false);
  });

  it('omite la nota y las indicaciones cuando vienen vacías', () => {
    const texto = mensajePedido({ ...base, notas: '   ', entrega: 'delivery', indicaciones: '' });
    expect(texto).not.toContain('Notas:');
    expect(texto).not.toContain('Indicaciones:');
  });
});

describe('número del local', () => {
  it('le pone el código de Bolivia a un celular de 8 dígitos', () => {
    expect(normalizarWhatsApp('70011223')).toBe('59170011223');
    expect(normalizarWhatsApp('700-112-23')).toBe('59170011223');
  });

  it('respeta el número que ya trae código de país', () => {
    expect(normalizarWhatsApp('59170011223')).toBe('59170011223');
    expect(normalizarWhatsApp('+591 70011223')).toBe('59170011223');
  });

  it('sin número no hay link: el pedido igual quedó registrado', () => {
    expect(normalizarWhatsApp(null)).toBeNull();
    expect(normalizarWhatsApp('123')).toBeNull();
    expect(linkWhatsAppPedido(null, base)).toBeNull();
  });

  it('el link lleva el mensaje ya codificado', () => {
    const url = linkWhatsAppPedido('70011223', base);
    expect(url).toContain('https://wa.me/59170011223?text=');
    expect(decodeURIComponent(url!.split('?text=')[1])).toContain('Cliente: Jose Alfredo');
  });
});
