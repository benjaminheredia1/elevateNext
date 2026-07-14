@AGENTS.md

# Reglas de trabajo del proyecto (obligatorias)

## Base de datos — PRODUCCIÓN COMPARTIDA
- `.env` apunta a la BD **real de producción** (Prisma Postgres en `db.prisma.io`), compartida entre desarrollo local y producción. `npm run dev` lee y escribe datos reales.
- **Nunca** modificar, borrar o insertar datos sin autorización explícita del usuario. Las consultas de diagnóstico deben ser de solo lectura.
- Cambios de estructura: **solo SQL aditivo** (CREATE INDEX, ADD COLUMN, CREATE TABLE). Nada que reescriba o elimine datos existentes.
- **Prohibido `prisma migrate dev`** (resetea la BD por drift) y **prohibido `prisma db push`** contra la BD compartida. Flujo correcto: crear carpeta en `prisma/migrations/<timestamp>_<nombre>/migration.sql` → aplicar con `prisma db execute --file` → registrar con `prisma migrate resolve --applied <nombre>`.
- Antes de crear constraints/índices únicos: verificar con consulta de solo lectura que no existan datos que los violen.
- **Sandbox local para pruebas manuales**: `docker compose up -d` (Postgres local en puerto 5435; el 5433 choca con un Postgres nativo de Windows en esta máquina) → `npm run db:local` (estructura + seed) → `npm run dev:local`. `npm run dev` a secas sigue apuntando a producción. Config en `.env.dev` (copiar de `.env.dev.example` si no existe). En el sandbox sí se puede insertar/borrar datos libremente.

## Tests
- La BD de tests es local y desechable: Docker `elevate_test_pg` en puerto 5434, BD `elevate_db_test` (ver `.env.test`). Levantar con:
  `docker run -d --name elevate_test_pg -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=elevate_db_test -p 5434:5432 postgres:16-alpine`
- `npm test` corre `pretest` (db push + seed) solo contra esa BD local. Jamás apuntar tests a la BD compartida.
- Los tests deben ser **idempotentes**: crear sus propios fixtures (no depender de IDs hardcodeados ni de datos dejados por otras corridas) y limpiar sus datos en `beforeAll`/`afterAll`.
- Antes de dar por terminado un cambio: `npx tsc --noEmit` y `npm test` en verde.

### Qué tipo de prueba escribir (Vitest, archivos junto al código probado)
- **Unitarias** (`*.test.ts` junto al módulo): para lógica pura sin BD — cálculo de precios/promos, validaciones (`assertPublicable`), helpers de fechas, DTOs Zod. Rápidas, sin fixtures.
- **De integración de endpoint** (`route.test.ts` junto a la ruta): importan los handlers (`GET`/`POST`/...) directamente y los ejecutan con `NextRequest` contra la BD de test. Cubrir mínimo: caso feliz, sin token → 401, rol insuficiente → 403, entrada inválida → 400/422, conflicto → 409.
- **E2E de flujo** (`*.e2e.test.ts`): encadenan varios endpoints para verificar un flujo de negocio completo (ej. `baja-restaurar.e2e.test.ts`: DELETE 409 → baja → oculto en tienda → restaurar → publicar). Usar para los flujos que cruzan módulos: pedido→stock, caja→contabilidad, baja→revisión.
- **Toda corrección de bug empieza con un test que lo reproduce** (falla antes del fix, pasa después). Es la prueba de que el bug existía y de que no vuelve (regresión).
- Al escribir una funcionalidad nueva con reglas de negocio (estados, permisos, dinero, stock), los tests del endpoint son parte de la entrega, no opcionales.
- Login en tests: usar los usuarios del seed (`prisma/seed.ts`) — admin `benjaherediaruiz@gmail.com`, cajero `cajero@elevate.com`.

## Patrones de API (seguir los existentes en `app/api/admin/`)
- Autenticación/autorización en **cada** handler: `requireAuth` + `requireRole` (o `guard`). Ningún endpoint que exponga datos de negocio (costos, stock, ventas) puede quedar sin auth.
- Validar entrada con **Zod**; errores vía `handleApiError` y clases de `lib/server/errors` (`ConflictError`, `NotFoundError`, `ValidationError`).
- Registrar acciones administrativas con `logAudit`.
- Precios y totales se calculan **server-side** (nunca confiar en montos enviados por el cliente).
- Las reglas de negocio se validan en el backend; el filtro de la UI no cuenta como validación.
- No dejar endpoints legacy duplicados: si una ruta nueva reemplaza a otra, eliminar la vieja (verificando antes con grep que nadie la use).

## Eliminación de registros con historial (productos, insumos)
- **Nunca borrado físico** si hay ventas/movimientos asociados: usar baja lógica (`estado_publicacion = 'BAJA'` + `motivo_baja` + `fecha_baja`). Así los reportes históricos nunca muestran `null`.
- Borrado físico solo permitido cuando no existen referencias (productos de prueba), dentro de una transacción que limpie relaciones de catálogo, con auditoría. Con referencias → responder `409` sugiriendo la baja.
- Integridad en dos capas: validación en el endpoint (mensaje amigable) + constraint/índice único en la BD (garantía final). Ojo: en Postgres las uniques con columnas NULL no bloquean duplicados con NULL; usar índice parcial (`WHERE col IS NULL`).

## Fechas y zona horaria
- El negocio opera en Bolivia (`America/La_Paz`, UTC-4 fijo); producción corre en UTC. **Nunca** usar `new Date('YYYY-MM-DD')`, `setHours(0,0,0,0)` ni `toISOString().slice(0,10)` para definir el "día" de un reporte: producen días corridos según la zona del servidor/navegador.
- Usar siempre los helpers de `lib/server/fechas.ts` (`rangoDiaNegocio`, `inicioMesNegocio`, `horaNegocio`, `hoyISO`) en el backend, y fecha local (no UTC) en el frontend.

## Seguridad
- **Secretos solo en variables de entorno** (`SECRET_JWT`, `DATABASE_URL`, etc.). Nunca hardcodearlos en código, commitearlos ni imprimirlos en logs o respuestas. `.env` no se commitea.
- **Sesión**: JWT firmado (`lib/auth.ts`) entregado en cookie `httpOnly` + `secure` + `sameSite` (`lib/server/auth/cookies.ts`). Nunca guardar tokens en `localStorage` ni exponerlos a JS del navegador.
- **Contraseñas**: solo hasheadas con bcrypt (`SALT_ROUNDS`). Jamás en texto plano, en logs, ni incluidas en respuestas (omitir siempre `password` al serializar usuarios).
- **Errores**: al cliente van mensajes genéricos; el detalle técnico (stack, error de Prisma) solo a `console.error` del servidor. Nunca `details: String(error)` en producción. En endpoints de auth, no revelar si el usuario existe o si falló la contraseña (respuesta genérica "credenciales inválidas").
- **Autorización siempre server-side y por handler**: `requireAuth` + `requireRole` / `guard`. Que la UI oculte un botón no protege nada; el rol se verifica en el endpoint. Roles: DUENO/ADMIN operan el negocio, CAJERO opera caja/pedidos.
- **Nunca interpolar SQL con datos del usuario**: usar el query builder de Prisma o `$queryRaw` con template literals (parametrizado).
- Parámetros numéricos de URL: validar con Zod o comprobar `Number.isInteger` — un `parseInt(id)` con `NaN` no debe llegar a Prisma.

## Arquitectura y código (nivel del codebase, mantenerlo)
- **Capas**: rutas en `app/api/**` delgadas (HTTP: auth, validación Zod, respuesta) → lógica de negocio en `lib/server/<dominio>/*.service.ts` → acceso a datos solo vía `lib/prisma.ts`. No meter lógica de negocio en componentes ni queries de Prisma en el frontend.
- **Escrituras multi-paso** (crear + relaciones + auditoría): siempre dentro de `prisma.$transaction` para que fallen o se apliquen completas.
- **DTOs con Zod** en `lib/server/dto/` compartidos entre endpoints; no redefinir shapes a mano.
- **Reutilizar helpers existentes** antes de escribir lógica nueva: precios (`lib/server/productos/precio.ts`), disponibilidad (`lib/server/inventario/disponibilidad.ts`), fechas (`lib/server/fechas.ts`), errores (`lib/server/errors.ts`). Duplicar lógica de dinero/stock es fuente de bugs contables.
- **TypeScript estricto**: evitar `any` en código nuevo; tipar respuestas de API. Dinero: `Decimal` en BD, convertir con cuidado (`Number` solo al final, para presentación).
- Idioma del codebase: nombres, comentarios y mensajes en español; mantener consistencia con lo existente.

## Git
- El usuario hace sus propios commits y push. No commitear, no pushear, no amend, salvo pedido explícito.
