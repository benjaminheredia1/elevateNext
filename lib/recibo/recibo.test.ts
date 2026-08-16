import { describe, it, expect } from 'vitest';
import { construirReciboHtml } from './recibo';
import { desdeTransaccion, desdeVentaCaja, lineasDeDetalles, type TransaccionRecibo } from './adaptadores';
import type { DatosRecibo } from './tipos';

const local = { nombre: 'Sucursal Centro', direccion: 'Av. Banzer #450', telefono: '70000002' };

/** Venta de mostrador cobrada en efectivo, con un combo y un producto suelto. */
const ventaBase: TransaccionRecibo = {
  id: 2318,
  numero_sucursal: 147,
  numero_turno: 4,
  turno_id: 12,
  created_at: '2026-08-15T23:42:00.000Z',
  total: 192,
  costo_envio: 0,
  metodo_pago: 'EFECTIVO',
  payment_status: 'PAGADO',
  es_cortesia: false,
  cliente_nombre: 'Jose Zambrana',
  cajero: { nombre: 'Marcela' },
  transaccionesDetalles_id: [
    {
      cantidad: 1, precio_unitario: 80, descuentoAplicado: 0,
      producto: { nombre: 'Pollo Entero' }, combo: { id: 5, nombre: 'Combo Familiar' },
    },
    {
      cantidad: 2, precio_unitario: 20, descuentoAplicado: 0,
      producto: { nombre: 'Papas Grandes' }, combo: { id: 5, nombre: 'Combo Familiar' },
    },
    {
      cantidad: 1, precio_unitario: 72, descuentoAplicado: 0,
      producto: { nombre: 'Medio Pollo' }, combo: null,
    },
  ],
};

describe('líneas del recibo', () => {
  it('agrupa el combo en una sola línea con su contenido', () => {
    const lineas = lineasDeDetalles(ventaBase.transaccionesDetalles_id);

    expect(lineas).toHaveLength(2);
    const combo = lineas.find(l => l.nombre === 'Combo Familiar');
    // 80 + 2×20: el combo se guarda prorrateado por componente y en el ticket
    // vuelve a ser una sola cosa.
    expect(combo?.importe).toBe(120);
    expect(combo?.detalle).toBe('1× Pollo Entero + 2× Papas Grandes');
  });

  it('descuenta el descuento por línea del importe', () => {
    const lineas = lineasDeDetalles([
      { cantidad: 2, precio_unitario: 30, descuentoAplicado: 10, producto: { nombre: 'Medio Pollo' } },
    ]);

    expect(lineas[0].importe).toBe(50);
  });
});

describe('adaptador de la venta', () => {
  it('cierra subtotal - descuento = total cuando el privilegio pega sobre el total', () => {
    const datos = desdeTransaccion(
      { ...ventaBase, total: 182.4, codigo_descuento: 'Privilegio: Staff (-5%)' },
      local,
    );

    expect(datos.subtotal).toBe(192);
    expect(datos.descuento).toEqual({ etiqueta: 'Privilegio: Staff (-5%)', monto: 9.6 });
    expect(datos.subtotal - datos.descuento!.monto).toBeCloseTo(datos.total, 2);
  });

  it('lleva las tres numeraciones a su lugar', () => {
    const datos = desdeTransaccion(ventaBase, local);

    // El grande es el del local, el del turno acompaña al cajero y el global
    // queda como referencia al pie.
    expect(datos.numero).toBe(147);
    expect(datos.turno).toEqual({ id: 12, venta: 4 });
    expect(datos.referencia).toBe(2318);
  });

  it('cae al id global cuando la venta no tiene correlativo de sucursal', () => {
    const datos = desdeTransaccion({ ...ventaBase, numero_sucursal: null }, local);

    expect(datos.numero).toBe(2318);
  });

  it('omite el cliente anónimo del mostrador', () => {
    const datos = desdeTransaccion({ ...ventaBase, cliente_nombre: 'Cliente mostrador' }, local);

    expect(datos.cliente).toBeNull();
  });

  it('en un fiado sella la deuda y no imprime método de pago', () => {
    const datos = desdeTransaccion(
      {
        ...ventaBase,
        payment_status: 'PENDIENTE',
        cuenta_corriente: { monto: 192, monto_pagado: 50, vencimiento: '2026-08-30T04:00:00.000Z' },
      },
      local,
    );

    expect(datos.pago).toBeNull();
    expect(datos.marca).toEqual({
      tipo: 'FIADO',
      saldo: 142,
      vencimiento: '2026-08-30T04:00:00.000Z',
    });
  });

  it('el contra-entrega del delivery web no se sella como fiado', () => {
    // No es deuda del cliente: es plata que el repartidor todavía no rindió.
    // Sellarlo como fiado mandaría a cobrarla a Deudores, donde no está.
    const datos = desdeTransaccion({ ...ventaBase, payment_status: 'COD_PENDIENTE' }, local);

    expect(datos.marca).toEqual({ tipo: 'COD', saldo: 192 });
    const html = construirReciboHtml(datos);
    expect(html).toContain('PAGO CONTRA ENTREGA');
    expect(html).toContain('Cobrar al entregar: Bs 192,00');
    expect(html).not.toContain('FIADO');
  });

  it('en una cortesía sella sin cargo y no imprime método de pago', () => {
    const datos = desdeTransaccion({ ...ventaBase, es_cortesia: true }, local);

    expect(datos.pago).toBeNull();
    expect(datos.marca).toEqual({ tipo: 'CORTESIA' });
  });

  it('desglosa el pago mixto desde los movimientos de caja', () => {
    const datos = desdeTransaccion(
      {
        ...ventaBase,
        metodo_pago: 'MIXTO',
        movimientos: [
          { metodo_pago: 'EFECTIVO', monto: 100 },
          { metodo_pago: 'QR', monto: 92 },
        ],
      },
      local,
    );

    expect(datos.pago).toEqual({
      metodo: 'MIXTO',
      partes: [{ metodo: 'EFECTIVO', monto: 100 }, { metodo: 'QR', monto: 92 }],
    });
  });

  it('sin turno (pedido web) no inventa la línea de turno', () => {
    const datos = desdeTransaccion({ ...ventaBase, turno_id: null, numero_turno: null }, local);

    expect(datos.turno).toBeNull();
  });

  it('la venta ya mapeada del turno produce el mismo ticket', () => {
    const datos = desdeVentaCaja(
      {
        id: 2318,
        numero_sucursal: 147,
        numero_turno: 4,
        created_at: '2026-08-15T23:42:00.000Z',
        total: 192,
        metodo_pago: 'EFECTIVO',
        forma: 'PAGADA',
        cliente_nombre: 'Jose Zambrana',
        cajero: 'Marcela',
        items: [
          { nombre: 'Pollo Entero', cantidad: 1, precio_unitario: 80, descuento: 0, combo: { id: 5, nombre: 'Combo Familiar' } },
          { nombre: 'Papas Grandes', cantidad: 2, precio_unitario: 20, descuento: 0, combo: { id: 5, nombre: 'Combo Familiar' } },
          { nombre: 'Medio Pollo', cantidad: 1, precio_unitario: 72, descuento: 0, combo: null },
        ],
      },
      local,
      { turnoId: 12 },
    );

    expect(datos.lineas).toHaveLength(2);
    expect(datos.total).toBe(192);
    expect(datos.turno).toEqual({ id: 12, venta: 4 });
  });
});

describe('html del recibo', () => {
  const datos: DatosRecibo = desdeTransaccion(ventaBase, local);

  it('imprime encabezado, número grande, cajero y turno', () => {
    const html = construirReciboHtml(datos);

    expect(html).toContain('SUCURSAL CENTRO');
    expect(html).toContain('Av. Banzer #450');
    expect(html).toContain('VENTA #147');
    expect(html).toContain('Atendi&oacute;: Marcela');
    expect(html).toContain('Turno #12 &middot; Venta #4 del turno');
    expect(html).toContain('Ref. 2318');
  });

  it('usa la hora de Bolivia y no la del servidor en UTC', () => {
    const html = construirReciboHtml(datos);

    // 23:42 UTC son las 19:42 en La Paz: un ticket con la hora del servidor no
    // sirve ni para reclamar ni para cuadrar el turno.
    expect(html).toContain('15/08/2026, 19:42');
  });

  it('deja claro que no es una factura', () => {
    expect(construirReciboHtml(datos)).toContain('no es una factura');
  });

  it('se maqueta para los 72 mm imprimibles de la térmica', () => {
    const html = construirReciboHtml(datos);

    expect(html).toContain('@page { size: 72mm auto; margin: 0; }');
    // 10 mm en blanco al final: el cortador queda por encima del cabezal.
    expect(html).toContain('padding: 3mm 2mm 10mm;');
  });

  it('no dibuja la línea de envío cuando es 0', () => {
    expect(construirReciboHtml(datos)).not.toContain('Env&iacute;o');
    expect(construirReciboHtml({ ...datos, envio: 15 })).toContain('Env&iacute;o');
  });

  it('escapa el html de un nombre de producto', () => {
    const html = construirReciboHtml({
      ...datos,
      lineas: [{ cantidad: 1, nombre: '<script>alert(1)</script>', importe: 10 }],
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('imprime el sello del fiado con su saldo', () => {
    const html = construirReciboHtml({
      ...datos,
      pago: null,
      marca: { tipo: 'FIADO', saldo: 142, vencimiento: '2026-08-30T04:00:00.000Z' },
    });

    expect(html).toContain('FIADO &mdash; PENDIENTE DE PAGO');
    expect(html).toContain('Saldo: Bs 142,00');
    expect(html).toContain('Vence: 30/08/2026');
    expect(html).not.toContain('<span>Pago</span>');
  });
});
