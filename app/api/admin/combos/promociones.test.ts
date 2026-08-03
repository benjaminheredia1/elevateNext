/**
 * Pantalla unificada: la misma API crea y edita los dos tipos de promoción.
 *
 * - COMBO: paquete que se cobra como una línea.
 * - DESCUENTO: abarata productos que se siguen vendiendo por separado.
 *
 * Y lo que importa del descuento: que efectivamente cambie el precio del
 * producto dentro de su franja y no fuera, y solo en su sucursal.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { login } from '@/lib/auth';
import { GET, POST } from './route';
import { PUT } from './[id]/route';
import { habilitarProductoEnSucursal } from '@/lib/server/productos/catalogo-sucursal.service';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';
import { calcularPrecioFinal, includePromos } from '@/lib/server/productos/precio';

const MARCADOR = `promo-${Date.now()}`;
const enBolivia = (iso: string) => new Date(`${iso}-04:00`);

let token: string;
let sucursal: number;
let otraSucursal: number;
let productoId: number;
let promoId: number;

const pedido = (body: unknown, metodo = 'POST', url = 'http://localhost/api/admin/combos') =>
  new NextRequest(url, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  token = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
  sucursal = await sucursalPorDefectoId();
  otraSucursal = (await prisma.sucursal.create({ data: { nombre: `${MARCADOR} otra`, activa: true } })).id;

  const p = await prisma.producto.create({
    data: { nombre: `${MARCADOR} bebida`, descripcion: 'fixture', precio: 20, estado_publicacion: 'PUBLICADO' },
  });
  productoId = p.id;
  await habilitarProductoEnSucursal(productoId, sucursal, { precio: 20 });
});

afterAll(async () => {
  await prisma.promocionesDescuentos.deleteMany({ where: { nombre: { startsWith: MARCADOR } } });
  await prisma.productoSucursal.deleteMany({ where: { producto_id: productoId } });
  await prisma.producto.deleteMany({ where: { id: productoId } });
  await prisma.sucursal.deleteMany({ where: { id: otraSucursal } });
});

/** Producto con sus promos, tal como lo lee la tienda. */
const conPromos = () => prisma.producto.findUniqueOrThrow({
  where: { id: productoId },
  include: includePromos,
});

describe('crear una promoción de tipo DESCUENTO', () => {
  it('la crea y la liga a los productos elegidos', async () => {
    const res = await POST(pedido({
      nombre: `${MARCADOR} happy hour`,
      tipo: 'DESCUENTO',
      modo_precio: 'PORCENTAJE',
      monto: 25,
      items: [{ producto_id: productoId, cantidad: 1 }],
      sucursales: [{ sucursal_id: sucursal, disponible: true }],
      vigencias: [{
        fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31T23:59:59',
        hora_inicio: '07:00', hora_fin: '12:00', dias_semana: [],
      }],
    }));
    expect(res.status).toBe(201);
    promoId = (await res.json()).data.id;

    // Se guarda como vínculo producto ↔ promo, no como item de combo.
    expect(await prisma.promocionProducto.count({ where: { promocion_descuentos_id: promoId } })).toBe(1);
    expect(await prisma.comboItem.count({ where: { promocion_id: promoId } })).toBe(0);
  });

  it('abarata el producto dentro de la franja y no fuera', async () => {
    const producto = await conPromos();

    const dentro = calcularPrecioFinal(producto, enBolivia('2026-08-15T09:00:00'), sucursal);
    expect(dentro.precioFinal).toBe(15); // 20 - 25%

    const fuera = calcularPrecioFinal(producto, enBolivia('2026-08-15T12:30:00'), sucursal);
    expect(fuera.precioFinal).toBe(20);
  });

  it('no abarata en una sucursal donde la promoción no está publicada', async () => {
    const producto = await conPromos();
    const enOtra = calcularPrecioFinal(producto, enBolivia('2026-08-15T09:00:00'), otraSucursal);
    expect(enOtra.precioFinal).toBe(20);
  });
});

describe('editar', () => {
  it('cambia el descuento y la franja', async () => {
    const res = await PUT(
      pedido({
        nombre: `${MARCADOR} happy hour`,
        monto: 50,
        vigencias: [{
          fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31T23:59:59',
          hora_inicio: '18:00', hora_fin: '20:00', dias_semana: [],
        }],
      }, 'PUT', `http://localhost/api/admin/combos/${promoId}`),
      { params: Promise.resolve({ id: String(promoId) }) },
    );
    expect(res.status).toBe(200);

    const producto = await conPromos();
    // La franja vieja ya no aplica…
    expect(calcularPrecioFinal(producto, enBolivia('2026-08-15T09:00:00'), sucursal).precioFinal).toBe(20);
    // …y en la nueva descuenta el 50%.
    expect(calcularPrecioFinal(producto, enBolivia('2026-08-15T19:00:00'), sucursal).precioFinal).toBe(10);
  });

  it('la lista devuelve los dos tipos con lo necesario para editarlos', async () => {
    const res = await GET(new NextRequest(`http://localhost/api/admin/combos?sucursal=${sucursal}`, {
      headers: { authorization: `Bearer ${token}` },
    }));
    const { data } = await res.json();
    const promo = data.find((p: { id: number }) => p.id === promoId);

    expect(promo.tipo).toBe('DESCUENTO');
    expect(promo.items).toHaveLength(1);
    expect(promo.vigencias[0].hora_inicio).toBe('18:00');
    // En un descuento no hay "precio del combo".
    expect(promo.precio).toBeNull();
  });
});

describe('promociones anteriores a multi-sucursal', () => {
  it('sin sucursales asignadas siguen valiendo en todos los locales', async () => {
    const vieja = await prisma.promocionesDescuentos.create({
      data: {
        nombre: `${MARCADOR} legado`,
        valor: '10%',
        modo_precio: 'PORCENTAJE',
        monto: 10,
        promocionProducto_id: { create: [{ producto_id: productoId, key: 'legado' }] },
        reglasHorarias_id: {
          create: [{ fecha_inicio: enBolivia('2026-08-01T00:00:00'), fecha_fin: enBolivia('2026-08-31T23:59:59') }],
        },
      },
    });

    const producto = await conPromos();
    // Vale en la otra sucursal aunque nadie la haya asignado ahí: es como se
    // comportaba antes, y cambiarlo le subiría el precio a productos en venta.
    expect(calcularPrecioFinal(producto, enBolivia('2026-08-15T09:00:00'), otraSucursal).precioFinal).toBe(18);

    await prisma.promocionesDescuentos.delete({ where: { id: vieja.id } });
  });
});
