/**
 * GET /api/configuracion es público: lo consultan la tienda y el link del
 * repartidor sin sesión. Este test es la red que impide que una columna interna
 * nueva en `Configuracion` se filtre sin querer al mundo.
 *
 * Regresión: al agregar `whatsapp_grupo_jid` el endpoint devolvía la fila
 * entera, exponiendo el JID y el nombre del grupo de WhatsApp del negocio.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GET } from './route';
import prisma from '@/lib/prisma';

let previo: { jid: string | null; nombre: string | null } = { jid: null, nombre: null };

beforeAll(async () => {
  const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
  previo = { jid: config?.whatsapp_grupo_jid ?? null, nombre: config?.whatsapp_grupo_nombre ?? null };

  await prisma.configuracion.upsert({
    where: { id: 1 },
    update: { whatsapp_grupo_jid: '120363000000000111@g.us', whatsapp_grupo_nombre: 'Grupo interno' },
    create: {
      id: 1,
      sucursal_lat: -17.771,
      sucursal_lng: -63.19,
      sucursal_nombre: 'Sucursal Principal',
      whatsapp_grupo_jid: '120363000000000111@g.us',
      whatsapp_grupo_nombre: 'Grupo interno',
    },
  });
});

afterAll(async () => {
  await prisma.configuracion
    .update({
      where: { id: 1 },
      data: { whatsapp_grupo_jid: previo.jid, whatsapp_grupo_nombre: previo.nombre },
    })
    .catch(() => {});
});

describe('GET /api/configuracion (público)', () => {
  it('devuelve los datos de la sucursal', async () => {
    const body = await (await GET()).json();

    expect(body.data.sucursal_nombre).toBeTypeOf('string');
    expect(body.data.sucursal_lat).toBeTypeOf('number');
    expect(body.data.sucursal_lng).toBeTypeOf('number');
  });

  it('NO filtra el grupo de WhatsApp ni ninguna otra columna interna', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).not.toHaveProperty('whatsapp_grupo_jid');
    expect(body.data).not.toHaveProperty('whatsapp_grupo_nombre');
    expect(JSON.stringify(body)).not.toContain('120363000000000111');
    expect(JSON.stringify(body)).not.toContain('Grupo interno');

    // Lista blanca explícita: si mañana alguien agrega una columna a
    // Configuracion, este test falla hasta que decida si es pública.
    expect(Object.keys(body.data).sort()).toEqual(
      ['id', 'sucursal_lat', 'sucursal_lng', 'sucursal_nombre'].sort(),
    );
  });
});
