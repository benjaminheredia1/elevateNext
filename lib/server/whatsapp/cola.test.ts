/**
 * Tests de la cola de avisos de WhatsApp.
 *
 * En tests `WHATSAPP_AUTH_DIR` apunta a una carpeta inexistente (ver `.env.test`),
 * así que `asegurarConexion()` siempre da false y nunca se abre un socket real:
 * es exactamente el escenario "WhatsApp caído" que la cola tiene que cubrir.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { contarPendientes, drenarCola, encolarMensaje, enviarOEncolar, MAX_INTENTOS } from './cola';
import { notificarPedidoWhatsapp } from './pedido.service';

const JID = '120363000000000999@g.us';

async function limpiar() {
  await prisma.whatsappPendiente.deleteMany({ where: { jid: JID } });
}

beforeEach(limpiar);
afterAll(limpiar);

describe('cola de avisos', () => {
  it('encolar guarda el mensaje como PENDIENTE con el motivo', async () => {
    await encolarMensaje(JID, 'hola', 'WhatsApp no está conectado');

    const fila = await prisma.whatsappPendiente.findFirstOrThrow({ where: { jid: JID } });
    expect(fila.estado).toBe('PENDIENTE');
    expect(fila.texto).toBe('hola');
    expect(fila.intentos).toBe(0);
    expect(fila.ultimo_error).toBe('WhatsApp no está conectado');
    expect(fila.enviado_at).toBeNull();
  });

  it('enviarOEncolar encola cuando no hay sesión, en vez de perder el aviso', async () => {
    await enviarOEncolar(JID, 'pedido #ABC');

    const filas = await prisma.whatsappPendiente.findMany({ where: { jid: JID } });
    expect(filas).toHaveLength(1);
    expect(filas[0].estado).toBe('PENDIENTE');
    expect(filas[0].texto).toBe('pedido #ABC');
  });

  it('drenar sin sesión deja todo pendiente: no descarta ni marca enviado', async () => {
    await encolarMensaje(JID, 'uno', 'sin sesión');
    await encolarMensaje(JID, 'dos', 'sin sesión');

    const resultado = await drenarCola();

    expect(resultado.enviados).toBe(0);
    expect(resultado.pendientes).toBeGreaterThanOrEqual(2);
    const filas = await prisma.whatsappPendiente.findMany({ where: { jid: JID } });
    expect(filas.every((f) => f.estado === 'PENDIENTE')).toBe(true);
  });

  it('los avisos nuevos se van al final de la cola: se respeta el orden de llegada', async () => {
    await enviarOEncolar(JID, 'primero');
    await enviarOEncolar(JID, 'segundo');
    await enviarOEncolar(JID, 'tercero');

    const filas = await prisma.whatsappPendiente.findMany({
      where: { jid: JID },
      orderBy: { created_at: 'asc' },
    });
    expect(filas.map((f) => f.texto)).toEqual(['primero', 'segundo', 'tercero']);
  });

  it('contarPendientes ignora los ya enviados', async () => {
    await encolarMensaje(JID, 'pendiente', 'sin sesión');
    await prisma.whatsappPendiente.create({
      data: { jid: JID, texto: 'viejo', estado: 'ENVIADO', enviado_at: new Date() },
    });

    const soloDeEsteTest = await prisma.whatsappPendiente.count({
      where: { jid: JID, estado: 'PENDIENTE' },
    });
    expect(soloDeEsteTest).toBe(1);
    expect(await contarPendientes()).toBeGreaterThanOrEqual(1);
  });

  it('un mensaje que agotó los intentos queda FALLIDO y no tapa la cola', async () => {
    // Simula el estado al que llega tras MAX_INTENTOS fallos.
    const agotado = await prisma.whatsappPendiente.create({
      data: { jid: JID, texto: 'irrecuperable', estado: 'FALLIDO', intentos: MAX_INTENTOS },
    });

    expect(await prisma.whatsappPendiente.count({ where: { jid: JID, estado: 'PENDIENTE' } })).toBe(0);

    const releido = await prisma.whatsappPendiente.findUniqueOrThrow({ where: { id: agotado.id } });
    expect(releido.estado).toBe('FALLIDO');
    expect(releido.intentos).toBe(MAX_INTENTOS);
  });
});

describe('notificarPedidoWhatsapp con WhatsApp caído', () => {
  let grupoPrevio: { jid: string | null; nombre: string | null };

  beforeEach(async () => {
    const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
    grupoPrevio = {
      jid: config?.whatsapp_grupo_jid ?? null,
      nombre: config?.whatsapp_grupo_nombre ?? null,
    };
  });

  afterAll(async () => {
    await prisma.configuracion
      .update({
        where: { id: 1 },
        data: { whatsapp_grupo_jid: grupoPrevio.jid, whatsapp_grupo_nombre: grupoPrevio.nombre },
      })
      .catch(() => {});
  });

  it('encola el aviso del pedido en lugar de perderlo', async () => {
    await prisma.configuracion.update({
      where: { id: 1 },
      data: { whatsapp_grupo_jid: JID, whatsapp_grupo_nombre: 'Pedidos' },
    });

    await notificarPedidoWhatsapp({
      codigo: 'Z9Y8X',
      tipo_entrega: 'DELIVERY',
      cliente_direccion: 'Av. Siempre Viva 742',
      cliente_lat: -17.78,
      cliente_lng: -63.18,
    });

    const fila = await prisma.whatsappPendiente.findFirstOrThrow({ where: { jid: JID } });
    expect(fila.estado).toBe('PENDIENTE');
    expect(fila.texto).toContain('Pedido #Z9Y8X');
    expect(fila.texto).toContain('Av. Siempre Viva 742');
  });

  it('sin grupo configurado no encola nada: no hay destino a dónde mandarlo', async () => {
    await prisma.configuracion.update({
      where: { id: 1 },
      data: { whatsapp_grupo_jid: null, whatsapp_grupo_nombre: null },
    });

    await notificarPedidoWhatsapp({
      codigo: 'SINGRUPO',
      tipo_entrega: 'RECOJO',
      cliente_direccion: null,
      cliente_lat: null,
      cliente_lng: null,
    });

    const filas = await prisma.whatsappPendiente.findMany({ where: { texto: { contains: 'SINGRUPO' } } });
    expect(filas).toHaveLength(0);
  });
});
