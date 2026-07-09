# Diseño: Fotos opcionales en productos + infraestructura de testing (Vitest)

## Contexto

El requerimiento (documento "Requerimientos Adicionales Elevate"): permitir cargar/publicar productos sin foto obligatoria, pudiendo agregarla después. El usuario también pidió introducir un framework de tests ahora, para empezar a cubrir esta y futuras features con pruebas automatizadas (el proyecto hoy no tiene ninguno: sin jest/vitest/playwright, sin archivos `*.test.*`).

## Investigación del estado actual

`Producto.imagen_url` ya es opcional en tres de las cuatro capas relevantes:
- **Prisma schema**: `imagen_url String?` (`prisma/schema.prisma:223`) — ya nullable.
- **Validación Zod**: `imagen_url: ImagenProductoSchema.optional()` (`lib/server/dto/inventario.dto.ts:66`) — ya opcional.
- **Tienda pública**: `app/page.tsx:357-364` ya renderiza un placeholder (`product-image-placeholder`) cuando `imageUrl` es falsy — no requiere cambios.
- **Guardar borrador**: el wizard (`components/admin/AdminProductWizard.tsx`) ya permite "Guardar borrador" sin foto — `save(false)` no valida el gate de publicación.

La única capa que exige foto es el **gate de publicación** (transición a `estado_publicacion: 'PUBLICADO'`), duplicado en dos lugares:
1. Backend — `lib/server/productos/publicacion.ts:23`: `if (!producto.imagen_url?.trim()) faltantes.push('imagen');` dentro de `faltantesPublicacion()`, usada por `assertPublicable()`, llamada desde `app/api/admin/productos/route.ts` (POST), `app/api/admin/productos/[id]/route.ts` (PUT y PATCH).
2. Frontend — `components/admin/AdminProductWizard.tsx:118`: `if (!p.imagen_url?.trim()) gate.push('Agrega una foto del producto.');`, que alimenta `canPublish` y bloquea visualmente el botón "Publicar al menú" en el paso "Revisar".

## Decisión de alcance (confirmada con el usuario)

Quitar la foto de los requisitos de publicación en ambos lugares. Nada más cambia — no se toca el schema, la validación Zod, ni la tienda pública, porque ya soportan esto correctamente.

## 1. Cambio de producto: foto opcional

### Backend (`lib/server/productos/publicacion.ts`)
Eliminar la línea:
```ts
if (!producto.imagen_url?.trim()) faltantes.push('imagen');
```
de `faltantesPublicacion()`. El resto de las validaciones (nombre, descripción, precio, menú, receta/insumo de reventa) permanecen intactas.

### Frontend (`components/admin/AdminProductWizard.tsx`)
Eliminar la línea:
```tsx
if (!p.imagen_url?.trim()) gate.push('Agrega una foto del producto.');
```
del array `gate`. El resto de las condiciones del gate permanecen intactas.

## 2. Infraestructura de testing (Vitest)

### Dependencias nuevas (devDependencies)
- `vitest`
- `vite-tsconfig-paths` (resuelve automáticamente el alias `@/*` de `tsconfig.json` sin duplicar configuración)

### Base de datos de test
Mismo contenedor Docker `elevate_postgres` (puerto 5433), pero una base de datos separada: `elevate_db_test`. No requiere infraestructura nueva — Prisma crea la base automáticamente al correr `db push` contra una URL cuya base de datos no existe todavía (el usuario `elevate_user` del contenedor tiene privilegios suficientes).

### `.env.test` (nuevo archivo, ya cubierto por el `.gitignore` existente `.env*`)
```
DATABASE_URL="postgres://elevate_user:elevate_pass123@localhost:5433/elevate_db_test"
SECRET_JWT="KAFJCMDAFJCJDLAQPFWMASDPADUWQPWM"
SALT_ROUNDS=10
```
(Mismos valores no-sensibles de `SECRET_JWT`/`SALT_ROUNDS` que `.env.local`, ya que es un proyecto local de desarrollo.)

### `vitest.config.ts` (nuevo, raíz del proyecto)
- Plugin `vite-tsconfig-paths` para resolver `@/*`.
- `test.setupFiles`: un script (`vitest.setup.ts`) que carga `.env.test` vía `dotenv.config({ path: '.env.test' })` **antes** de que Vitest importe cualquier archivo de test — esto es crítico porque `lib/prisma.ts` lee `process.env.DATABASE_URL` una sola vez al importarse (patrón singleton), así que el env debe estar seteado antes de la primera importación de `@/lib/prisma` (directa o indirecta, vía cualquier route handler).
- `test.environment: 'node'` (no se testean componentes React en este alcance).

### Scripts nuevos en `package.json`
```json
"test": "vitest run",
"test:watch": "vitest",
"pretest": "dotenv -e .env.test -- prisma db push"
```
(`pretest` corre automáticamente antes de `npm test`/`npm run test` vía la convención npm de scripts `pre*`, sincronizando el schema contra `elevate_db_test` antes de cada corrida. Ese hook automático **no** aplica a `test:watch` — para modo watch, correr `npm test` al menos una vez primero deja `elevate_db_test` sincronizada. Requiere agregar `dotenv-cli` como devDependency para poder pasarle un archivo de env distinto al comando `prisma db push` sin afectar `.env`/`.env.local`.)

### Convención de tests
Co-ubicados junto al código: `archivo.ts` → `archivo.test.ts` (convención estándar de Vitest, sin carpeta `__tests__` separada).

### Patrón para tests de integración de rutas API
No se levanta un servidor HTTP real. Se importan las funciones exportadas (`POST`, `PUT`, etc.) directamente desde el `route.ts` correspondiente y se invocan con un `NextRequest` construido a mano:

```ts
import { POST } from '@/app/api/admin/productos/route';
import { login } from '@/lib/auth';
import { NextRequest } from 'next/server';

const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
const request = new NextRequest('http://localhost/api/admin/productos', {
  method: 'POST',
  headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ /* ... */ }),
});
const response = await POST(request);
expect(response.status).toBe(201);
```

`login()` se llama directamente (no por HTTP) y corre contra la base de test real vía el mismo `lib/prisma.ts` ya apuntado a `elevate_db_test` por el setup. El middleware de auth (`requireAuth` en `lib/server/auth/session.ts`) ya soporta `Authorization: Bearer <token>` además de la cookie, así que no hace falta simular cookies en los tests.

Esto es una prueba de integración real: ejercita el route handler real, la validación Zod real, y Prisma real contra Postgres real — sin mocks.

## 3. Tests para esta feature

### Unit: `lib/server/productos/publicacion.test.ts`
Verifica `faltantesPublicacion()`/`assertPublicable()`:
- Un producto completo SIN `imagen_url` → no aparece "imagen" en los faltantes, se puede publicar.
- Un producto sin nombre/descripción/precio/menú/receta → cada uno sigue apareciendo en los faltantes (para no romper el resto del gate por accidente al tocar esta función).

No requiere base de datos — son funciones puras.

### Integración: `app/api/admin/productos/route.test.ts`
- `POST /api/admin/productos` con `estado_publicacion: 'PUBLICADO'` y sin `imagen_url` → 201, el producto queda creado con `estado_publicacion: 'PUBLICADO'`.
- Mismo caso vía `PUT /api/admin/productos/[id]` sobre un producto ya existente.

Cada test crea sus propios datos (categoría/marca/insumo mínimos necesarios) y no depende de datos sembrados por otros tests, para poder correr en cualquier orden.

## Fuera de alcance

- No se testean componentes React (`AdminProductWizard.tsx`) en esta iteración — el cambio ahí es una eliminación de una línea de validación, cubierta indirectamente por los tests de integración del backend (que es la fuente de verdad real).
- No se migra ningún test existente (no hay ninguno).
- No se toca CI/CD — correr `npm test` queda como paso manual por ahora.
