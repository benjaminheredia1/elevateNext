import prisma from '@/lib/prisma';
import { asegurarConexion, enviarTexto } from './cliente';

/**
 * Cola de avisos de WhatsApp.
 *
 * Regla: un aviso nunca se pierde por tener la sesión caída. Si no se puede
 * enviar en el momento, queda en `WhatsappPendiente` y sale apenas WhatsApp
 * vuelve (al reconectar, al entrar el siguiente pedido, o por el reintento
 * periódico).
 */

/** Después de esto se marca FALLIDO y deja de reintentarse. */
export const MAX_INTENTOS = 10;
/** Cuántos manda por pasada, para no bloquear el proceso con una cola larga. */
const LOTE = 50;
const REINTENTO_MS = 60_000;

declare global {
  var __whatsappCola: { drenando: boolean; timer: NodeJS.Timeout | null } | undefined;
}

const estado = (globalThis.__whatsappCola ??= { drenando: false, timer: null });

function textoDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reintenta en segundo plano mientras queden pendientes. Se enciende solo al
 * encolar algo y se apaga cuando la cola queda vacía: sin cola no hay timer.
 */
function asegurarReintentos(): void {
  if (estado.timer) return;
  estado.timer = setInterval(() => {
    void drenarCola().then((resultado) => {
      if (resultado.pendientes === 0 && estado.timer) {
        clearInterval(estado.timer);
        estado.timer = null;
      }
    });
  }, REINTENTO_MS);
  // No mantiene el proceso vivo por sí solo.
  estado.timer.unref?.();
}

export async function contarPendientes(): Promise<number> {
  return prisma.whatsappPendiente.count({ where: { estado: 'PENDIENTE' } });
}

/** Guarda un aviso que no se pudo mandar. */
export async function encolarMensaje(jid: string, texto: string, motivo: string): Promise<void> {
  await prisma.whatsappPendiente.create({
    data: { jid, texto, ultimo_error: motivo },
  });
  console.warn(`[WhatsApp] Aviso encolado (${motivo}).`);
  asegurarReintentos();
}

/**
 * Manda lo que haya pendiente, del más viejo al más nuevo.
 * Se corta al primer fallo: si la sesión se cayó, insistir con los demás sobra
 * y además rompería el orden de los avisos.
 */
export async function drenarCola(): Promise<{ enviados: number; pendientes: number }> {
  if (estado.drenando) return { enviados: 0, pendientes: await contarPendientes() };

  estado.drenando = true;
  let enviados = 0;
  try {
    const pendientes = await prisma.whatsappPendiente.findMany({
      where: { estado: 'PENDIENTE' },
      orderBy: { created_at: 'asc' },
      take: LOTE,
    });
    if (pendientes.length === 0) return { enviados: 0, pendientes: 0 };

    if (!(await asegurarConexion())) {
      return { enviados: 0, pendientes: await contarPendientes() };
    }

    for (const mensaje of pendientes) {
      try {
        await enviarTexto(mensaje.jid, mensaje.texto);
        await prisma.whatsappPendiente.update({
          where: { id: mensaje.id },
          data: { estado: 'ENVIADO', enviado_at: new Date(), intentos: { increment: 1 } },
        });
        enviados++;
      } catch (error) {
        const intentos = mensaje.intentos + 1;
        await prisma.whatsappPendiente.update({
          where: { id: mensaje.id },
          data: {
            intentos,
            ultimo_error: textoDeError(error),
            // Agotó los reintentos: se archiva para que la cola no se tape con él.
            ...(intentos >= MAX_INTENTOS ? { estado: 'FALLIDO' as const } : {}),
          },
        });
        break;
      }
    }
  } catch (error) {
    console.error('[WhatsApp] Error drenando la cola:', error);
  } finally {
    estado.drenando = false;
  }

  const pendientes = await contarPendientes();
  if (enviados > 0) console.log(`[WhatsApp] ${enviados} aviso(s) atrasado(s) enviados.`);
  if (pendientes > 0) asegurarReintentos();
  return { enviados, pendientes };
}

/**
 * Intenta mandar el aviso ahora; si no se puede, lo encola.
 * Si ya había cola, el mensaje nuevo se va al final para no adelantarse a los
 * anteriores, y recién ahí se intenta drenar todo junto.
 */
export async function enviarOEncolar(jid: string, texto: string): Promise<void> {
  if ((await contarPendientes()) > 0) {
    await encolarMensaje(jid, texto, 'En espera detrás de avisos anteriores');
    await drenarCola();
    return;
  }

  try {
    if (!(await asegurarConexion())) throw new Error('WhatsApp no está conectado');
    await enviarTexto(jid, texto);
  } catch (error) {
    await encolarMensaje(jid, texto, textoDeError(error));
  }
}
