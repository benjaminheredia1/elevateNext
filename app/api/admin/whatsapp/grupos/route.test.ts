import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

const JID_GRUPO = '120363000000000000@g.us';

function request(token: string | null, body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/admin/whatsapp/grupos', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

// El endpoint hace upsert sobre Configuracion (id fijo = 1): guardamos el
// destino previo y lo restauramos para no ensuciar otras corridas.
let grupoPrevio: { jid: string | null; nombre: string | null } = { jid: null, nombre: null };

beforeAll(async () => {
  const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
  grupoPrevio = { jid: config?.whatsapp_grupo_jid ?? null, nombre: config?.whatsapp_grupo_nombre ?? null };
});

afterAll(async () => {
  await prisma.configuracion.update({
    where: { id: 1 },
    data: { whatsapp_grupo_jid: grupoPrevio.jid, whatsapp_grupo_nombre: grupoPrevio.nombre },
  }).catch(() => {});
});

describe('PUT /api/admin/whatsapp/grupos', () => {
  it('401 sin token', async () => {
    const response = await PUT(request(null, { jid: JID_GRUPO, nombre: 'Pedidos' }));
    expect(response.status).toBe(401);
  });

  it('403 para CAJERO: elegir el destino de los avisos es de administración', async () => {
    const { access_token } = await login('cajero@elevate.com', 'cajero123');
    const response = await PUT(request(access_token, { jid: JID_GRUPO, nombre: 'Pedidos' }));
    expect(response.status).toBe(403);
  });

  it('422 si el JID no es de WhatsApp', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await PUT(request(access_token, { jid: 'no-es-un-jid', nombre: 'Pedidos' }));
    expect(response.status).toBe(422);
  });

  it('guarda el grupo elegido en Configuracion', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await PUT(request(access_token, { jid: JID_GRUPO, nombre: 'Pedidos Elevate' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.whatsapp_grupo_jid).toBe(JID_GRUPO);

    const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
    expect(config?.whatsapp_grupo_jid).toBe(JID_GRUPO);
    expect(config?.whatsapp_grupo_nombre).toBe('Pedidos Elevate');
  });

  it('acepta también un chat individual, no solo grupos', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const response = await PUT(request(access_token, { jid: '59171234567@s.whatsapp.net', nombre: 'Encargado' }));
    expect(response.status).toBe(200);
  });
});
