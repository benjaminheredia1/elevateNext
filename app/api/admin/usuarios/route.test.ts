/**
 * Integración: alcance multi-sucursal del ADMIN.
 *
 * Cubre las dos mitades del encierro: que asignar N sucursales quede guardado y
 * se pueda reemplazar, y que el servidor respete ese alcance aunque la petición
 * pida otro local. Es la regla que, si se rompe, mezcla la plata de dos
 * sucursales sin que ningún otro test lo note.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listarUsuarios, POST as crearUsuario, PUT as editarUsuario } from './route';
import { GET as listarActivos } from '../activos-fijos/route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const MARCA = `admin-multi-${Date.now()}`;
const EMAIL_ADMIN = `${MARCA}@elevate.test`;
const PASS = 'admin12345';

let tokenDueno: string;
let tokenAdmin: string;
let principalId: number;
let segundaId: number;
let terceraId: number;
let adminId: number;

function req(url: string, token?: string, body?: unknown, metodo = 'GET') {
  return new NextRequest(`http://localhost${url}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  tokenDueno = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
  principalId = await sucursalPorDefectoId();
  segundaId = (await prisma.sucursal.create({ data: { nombre: `${MARCA}-B`, activa: true } })).id;
  terceraId = (await prisma.sucursal.create({ data: { nombre: `${MARCA}-C`, activa: true } })).id;
});

afterAll(async () => {
  await prisma.usuarioSucursal.deleteMany({ where: { usuario_id: adminId } });
  await prisma.activoFijo.deleteMany({ where: { sucursal_id: { in: [segundaId, terceraId] } } });
  await prisma.usuario.deleteMany({ where: { email: EMAIL_ADMIN } });
  await prisma.cuentaFinanciera.deleteMany({ where: { sucursal_id: { in: [segundaId, terceraId] } } });
  await prisma.sucursal.deleteMany({ where: { id: { in: [segundaId, terceraId] } } });
});

describe('POST/PUT /api/admin/usuarios — asignación de varias sucursales', () => {
  it('crea un admin con dos sucursales asignadas', async () => {
    const res = await crearUsuario(req('/api/admin/usuarios', tokenDueno, {
      nombre: 'Admin', apellido_paterno: 'Multi', apellido_materno: 'Sucursal',
      email: EMAIL_ADMIN, password: PASS, rol: 'ADMIN',
      sucursal_ids: [segundaId, terceraId],
    }, 'POST'));
    expect(res.status).toBe(201);
    const creado = await res.json();
    adminId = creado.id;

    const asignadas = await prisma.usuarioSucursal.findMany({ where: { usuario_id: adminId } });
    expect(asignadas.map(a => a.sucursal_id).sort()).toEqual([segundaId, terceraId].sort());
    // Sin principal explícita, queda la primera de la lista.
    expect(creado.sucursal_id).toBe(segundaId);
  });

  it('rechaza una sucursal inexistente en vez de ignorarla', async () => {
    const res = await crearUsuario(req('/api/admin/usuarios', tokenDueno, {
      nombre: 'Admin', apellido_paterno: 'Fantasma', apellido_materno: 'Test',
      email: `fantasma-${MARCA}@elevate.test`, password: PASS, rol: 'ADMIN',
      sucursal_ids: [999999],
    }, 'POST'));
    expect(res.status).toBe(422);
  });

  it('el listado devuelve las sucursales de cada usuario', async () => {
    const res = await listarUsuarios(req('/api/admin/usuarios', tokenDueno));
    expect(res.status).toBe(200);
    const { items } = await res.json();
    const fila = items.find((u: { id: number }) => u.id === adminId);
    expect(fila.sucursales.map((s: { id: number }) => s.id).sort()).toEqual([segundaId, terceraId].sort());
  });

  it('editar reemplaza el alcance: destildar una sucursal la quita de verdad', async () => {
    const res = await editarUsuario(req('/api/admin/usuarios', tokenDueno, {
      id: adminId, sucursal_ids: [terceraId],
    }, 'PUT'));
    expect(res.status).toBe(200);

    const asignadas = await prisma.usuarioSucursal.findMany({ where: { usuario_id: adminId } });
    expect(asignadas.map(a => a.sucursal_id)).toEqual([terceraId]);
    // La principal seguía siendo la segunda, que ya no es suya: se corrige sola.
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: adminId } });
    expect(u.sucursal_id).toBe(terceraId);
  });
});

describe('alcance del ADMIN sobre los datos', () => {
  beforeAll(async () => {
    // Le devolvemos las dos sucursales y creamos un activo en cada una.
    await editarUsuario(req('/api/admin/usuarios', tokenDueno, {
      id: adminId, sucursal_ids: [segundaId, terceraId], sucursal_id: segundaId,
    }, 'PUT'));
    tokenAdmin = (await login(EMAIL_ADMIN, PASS)).access_token;
    for (const [sucursal_id, nombre] of [[segundaId, 'Horno B'], [terceraId, 'Horno C'], [principalId, 'Horno A']] as const) {
      await prisma.activoFijo.create({
        data: {
          sucursal_id, nombre: `${MARCA}-${nombre}`, categoria: 'Cocina',
          fecha_compra: new Date(), valor_original: 1000, valor_actual: 1000,
          creado_por_id: adminId,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.activoFijo.deleteMany({ where: { nombre: { startsWith: MARCA } } });
  });

  it('sin pedir sucursal ve la principal, no el consolidado del negocio', async () => {
    const res = await listarActivos(req('/api/admin/activos-fijos', tokenAdmin));
    expect(res.status).toBe(200);
    const data = await res.json();
    const items = data.items ?? data;
    const mios = items.filter((a: { nombre: string }) => a.nombre?.startsWith(MARCA));
    expect(mios.every((a: { sucursal_id: number }) => a.sucursal_id === segundaId)).toBe(true);
  });

  it('puede filtrar por cualquiera de sus sucursales', async () => {
    const res = await listarActivos(req(`/api/admin/activos-fijos?sucursal=${terceraId}`, tokenAdmin));
    expect(res.status).toBe(200);
    const data = await res.json();
    const items = data.items ?? data;
    const mios = items.filter((a: { nombre: string }) => a.nombre?.startsWith(MARCA));
    expect(mios.length).toBeGreaterThan(0);
    expect(mios.every((a: { sucursal_id: number }) => a.sucursal_id === terceraId)).toBe(true);
  });

  it('pedir una sucursal ajena devuelve 403, no los datos de otro local', async () => {
    const res = await listarActivos(req(`/api/admin/activos-fijos?sucursal=${principalId}`, tokenAdmin));
    expect(res.status).toBe(403);
  });

  it('el dueño sí ve todas las sucursales a la vez', async () => {
    const res = await listarActivos(req('/api/admin/activos-fijos', tokenDueno));
    expect(res.status).toBe(200);
    const data = await res.json();
    const items = data.items ?? data;
    const sucursales = new Set(
      items.filter((a: { nombre: string }) => a.nombre?.startsWith(MARCA))
        .map((a: { sucursal_id: number }) => a.sucursal_id),
    );
    expect(sucursales.size).toBeGreaterThan(1);
  });
});
