/**
 * Integración: venta de un combo en caja.
 *
 * El combo entra al pedido como "cuál y cuántos"; el servidor lo valoriza, lo
 * descompone en una línea por producto y revalida la ventana horaria. Lo que se
 * cuida acá es que el total cobrado sea el del combo (no la suma de sus
 * productos) y que fuera de horario la venta se rechace.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { habilitarProductoEnSucursal } from '@/lib/server/productos/catalogo-sucursal.service';

const MARCADOR = `venta-combo-${Date.now()}`;

let token: string;
let sucursalId: number;
let turnoId: number;
let bowlId: number;
let jugoId: number;
let comboId: number;

let reqCount = 0;
function req(body: unknown) {
  reqCount += 1;
  return new NextRequest('http://localhost/api/caja/venta', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.98.0.${reqCount}`,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

/** Vigencia que incluye el momento en que corren los tests. */
function vigenciaQueIncluyeAhora() {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
  const hasta = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  return { fecha_inicio: desde, fecha_fin: hasta, hora_inicio: null, hora_fin: null, dias_semana: [] };
}

beforeAll(async () => {
  token = (await login('cajero@elevate.com', 'cajero123')).access_token;
  const user = await prisma.usuario.findUniqueOrThrow({ where: { email: 'cajero@elevate.com' } });
  if (user.sucursal_id == null) throw new Error('El seed debe asignar sucursal al cajero');
  sucursalId = user.sucursal_id;

  const crearProducto = async (nombre: string, precio: number) => {
    const p = await prisma.producto.create({
      data: { nombre, descripcion: 'fixture combo', precio, disponible: true },
    });
    await habilitarProductoEnSucursal(p.id, sucursalId, { precio });
    return p.id;
  };
  bowlId = await crearProducto(`${MARCADOR} bowl`, 30);
  jugoId = await crearProducto(`${MARCADOR} jugo`, 10);

  comboId = (await prisma.promocionesDescuentos.create({
    data: {
      nombre: `${MARCADOR} combo`,
      valor: '20%',
      tipo: 'COMBO',
      modo_precio: 'PORCENTAJE',
      monto: 20,
      activo: true,
      items: { create: [{ producto_id: bowlId, cantidad: 1 }, { producto_id: jugoId, cantidad: 1 }] },
      sucursales: { create: [{ sucursal_id: sucursalId, disponible: true }] },
      reglasHorarias_id: { create: [vigenciaQueIncluyeAhora()] },
    },
  })).id;

  await prisma.cajaTurno.updateMany({
    where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
    data: { estado: 'CERRADO', fecha_cierre: new Date() },
  });
  turnoId = (await prisma.cajaTurno.create({
    data: { sucursal_id: sucursalId, cajero_id: user.id, apertura_efectivo: 100, apertura_qr: 0 },
  })).id;
});

afterAll(async () => {
  const ventas = await prisma.transaccion.findMany({ where: { turno_id: turnoId }, select: { id: true } });
  const ids = ventas.map(v => v.id);
  await prisma.movimientoCaja.deleteMany({ where: { transaccion_id: { in: ids } } });
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: ids } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: ids } } });
  await prisma.cajaTurno.deleteMany({ where: { id: turnoId } });
  await prisma.promocionesDescuentos.deleteMany({ where: { id: comboId } });
  await prisma.productoSucursal.deleteMany({ where: { producto_id: { in: [bowlId, jugoId] } } });
  await prisma.producto.deleteMany({ where: { id: { in: [bowlId, jugoId] } } });
});

describe('POST /api/caja/venta con combos', () => {
  it('cobra el precio del combo y lo guarda como una línea por producto', async () => {
    const res = await POST(req({
      items: [],
      combos: [{ combo_id: comboId, cantidad: 1 }],
      metodo_pago: 'EFECTIVO',
      cliente_anonimo: true,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();

    // 30 + 10 = 40, menos 20% = 32. No se cobra la suma de los productos.
    expect(Number(body.total)).toBe(32);

    const detalles = await prisma.transaccionesDetalles.findMany({
      where: { transaccion_id: body.id },
    });
    expect(detalles).toHaveLength(2);
    // Todas las líneas quedan marcadas con el combo para poder medirlo.
    expect(detalles.every(d => d.combo_id === comboId)).toBe(true);
    const suma = detalles.reduce((s, d) => s + Number(d.precio_unitario) * d.cantidad, 0);
    expect(Number(suma.toFixed(2))).toBe(32);
  });

  it('permite mezclar combos con productos sueltos', async () => {
    const res = await POST(req({
      items: [{ producto_id: jugoId, cantidad: 1 }],
      combos: [{ combo_id: comboId, cantidad: 1 }],
      metodo_pago: 'EFECTIVO',
      cliente_anonimo: true,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    // 32 del combo + 10 del jugo suelto
    expect(Number(body.total)).toBe(42);
  });

  it('rechaza el combo fuera de su ventana horaria', async () => {
    // Se lo deja vigente solo en una franja que ya pasó hoy.
    await prisma.reglasHorarias.updateMany({
      where: { promocionesDescuentos_id: comboId },
      data: { hora_inicio: '00:00', hora_fin: '00:01' },
    });

    const res = await POST(req({
      items: [],
      combos: [{ combo_id: comboId, cantidad: 1 }],
      metodo_pago: 'EFECTIVO',
      cliente_anonimo: true,
    }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/horario/i);

    await prisma.reglasHorarias.updateMany({
      where: { promocionesDescuentos_id: comboId },
      data: { hora_inicio: null, hora_fin: null },
    });
  });

  it('rechaza una venta sin productos ni combos', async () => {
    const res = await POST(req({
      items: [], combos: [], metodo_pago: 'EFECTIVO', cliente_anonimo: true,
    }));
    expect(res.status).toBe(422);
  });
});
