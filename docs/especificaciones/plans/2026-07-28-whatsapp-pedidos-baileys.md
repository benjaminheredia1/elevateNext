# Notificación de Pedidos a WhatsApp (Baileys) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando se crea un pedido desde la tienda web (`POST /api/pedidos`), avisar a un grupo de WhatsApp con código del pedido, cliente, teléfono, tipo de entrega y ubicación (link de Google Maps), usando Baileys.

**Architecture:** Dos piezas separadas. (1) `services/whatsapp-bot/`: proceso Node standalone con Baileys, corre 24/7 en el servidor propio del usuario (NO en Vercel), expone `POST /notify-order` protegido por secreto compartido, y solo reenvía texto al grupo — no arma la plantilla. (2) Next.js: `lib/server/notificaciones/whatsapp-pedido.service.ts` arma el mensaje y lo empuja al bot vía `fetch`, invocado con `after()` de `next/server` dentro de `app/api/pedidos/route.ts` para no bloquear la respuesta del checkout.

**Tech Stack:** Next.js 16 (`after()` de `next/server`), Prisma 7, `@whiskeysockets/baileys` (proceso Node separado), Vitest.

Spec completo: `docs/especificaciones/specs/2026-07-28-whatsapp-pedidos-baileys-design.md`.

## Global Constraints

- El bot Baileys **no se despliega en Vercel** — es un paquete Node separado en `services/whatsapp-bot/` con su propio `package.json`, para no meter dependencias de Baileys en el build de la app principal (`vercel.json` / `package.json` raíz no se tocan).
- Instalar `@whiskeysockets/baileys@latest` (resolvió en `7.0.0-rc13` al momento de este plan) — **nunca** una versión menor a `6.7.22`/`7.0.0-rc12`: versiones anteriores tienen un CVE de spoofing de mensajes (ver aviso de deprecación del paquete en npm).
- Requiere Node **>= 20** en el servidor donde corre el bot (requisito de Baileys).
- Comunicación fire-and-forget: si el bot falla o está caído, se loguea y el pedido sigue su curso — nunca bloquea ni revierte la creación del pedido.
- Mensaje: solo texto (código, cliente, teléfono, tipo de entrega, ubicación + link de Google Maps). **Sin** lista de productos ni total/método de pago — confirmado con el usuario.
- `after()` de `next/server` lanza `Error: "after" was called outside a request scope` si se invoca fuera del ciclo real de un request de Next.js (p. ej. al llamar al handler exportado directamente, como hacen los tests de este repo). Por eso va envuelto en `try/catch` en el route handler — no-op seguro en ese caso.
- Este repo no usa `vi.mock`/`vi.fn` en ningún test existente (confirmado por grep) — ni `lib/server/alertas/whatsapp.service.ts`, el stub de WhatsApp ya existente, tiene test. Se sigue esa convención: solo se testea la función pura `construirMensajePedido` (sin red, sin BD, sin mocks); `notificarPedidoWhatsapp` (hace `fetch` + lee `Configuracion`) se verifica manualmente, no con test automatizado.
- Esta feature no cambia estados, permisos, dinero ni stock del endpoint `/api/pedidos` — solo agrega un efecto secundario de notificación. No aplica la regla de "tests de endpoint obligatorios para reglas de negocio nuevas" (CLAUDE.md) porque no hay regla de negocio nueva en el endpoint en sí.
- Idioma del mensaje y del código nuevo: español, consistente con el resto del codebase.

---

## File Structure

- **Crear** `services/whatsapp-bot/package.json` — paquete Node standalone (`type: module`), dependencias `@whiskeysockets/baileys`, `qrcode-terminal`, `dotenv`.
- **Crear** `services/whatsapp-bot/.gitignore` — ignora `auth/` (sesión) y `.env`.
- **Crear** `services/whatsapp-bot/.env.example` — placeholders `WHATSAPP_BOT_SECRET`, `WHATSAPP_GROUP_JID`, `PORT`.
- **Crear** `services/whatsapp-bot/index.mjs` — conexión Baileys + listado de grupos + servidor HTTP `POST /notify-order`.
- **Crear** `services/whatsapp-bot/README.md` — pasos de setup (instalar, escanear QR, copiar JID, correr persistente).
- **Crear** `lib/server/notificaciones/whatsapp-pedido.service.ts` — `construirMensajePedido` (pura) + `notificarPedidoWhatsapp` (fetch al bot).
- **Crear** `lib/server/notificaciones/whatsapp-pedido.service.test.ts` — tests de `construirMensajePedido`.
- **Modificar** `app/api/pedidos/route.ts` — llama `notificarPedidoWhatsapp` vía `after()` tras crear la transacción.
- **Modificar** `.env.test.example` — agrega placeholders vacíos `WHATSAPP_BOT_URL`, `WHATSAPP_BOT_SECRET` (documentación; al estar vacíos, `notificarPedidoWhatsapp` hace no-op en tests).

---

### Task 1: Bot — conexión a WhatsApp con Baileys

**Files:**
- Create: `services/whatsapp-bot/package.json`
- Create: `services/whatsapp-bot/.gitignore`
- Create: `services/whatsapp-bot/.env.example`
- Create: `services/whatsapp-bot/index.mjs`
- Create: `services/whatsapp-bot/README.md`

**Interfaces:**
- Produces: proceso Node que al arrancar (`npm start` dentro de `services/whatsapp-bot/`) se conecta a WhatsApp, imprime QR la primera vez, persiste la sesión en `auth/`, y reconecta solo automáticamente ante cortes (no ante logout real).

- [ ] **Step 1: Crear el paquete**

Crea `services/whatsapp-bot/package.json`:

```json
{
  "name": "elevate-whatsapp-bot",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node index.mjs"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^7.0.0-rc13",
    "qrcode-terminal": "^0.12.0",
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

```bash
cd services/whatsapp-bot
npm install
```

Expected: `npm install` termina sin errores; se crea `services/whatsapp-bot/node_modules` y `package-lock.json`.

- [ ] **Step 3: Crear `.gitignore` y `.env.example` del bot**

Crea `services/whatsapp-bot/.gitignore`:

```
node_modules/
auth/
.env
```

Crea `services/whatsapp-bot/.env.example`:

```
# Secreto compartido con Next.js (mismo valor que WHATSAPP_BOT_SECRET en el .env de la app principal)
WHATSAPP_BOT_SECRET=""
# JID del grupo destino — dejar vacío en el primer arranque; el bot lo imprime en consola
WHATSAPP_GROUP_JID=""
PORT=3900
```

- [ ] **Step 4: Escribir la conexión a WhatsApp**

Crea `services/whatsapp-bot/index.mjs`:

```js
import 'dotenv/config';
import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

let sock;

async function listarGrupos() {
  const grupos = await sock.groupFetchAllParticipating();
  console.log('--- Grupos disponibles (copia el JID a WHATSAPP_GROUP_JID en .env y reinicia) ---');
  for (const grupo of Object.values(grupos)) {
    console.log(`${grupo.subject}: ${grupo.id}`);
  }
  console.log('---');
}

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(new URL('./auth', import.meta.url).pathname);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({ auth: state, version });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('Escanea este QR con WhatsApp (Dispositivos vinculados):');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('Bot conectado a WhatsApp.');
      if (!process.env.WHATSAPP_GROUP_JID) {
        listarGrupos().catch((error) => console.error('Error al listar grupos:', error));
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.error(`Conexión cerrada (status ${statusCode}).`, loggedOut ? 'Sesión cerrada: borra auth/ y vuelve a escanear el QR.' : 'Reconectando...');
      if (!loggedOut) connect();
    }
  });
}

connect().catch((error) => {
  console.error('Error al conectar el bot:', error);
  process.exit(1);
});
```

- [ ] **Step 5: Escribir el README de setup**

Crea `services/whatsapp-bot/README.md`:

```md
# Bot WhatsApp de pedidos (Baileys)

Proceso Node standalone — corre en un servidor propio siempre encendido, NO en Vercel.

## Setup

1. `cp .env.example .env` y define `WHATSAPP_BOT_SECRET` (cualquier string largo aleatorio) y `PORT` (default 3900). Deja `WHATSAPP_GROUP_JID` vacío por ahora.
2. `npm install`
3. `npm start` — escanea el QR que aparece en la terminal con WhatsApp (Dispositivos vinculados) usando el número que quieres que mande los avisos. Este número debe ya ser miembro del grupo destino.
4. Al conectar, si no hay `WHATSAPP_GROUP_JID` configurado, la consola imprime la lista de grupos donde participa el número, con su JID (formato `xxxxx-xxxxx@g.us`). Copia el JID del grupo correcto.
5. Pega ese JID en `WHATSAPP_GROUP_JID` en `.env` y reinicia (`npm start`).
6. En el `.env` de la app Next.js (raíz del repo), configura `WHATSAPP_BOT_URL` apuntando a este servidor (ej. `https://tu-servidor:3900`) y `WHATSAPP_BOT_SECRET` con el mismo valor que pusiste acá.

## Correr persistente

Este proceso debe quedar corriendo 24/7. Opciones simples: `pm2 start index.mjs --name whatsapp-bot` (reinicia solo si se cae) o un servicio systemd. La sesión vive en `auth/` — no la borres salvo que quieras re-parear el número.

## Si WhatsApp cierra la sesión

Baileys puede recibir un "logout" forzado por WhatsApp (ej. si se cierra sesión desde el teléfono). Cuando pase, la consola lo indica; hay que borrar `auth/` y volver a escanear el QR (Step 3).

## Exposición pública

`WHATSAPP_BOT_URL` debe ser alcanzable desde internet (Vercel le hace `fetch` a esta URL). Ponerlo detrás de HTTPS (reverse proxy con certificado, ej. Caddy o nginx) — no exponer el puerto en texto plano si el servidor está en una red pública.
```

- [ ] **Step 6: Prueba manual**

```bash
cd services/whatsapp-bot
npm start
```

Expected: aparece un QR en la terminal. Escanéalo desde el teléfono (WhatsApp → Dispositivos vinculados → Vincular dispositivo). Tras escanear, debe aparecer `Bot conectado a WhatsApp.` y, si `WHATSAPP_GROUP_JID` está vacío, la lista de grupos con sus JIDs. Copia el JID del grupo de pedidos y pégalo en `services/whatsapp-bot/.env`, reinicia con `npm start` y confirma que esta vez NO se imprime la lista de grupos (porque ya está seteado).

**Troubleshooting**: si `npm start` falla con algo como `fetchLatestBaileysVersion is not a function` (la librería no es oficial de Meta y su API puede variar entre versiones), corre `node -e "import('@whiskeysockets/baileys').then(m => console.log(Object.keys(m)))"` para ver los nombres reales exportados por la versión instalada, y ajusta el import en `index.mjs`. Si `fetchLatestBaileysVersion` no existe, se puede quitar por completo esa línea y el `version` del `makeWASocket({ auth: state })` — Baileys trae un default embebido.

- [ ] **Step 7: Commit**

```bash
git add services/whatsapp-bot/package.json services/whatsapp-bot/.gitignore services/whatsapp-bot/.env.example services/whatsapp-bot/index.mjs services/whatsapp-bot/README.md
git commit -m "feat: bot de WhatsApp (Baileys) - conexion y setup de grupo"
```

---

### Task 2: Bot — endpoint HTTP `/notify-order`

**Files:**
- Modify: `services/whatsapp-bot/index.mjs`
- Modify: `services/whatsapp-bot/README.md`

**Interfaces:**
- Consumes: `sock` (instancia viva del socket Baileys, Task 1), `process.env.WHATSAPP_BOT_SECRET`, `process.env.WHATSAPP_GROUP_JID`, `process.env.PORT`.
- Produces: `POST http://<host>:<PORT>/notify-order` — header `Authorization: Bearer <WHATSAPP_BOT_SECRET>`, body `{ "text": string }` → `200 { ok: true }` o `401`/`500` con `{ ok: false, error }`.

- [ ] **Step 1: Agregar el servidor HTTP**

En `services/whatsapp-bot/index.mjs`, agrega el import de `node:http` al inicio:

```js
import http from 'node:http';
```

Y al final del archivo (después de la llamada a `connect()`), agrega:

```js
const PORT = process.env.PORT || 3900;

http
  .createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/notify-order') {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    if (req.headers['authorization'] !== `Bearer ${process.env.WHATSAPP_BOT_SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { text } = JSON.parse(body);
        if (!text) throw new Error('falta "text" en el body');
        if (!process.env.WHATSAPP_GROUP_JID) throw new Error('WHATSAPP_GROUP_JID no configurado');
        if (!sock) throw new Error('bot no conectado todavia');

        await sock.sendMessage(process.env.WHATSAPP_GROUP_JID, { text });
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
      } catch (error) {
        console.error('POST /notify-order error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
      }
    });
  })
  .listen(PORT, () => console.log(`Bot escuchando en puerto ${PORT}`));
```

- [ ] **Step 2: Prueba manual — secreto incorrecto**

Con el bot corriendo (`npm start`, ya conectado y con `WHATSAPP_GROUP_JID` seteado desde la Task 1):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3900/notify-order \
  -H "Authorization: Bearer secreto-incorrecto" \
  -H "Content-Type: application/json" \
  -d '{"text":"prueba"}'
```

Expected: `401`.

- [ ] **Step 3: Prueba manual — secreto correcto**

Reemplaza `<SECRETO>` por el valor real de `WHATSAPP_BOT_SECRET` en `services/whatsapp-bot/.env`:

```bash
curl -s -X POST http://localhost:3900/notify-order \
  -H "Authorization: Bearer <SECRETO>" \
  -H "Content-Type: application/json" \
  -d '{"text":"🛎️ Prueba del bot de pedidos"}'
```

Expected: `{"ok":true}` en la respuesta, y el mensaje "🛎️ Prueba del bot de pedidos" debe aparecer en el grupo de WhatsApp configurado, en menos de unos segundos.

- [ ] **Step 4: Actualizar el README**

En `services/whatsapp-bot/README.md`, agrega al final una sección:

```md
## Probar el envío

```bash
curl -s -X POST http://localhost:3900/notify-order \
  -H "Authorization: Bearer <WHATSAPP_BOT_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"text":"prueba"}'
```

Debe responder `{"ok":true}` y el mensaje debe llegar al grupo configurado en `WHATSAPP_GROUP_JID`.
```

- [ ] **Step 5: Commit**

```bash
git add services/whatsapp-bot/index.mjs services/whatsapp-bot/README.md
git commit -m "feat: endpoint HTTP notify-order en el bot de WhatsApp"
```

---

### Task 3: Next.js — armado del mensaje y llamada al bot

**Files:**
- Create: `lib/server/notificaciones/whatsapp-pedido.service.ts`
- Create: `lib/server/notificaciones/whatsapp-pedido.service.test.ts`
- Modify: `.env.test.example`

**Interfaces:**
- Consumes: `prisma` de `@/lib/prisma`; `TipoEntrega` de `@prisma/client`.
- Produces: `construirMensajePedido(pedido: PedidoParaNotificar, tienda: UbicacionTienda): string`; `notificarPedidoWhatsapp(pedido: PedidoParaNotificar): Promise<void>`; tipos `PedidoParaNotificar`, `UbicacionTienda` exportados — Task 4 los consume.

- [ ] **Step 1: Escribir el test (falla primero)**

Crea `lib/server/notificaciones/whatsapp-pedido.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TipoEntrega } from '@prisma/client';
import { construirMensajePedido, type PedidoParaNotificar, type UbicacionTienda } from './whatsapp-pedido.service';

const tienda: UbicacionTienda = { sucursal_nombre: 'Sucursal Principal', sucursal_lat: -17.771, sucursal_lng: -63.19 };

const base: PedidoParaNotificar = {
  codigo: 'AB123',
  cliente_nombre: 'Juan Pérez',
  cliente_telefono: '70011122',
  tipo_entrega: TipoEntrega.DELIVERY,
  cliente_direccion: 'Av. Siempre Viva 123',
  cliente_lat: -17.8,
  cliente_lng: -63.2,
};

describe('construirMensajePedido', () => {
  it('arma el mensaje para DELIVERY con la ubicación del cliente', () => {
    const texto = construirMensajePedido(base, tienda);

    expect(texto).toContain('Pedido nuevo #AB123');
    expect(texto).toContain('Cliente: Juan Pérez');
    expect(texto).toContain('Tel: 70011122');
    expect(texto).toContain('Tipo: Entrega a domicilio');
    expect(texto).toContain('Ubicación: Av. Siempre Viva 123');
    expect(texto).toContain('https://maps.google.com/?q=-17.8,-63.2');
  });

  it('arma el mensaje para RECOJO con la ubicación de la tienda', () => {
    const texto = construirMensajePedido(
      { ...base, tipo_entrega: TipoEntrega.RECOJO, cliente_direccion: null, cliente_lat: null, cliente_lng: null },
      tienda,
    );

    expect(texto).toContain('Tipo: Recoger en tienda');
    expect(texto).toContain('Ubicación: Sucursal Principal');
    expect(texto).toContain('https://maps.google.com/?q=-17.771,-63.19');
  });

  it('omite el link de mapas si no hay coordenadas', () => {
    const texto = construirMensajePedido(
      { ...base, cliente_direccion: 'Sin coords', cliente_lat: null, cliente_lng: null },
      tienda,
    );

    expect(texto).not.toContain('maps.google.com');
    expect(texto).toContain('Ubicación: Sin coords');
  });

  it('usa placeholders cuando falta nombre o teléfono', () => {
    const texto = construirMensajePedido({ ...base, cliente_nombre: null, cliente_telefono: null }, tienda);

    expect(texto).toContain('Cliente: Sin nombre');
    expect(texto).toContain('Tel: Sin teléfono');
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

```bash
npx vitest run lib/server/notificaciones/whatsapp-pedido.service.test.ts
```

Expected: falla porque `./whatsapp-pedido.service` no existe todavía (`Cannot find module` o similar).

- [ ] **Step 3: Implementar el service**

Crea `lib/server/notificaciones/whatsapp-pedido.service.ts`:

```ts
import { TipoEntrega } from '@prisma/client';
import prisma from '@/lib/prisma';

export interface PedidoParaNotificar {
  codigo: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  tipo_entrega: TipoEntrega | null;
  cliente_direccion: string | null;
  cliente_lat: number | null;
  cliente_lng: number | null;
}

export interface UbicacionTienda {
  sucursal_nombre: string;
  sucursal_lat: number;
  sucursal_lng: number;
}

export function construirMensajePedido(pedido: PedidoParaNotificar, tienda: UbicacionTienda): string {
  const esRecojo = pedido.tipo_entrega === TipoEntrega.RECOJO;
  const tipoLabel = esRecojo ? 'Recoger en tienda' : 'Entrega a domicilio';
  const direccion = esRecojo ? tienda.sucursal_nombre : (pedido.cliente_direccion ?? 'Sin dirección');
  const lat = esRecojo ? tienda.sucursal_lat : pedido.cliente_lat;
  const lng = esRecojo ? tienda.sucursal_lng : pedido.cliente_lng;
  const mapsLine = lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null;

  return [
    `🛎️ Pedido nuevo #${pedido.codigo ?? '?'}`,
    `Cliente: ${pedido.cliente_nombre ?? 'Sin nombre'}`,
    `Tel: ${pedido.cliente_telefono ?? 'Sin teléfono'}`,
    `Tipo: ${tipoLabel}`,
    `Ubicación: ${direccion}`,
    mapsLine,
  ].filter((line): line is string => line != null).join('\n');
}

async function obtenerUbicacionTienda(): Promise<UbicacionTienda> {
  const config = await prisma.configuracion.findUnique({ where: { id: 1 } });
  if (!config) {
    return { sucursal_nombre: 'Sucursal Principal', sucursal_lat: -17.7710, sucursal_lng: -63.1900 };
  }
  return { sucursal_nombre: config.sucursal_nombre, sucursal_lat: config.sucursal_lat, sucursal_lng: config.sucursal_lng };
}

export async function notificarPedidoWhatsapp(pedido: PedidoParaNotificar): Promise<void> {
  const url = process.env.WHATSAPP_BOT_URL;
  const secret = process.env.WHATSAPP_BOT_SECRET;
  if (!url || !secret) return;

  try {
    const tienda = await obtenerUbicacionTienda();
    const text = construirMensajePedido(pedido, tienda);
    const res = await fetch(`${url}/notify-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error('notificarPedidoWhatsapp: el bot respondió', res.status);
    }
  } catch (error) {
    console.error('notificarPedidoWhatsapp: error al notificar', error);
  }
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

```bash
npx vitest run lib/server/notificaciones/whatsapp-pedido.service.test.ts
```

Expected: 4 tests, todos en verde.

- [ ] **Step 5: Agregar los placeholders al env de test**

En `.env.test.example`, agrega al final (después de las líneas de `RESEND_*` duplicadas existentes):

```
WHATSAPP_BOT_URL=""
WHATSAPP_BOT_SECRET=""
```

- [ ] **Step 6: Chequeo de tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores nuevos relacionados a `whatsapp-pedido.service.ts` o su test.

- [ ] **Step 7: Commit**

```bash
git add lib/server/notificaciones/whatsapp-pedido.service.ts lib/server/notificaciones/whatsapp-pedido.service.test.ts .env.test.example
git commit -m "feat: armado de mensaje y notificacion HTTP al bot de WhatsApp"
```

---

### Task 4: Wire — invocar la notificación al crear un pedido

**Files:**
- Modify: `app/api/pedidos/route.ts`

**Interfaces:**
- Consumes: `notificarPedidoWhatsapp` de `@/lib/server/notificaciones/whatsapp-pedido.service` (Task 3); `after` de `next/server`; `transaccion` (el objeto ya creado por `prisma.transaccion.create` en este mismo handler, línea ~163-182 — sus campos `codigo, cliente_nombre, cliente_telefono, tipo_entrega, cliente_direccion, cliente_lat, cliente_lng` ya calzan estructuralmente con `PedidoParaNotificar`).
- Produces: efecto secundario post-respuesta; no cambia la firma ni el `Response` de `POST /api/pedidos`.

- [ ] **Step 1: Agregar los imports**

En `app/api/pedidos/route.ts`, reemplaza la primera línea:

```ts
import { NextRequest, NextResponse } from 'next/server';
```

por:

```ts
import { NextRequest, NextResponse, after } from 'next/server';
import { notificarPedidoWhatsapp } from '@/lib/server/notificaciones/whatsapp-pedido.service';
```

- [ ] **Step 2: Invocar la notificación tras crear los detalles**

Reemplaza:

```ts
    await prisma.transaccionesDetalles.createMany({
      data: lineas.map((l) => ({
        transaccion_id: transaccion.id,
        producto_id: l.producto_id,
        precio_unitario: l.precio_unitario,
        descuentoAplicado: l.descuento,
        cantidad: l.cantidad,
      })),
    });

    return NextResponse.json(
```

por:

```ts
    await prisma.transaccionesDetalles.createMany({
      data: lineas.map((l) => ({
        transaccion_id: transaccion.id,
        producto_id: l.producto_id,
        precio_unitario: l.precio_unitario,
        descuentoAplicado: l.descuento,
        cantidad: l.cantidad,
      })),
    });

    try {
      // `after` exige el contexto de un request real de Next.js; al invocar este
      // handler directamente (como hacen los tests de este repo) lanza fuera de
      // ese contexto — se ignora ahí, la notificación es best-effort de por sí.
      after(() => notificarPedidoWhatsapp(transaccion));
    } catch {
      // no-op
    }

    return NextResponse.json(
```

- [ ] **Step 3: Chequeo de tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores nuevos en `app/api/pedidos/route.ts`.

- [ ] **Step 4: Correr toda la suite de tests**

```bash
npm test
```

Expected: todos los tests existentes en verde, sin regresiones (en particular `app/api/pedidos/[id]/route.test.ts`, que sigue llamando handlers directamente).

- [ ] **Step 5: Verificación manual — sin bot configurado**

Con `npm run dev` corriendo y `WHATSAPP_BOT_URL` vacío/no seteado en `.env`:

1. Completa un pedido desde la tienda pública (`http://localhost:3000`) o con curl a `POST /api/pedidos` con un body válido de items.
2. Expected: la respuesta sigue siendo `201` con el pedido creado, igual que antes — sin errores en consola relacionados a WhatsApp (porque `notificarPedidoWhatsapp` hace no-op al no haber `WHATSAPP_BOT_URL`).

- [ ] **Step 6: Verificación manual — con bot configurado (opcional, si ya tienes el bot corriendo de las Tasks 1-2)**

1. En `.env` (raíz), setea `WHATSAPP_BOT_URL="http://localhost:3900"` y `WHATSAPP_BOT_SECRET` con el mismo valor que `services/whatsapp-bot/.env`.
2. Reinicia `npm run dev`.
3. Completa un pedido DELIVERY con una dirección/coordenadas reales desde la tienda.
4. Expected: en pocos segundos llega al grupo de WhatsApp un mensaje con el código del pedido, cliente, teléfono, "Entrega a domicilio" y un link de Google Maps que abre la ubicación correcta.
5. Repite con un pedido RECOJO — Expected: mensaje dice "Recoger en tienda" y el link de Maps apunta a la dirección de `Configuracion` (`/admin/settings`).

- [ ] **Step 7: Commit**

```bash
git add app/api/pedidos/route.ts
git commit -m "feat: notificar pedidos nuevos al grupo de WhatsApp via Baileys"
```

---

## Fuera de alcance (recordatorio del spec)

- Reintentos automáticos si el bot está caído.
- Lista de productos, total o método de pago en el mensaje.
- Mensaje de tipo "location" nativo de WhatsApp (solo texto + link).
- Multi-grupo o enrutar a distintos grupos según sucursal.
- Panel admin para configurar `WHATSAPP_GROUP_JID`/secretos desde la UI.
- Test automatizado de `notificarPedidoWhatsapp` (fetch + DB) — se verifica a mano (ver Task 4, Steps 5-6), consistente con que el resto del repo tampoco mockea fetch/Prisma en tests.
