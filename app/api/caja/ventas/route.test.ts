/**
 * Ventas de la caja: lo que el libro de movimientos no muestra.
 *
 * Un fiado y una cortesía no generan MovimientoCaja —no entra ni sale plata—,
 * así que en /caja/movimientos no aparecen nunca. Este endpoint existe para
 * verlas todas, con su forma de cierre y su detalle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { login } from '@/lib/auth';
import { GET } from './route';
import { habilitarProductoEnSucursal } from '@/lib/server/productos/catalogo-sucursal.service';

const MARCADOR = `ventas-caja-${Date.now()}`;

let token: string;
let sucursalId: number;
let turnoId: number;
let productoId: number;
let cajeroId: number;

const pedir = () => GET(new NextRequest('http://localhost/api/caja/ventas', {
  headers: { authorization: `Bearer ${token}` },
}));

/** Venta directa en la BD, para no depender del flujo completo de cobro. */
async function crearVenta(opts: { total: number; cortesia?: boolean; fiado?: boolean; descuento?: string }) {
  return prisma.transaccion.create({
    data: {
      canal: 'SALON',
      sucursal_id: sucursalId,
      turno_id: turnoId,
      cajero_id: cajeroId,
      metodo_pago: 'EFECTIVO',
      total: opts.total,
      es_cortesia: opts.cortesia ?? false,
      codigo_descuento: opts.descuento ?? null,
      estado: opts.fiado ? 'ENTREGADO' : 'PAGADO',
      payment_status: opts.fiado ? 'PENDIENTE' : 'PAGADO',
      cliente_nombre: `${MARCADOR} cliente`,
      transaccionesDetalles_id: {
        create: [{ producto_id: productoId, precio_unitario: opts.total, cantidad: 1 }],
      },
    },
  });
}

beforeAll(async () => {
  token = (await login('cajero@elevate.com', 'cajero123')).access_token;
  const user = await prisma.usuario.findUniqueOrThrow({ where: { email: 'cajero@elevate.com' } });
  if (user.sucursal_id == null) throw new Error('El seed debe asignar sucursal al cajero');
  sucursalId = user.sucursal_id;
  cajeroId = user.id;

  const p = await prisma.producto.create({
    data: { nombre: `${MARCADOR} plato`, descripcion: 'fixture', precio: 50, disponible: true },
  });
  productoId = p.id;
  await habilitarProductoEnSucursal(productoId, sucursalId, { precio: 50 });

  await prisma.cajaTurno.updateMany({
    where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
    data: { estado: 'CERRADO', fecha_cierre: new Date() },
  });
  turnoId = (await prisma.cajaTurno.create({
    data: { sucursal_id: sucursalId, cajero_id: cajeroId, apertura_efectivo: 0, apertura_qr: 0 },
  })).id;

  await crearVenta({ total: 50 });
  await crearVenta({ total: 30, fiado: true });
  await crearVenta({ total: 20, cortesia: true });
  await crearVenta({ total: 40, descuento: 'Privilegio: Staff (-15%)' });
});

afterAll(async () => {
  const ventas = await prisma.transaccion.findMany({ where: { turno_id: turnoId }, select: { id: true } });
  const ids = ventas.map(v => v.id);
  await prisma.transaccionesDetalles.deleteMany({ where: { transaccion_id: { in: ids } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: ids } } });
  await prisma.cajaTurno.deleteMany({ where: { id: turnoId } });
  await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
});

describe('GET /api/caja/ventas', () => {
  it('devuelve las ventas del turno con su forma de cierre', async () => {
    const body = await (await pedir()).json();
    expect(body.ambito).toBe('TURNO');
    expect(body.ventas).toHaveLength(4);

    const formas = body.ventas.map((v: { forma: string }) => v.forma).sort();
    expect(formas).toEqual(['CORTESIA', 'FIADO', 'PAGADA', 'PAGADA']);
  });

  it('incluye los fiados y las cortesías, que no están en movimientos', async () => {
    const body = await (await pedir()).json();
    const fiado = body.ventas.find((v: { forma: string }) => v.forma === 'FIADO');
    const cortesia = body.ventas.find((v: { forma: string }) => v.forma === 'CORTESIA');

    expect(fiado.total).toBe(30);
    expect(cortesia.es_cortesia).toBe(true);

    // Ninguna de las dos movió plata: no hay MovimientoCaja para ellas.
    const movimientos = await prisma.movimientoCaja.count({
      where: { turno_id: turnoId, transaccion_id: { in: [fiado.id, cortesia.id] } },
    });
    expect(movimientos).toBe(0);
  });

  it('trae el detalle de cada venta para desplegarlo', async () => {
    const body = await (await pedir()).json();
    const venta = body.ventas[0];
    expect(venta.items[0].nombre).toContain(MARCADOR);
    expect(venta.items[0].cantidad).toBe(1);
    expect(venta.cajero).toBeTruthy();
  });

  it('marca las que llevaron descuento', async () => {
    const body = await (await pedir()).json();
    const conDescuento = body.ventas.filter((v: { descuento: string | null }) => v.descuento);
    expect(conDescuento).toHaveLength(1);
    expect(conDescuento[0].descuento).toContain('Privilegio');
  });

  it('no devuelve ventas de otra sucursal', async () => {
    const otra = await prisma.sucursal.create({ data: { nombre: `${MARCADOR} otra`, activa: true } });
    const ajena = await prisma.transaccion.create({
      data: { canal: 'SALON', sucursal_id: otra.id, total: 999, estado: 'PAGADO', payment_status: 'PAGADO' },
    });

    const body = await (await pedir()).json();
    expect(body.ventas.map((v: { id: number }) => v.id)).not.toContain(ajena.id);

    await prisma.transaccion.delete({ where: { id: ajena.id } });
    await prisma.sucursal.delete({ where: { id: otra.id } });
  });
});
