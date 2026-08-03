import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Sesión de WhatsApp (Baileys) viviendo dentro del proceso de Next.
 *
 * IMPORTANTE: esto exige que la app corra como servidor Node persistente
 * (`next start` en un servidor propio o en la PC del local). En un entorno
 * serverless (Vercel) no funciona: cada request es un proceso nuevo, sin socket
 * abierto ni disco donde persistir la sesión pareada.
 */

/** Carpeta donde Baileys persiste las credenciales de la sesión pareada. */
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR ?? path.join(process.cwd(), '.whatsapp-auth');

export type EstadoWhatsapp = 'DESCONECTADO' | 'ESPERANDO_QR' | 'CONECTADO';

export interface GrupoWhatsapp {
  jid: string;
  nombre: string;
  participantes: number;
}

interface SesionWhatsapp {
  sock: WASocket | null;
  estado: EstadoWhatsapp;
  /** QR listo para pintar en un <img>, solo mientras estado === 'ESPERANDO_QR'. */
  qrDataUrl: string | null;
  /** Número pareado, ej. "59171234567". */
  numero: string | null;
  ultimoError: string | null;
  /** Conexión en curso, para que llamadas simultáneas no abran dos sockets. */
  conectando: Promise<void> | null;
}

// El módulo se reevalúa en cada recarga de Next en dev; el socket vive en
// globalThis para no dejar sesiones huérfanas conectadas a WhatsApp.
declare global {
  var __whatsappSesion: SesionWhatsapp | undefined;
}

const sesion: SesionWhatsapp = (globalThis.__whatsappSesion ??= {
  sock: null,
  estado: 'DESCONECTADO',
  qrDataUrl: null,
  numero: null,
  ultimoError: null,
  conectando: null,
});

/** Logger mínimo que cumple la interfaz que pide Baileys, sin ruido en consola. */
const loggerSilencioso = {
  level: 'silent',
  child: () => loggerSilencioso,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** "59171234567:12@s.whatsapp.net" → "59171234567" */
function numeroDesdeJid(jid: string | undefined): string | null {
  if (!jid) return null;
  return jid.split(':')[0].split('@')[0] || null;
}

async function existeSesionGuardada(): Promise<boolean> {
  try {
    await fs.access(path.join(AUTH_DIR, 'creds.json'));
    return true;
  } catch {
    return false;
  }
}

async function borrarSesionGuardada(): Promise<void> {
  await fs.rm(AUTH_DIR, { recursive: true, force: true });
}

function resetear(estado: EstadoWhatsapp, error: string | null = null): void {
  sesion.sock = null;
  sesion.estado = estado;
  sesion.qrDataUrl = null;
  sesion.numero = null;
  sesion.ultimoError = error;
}

/**
 * Abre la sesión de WhatsApp. Si no hay credenciales guardadas, deja el QR
 * disponible en `estadoWhatsapp().qrDataUrl` para que lo escaneen.
 * Es idempotente: si ya está conectada o conectándose, no abre otro socket.
 */
export async function conectarWhatsapp(): Promise<void> {
  if (sesion.estado === 'CONECTADO' && sesion.sock) return;
  if (sesion.conectando) return sesion.conectando;

  sesion.conectando = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
      auth: state,
      logger: loggerSilencioso,
      browser: ['Elevate', 'Chrome', '1.0.0'],
      // Sin esto Baileys re-emite todo el historial de chats al parear.
      syncFullHistory: false,
    });

    sesion.sock = sock;
    sesion.ultimoError = null;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        sesion.estado = 'ESPERANDO_QR';
        // toDataURL es async; el QR queda disponible en el siguiente poll de la UI.
        QRCode.toDataURL(qr, { width: 320, margin: 1 })
          .then((dataUrl) => {
            sesion.qrDataUrl = dataUrl;
          })
          .catch((error) => {
            console.error('[WhatsApp] No se pudo generar el QR:', error);
          });
      }

      if (connection === 'open') {
        sesion.estado = 'CONECTADO';
        sesion.qrDataUrl = null;
        sesion.numero = numeroDesdeJid(sock.user?.id);
        sesion.ultimoError = null;
        console.log(`[WhatsApp] Sesión conectada (${sesion.numero ?? 'sin número'}).`);

        // Volvió la sesión: salen los avisos que quedaron encolados mientras
        // estuvo caída. Import dinámico porque `cola` importa este módulo.
        void import('./cola')
          .then((cola) => cola.drenarCola())
          .catch((error) => console.error('[WhatsApp] No se pudo drenar la cola:', error));
      }

      if (connection === 'close') {
        const status = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;

        if (status === DisconnectReason.loggedOut) {
          // WhatsApp cerró la sesión desde el celular: hay que volver a escanear.
          console.warn('[WhatsApp] Sesión cerrada desde el teléfono. Se requiere escanear el QR de nuevo.');
          resetear('DESCONECTADO', 'Sesión cerrada desde el teléfono.');
          void borrarSesionGuardada();
          return;
        }

        // Corte de red o reinicio pedido por WhatsApp (515 tras el pareo): reconectar.
        console.warn(`[WhatsApp] Conexión caída (status ${status ?? 'desconocido'}). Reconectando...`);
        sesion.sock = null;
        sesion.estado = 'DESCONECTADO';
        setTimeout(() => {
          conectarWhatsapp().catch((error) => {
            console.error('[WhatsApp] Falló la reconexión:', error);
          });
        }, 3000);
      }
    });
  })();

  try {
    await sesion.conectando;
  } catch (error) {
    resetear('DESCONECTADO', error instanceof Error ? error.message : 'Error al conectar');
    throw error;
  } finally {
    sesion.conectando = null;
  }
}

/**
 * Levanta la sesión si hay credenciales guardadas pero el socket está caído
 * (típico tras reiniciar el servidor). No fuerza un QR nuevo.
 */
export async function asegurarConexion(): Promise<boolean> {
  if (sesion.estado === 'CONECTADO' && sesion.sock) return true;
  if (!(await existeSesionGuardada())) return false;
  await conectarWhatsapp();
  return sesion.estado === 'CONECTADO';
}

/** Cierra la sesión en WhatsApp y borra las credenciales locales. */
export async function cerrarSesionWhatsapp(): Promise<void> {
  try {
    await sesion.sock?.logout();
  } catch (error) {
    // Si el socket ya estaba caído el logout falla; da igual, igual borramos.
    console.warn('[WhatsApp] Logout falló, se borra la sesión local igual:', error);
  }
  resetear('DESCONECTADO');
  await borrarSesionGuardada();
}

export function estadoWhatsapp(): {
  estado: EstadoWhatsapp;
  qrDataUrl: string | null;
  numero: string | null;
  ultimoError: string | null;
} {
  return {
    estado: sesion.estado,
    qrDataUrl: sesion.qrDataUrl,
    numero: sesion.numero,
    ultimoError: sesion.ultimoError,
  };
}

/** Grupos donde participa el número pareado, para elegir a cuál avisar. */
export async function listarGrupos(): Promise<GrupoWhatsapp[]> {
  if (sesion.estado !== 'CONECTADO' || !sesion.sock) {
    throw new Error('WhatsApp no está conectado');
  }
  const grupos = await sesion.sock.groupFetchAllParticipating();
  return Object.values(grupos)
    .map((grupo) => ({
      jid: grupo.id,
      nombre: grupo.subject || grupo.id,
      participantes: grupo.participants?.length ?? 0,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Envía texto a un JID (grupo `...@g.us` o chat `...@s.whatsapp.net`). */
export async function enviarTexto(jid: string, texto: string): Promise<void> {
  if (sesion.estado !== 'CONECTADO' || !sesion.sock) {
    throw new Error('WhatsApp no está conectado');
  }
  await sesion.sock.sendMessage(jid, { text: texto });
}
