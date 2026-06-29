# FASE 6 · B — Hardening de seguridad + limpieza + build verde

> Depende de todas las fases. Ref: `docs/SEGURIDAD_Y_AUDITORIA.md`.

## PASO 1 — Proteger endpoints existentes con RBAC
Auditar TODOS los `app/api/*` y aplicar `requireAuth` + `requireRole` donde falte:
- `/api/admin/*` y operaciones de gestión → `['DUENO','ADMIN']`.
- `/api/caja/*` → `['CAJERO']` (admin supervisión por endpoints admin).
- Endpoints públicos de tienda (productos publicados) → lectura pública controlada.
- Verificar **ownership** en accesos por ID (no confiar en IDs del cliente).

## PASO 2 — Rate limiting
- Middleware o helper de rate limit en: `login`, `caja/venta`, `caja/cierre`,
  `auth/register`. Almacén: Upstash Redis / Vercel KV (o limitador en memoria mínimo).
- Devolver 429 al exceder.

## PASO 3 — Endurecer auth/sesión
- Considerar mover el token a cookie `HttpOnly`+`Secure`+`SameSite` (mitiga robo por
  XSS). Si se mantiene en localStorage, documentar el riesgo.
- Revisar expiración del JWT; no incluir datos sensibles en el payload (ya se quitó
  la password en Fase 0B).

## PASO 4 — Limpieza de dependencias
- Quitar `@auth0/nextjs-auth0` (0 usos) del `package.json` y reinstalar.
- Revisar dependencias sin uso.

## PASO 5 — Build verde
- `npm run build` y corregir TODOS los errores de TypeScript/ESLint.
- `next build` type-checkea en build (Next 16). Dejar 0 errores y 0 warnings críticos.
- Optimizar imágenes con `<Image/>` de Next donde aplique (tienda).

## Criterios de aceptación
- [ ] Ningún endpoint sensible accesible sin rol correcto (probar 401/403).
- [ ] Rate limiting activo en login y operaciones de caja (429 al exceder).
- [ ] `@auth0/nextjs-auth0` eliminado.
- [ ] `npm run build` pasa sin errores.
- [ ] Checklist de `docs/SEGURIDAD_Y_AUDITORIA.md` §12 cumplido.
