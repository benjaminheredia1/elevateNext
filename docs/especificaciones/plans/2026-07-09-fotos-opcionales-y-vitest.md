# Fotos Opcionales en Productos + Infraestructura Vitest Implementation Plan

> Plan de implementación por tareas; los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Permitir publicar un producto sin foto (agregándola después), e introducir Vitest como framework de tests del proyecto, empezando por cubrir este mismo cambio.

**Architecture:** El único cambio funcional es eliminar la validación de `imagen_url` del gate de publicación, duplicada en backend (`lib/server/productos/publicacion.ts`, la fuente de verdad) y frontend (`components/admin/AdminProductWizard.tsx`). Todo lo demás (schema, Zod, tienda pública, guardar borrador) ya soporta productos sin foto y no se toca. Vitest se configura con una base de datos de test dedicada (`elevate_db_test`, mismo contenedor Docker que el dev, puerto 5433) para correr tests de integración reales sin mocks.

**Tech Stack:** Next.js App Router (route handlers), Prisma 7, PostgreSQL, Vitest, `vite-tsconfig-paths`, `dotenv-cli`.

## Global Constraints

- Sin conversión ni cambios de schema — el campo `Producto.imagen_url` ya es `String?` opcional.
- No tocar `app/page.tsx` (ya maneja el placeholder sin foto) ni la validación Zod (`lib/server/dto/inventario.dto.ts`, ya opcional).
- Base de datos de test: `postgres://elevate_user:elevate_pass123@localhost:5433/elevate_db_test` (mismo contenedor `elevate_postgres` que dev, otra base). Requiere `docker compose up -d postgres` corriendo.
- `.env.test` es un archivo nuevo, ya cubierto por el `.gitignore` existente (`.env*`).
- Login de prueba (ya sembrado, disponible tanto en dev como en el test DB tras el seed): `benjaherediaruiz@gmail.com` / `benja122` (rol DUENO).
- El proyecto no tenía test framework — after this plan, la convención pasa a ser: unit tests para funciones puras, tests de integración importando los route handlers directamente (sin servidor HTTP, sin mocks de Prisma) contra `elevate_db_test`.

---

## File Structure

- **Modificar** `lib/server/productos/publicacion.ts` — quitar la línea que exige `imagen_url`.
- **Modificar** `components/admin/AdminProductWizard.tsx` — quitar la línea equivalente del gate del frontend.
- **Modificar** `package.json` — nuevas devDependencies (`vitest`, `vite-tsconfig-paths`, `dotenv-cli`) y scripts (`test`, `test:watch`, `pretest`).
- **Crear** `vitest.config.ts` — configuración raíz de Vitest.
- **Crear** `vitest.setup.ts` — carga `.env.test` antes de que se importe cualquier módulo de la app (crítico para el singleton de `lib/prisma.ts`).
- **Crear** `.env.test` — credenciales de la base de datos de test.
- **Crear** `lib/prisma.test.ts` — smoke test: confirma que Vitest está conectado a `elevate_db_test`, no a la base de dev.
- **Crear** `lib/server/productos/publicacion.test.ts` — unit tests de `faltantesPublicacion`/`assertPublicable`.
- **Crear** `app/api/admin/productos/route.test.ts` — test de integración de `POST`.
- **Crear** `app/api/admin/productos/[id]/route.test.ts` — test de integración de `PUT`.

---

### Task 1: Quitar la foto de los requisitos de publicación

**Files:**
- Modify: `lib/server/productos/publicacion.ts:23`
- Modify: `components/admin/AdminProductWizard.tsx:118`

**Interfaces:**
- No cambia ninguna firma. `faltantesPublicacion(producto: ProductoPublicable): string[]` y `assertPublicable(producto: ProductoPublicable): void` mantienen su contrato exacto.

- [ ] **Step 1: Quitar la validación de imagen en el backend**

En `lib/server/productos/publicacion.ts`, dentro de `faltantesPublicacion`, elimina esta línea:

```ts
  if (!producto.imagen_url?.trim()) faltantes.push('imagen');
```

La función debe quedar así (nota: `imagen_url` sigue en el tipo `ProductoPublicable` porque el objeto completo se sigue pasando; simplemente ya no se valida):

```ts
export function faltantesPublicacion(producto: ProductoPublicable) {
  const faltantes: string[] = [];

  if (!producto.nombre.trim()) faltantes.push('nombre');
  if (!producto.descripcion.trim()) faltantes.push('descripcion');
  if (!(monto(producto.precio) > 0)) faltantes.push('precio de venta');
  if (producto.marcas.length === 0) faltantes.push('menu donde aparecera');

  if (producto.tipo === 'REVENTA') {
    if (!producto.insumo_reventa_id && !producto.tiene_nuevo_insumo_reventa) faltantes.push('insumo de reventa');
  } else {
    const recetaValida = producto.recetaProducto_id.length > 0
      && producto.recetaProducto_id.every((item) => item.insumo_id > 0 && item.cantidad_utilizada > 0);
    if (!recetaValida) faltantes.push('receta con insumos y cantidades validas');
  }

  return faltantes;
}
```

- [ ] **Step 2: Quitar la validación de imagen en el wizard del frontend**

En `components/admin/AdminProductWizard.tsx`, dentro del bloque `/* ---- gate de publicación ---- */`, elimina esta línea:

```tsx
  if (!p.imagen_url?.trim()) gate.push('Agrega una foto del producto.');
```

El bloque debe quedar así:

```tsx
  /* ---- gate de publicación ---- */
  const gate: string[] = [];
  if (!p.nombre.trim()) gate.push('Define el nombre del producto.');
  if (!p.descripcion.trim()) gate.push('Agrega una descripción.');
  if (!(p.precio > 0)) gate.push('Define un precio de venta.');
  if (p.marcas.length === 0) gate.push('Asigna al menos un menú.');
  if (
    p.tipo === 'ELABORADO'
    && (p.receta.length === 0 || p.receta.some(item => !item.insumo_id || !(item.cantidad_utilizada > 0)))
  ) gate.push('Falta la ficha técnica con insumos y cantidades válidas.');
  if (p.tipo === 'REVENTA' && !(reventaInsumo.costo_unitario > 0)) gate.push('Define el costo unitario del insumo de reventa.');
  const canPublish = gate.length === 0;
```

- [ ] **Step 3: Verificar manualmente contra el servidor de dev**

Con `npm run dev` corriendo y sesión iniciada (`benjaherediaruiz@gmail.com` / `benja122`):

```bash
curl -s -c /tmp/cookies-fotos.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"benjaherediaruiz@gmail.com","password":"benja122"}' -o /dev/null -w "login: %{http_code}\n"

MARCA_ID=$(curl -s -b /tmp/cookies-fotos.txt http://localhost:3000/api/admin/marcas | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "marca id: $MARCA_ID"

curl -s -b /tmp/cookies-fotos.txt -X POST http://localhost:3000/api/admin/productos \
  -H "Content-Type: application/json" \
  -d "{\"nombre\":\"Test sin foto\",\"descripcion\":\"Verificacion manual\",\"precio\":20,\"tipo\":\"REVENTA\",\"estado_publicacion\":\"PUBLICADO\",\"marcas\":[$MARCA_ID],\"nuevo_insumo_reventa\":{\"unidad_medida\":\"UNIDAD\",\"stock\":5,\"costo_unitario\":10}}"
```

Expected: `201` con `"data":{"...","estado_publicacion":"PUBLICADO","imagen_url":null,...}` — el producto se publica sin foto.

Verifica también que el gate SIGUE bloqueando por falta de menú (sin `marcas`):

```bash
curl -s -b /tmp/cookies-fotos.txt -X POST http://localhost:3000/api/admin/productos \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test sin menu","descripcion":"Debe fallar","precio":20,"tipo":"REVENTA","estado_publicacion":"PUBLICADO","nuevo_insumo_reventa":{"unidad_medida":"UNIDAD","stock":5,"costo_unitario":10}}'
```

Expected: `422` con `"error":"No se puede publicar: falta menu donde aparecera."` (sin mencionar "imagen").

Borra el producto de prueba creado en el primer curl para no dejar basura (usa el `id` del response):

```bash
curl -s -b /tmp/cookies-fotos.txt -X DELETE http://localhost:3000/api/admin/productos/<id>
```

- [ ] **Step 4: Commit**

```bash
git add lib/server/productos/publicacion.ts components/admin/AdminProductWizard.tsx
git commit -m "feat: permitir publicar productos sin foto obligatoria"
```

---

### Task 2: Infraestructura de Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `.env.test`
- Create: `lib/prisma.test.ts`

**Interfaces:**
- Produces: comando `npm test` (corre `pretest` + `vitest run`), comando `npm run test:watch`.
- Consumes: contenedor Docker `elevate_postgres` (puerto 5433) ya corriendo.

- [ ] **Step 1: Instalar dependencias**

```bash
npm install -D vitest vite-tsconfig-paths dotenv-cli
```

- [ ] **Step 2: Crear `.env.test`**

Crea `.env.test` en la raíz del proyecto:

```
DATABASE_URL="postgres://elevate_user:elevate_pass123@localhost:5433/elevate_db_test"
DATABASE_URL_PRISMA_DATABASE_URL="postgres://elevate_user:elevate_pass123@localhost:5433/elevate_db_test"
SECRET_JWT="KAFJCMDAFJCJDLAQPFWMASDPADUWQPWM"
SALT_ROUNDS=10
```

**Importante:** hay que definir AMBAS variables, no solo `DATABASE_URL`. `prisma.config.ts` (raíz del proyecto) no lee `DATABASE_URL` — lee específicamente `DATABASE_URL_PRISMA_DATABASE_URL` para las operaciones del CLI (`prisma db push`, `prisma db seed`), y además hace su propio `dotenv.config()` (carga `.env`, sin path) al arrancar. Si `.env.test` solo definiera `DATABASE_URL`, el CLI de Prisma (`db push`/`db seed` del `pretest`) caería en el valor de `DATABASE_URL_PRISMA_DATABASE_URL` del `.env` raíz — que apunta a `elevate_db` (la base de **dev**, no la de test) — y `pretest` sincronizaría/sembraría silenciosamente la base equivocada. `DATABASE_URL` (sin el sufijo) es la que lee `lib/prisma.ts` en tiempo de ejecución de los tests (usada por los route handlers y por Prisma dentro de los tests mismos), así que ambas deben apuntar a `elevate_db_test`.

- [ ] **Step 3: Crear `vitest.setup.ts`**

Crea `vitest.setup.ts` en la raíz del proyecto:

```ts
import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '.env.test'), override: true });
```

Este archivo debe cargar el env **antes** de que Vitest importe cualquier archivo de test — por eso va en `test.setupFiles`, no como un test más.

- [ ] **Step 4: Crear `vitest.config.ts`**

Crea `vitest.config.ts` en la raíz del proyecto:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

- [ ] **Step 5: Agregar los scripts a `package.json`**

Reemplaza:

```json
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint",
    "electron:dev": "electron .",
    "electron:build": "electron-builder build --win"
  },
```

por:

```json
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint",
    "electron:dev": "electron .",
    "electron:build": "electron-builder build --win",
    "pretest": "dotenv -e .env.test -- prisma db push && dotenv -e .env.test -- prisma db seed",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

`pretest` corre automáticamente antes de `npm test` (convención npm de scripts `pre*`): sincroniza el schema y siembra los datos base (usuarios, marcas) en `elevate_db_test`. Este hook no aplica a `test:watch` — corre `npm test` una vez antes de usar `test:watch` para dejar la base sincronizada.

- [ ] **Step 6: Crear el smoke test de conexión**

Crea `lib/prisma.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import prisma from '@/lib/prisma';

describe('base de datos de test', () => {
  it('esta conectada a elevate_db_test, no a la base de dev', async () => {
    expect(process.env.DATABASE_URL).toContain('elevate_db_test');
    const count = await prisma.usuario.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 7: Correr los tests**

```bash
npm test
```

Expected: la salida muestra primero `prisma db push`/`prisma db seed` corriendo contra `elevate_db_test` (crea la base la primera vez), y luego `1 passed` del smoke test, sin errores.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts lib/prisma.test.ts
git commit -m "feat: agregar Vitest con base de datos de test dedicada"
```

Nota: `.env.test` NO se commitea (ya cubierto por `.gitignore: .env*`), igual que `.env`/`.env.local`.

---

### Task 3: Unit tests de la lógica de publicación

**Files:**
- Create: `lib/server/productos/publicacion.test.ts`

**Interfaces:**
- Consumes: `faltantesPublicacion(producto: ProductoPublicable): string[]`, `assertPublicable(producto: ProductoPublicable): void`, y el tipo `ProductoPublicable` — todos exportados de `lib/server/productos/publicacion.ts` (Task 1, sin cambios de firma).

- [ ] **Step 1: Escribir los tests**

Crea `lib/server/productos/publicacion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { faltantesPublicacion, assertPublicable, type ProductoPublicable } from './publicacion';

const productoCompleto: ProductoPublicable = {
  nombre: 'Bowl de pollo',
  descripcion: 'Bowl con pollo, arroz y vegetales',
  precio: 45,
  imagen_url: null,
  tipo: 'ELABORADO',
  insumo_reventa_id: null,
  marcas: [1],
  recetaProducto_id: [{ cantidad_utilizada: 1, insumo_id: 1 }],
};

describe('faltantesPublicacion', () => {
  it('no exige imagen_url', () => {
    const faltantes = faltantesPublicacion(productoCompleto);
    expect(faltantes).not.toContain('imagen');
  });

  it('sigue exigiendo nombre', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, nombre: '  ' });
    expect(faltantes).toContain('nombre');
  });

  it('sigue exigiendo descripcion', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, descripcion: '' });
    expect(faltantes).toContain('descripcion');
  });

  it('sigue exigiendo precio de venta positivo', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, precio: 0 });
    expect(faltantes).toContain('precio de venta');
  });

  it('sigue exigiendo al menos un menu', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, marcas: [] });
    expect(faltantes).toContain('menu donde aparecera');
  });

  it('sigue exigiendo receta valida para productos ELABORADO', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, recetaProducto_id: [] });
    expect(faltantes).toContain('receta con insumos y cantidades validas');
  });

  it('sigue exigiendo insumo de reventa para productos REVENTA', () => {
    const faltantes = faltantesPublicacion({
      ...productoCompleto,
      tipo: 'REVENTA',
      insumo_reventa_id: null,
      tiene_nuevo_insumo_reventa: false,
    });
    expect(faltantes).toContain('insumo de reventa');
  });
});

describe('assertPublicable', () => {
  it('no lanza error para un producto completo sin imagen_url', () => {
    expect(() => assertPublicable(productoCompleto)).not.toThrow();
  });

  it('lanza error si falta el nombre', () => {
    expect(() => assertPublicable({ ...productoCompleto, nombre: '' })).toThrow();
  });
});
```

- [ ] **Step 2: Correr los tests**

```bash
npx vitest run lib/server/productos/publicacion.test.ts
```

Expected: `9 passed` (o el número exacto de `it(...)` de arriba), sin fallos.

- [ ] **Step 3: Commit**

```bash
git add lib/server/productos/publicacion.test.ts
git commit -m "test: cubrir faltantesPublicacion/assertPublicable sin exigir imagen"
```

---

### Task 4: Tests de integración de las rutas de productos

**Files:**
- Create: `app/api/admin/productos/route.test.ts`
- Create: `app/api/admin/productos/[id]/route.test.ts`

**Interfaces:**
- Consumes: `POST` de `app/api/admin/productos/route.ts` (Task 1, sin cambio de firma: `(req: NextRequest) => Promise<NextResponse>`); `PUT` de `app/api/admin/productos/[id]/route.ts` (`(req: NextRequest, { params }: { params: Promise<{ id: string }> }) => Promise<NextResponse>`); `login(identifier: string, password: string)` de `lib/auth.ts` (devuelve `{ access_token: string, user: {...} }`); `prisma` default export de `lib/prisma.ts`.
- Depende de Task 2 (Vitest configurado, `elevate_db_test` sembrada con el usuario admin y las marcas base) y Task 1 (el gate ya no exige imagen).

- [ ] **Step 1: Escribir el test de integración de `POST`**

Crea `app/api/admin/productos/route.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

describe('POST /api/admin/productos', () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.producto.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it('publica un producto sin imagen_url', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const marca = await prisma.marca.findFirstOrThrow();

    const request = new NextRequest('http://localhost/api/admin/productos', {
      method: 'POST',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Producto de test sin foto',
        descripcion: 'Creado por el test de integracion',
        precio: 20,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        marcas: [marca.id],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 5, costo_unitario: 10 },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.estado_publicacion).toBe('PUBLICADO');
    expect(body.data.imagen_url).toBeNull();

    createdIds.push(body.data.id);
  });
});
```

- [ ] **Step 2: Correr el test de `POST` y verificar que pasa**

```bash
npx vitest run app/api/admin/productos/route.test.ts
```

Expected: `1 passed`.

- [ ] **Step 3: Escribir el test de integración de `PUT`**

Crea `app/api/admin/productos/[id]/route.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

describe('PUT /api/admin/productos/[id]', () => {
  const createdIds: number[] = [];

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.producto.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it('publica un producto existente sin imagen_url', async () => {
    const { access_token } = await login('benjaherediaruiz@gmail.com', 'benja122');
    const marca = await prisma.marca.findFirstOrThrow();

    const existente = await prisma.producto.create({
      data: {
        nombre: 'Producto de test para editar',
        descripcion: 'Borrador inicial',
        precio: 15,
        tipo: 'REVENTA',
        estado_publicacion: 'BORRADOR',
      },
    });
    createdIds.push(existente.id);

    const request = new NextRequest(`http://localhost/api/admin/productos/${existente.id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: existente.nombre,
        descripcion: existente.descripcion,
        precio: 15,
        tipo: 'REVENTA',
        estado_publicacion: 'PUBLICADO',
        marcas: [marca.id],
        nuevo_insumo_reventa: { unidad_medida: 'UNIDAD', stock: 3, costo_unitario: 8 },
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: String(existente.id) }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.estado_publicacion).toBe('PUBLICADO');
    expect(body.data.imagen_url).toBeNull();
  });
});
```

- [ ] **Step 4: Correr todos los tests del proyecto**

```bash
npm test
```

Expected: todos los tests pasan (smoke test de Task 2 + unit tests de Task 3 + los dos de integración de esta tarea), sin fallos ni warnings.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/productos/route.test.ts" "app/api/admin/productos/[id]/route.test.ts"
git commit -m "test: cubrir POST/PUT de productos publicando sin imagen_url"
```

---

## Fuera de alcance

- No se testean componentes React (`AdminProductWizard.tsx`) — el cambio ahí es una eliminación de una línea de validación de UI, cubierta indirectamente porque el backend (fuente de verdad) ya lo exige/permite correctamente.
- No se agrega CI — correr `npm test` queda como paso manual.
- No se toca el enum hardcodeado `NuevoInsumoReventaSchema.unidad_medida` (`lib/server/dto/inventario.dto.ts:53`) ni el tipo local `UnidadMedida`/`UNIDADES` de `AdminProductWizard.tsx` — ambos siguen usando la lista fija KG/GR/UNIDAD/LT/ML en vez del catálogo dinámico de unidades. Es una limitación conocida y preexistente, fuera del alcance de este plan.
