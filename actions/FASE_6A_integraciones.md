# FASE 6 · A — Integraciones (WhatsApp alertas, GPS real, promos en tienda)

> Depende de Fase 5 (alertas) y módulos previos. Ref: `docs/MODULO_INVENTARIO.md`,
> AGENTS.md (tareas 3 y 5).

## Parte 1 — Alertas WhatsApp (demo → real)
- `lib/server/alertas/whatsapp.service.ts`: construir mensaje desde plantilla
  (`{count}`, `{list}`, `{url}`), con **anti-spam** (intervalo mínimo) y **horario
  silencioso**. Persistir `RegistroAlerta`.
- Modo demo: estado `simulated` (no envía). Modo real: integrar proveedor (ej.
  WhatsApp Cloud API / Twilio) detrás de una interfaz, con credenciales en env
  (servidor). NUNCA enviar desde el navegador.
- Disparar al cruzar umbral tras movimientos de inventario (Fase 5B) + botón "enviar
  alerta manual" en Settings.

## Parte 2 — GPS real de repartidores
- Endpoint `POST /api/pedidos/driver/[token]/ubicacion` que reciba `{lat,lng}` y
  actualice `Transaccion.driver_lat/lng` (validar `driver_link_id`/token).
- En `app/driver/[token]/page.tsx`: enviar ubicación periódicamente
  (`navigator.geolocation.watchPosition`).
- `components/admin/AdminDeliverys.tsx`: refrescar el mapa con polling/realtime sin
  recargar. Reemplazar coordenadas simuladas.

## Parte 3 — Promos/reglas horarias en la tienda
- En el endpoint de productos de la tienda, verificar `ReglasHorarias` +
  `PromocionesDescuentos` activas (fecha/hora actual) y aplicar el descuento al precio
  mostrado. Marcar el descuento en el detalle de la transacción
  (`TransaccionesDetalles.descuentoAplicado`).

## Criterios de aceptación
- [ ] Alertas: se registran (demo) y, si hay credenciales, se envían (real) respetando
      anti-spam y horario silencioso.
- [ ] El mapa de deliverys refleja ubicación real del repartidor.
- [ ] La tienda aplica promociones vigentes automáticamente.
