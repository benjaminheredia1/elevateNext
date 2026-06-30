# Pendientes — Elevate

Lista de trabajo postergado, con contexto para retomarlo. Última actualización: 2026-06-29.

---

## Fase 5 — Pasarela de pago real + pickup prepago (POSTERGADO)

**Estado:** bloqueado. No se implementa aún porque todavía no se integra una pasarela de pagos.

**Situación actual (provisional):**
- Cuando el cliente elige **QR o tarjeta**, el pedido se marca **PAGADO automáticamente** (no hay cobro real verificable). Ver `estadoPagoInicial()` en [app/api/pedidos/route.ts](app/api/pedidos/route.ts).
- El pickup todavía **permite efectivo** (pago al recoger, verificado por el cajero).

**Qué falta hacer cuando se integre la pasarela:**
1. Integrar una pasarela real (QR simple / Tigo Money / banco o un agregador) con **confirmación automática por webhook** que marque `payment_status = PAGADO` solo cuando el pago se confirme de verdad.
2. Mientras tanto, el QR/tarjeta debe pasar a estado **"pago por confirmar"** (no PAGADO) hasta el webhook; el cajero verifica el comprobante si hace falta.
3. **Recién entonces** activar la regla de negocio: **"pickup = solo prepago (QR/tarjeta), sin efectivo"**, para evitar no-shows con producto preparado y sin recoger.
   - Hoy NO se fuerza esa regla porque sin cobro real el "prepago" sería ficticio (el cliente igual podría no presentarse sin haber pagado nada).

**Por qué importa:** el prepago obligatorio en pickup es un *commitment device* contra no-shows, pero solo tiene sentido cuando el pago es verificable.

---

## Limpieza técnica pendiente (deuda)

### 1. Migrar el POS al modelo `payment_status`
- La venta presencial ([registrarVentaFisica](lib/server/caja/caja.service.ts)) aún crea `estado = 'PAGADO'` (valor heredado dentro del enum de cumplimiento `EstadoTransaccion`).
- El enum `estado` conserva el valor `PAGADO` solo por compatibilidad con el POS.
- **A futuro:** migrar el POS para que use únicamente `estado` (cumplimiento) + `payment_status` (pago) por separado, y eventualmente retirar `PAGADO` del enum de cumplimiento.

### 2. Identidad real del repartidor
- Hoy el repartidor entra por un **link sin autenticación** (`/driver/[token]`), lo que es un riesgo (cualquiera con el link manipula estados / "cobra").
- **A futuro:** crear un rol **REPARTIDOR** con login, o al menos un token firmado de un solo uso y con caducidad.

### 3. Rol opcional de COCINA / KDS
- No es necesario ahora (el cajero cubre preparación). A futuro, una pantalla de cocina que solo marque `EN_PREPARACION → LISTO`, separando cocina de caja.

---

## Despliegue

### Vercel Blob (subida de imágenes)
- La subida de imágenes de productos ([app/api/admin/upload/route.ts](app/api/admin/upload/route.ts)) usa **disco local** en desarrollo y **Vercel Blob** en producción (si existe `BLOB_READ_WRITE_TOKEN`).
- **Al desplegar en Vercel:** crear un **Blob Store** en el dashboard y vincularlo al proyecto (inyecta `BLOB_READ_WRITE_TOKEN`). Sin eso, las imágenes subidas se perderían entre despliegues.

---

## Mejora de identidad de cliente (Nivel 2 — opcional, a futuro)

- Ya implementado: dedup por teléfono/email/NIT + fusión manual en el admin (Nivel 0+1).
- **Pendiente opcional:** verificación por **OTP (WhatsApp/SMS)** para identidad verificada real (casi cero duplicados). Tiene costo por mensaje y agrega fricción; dejar para cuando el negocio lo justifique. El **email OTP** sería un puente intermedio gratis.
