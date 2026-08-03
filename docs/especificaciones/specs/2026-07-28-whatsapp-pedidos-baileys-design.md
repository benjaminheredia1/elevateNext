# Diseño: Notificación de pedidos a WhatsApp vía Baileys

> **SUPERADO (2026-08-02).** Este documento describe la variante de "bot como
> proceso aparte" (`services/whatsapp-bot/`, ver worktree
> `.claude/worktrees/whatsapp-pedidos-baileys`). Lo implementado finalmente es
> otra cosa, por decisión del usuario: Baileys corre **dentro del proceso de
> Next.js**, el QR se escanea desde `/admin/whatsapp` y el grupo destino se
> elige desde esa misma pantalla (se guarda en `Configuracion.whatsapp_grupo_jid`,
> no en una variable de entorno). Contrapartida asumida: la app debe correr con
> `next start` en un servidor propio siempre encendido — en Vercel no funciona.
> El mensaje quedó como "origen → destino", sin nombre/teléfono del cliente.
> Código: `lib/server/whatsapp/`, `app/api/admin/whatsapp/`, `app/admin/whatsapp/`.

## Contexto

Requerimiento: cuando se crea un pedido desde la tienda web, avisar a un grupo de WhatsApp con los datos del pedido y la ubicación de entrega o recojo, usando Baileys (cliente de WhatsApp Web no oficial).

## Restricción de infraestructura (confirmada con el usuario)

La web corre en Vercel (serverless, `vercel.json` con `framework: nextjs`). Baileys necesita un proceso Node persistente con sesión pareada por QR guardada en disco — no cabe en una función serverless. El usuario confirmó que tiene servidor propio siempre encendido para correr el bot. Por eso la solución son **dos piezas separadas**: el bot Baileys vive fuera de Vercel, y Next.js le habla por HTTP.

## Decisiones de alcance (confirmadas con el usuario)

1. **Comunicación**: push HTTP directo, fire-and-forget. Next.js llama al bot después de crear el pedido, sin bloquear la respuesta al cliente. Si el bot falla o está caído, se loguea el error y el pedido sigue su curso normal — el aviso de WhatsApp no es dato crítico, no tiene cola de reintentos (se descartó por sobre-ingeniería para el volumen de un restaurante).
2. **Ubicación en pedidos DELIVERY**: solo texto con link de Google Maps (`https://maps.google.com/?q=lat,lng`), no se manda un mensaje de tipo "location" nativo de WhatsApp.
3. **Ubicación en pedidos RECOJO**: mismo formato que delivery (texto + link de Maps), usando la dirección fija de la tienda (`Configuracion.sucursal_lat/lng/nombre`), por consistencia con el caso delivery.
4. **Contenido del mensaje**: mínimo — código de pedido, nombre del cliente, teléfono, tipo de entrega y ubicación. **Sin** lista de productos ni total/método de pago (eso se consulta en el panel admin; el WhatsApp es aviso de logística, no resumen de cocina).
5. **Grupo destino**: ya existe y el número que correrá el bot ya es miembro. El bot resuelve su JID en el primer arranque (ver Setup).

## Arquitectura

```
Cliente (tienda web) → POST /api/pedidos (Vercel/Next.js)
                            │
                            ├─ crea Transaccion + detalles (como hoy, sin cambios)
                            ├─ responde 201 al cliente
                            └─ after(): whatsapp-pedido.service.ts
                                            │
                                            └─ POST https://<servidor-propio>/notify-order
                                               Authorization: Bearer <WHATSAPP_BOT_SECRET>
                                                            │
                                              services/whatsapp-bot (proceso Node propio, 24/7)
                                                            │
                                                    sock.sendMessage(groupJid, {text})
                                                            │
                                                     Grupo de WhatsApp
```

### 1. `services/whatsapp-bot/` (nuevo, proceso separado — no se despliega en Vercel)

- Paquete Node independiente (`package.json` propio), dependencia `baileys`.
- Conexión a WhatsApp con `useMultiFileAuthState` (sesión persistida en `services/whatsapp-bot/auth/`, gitignored). Primer arranque: imprime QR en consola para escanear una vez.
- Reconexión automática ante cortes de socket; si WhatsApp fuerza logout, requiere re-escanear el QR (limitación conocida de Baileys, no hay forma de evitarla).
- **Setup del JID del grupo**: si `WHATSAPP_GROUP_JID` no está seteado en el `.env` del bot, al conectar imprime en consola la lista de grupos donde participa el número (`sock.groupFetchAllParticipating()`) con su JID, para copiarlo a `.env` y reiniciar.
- Servidor HTTP mínimo (Node `http` nativo, sin framework — un solo endpoint no justifica Express):
  - `POST /notify-order`
    - Header requerido: `Authorization: Bearer <WHATSAPP_BOT_SECRET>` → 401 si no coincide.
    - Body JSON: `{ text: string }` — el bot es un relay simple, **no** arma la plantilla del mensaje (eso vive del lado de Next.js, donde es testeable con Vitest; el bot no tiene suite de tests).
    - Llama `sock.sendMessage(process.env.WHATSAPP_GROUP_JID, { text: body.text })`.
    - Responde `200 { ok: true }` o `500 { ok: false, error }` si falla el envío (Next.js lo ignora igual, solo lo loguea).
- Variables de entorno del bot: `WHATSAPP_BOT_SECRET`, `WHATSAPP_GROUP_JID`, `PORT`.
- `README.md` propio con pasos de setup (instalar, arrancar, escanear QR, copiar JID, reiniciar, cómo correrlo persistente en el servidor — ej. `pm2` o systemd).

### 2. Next.js — `lib/server/notificaciones/whatsapp-pedido.service.ts` (nuevo)

- Función pura `construirMensajePedido(transaccion, cliente, configuracion)` → string, testeable sin red.
- Función `notificarPedidoWhatsapp(transaccion, cliente)`:
  - Si `!process.env.WHATSAPP_BOT_URL` → no-op inmediato (dev/test sin bot configurado).
  - Resuelve ubicación: `DELIVERY` usa `transaccion.cliente_direccion/cliente_lat/cliente_lng`; `RECOJO` consulta `Configuracion` (mismo fallback a Santa Cruz que ya usa `GET /api/configuracion`).
  - Arma el texto final con `construirMensajePedido(...)` y lo manda como `{ text }`.
  - `fetch(`${WHATSAPP_BOT_URL}/notify-order`, { method: 'POST', headers: { Authorization: `Bearer ${WHATSAPP_BOT_SECRET}` }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000) })`.
  - Try/catch envolvente: cualquier error (timeout, red, non-2xx) → `console.error`, nunca lanza.

### 3. `app/api/pedidos/route.ts` (modificado)

- Import `after` de `next/server`.
- Después de crear `transaccion` (y antes del `return NextResponse.json(...)` o inmediatamente después, da igual porque `after` corre post-respuesta): `after(() => notificarPedidoWhatsapp(transaccion, cliente))`.
- No cambia la validación, el cálculo de precios, ni la respuesta existente.

## Plantilla del mensaje

```
🛎️ Pedido nuevo #{codigo}
Cliente: {cliente_nombre}
Tel: {cliente_telefono}
Tipo: {Entrega a domicilio | Recoger en tienda}
Ubicación: {direccion}
{maps_url}
```

## Variables de entorno nuevas

- Next.js (`.env`, `.env.dev.example`, `.env.test.example` como placeholder vacío): `WHATSAPP_BOT_URL`, `WHATSAPP_BOT_SECRET`.
- Bot (`services/whatsapp-bot/.env`, no committeado): `WHATSAPP_BOT_SECRET` (mismo valor que Next.js), `WHATSAPP_GROUP_JID`, `PORT`.

## Testing

- Unitario (`whatsapp-pedido.service.test.ts`, junto al service): `construirMensajePedido` con casos DELIVERY y RECOJO, sin red, verifica el texto exacto esperado.
- Unitario: `notificarPedidoWhatsapp` con `fetch` mockeado — verifica payload/URL/header correctos, y que un fetch que rechaza (timeout/red) no lanza excepción hacia el caller.
- No se agregan tests de integración contra Baileys/WhatsApp real (no hay valor en mockear una API no oficial de terceros); se verifica a mano al desplegar el bot.
- Tests existentes de `POST /api/pedidos` no deben verse afectados: `WHATSAPP_BOT_URL` no está seteado en `.env.test`, por lo que la notificación es no-op.

## Fuera de alcance

- Reintentos automáticos si el bot está caído (aceptado como pérdida de aviso puntual, no de datos).
- Lista de productos, total o método de pago en el mensaje.
- Mensaje de tipo "location" nativo de WhatsApp (solo texto + link).
- Multi-grupo o enrutar a distintos grupos según sucursal (un solo grupo, fijo).
- Panel admin para configurar `WHATSAPP_GROUP_JID`/secretos desde la UI (se configuran por variables de entorno, como el resto de credenciales del proyecto).
