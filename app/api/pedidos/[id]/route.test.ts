/**
 * Integración: seguridad de la consulta de una venta.
 *
 * El PUT que movía estados y el tracking público se eliminaron con el
 * seguimiento de pedidos: la web ya no registra pedidos y el cajero registra la
 * venta ya cobrada. Lo que queda por cuidar es que el GET no sea público,
 * porque expone los datos del cliente.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const CONTRAPARTE = 'Cliente Pedido Fiado Seguridad E2E';

let token: string;
let cajeroUserId: number;
let pedidoId: number;

function req(id: number | string, tk?: string) {
  return new NextRequest(`http://localhost/api/pedidos/${id}`, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
  });
}
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

async function limpiarFixtures() {
  const cuentas = await prisma.cuentaCorriente.findMany({ where: { contraparte: CONTRAPARTE }, select: { id: true, transaccion_id: true } });
  await prisma.cuentaCorrientePago.deleteMany({ where: { cuenta_id: { in: cuentas.map(c => c.id) } } });
  await prisma.cuentaCorriente.deleteMany({ where: { id: { in: cuentas.map(c => c.id) } } });
  const ventaIds = cuentas.map(c => c.transaccion_id).filter((x): x is number => x != null);
  await prisma.transaccion.deleteMany({ where: { id: { in: ventaIds } } });
}

beforeAll(async () => {
  const cajero = await login('cajero@elevate.com', 'cajero123');
  token = cajero.access_token;
  const user = await prisma.usuario.findUniqueOrThrow({ where: { email: 'cajero@elevate.com' } });
  cajeroUserId = user.id;

  await limpiarFixtures();

  const venta = await prisma.transaccion.create({
    data: { sucursal_id: await sucursalPorDefectoId(), total: 25, estado: 'PAGADO', payment_status: 'PENDIENTE', cajero_id: cajeroUserId },
  });
  pedidoId = venta.id;
  await prisma.cuentaCorriente.create({
    data: { tipo: 'POR_COBRAR', contraparte: CONTRAPARTE, concepto: `Fiado venta #${venta.id}`, monto: 25, creado_por_id: cajeroUserId, transaccion_id: venta.id },
  });
});

afterAll(async () => {
  await limpiarFixtures();
});

describe('seguridad de /api/pedidos/[id]', () => {
  it('GET sin token devuelve 401', async () => {
    const res = await GET(req(pedidoId), ctx(pedidoId));
    expect(res.status).toBe(401);
  });

  it('GET con token devuelve la venta', async () => {
    const res = await GET(req(pedidoId, token), ctx(pedidoId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(pedidoId);
  });

  it('GET con id no numérico devuelve 422', async () => {
    const res = await GET(req('abc', token), ctx('abc'));
    expect(res.status).toBe(422);
  });
});
