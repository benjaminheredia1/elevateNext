# 🚀 Onboarding — Fase 6 (Elevate Next)

> Documento para el compañero que va a trabajar la Fase 6 mientras el repo principal se
> afina y testea. Léelo de arriba a abajo antes de tocar código.

---

## 1. Repo y rama de trabajo

```bash
git clone https://github.com/benjaminheredia1/elevateNext.git
cd elevateNext
npm install
```

> Crea una rama nueva para la Fase 6:
> ```bash
> git checkout -b feat/fase-6
> ```

---

## 2. Stack del proyecto

| Pieza | Detalle |
|-------|---------|
| Framework | **Next.js 16 + App Router + React 19 + TypeScript** |
| Base de datos | **PostgreSQL** vía Prisma ORM |
| Auth | JWT custom (`lib/server/auth/session.ts`) + bcrypt |
| Estilos | Tailwind CSS v4 |
| UI/Animaciones | Framer Motion, PrimeReact |
| Mapas | Leaflet |
| Gráficos | Recharts |
| Dev runner | `npm run dev` (Turbopack) |

---

## 3. Arranque local

### Prerequisitos
- Node 20+, npm, **PostgreSQL corriendo**

### Variables de entorno (crear `.env`)
```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/elevate"
SECRET_JWT="super-secreto-de-desarrollo"
SALT_ROUNDS=10
```

### Primeros pasos
```bash
npm install
npx prisma generate          # genera el cliente Prisma
npx prisma db push           # aplica el schema a la BD local
npx prisma db seed           # carga datos base (usuarios, marcas, categorías…)
npm run dev                  # http://localhost:3000
```

> **Credenciales seed por defecto** (cambiar en producción):
> - DUENO: `admin@elevate.com` / `admin123`
> - CAJERO: creado desde `/admin/usuarios`

---

## 4. Convenciones de código (NO romper)

- Todo endpoint con datos sensibles usa `requireAuth(req)` + `requireRole(session, ['ROL'])`.
- Toda mutación auditable llama `logAudit(...)` (ver `lib/server/audit/audit.service.ts`).
- Errores de API se manejan con `handleApiError(error)` (ver `lib/server/errors.ts`).
- DTOs validados con **Zod** en `lib/server/dto/`.
- Mutaciones complejas usan `prisma.$transaction(async (tx) => {...})`.
- Nunca importar Prisma directamente — usar `import prisma from '@/lib/prisma'`.

---

## 5. Estructura de directorios clave

```
app/
  api/admin/         → endpoints protegidos (DUENO/ADMIN)
  api/caja/          → endpoints de cajero
  admin/             → páginas del panel admin (sidebar: AdminPanel.tsx)
  caja/              → módulo cajero
  driver/[token]/    → vista pública del repartidor (GPS)
components/
  admin/AdminPanel.tsx    ← sidebar con nav groups, toasts
  admin/AdminInsumos.tsx  ← inventario completo (ya hecho en Fase 5C)
lib/server/
  auth/session.ts    → requireAuth, requireRole
  audit/             → logAudit
  inventario/        → servicios de inventario, analítica
  dto/               → schemas Zod
prisma/
  schema.prisma      → schema completo (NO modificar schema sin avisarlo)
  seed.ts            → datos semilla
actions/
  README.md          ← tabla de estado de fases ← LEER PRIMERO
  FASE_6*.md         ← specs detalladas de cada tanda
docs/
  SEGURIDAD_Y_AUDITORIA.md
  MODULO_INVENTARIO.md
  BACKEND_IMPLEMENTACION.md
```

---

## 6. Estado actual: lo que ya está hecho

| Fase | Contenido | Estado |
|------|-----------|--------|
| 0A/0B | Schema RBAC/Sucursal/Auditoría + auth + login por rol | ✅ |
| 1A/1B | Schema caja + servicios + endpoints caja | ✅ |
| 2A/2B/2C | Layout cajero + pantallas de operación caja | ✅ |
| 3A/3B/3C | Backend finanzas + contabilidad + gastos fijos | ✅ |
| 4C | Clientes + usuarios + auditoría UI | ✅ |
| 5A/5B/5C | Schema inventario + backend + front (insumos, recetas, analítica, wizard, alertas) | ✅ |

**Todo lo anterior está en el repo y funciona.** Tu trabajo empieza en la Fase 6.

---

## 7. La Fase 6 — Qué hacer y en qué orden

> Las fases van en orden: **6A → 6B → 6C**. Lee el spec completo de cada una en `actions/`.

---

### FASE 6A — Integraciones
**Archivo spec:** `actions/FASE_6A_integraciones.md`

#### Parte 1: Alertas WhatsApp (prioridad alta)
- Crear `lib/server/alertas/whatsapp.service.ts`
- Función `enviarAlerta({ insumos, cfg })` que:
  1. Verifica horario silencioso y anti-spam (campo `ultima_alerta_at` en `ConfiguracionAlerta`)
  2. En modo **demo** (sin credenciales env): guarda un `RegistroAlerta` con `estado='simulated'`
  3. En modo **real**: llama WhatsApp Cloud API o Twilio con las credenciales de `WHATSAPP_*` env vars
- Dispararlo en `app/api/admin/insumos/compra/route.ts`, `merma/route.ts`, `conteo/route.ts` tras actualizar stock
- Agregar botón "Enviar alerta manual" en `app/admin/settings/page.tsx` → `POST /api/admin/alertas/enviar`

**Modelo Prisma relevante:**
```prisma
ConfiguracionAlerta { habilitado, destinatarios, intervalo_minutos,
                       hora_silencio_inicio, hora_silencio_fin,
                       plantilla_mensaje, ultima_alerta_at }
```

#### Parte 2: GPS real del repartidor
- **Endpoint ya existe:** `PUT /api/pedidos/driver/[token]` actualiza `driver_lat/driver_lng`
- Lo que falta:
  - En `app/driver/[token]/page.tsx`: agregar `navigator.geolocation.watchPosition` que haga `PUT` al endpoint cada 10s
  - En `components/admin/AdminDeliverys.tsx`: el polling ya existe; asegurar que los marcadores se actualicen en el mapa sin recarga total (ya usa Leaflet)

#### Parte 3: Promos/reglas horarias en la tienda
- En `app/api/pedidos/route.ts` (o endpoint de productos públicos): al obtener productos, consultar `ReglasHorarias` + `PromocionesDescuentos` activas y aplicar el descuento
- Guardar `descuentoAplicado` en `TransaccionesDetalles`

---

### FASE 6B — Hardening de seguridad
**Archivo spec:** `actions/FASE_6B_hardening.md`

#### PASO 1: Auditar RBAC en todos los endpoints
Usar este patrón en CADA `route.ts` que lo necesite:
```typescript
const session = await requireAuth(req);
requireRole(session, ['DUENO', 'ADMIN']); // ajustar por endpoint
```

- `app/api/admin/*` → `['DUENO', 'ADMIN']`
- `app/api/caja/*` → `['CAJERO', 'DUENO', 'ADMIN']`
- Endpoints públicos de tienda → sin `requireAuth` pero solo datos `publicado: true`

#### PASO 2: Rate limiting en endpoints críticos
- Login (`/api/auth/login`), venta de caja (`/api/caja/venta`), cierre de caja (`/api/caja/cierre`)
- Opción mínima: un `Map` en memoria con ventana deslizante (no requiere Redis para dev)
- Retornar HTTP 429 al exceder

#### PASO 3: Endurecer auth/sesión
- Token actual en `localStorage`. Documentar el riesgo o migrar a cookie `HttpOnly`
- El payload JWT NO debe incluir datos sensibles (ya correcto en Fase 0B)

#### PASO 4: Limpiar dependencias
```bash
npm uninstall @auth0/nextjs-auth0
npm install
```

#### PASO 5: Build verde
```bash
npm run build
```
Corregir **todos** los errores TypeScript y ESLint que aparezcan. El `npm run dev` con Turbopack es más permisivo — el build de producción es más estricto.

---

### FASE 6C — Deploy a producción
**Archivo spec:** `actions/FASE_6C_deploy.md`

1. Crear BD en **Neon** (PostgreSQL serverless, tier gratuito suficiente para demo)
2. `DATABASE_URL=<neon_url> npx prisma migrate deploy` (usa migraciones, no db push)
3. Subir a **Vercel** y configurar env vars:
   - `DATABASE_URL`, `SECRET_JWT`, `SALT_ROUNDS`
   - (opcional) `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` si se implementa integración real
4. Verificar que `package.json` build script corra `prisma generate`:
   ```json
   "build": "prisma generate && next build"
   ```
5. Smoke test completo (ver checklist en el spec)

---

## 8. Flujo de trabajo recomendado

```
feat/fase-6-A  →  PR → merge → feat/fase-6-B  →  PR → merge → feat/fase-6-C
```

Puede hacerse en commits atómicos por parte. Antes de cada PR: `npx tsc --noEmit` debe pasar en verde.

---

## 9. Preguntas frecuentes

**¿Dónde está el schema Prisma completo?**
`prisma/schema.prisma` — 566 líneas. Tiene todos los modelos.

**¿Cómo pruebo el GPS del repartidor?**
Al cambiar un pedido a estado `EN_CAMINO` en `/admin/orders`, se genera un link `/driver/[token]`. Abrirlo en el móvil activa el watchPosition.

**¿Cómo sé qué rol tiene mi usuario?**
`GET /api/auth/me` devuelve el payload del JWT actual.

**¿Hay Docker?**
Sí, hay un `docker-compose.yml` en la raíz con Postgres para desarrollo local.

**¿TypeScript falla en el build?**
`npx tsc --noEmit` — corregir todo antes de PR. No usar `// @ts-ignore` sin justificar.

---

> **Contacto:** Preguntar al propietario del repo (`benjaminheredia1`) cualquier duda de contexto de negocio.
