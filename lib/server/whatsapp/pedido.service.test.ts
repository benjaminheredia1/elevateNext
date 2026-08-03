/**
 * Tests del aviso de pedidos por WhatsApp.
 * Solo la función pura: sin BD, sin red, sin sesión de Baileys.
 */
import { describe, it, expect } from 'vitest';
import { construirMensajePedido, type PedidoNotificable, type SucursalOrigen } from './pedido.service';

const SUCURSAL: SucursalOrigen = {
  sucursal_nombre: 'Elevate — Av. Banzer',
  sucursal_lat: -17.771,
  sucursal_lng: -63.19,
};

const BASE: PedidoNotificable = {
  codigo: 'A7K2P',
  tipo_entrega: 'DELIVERY',
  cliente_direccion: 'Calle Los Tajibos #240',
  cliente_lat: -17.7605,
  cliente_lng: -63.1802,
};

describe('construirMensajePedido', () => {
  it('delivery: va de la sucursal a la dirección del cliente, con link a sus coordenadas', () => {
    expect(construirMensajePedido(BASE, SUCURSAL)).toBe(
      [
        '🛎️ Pedido #A7K2P',
        'De: Elevate — Av. Banzer',
        'A: Calle Los Tajibos #240',
        '📍 https://maps.google.com/?q=-17.7605,-63.1802',
      ].join('\n'),
    );
  });

  it('recojo: el destino es la tienda y el link apunta a la sucursal', () => {
    const pedido: PedidoNotificable = {
      codigo: 'B3M9Q',
      tipo_entrega: 'RECOJO',
      cliente_direccion: null,
      cliente_lat: null,
      cliente_lng: null,
    };
    expect(construirMensajePedido(pedido, SUCURSAL)).toBe(
      [
        '🛎️ Pedido #B3M9Q',
        'De: Elevate — Av. Banzer',
        'A: Recojo en tienda',
        '📍 https://maps.google.com/?q=-17.771,-63.19',
      ].join('\n'),
    );
  });

  it('delivery sin coordenadas: manda la dirección pero omite el link de mapas', () => {
    const pedido: PedidoNotificable = { ...BASE, cliente_lat: null, cliente_lng: null };
    const mensaje = construirMensajePedido(pedido, SUCURSAL);
    expect(mensaje).toBe(
      ['🛎️ Pedido #A7K2P', 'De: Elevate — Av. Banzer', 'A: Calle Los Tajibos #240'].join('\n'),
    );
    expect(mensaje).not.toContain('maps.google.com');
  });

  it('delivery sin dirección ni tipo de entrega: no rompe y avisa igual', () => {
    const pedido: PedidoNotificable = {
      codigo: 'C1D4E',
      tipo_entrega: null,
      cliente_direccion: '   ',
      cliente_lat: null,
      cliente_lng: null,
    };
    expect(construirMensajePedido(pedido, SUCURSAL)).toBe(
      ['🛎️ Pedido #C1D4E', 'De: Elevate — Av. Banzer', 'A: Dirección no especificada'].join('\n'),
    );
  });

  it('pedido sin código: deja constancia en vez de imprimir "null"', () => {
    const mensaje = construirMensajePedido({ ...BASE, codigo: null }, SUCURSAL);
    expect(mensaje.startsWith('🛎️ Pedido #sin código')).toBe(true);
  });
});
