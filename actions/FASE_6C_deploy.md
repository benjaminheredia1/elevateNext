# FASE 6 · C — Deploy a producción

> Depende de 6B (build verde + seguridad). Ref: `docs/ROADMAP_PRIORIZADO.md` Fase 6,
> AGENTS.md §6. Plataforma recomendada: **Vercel + Postgres gestionado (Neon)**.

## PASO 1 — Base de datos de producción (Neon)
- Crear Postgres en Neon (o vía Marketplace de Vercel). Obtener `DATABASE_URL` con
  pooling.
- Aplicar el schema con **migraciones** (no `db push`):
  `DATABASE_URL=<neon> npx prisma migrate deploy`.
- Sembrar datos base: `DATABASE_URL=<neon> npx prisma db seed` (sucursal, usuarios
  base, cuentas, marcas). Cambiar contraseñas por defecto.

## PASO 2 — Variables de entorno en Vercel
Configurar (Production + Preview):
- `DATABASE_URL` (Neon, con pooling)
- `SECRET_JWT` (secreto fuerte, distinto al de dev)
- `SALT_ROUNDS` (p. ej. 10)
- (si aplica) credenciales de WhatsApp, etc.
> `prisma.config.ts` carga `.env` solo para CLI; en Vercel las envs vienen del panel.

## PASO 3 — Configuración de Prisma para serverless
- Confirmar que `lib/prisma.ts` usa `@prisma/adapter-pg` (ya configurado) — apto para
  Fluid Compute.
- `postinstall`/build debe correr `prisma generate` (agregar a `build` si hace falta:
  `prisma generate && next build`).

## PASO 4 — Deploy
- `vercel` (preview) → verificar → `vercel --prod` (o conectar el repo a Vercel para
  CI/CD por push). Instalar Vercel CLI si falta (`npm i -g vercel`).

## PASO 5 — Verificación en producción (smoke test)
- [ ] Login DUENO/ADMIN → `/admin`; login CAJERO → `/caja`.
- [ ] Cajero: abrir caja, vender, cerrar (diferencia correcta).
- [ ] Admin: contabilidad/flujo/auditoría cargan.
- [ ] Tienda pública: catálogo y creación de pedido.
- [ ] Auditoría registra acciones.
- [ ] HTTPS activo; no hay secretos en el cliente.

## Criterios de aceptación
- [ ] App desplegada en Vercel con BD en Neon.
- [ ] Migraciones aplicadas con `migrate deploy` (reproducible).
- [ ] Smoke test completo en verde.
- [ ] Contraseñas por defecto cambiadas.

> 🎉 Con esto el sistema queda **desplegado y funcional** en producción.
