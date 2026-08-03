/**
 * El desplegable de privilegios de caja solo ofrece lo que el cajero puede usar:
 * los de su sucursal más los del negocio. Ofrecer los de otro local no sirve —
 * al cobrar, la venta los rechaza por no aplicar en esa sucursal.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { GET } from './route';
import { login } from '@/lib/auth';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const MARCADOR = `priv-sucursal-${Date.now()}`;

let token: string;
let sucursalCajero: number;
let otraSucursal: number;
let delLocal: number;
let deOtroLocal: number;
let delNegocio: number;

beforeAll(async () => {
  // El cajero del seed está asignado a la sucursal principal.
  token = (await login('cajero@elevate.com', 'cajero123')).access_token;
  sucursalCajero = await sucursalPorDefectoId();
  otraSucursal = (await prisma.sucursal.create({ data: { nombre: `${MARCADOR} otra`, activa: true } })).id;

  const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
  const crear = (nombre: string, sucursal_id: number | null) =>
    prisma.privilegio.create({
      data: { nombre, porcentaje: 10, activo: true, sucursal_id, creado_por_id: admin.id },
    });

  delLocal = (await crear(`${MARCADOR} del local`, sucursalCajero)).id;
  deOtroLocal = (await crear(`${MARCADOR} de otro local`, otraSucursal)).id;
  delNegocio = (await crear(`${MARCADOR} del negocio`, null)).id;
});

afterAll(async () => {
  await prisma.privilegio.deleteMany({ where: { id: { in: [delLocal, deOtroLocal, delNegocio] } } });
  await prisma.sucursal.deleteMany({ where: { id: otraSucursal } });
});

describe('GET /api/caja/privilegios', () => {
  it('ofrece los de la sucursal del cajero y los del negocio, nunca los de otro local', async () => {
    const req = new NextRequest('http://localhost/api/caja/privilegios', {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await (await GET(req)).json();
    const ids: number[] = body.data.map((p: { id: number }) => p.id);

    expect(ids).toContain(delLocal);
    expect(ids).toContain(delNegocio);
    expect(ids).not.toContain(deOtroLocal);
  });
});
