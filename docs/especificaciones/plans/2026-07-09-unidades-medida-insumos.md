# Unidades de Medida Administrables Implementation Plan

> Plan de implementación por tareas; los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Reemplazar el enum fijo `Unidad_medida` (KG/GR/UNIDAD/LT/ML) por un catálogo administrable (`UnidadMedida`) que el admin puede crear/editar/desactivar desde el módulo de Insumos, con un botón de alta rápida dentro del formulario de crear/editar insumo.

**Architecture:** `Insumo.unidad_medida` pasa de enum a `String` libre (sin llave foránea). Una tabla nueva `UnidadMedida` sirve solo como catálogo/fuente de opciones para los selectores — no se toca ningún otro archivo de los ~18 que ya leen `insumo.unidad_medida` como texto. Endpoints REST nuevos (`/api/unidades-medida`, `/api/unidades-medida/[id]`) siguen el mismo patrón que `/api/categoria` (guard de rol simple, sin capas extra). El frontend agrega una pestaña "Unidades" y un botón "+ Nueva" en `components/admin/AdminInsumos.tsx`.

**Tech Stack:** Next.js App Router (route handlers), Prisma 7 + `@prisma/adapter-pg`, PostgreSQL, React 19 (cliente `'use client'`), axios (`apiClient`).

## Global Constraints

- Sin conversión entre unidades — `nombre` es una etiqueta descriptiva, nada más (del spec).
- Sin llave foránea entre `Insumo.unidad_medida` y `UnidadMedida` — el campo del insumo sigue siendo `String` libre (del spec).
- No modificar los archivos que ya consumen `insumo.unidad_medida` como string (recetas, movimientos, insumos mixtos, productos reventa, dashboard, reportes, alertas WhatsApp, `AdminProductWizard.tsx`) — quedan fuera de alcance explícitamente.
- Este proyecto no tiene framework de tests (no hay `jest`/`vitest`/`playwright` en `package.json`, no hay archivos `*.test.*`). La verificación de cada tarea es manual: `npx tsc --noEmit`, curl contra el servidor de dev, y/o inspección directa de la base con `docker exec elevate_postgres psql`. No introducir un framework de testing nuevo solo para este feature.
- Base de datos local: contenedor Docker `elevate_postgres` (`docker-compose.yml`, puerto 5433, db `elevate_db`, usuario `elevate_user`). Debe estar corriendo (`docker compose up -d postgres`) antes de cualquier paso de verificación contra la base.
- Servidor de dev: `npm run dev` en `http://localhost:3000`. Reiniciarlo después de cambios de schema (el cliente Prisma se cachea en `global.prisma`, ver `lib/prisma.ts`).
- Login de prueba (admin/DUENO, ya sembrado): `benjaherediaruiz@gmail.com` / `benja122`.

---

## File Structure

- **Modificar** `prisma/schema.prisma` — nuevo modelo `UnidadMedida`; `Insumo.unidad_medida` pasa de enum a `String`; se elimina el enum `Unidad_medida`.
- **Modificar** `prisma/seed.ts` — upsert idempotente de las 5 unidades base (KG, GR, UNIDAD, LT, ML).
- **Crear** `app/api/unidades-medida/route.ts` — `GET` (lista, filtro opcional `?activo=true`), `POST` (crear, guard ADMIN).
- **Crear** `app/api/unidades-medida/[id]/route.ts` — `PUT` (editar nombre/activo, guard ADMIN), `DELETE` (eliminar si no está en uso, guard ADMIN).
- **Modificar** `components/admin/AdminInsumos.tsx` — pestaña "Unidades", selects de unidad alimentados por el catálogo, botón "+ Nueva" con mini-modal superpuesto.

---

### Task 1: Modelo de datos — tabla `UnidadMedida` y migración de `Insumo.unidad_medida`

**Files:**
- Modify: `prisma/schema.prisma:266-300`

**Interfaces:**
- Produces: modelo Prisma `UnidadMedida { id, nombre, activo, created_at, update_at }`; `Insumo.unidad_medida` ahora tipo `String` (antes `Unidad_medida`).

- [ ] **Step 1: Reemplazar el enum `Unidad_medida` por el modelo `UnidadMedida` y cambiar el tipo de `Insumo.unidad_medida`**

En `prisma/schema.prisma`, reemplaza este bloque (líneas 266-272):

```prisma
enum Unidad_medida {
  KG
  GR
  UNIDAD
  LT
  ML
}
```

por:

```prisma
model UnidadMedida {
  id         Int      @id @default(autoincrement())
  nombre     String   @unique
  activo     Boolean  @default(true)
  created_at DateTime @default(now())
  update_at  DateTime @updatedAt
}
```

Luego, en el modelo `Insumo` (línea ~279), cambia:

```prisma
  unidad_medida        Unidad_medida
```

por:

```prisma
  unidad_medida        String
```

- [ ] **Step 2: Aplicar el cambio a la base de datos**

Asegúrate de que el contenedor esté corriendo:

```bash
docker compose up -d postgres
```

Aplica el schema:

```bash
npx prisma db push
```

Expected output: `Your database is now in sync with your Prisma schema. Done in ...ms` (sin errores). Esto regenera también el cliente Prisma.

- [ ] **Step 3: Verificar el cambio directamente en la base**

```bash
docker exec elevate_postgres psql -U elevate_user -d elevate_db -c "\d \"UnidadMedida\""
docker exec elevate_postgres psql -U elevate_user -d elevate_db -c "\d \"Insumo\"" | grep unidad_medida
```

Expected: la primera muestra las columnas `id, nombre, activo, created_at, update_at` con `nombre` marcado `unique`; la segunda muestra `unidad_medida | text` (ya no `USER-DEFINED`/enum).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: reemplazar enum Unidad_medida por catálogo UnidadMedida administrable"
```

---

### Task 2: Seed de las unidades base existentes

**Files:**
- Modify: `prisma/seed.ts:71-85`

**Interfaces:**
- Consumes: `prisma.unidadMedida` (Task 1).
- Produces: 5 filas en `UnidadMedida` (`KG, GR, UNIDAD, LT, ML`) tras correr el seed.

- [ ] **Step 1: Agregar el bloque de seed de unidades**

En `prisma/seed.ts`, después del bloque de "4. Marcas" (antes del cierre de `main()`, es decir después de la línea `console.log(\`✅ Marca: ${m.nombre} (${m.key})\`)` y su `}` de cierre del `for`, justo antes del `}` final que cierra `async function main()`), agrega:

```ts
  // 5. Unidades de medida (catálogo administrable) — upsert idempotente por nombre
  const unidadesBase = ['KG', 'GR', 'UNIDAD', 'LT', 'ML']
  for (const nombre of unidadesBase) {
    await prisma.unidadMedida.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    })
  }
  console.log('✅ Unidades de medida base (KG, GR, UNIDAD, LT, ML)')
```

El archivo completo de `main()` debe quedar así al final (verifica que las llaves cierren correctamente):

```ts
  // 4. Marcas (FASE 5A) — upsert idempotente por key
  const marcas = [
    { key: 'elevate', nombre: 'Elevate', color: '#22c55e' },
    { key: 'fitbull', nombre: 'Fitbull', color: '#f59e0b' },
  ]
  for (const m of marcas) {
    await prisma.marca.upsert({
      where: { key: m.key },
      update: { nombre: m.nombre, color: m.color },
      create: m,
    })
    console.log(`✅ Marca: ${m.nombre} (${m.key})`)
  }

  // 5. Unidades de medida (catálogo administrable) — upsert idempotente por nombre
  const unidadesBase = ['KG', 'GR', 'UNIDAD', 'LT', 'ML']
  for (const nombre of unidadesBase) {
    await prisma.unidadMedida.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    })
  }
  console.log('✅ Unidades de medida base (KG, GR, UNIDAD, LT, ML)')
}
```

- [ ] **Step 2: Correr el seed**

```bash
npx prisma db seed
```

Expected: entre las líneas de salida aparece `✅ Unidades de medida base (KG, GR, UNIDAD, LT, ML)` sin errores.

- [ ] **Step 3: Verificar en la base**

```bash
docker exec elevate_postgres psql -U elevate_user -d elevate_db -c 'SELECT nombre, activo FROM "UnidadMedida" ORDER BY nombre;'
```

Expected: 5 filas (`GR, KG, LT, ML, UNIDAD`), todas con `activo = t`.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: sembrar unidades de medida base en el catalogo administrable"
```

---

### Task 3: API — listar y crear unidades (`GET`/`POST /api/unidades-medida`)

**Files:**
- Create: `app/api/unidades-medida/route.ts`

**Interfaces:**
- Consumes: `prisma.unidadMedida` (Task 1); `guard`, `ADMIN` de `@/lib/server/auth/guard`.
- Produces: `GET /api/unidades-medida` → `UnidadMedida[]` (JSON array plano, igual patrón que `GET /api/categoria`); `POST /api/unidades-medida` con body `{ nombre: string }` → `UnidadMedida` creada (201) o error `{ message: string }` (400 si falta nombre, 409 si duplicado case-insensitive).

- [ ] **Step 1: Crear el route handler**

Crea `app/api/unidades-medida/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const soloActivas = searchParams.get('activo') === 'true';
    const unidades = await prisma.unidadMedida.findMany({
      where: soloActivas ? { activo: true } : undefined,
      orderBy: { nombre: 'asc' },
    });
    return NextResponse.json(unidades);
  } catch {
    return NextResponse.json({ message: 'Error al obtener unidades de medida' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { nombre } = await request.json();
    const nombreTrim = String(nombre ?? '').trim();
    if (!nombreTrim) {
      return NextResponse.json({ message: 'El nombre es requerido' }, { status: 400 });
    }

    const existente = await prisma.unidadMedida.findFirst({
      where: { nombre: { equals: nombreTrim, mode: 'insensitive' } },
    });
    if (existente) {
      return NextResponse.json({ message: `Ya existe una unidad "${existente.nombre}"` }, { status: 409 });
    }

    const unidad = await prisma.unidadMedida.create({ data: { nombre: nombreTrim } });
    return NextResponse.json(unidad, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Error al crear la unidad de medida' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Levantar el servidor de dev**

```bash
npm run dev
```

Deja esta terminal corriendo; usa otra terminal para los siguientes `curl`.

- [ ] **Step 3: Verificar `GET` sin autenticación (debe funcionar, igual que `/api/categoria`)**

```bash
curl -s http://localhost:3000/api/unidades-medida
```

Expected: array JSON con las 5 unidades sembradas, ej. `[{"id":1,"nombre":"GR","activo":true,...}, ...]`.

- [ ] **Step 4: Verificar que `POST` sin sesión se rechaza**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/unidades-medida \
  -H "Content-Type: application/json" -d '{"nombre":"paquete"}'
```

Expected: `401` (o `403`), no `201`.

- [ ] **Step 5: Iniciar sesión y verificar `POST` autenticado**

```bash
curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"benjaherediaruiz@gmail.com","password":"benja122"}' > /dev/null

curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/unidades-medida \
  -H "Content-Type: application/json" -d '{"nombre":"paquete"}'
```

Expected: `201` con el objeto creado, ej. `{"id":6,"nombre":"paquete","activo":true,...}`.

- [ ] **Step 6: Verificar rechazo de duplicados (case-insensitive) y de nombre vacío**

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/unidades-medida \
  -H "Content-Type: application/json" -d '{"nombre":"PAQUETE"}'

curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/unidades-medida \
  -H "Content-Type: application/json" -d '{"nombre":""}'
```

Expected: la primera responde 409 (`Ya existe una unidad "paquete"`); la segunda responde 400 (`El nombre es requerido`).

- [ ] **Step 7: Commit**

```bash
git add app/api/unidades-medida/route.ts
git commit -m "feat: endpoint GET/POST para catalogo de unidades de medida"
```

---

### Task 4: API — editar y eliminar unidades (`PUT`/`DELETE /api/unidades-medida/[id]`)

**Files:**
- Create: `app/api/unidades-medida/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma.unidadMedida`, `prisma.insumo` (para el chequeo de uso); `guard`, `ADMIN`.
- Produces: `PUT /api/unidades-medida/:id` con body `{ nombre?: string; activo?: boolean }` → `UnidadMedida` actualizada; `DELETE /api/unidades-medida/:id` → `{ ok: true }` (200) o 409 si está en uso por algún insumo activo.

- [ ] **Step 1: Crear el route handler**

Crea `app/api/unidades-medida/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN } from '@/lib/server/auth/guard';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const unidadId = Number(id);
    const { nombre, activo } = await request.json();

    const data: { nombre?: string; activo?: boolean } = {};

    if (nombre !== undefined) {
      const nombreTrim = String(nombre).trim();
      if (!nombreTrim) {
        return NextResponse.json({ message: 'El nombre es requerido' }, { status: 400 });
      }
      const existente = await prisma.unidadMedida.findFirst({
        where: { nombre: { equals: nombreTrim, mode: 'insensitive' }, NOT: { id: unidadId } },
      });
      if (existente) {
        return NextResponse.json({ message: `Ya existe una unidad "${existente.nombre}"` }, { status: 409 });
      }
      data.nombre = nombreTrim;
    }

    if (activo !== undefined) {
      data.activo = Boolean(activo);
    }

    const unidad = await prisma.unidadMedida.update({ where: { id: unidadId }, data });
    return NextResponse.json(unidad);
  } catch {
    return NextResponse.json({ message: 'Error al actualizar la unidad de medida' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const unidadId = Number(id);

    const unidad = await prisma.unidadMedida.findUnique({ where: { id: unidadId } });
    if (!unidad) {
      return NextResponse.json({ message: 'No encontrada' }, { status: 404 });
    }

    const enUso = await prisma.insumo.count({ where: { unidad_medida: unidad.nombre, activo: true } });
    if (enUso > 0) {
      return NextResponse.json(
        { message: `No se puede eliminar: ${enUso} insumo(s) usan esta unidad. Desactívala en su lugar.` },
        { status: 409 },
      );
    }

    await prisma.unidadMedida.delete({ where: { id: unidadId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'Error al eliminar la unidad de medida' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar `PUT` (renombrar y desactivar)**

Con el servidor de dev corriendo y `/tmp/cookies.txt` de la Task 3 (o repite el login si expiró):

```bash
curl -s -b /tmp/cookies.txt -X PUT http://localhost:3000/api/unidades-medida/6 \
  -H "Content-Type: application/json" -d '{"nombre":"Paquete"}'

curl -s -b /tmp/cookies.txt -X PUT http://localhost:3000/api/unidades-medida/6 \
  -H "Content-Type: application/json" -d '{"activo":false}'
```

Expected: la primera responde 200 con `"nombre":"Paquete"`; la segunda responde 200 con `"activo":false`. (Ajusta el `6` al id real que devolvió el `POST` de la Task 3.)

Reactívala para el siguiente paso:

```bash
curl -s -b /tmp/cookies.txt -X PUT http://localhost:3000/api/unidades-medida/6 \
  -H "Content-Type: application/json" -d '{"activo":true}'
```

- [ ] **Step 3: Verificar el bloqueo de `DELETE` cuando está en uso**

Crea un insumo que use la unidad "Paquete" (ajusta el id 6 si corresponde):

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/insumo \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Bolsas de prueba","stock_actual":10,"stock_minimo":2,"unidad_medida":"Paquete"}'

curl -s -b /tmp/cookies.txt -X DELETE http://localhost:3000/api/unidades-medida/6
```

Expected: el `DELETE` responde 409 con un mensaje tipo `No se puede eliminar: 1 insumo(s) usan esta unidad...`.

- [ ] **Step 4: Verificar `DELETE` exitoso cuando no está en uso**

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3000/api/unidades-medida \
  -H "Content-Type: application/json" -d '{"nombre":"unidad-temporal-test"}'
```

Anota el `id` devuelto (ej. `7`), luego:

```bash
curl -s -b /tmp/cookies.txt -X DELETE http://localhost:3000/api/unidades-medida/7
```

Expected: `{"ok":true}`.

- [ ] **Step 5: Limpiar los datos de prueba creados en esta task**

Elimina el insumo de prueba desde la UI (`/admin/insumos`, botón 🗑) o vía API, para no dejar basura en la base local:

```bash
curl -s -b /tmp/cookies.txt http://localhost:3000/api/insumo | grep -o '"id":[0-9]*,"nombre":"Bolsas de prueba"'
```

Usa el `id` que salga para: `curl -s -b /tmp/cookies.txt -X DELETE http://localhost:3000/api/insumo/<id>`.

- [ ] **Step 6: Commit**

```bash
git add "app/api/unidades-medida/[id]/route.ts"
git commit -m "feat: endpoint PUT/DELETE para editar y eliminar unidades de medida"
```

---

### Task 5: Frontend — pestaña "Unidades" y botón "+ Nueva" en el modal de insumo

**Files:**
- Modify: `components/admin/AdminInsumos.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/unidades-medida`, `PUT/DELETE /api/unidades-medida/:id` (Tasks 3-4); `apiClient` de `@/hooks/api`; clases CSS existentes `admin-modal`, `admin-modal.compact`, `admin-table`, `pub-badge`, `action-btn` (`components/admin/admin.css`).
- Produces: pestaña "Unidades" navegable en el módulo de Insumos; selects de "Unidad" en los modales de crear/editar insumo alimentados por el catálogo dinámico en vez de la lista fija `UNITS`.

- [ ] **Step 1: Agregar el tipo `UnidadMedidaRow`, extender `Tab`, y quitar la constante `UNITS`**

En `components/admin/AdminInsumos.tsx`, reemplaza:

```tsx
type Tab = 'insumos' | 'movimientos' | 'recetas';
```

por:

```tsx
type Tab = 'insumos' | 'movimientos' | 'recetas' | 'unidades';
```

Y reemplaza:

```tsx
const UNITS = ['KG', 'GR', 'UNIDAD', 'LT', 'ML'];
```

por:

```tsx
interface UnidadMedidaRow {
  id: number;
  nombre: string;
  activo: boolean;
}
```

- [ ] **Step 2: Agregar estado de unidades y su carga en `load()`**

Reemplaza:

```tsx
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insumosRes, movimientosRes, recetasRes] = await Promise.all([
        apiClient.get('/api/insumo'),
        apiClient.get('/api/insumo/movimiento'),
        apiClient.get('/api/recetas'),
      ]);
      setInsumos(Array.isArray(insumosRes.data) ? insumosRes.data : []);
      setMovimientos(movimientosRes.data?.data ?? []);
      setRecetas(recetasRes.data?.data ?? []);
    } catch (err) {
      console.error(err);
      setInsumos([]);
      setMovimientos([]);
      setRecetas([]);
    } finally {
      setLoading(false);
    }
  }, []);
```

por:

```tsx
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insumosRes, movimientosRes, recetasRes, unidadesRes] = await Promise.all([
        apiClient.get('/api/insumo'),
        apiClient.get('/api/insumo/movimiento'),
        apiClient.get('/api/recetas'),
        apiClient.get('/api/unidades-medida'),
      ]);
      setInsumos(Array.isArray(insumosRes.data) ? insumosRes.data : []);
      setMovimientos(movimientosRes.data?.data ?? []);
      setRecetas(recetasRes.data?.data ?? []);
      setUnidades(Array.isArray(unidadesRes.data) ? unidadesRes.data : []);
    } catch (err) {
      console.error(err);
      setInsumos([]);
      setMovimientos([]);
      setRecetas([]);
      setUnidades([]);
    } finally {
      setLoading(false);
    }
  }, []);
```

Agrega también el estado nuevo junto a los demás `useState` del componente. Reemplaza:

```tsx
  const [pageMsg, setPageMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
```

por:

```tsx
  const [pageMsg, setPageMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [unidades, setUnidades] = useState<UnidadMedidaRow[]>([]);
  const [unidadModal, setUnidadModal] = useState<'crear' | 'editar' | null>(null);
  const [selectedUnidad, setSelectedUnidad] = useState<UnidadMedidaRow | null>(null);
  const [unidadForm, setUnidadForm] = useState<{ nombre: string; activo: boolean }>({ nombre: '', activo: true });
  const [unidadSaving, setUnidadSaving] = useState(false);
  const [unidadError, setUnidadError] = useState('');
```

- [ ] **Step 3: Agregar `unidadesActivas` derivado y los handlers de unidades**

Reemplaza:

```tsx
  const totalValue = insumos.reduce((sum, item) => sum + item.stock_actual * item.costo_promedio, 0);
```

por:

```tsx
  const unidadesActivas = useMemo(() => unidades.filter(u => u.activo), [unidades]);

  const openUnidadModal = (action: 'crear' | 'editar', unidad?: UnidadMedidaRow) => {
    setUnidadError('');
    setUnidadModal(action);
    setSelectedUnidad(unidad ?? null);
    setUnidadForm(action === 'editar' && unidad
      ? { nombre: unidad.nombre, activo: unidad.activo }
      : { nombre: '', activo: true });
  };

  const closeUnidadModal = () => {
    setUnidadModal(null);
    setSelectedUnidad(null);
    setUnidadForm({ nombre: '', activo: true });
    setUnidadError('');
  };

  const submitUnidad = async (event: FormEvent) => {
    event.preventDefault();
    setUnidadSaving(true);
    setUnidadError('');
    try {
      const nombreTrim = unidadForm.nombre.trim();
      let saved: UnidadMedidaRow;
      if (unidadModal === 'crear') {
        const res = await apiClient.post('/api/unidades-medida', { nombre: nombreTrim });
        saved = res.data;
      } else {
        const res = await apiClient.put(`/api/unidades-medida/${selectedUnidad!.id}`, {
          nombre: nombreTrim,
          activo: unidadForm.activo,
        });
        saved = res.data;
      }
      const quickAddDesdeInsumo = unidadModal === 'crear' && modalAction !== null;
      closeUnidadModal();
      await load();
      if (quickAddDesdeInsumo) {
        setForm(prev => ({ ...prev, unidad_medida: saved.nombre }));
      }
    } catch (err) {
      setUnidadError(errorMsg(err));
    } finally {
      setUnidadSaving(false);
    }
  };

  const handleToggleUnidad = async (unidad: UnidadMedidaRow) => {
    setPageMsg(null);
    try {
      await apiClient.put(`/api/unidades-medida/${unidad.id}`, { activo: !unidad.activo });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const handleDeleteUnidad = async (unidad: UnidadMedidaRow) => {
    if (!window.confirm(`¿Eliminar la unidad "${unidad.nombre}"?`)) return;
    setPageMsg(null);
    try {
      await apiClient.delete(`/api/unidades-medida/${unidad.id}`);
      setPageMsg({ type: 'ok', text: `Unidad "${unidad.nombre}" eliminada.` });
      await load();
    } catch (err) {
      setPageMsg({ type: 'error', text: errorMsg(err) });
    }
  };

  const totalValue = insumos.reduce((sum, item) => sum + item.stock_actual * item.costo_promedio, 0);
```

Nota: `totalValue` ya existía antes de este bloque — se conserva, solo se le agregan las definiciones nuevas justo antes.

- [ ] **Step 4: Agregar la pestaña "Unidades" a la barra de tabs**

Reemplaza:

```tsx
      <div className="inv-tabs">
        {[
          ['insumos', 'Insumos'],
          ['movimientos', 'Movimientos'],
          ['recetas', 'Recetas'],
        ].map(([key, label]) => (
```

por:

```tsx
      <div className="inv-tabs">
        {[
          ['insumos', 'Insumos'],
          ['movimientos', 'Movimientos'],
          ['recetas', 'Recetas'],
          ['unidades', 'Unidades'],
        ].map(([key, label]) => (
```

- [ ] **Step 5: Reemplazar el select de "Unidad" en el formulario de CREAR insumo**

Reemplaza (dentro del bloque `modalAction === 'crear'`):

```tsx
                  <label className="form-group"><span>Unidad</span><select value={form.unidad_medida} onChange={event => setForm(prev => ({ ...prev, unidad_medida: event.target.value }))}>{UNITS.map(unit => <option key={unit} value={unit}>{unit.toLowerCase()}</option>)}</select></label>
                  <label className="form-group"><span>Stock</span><input type="number" min="0" step="0.01" value={form.stock_actual} onChange={event => setForm(prev => ({ ...prev, stock_actual: event.target.value }))} required /></label>
```

por:

```tsx
                  <label className="form-group">
                    <span>Unidad</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select value={form.unidad_medida} onChange={event => setForm(prev => ({ ...prev, unidad_medida: event.target.value }))} style={{ flex: 1 }}>
                        {unidadesActivas.map(unidad => <option key={unidad.id} value={unidad.nombre}>{unidad.nombre}</option>)}
                      </select>
                      <button className="admin-btn secondary" onClick={() => openUnidadModal('crear')} type="button">+ Nueva</button>
                    </div>
                  </label>
                  <label className="form-group"><span>Stock</span><input type="number" min="0" step="0.01" value={form.stock_actual} onChange={event => setForm(prev => ({ ...prev, stock_actual: event.target.value }))} required /></label>
```

- [ ] **Step 6: Reemplazar el select de "Unidad" en el formulario de EDITAR insumo**

Reemplaza (dentro del bloque `modalAction === 'editar'`):

```tsx
                  <label className="form-group"><span>Unidad</span><select value={form.unidad_medida} onChange={event => setForm(prev => ({ ...prev, unidad_medida: event.target.value }))}>{UNITS.map(unit => <option key={unit} value={unit}>{unit.toLowerCase()}</option>)}</select></label>
                  <label className="form-group"><span>Costo unitario (Bs)</span><input type="number" min="0" step="0.01" value={form.costo_promedio} onChange={event => setForm(prev => ({ ...prev, costo_promedio: event.target.value }))} /></label>
```

por:

```tsx
                  <label className="form-group">
                    <span>Unidad</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select value={form.unidad_medida} onChange={event => setForm(prev => ({ ...prev, unidad_medida: event.target.value }))} style={{ flex: 1 }}>
                        {unidadesActivas.map(unidad => <option key={unidad.id} value={unidad.nombre}>{unidad.nombre}</option>)}
                      </select>
                      <button className="admin-btn secondary" onClick={() => openUnidadModal('crear')} type="button">+ Nueva</button>
                    </div>
                  </label>
                  <label className="form-group"><span>Costo unitario (Bs)</span><input type="number" min="0" step="0.01" value={form.costo_promedio} onChange={event => setForm(prev => ({ ...prev, costo_promedio: event.target.value }))} /></label>
```

- [ ] **Step 7: Agregar el contenido de la pestaña "Unidades"**

Justo después del bloque `{tab === 'recetas' && ( ... )}` (antes de `{modalAction && ( ... )}`), agrega:

```tsx
      {tab === 'unidades' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="admin-btn primary" onClick={() => openUnidadModal('crear')} type="button">+ Nueva unidad</button>
          </div>
          {unidades.length === 0 ? (
            <div className="empty-state"><h4>Sin unidades registradas</h4><p>Crea la primera unidad de medida para usarla en los insumos.</p></div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {unidades.map(unidad => (
                    <tr key={unidad.id}>
                      <td>{unidad.nombre}</td>
                      <td>
                        <span className={`pub-badge ${unidad.activo ? 'publicado' : 'archivado'}`} style={{ color: unidad.activo ? 'var(--fresh)' : 'var(--danger)' }}>
                          {unidad.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="action-btn edit" title="Editar" onClick={() => openUnidadModal('editar', unidad)} type="button">✏</button>
                          <button className="action-btn" title={unidad.activo ? 'Desactivar' : 'Activar'} onClick={() => handleToggleUnidad(unidad)} type="button">{unidad.activo ? '⏸' : '▶'}</button>
                          <button className="action-btn delete" title="Eliminar" onClick={() => handleDeleteUnidad(unidad)} type="button">🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
```

- [ ] **Step 8: Agregar el mini-modal superpuesto para crear/editar unidad**

Justo después del cierre del bloque `{modalAction && ( ... )}` (al final del `return (...)`, antes del `</div>` final del componente), agrega:

```tsx
      {unidadModal && (
        <div className="admin-modal-overlay" style={{ zIndex: 110 }} onMouseDown={closeUnidadModal}>
          <form className="admin-modal compact" onSubmit={submitUnidad} onMouseDown={event => event.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{unidadModal === 'crear' ? 'Nueva unidad' : `Editar unidad · ${selectedUnidad?.nombre ?? ''}`}</h3>
              <button className="admin-modal-close" onClick={closeUnidadModal} type="button">×</button>
            </div>
            <div className="admin-modal-body">
              <div className="form-grid">
                <label className="form-group full">
                  <span>Nombre</span>
                  <input
                    value={unidadForm.nombre}
                    onChange={event => setUnidadForm(prev => ({ ...prev, nombre: event.target.value }))}
                    placeholder="Ej. paquete, caja, sobre"
                    required
                  />
                </label>
                {unidadModal === 'editar' && (
                  <label className="form-group full" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={unidadForm.activo}
                      onChange={event => setUnidadForm(prev => ({ ...prev, activo: event.target.checked }))}
                    />
                    <span>Activa (disponible para nuevos insumos)</span>
                  </label>
                )}
              </div>
              {unidadError && <div className="gate-warning" style={{ marginTop: 12 }}>{unidadError}</div>}
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn secondary" onClick={closeUnidadModal} type="button">Cancelar</button>
              <button className="admin-btn primary" disabled={unidadSaving} type="submit">{unidadSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
```

- [ ] **Step 9: Chequeo de tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores relacionados a `AdminInsumos.tsx` (ni a `UNITS`, que ya no debe existir en el archivo).

- [ ] **Step 10: Verificación manual en el navegador**

Con `npm run dev` corriendo y sesión iniciada como `benjaherediaruiz@gmail.com` / `benja122`:

1. Ve a `http://localhost:3000/admin/insumos`.
2. Click en la pestaña **"Unidades"** — debe listar `GR, KG, LT, ML, UNIDAD` (más `Paquete` si quedó de la Task 4, o límpiala primero).
3. Click **"+ Nueva unidad"**, escribe `caja`, guarda — debe aparecer en la tabla como activa.
4. Click el botón ⏸ sobre `caja` — el estado debe cambiar a "Inactivo"; reactívala con ▶.
5. Ve a la pestaña **"Insumos"**, click **"+ Insumo"**. En el selector "Unidad" deben aparecer las unidades activas (si desactivaste `caja`, no debe aparecer).
6. Dentro de ese mismo modal, click **"+ Nueva"** junto al selector de unidad, crea `sobre` — el mini-modal debe cerrarse solo y el selector del formulario de insumo debe quedar en `sobre` automáticamente, sin cerrar el modal de "Nuevo insumo".
7. Completa el resto del formulario (nombre, stock, stock mínimo) y guarda el insumo — debe crearse sin error, con unidad `sobre`.
8. Intenta eliminar (🗑) la unidad `sobre` desde la pestaña "Unidades" — debe fallar con un mensaje indicando que está en uso.

- [ ] **Step 11: Commit**

```bash
git add components/admin/AdminInsumos.tsx
git commit -m "feat: pestana Unidades y alta rapida de unidad en el modal de insumo"
```

---

## Fuera de alcance (recordatorio del spec)

- Conversión/factor entre unidades.
- Actualizar en cascada insumos existentes cuando se renombra una unidad del catálogo.
- Los ~18 archivos que ya leen `insumo.unidad_medida` como string, incluyendo el tipo local `UnidadMedida` hardcodeado en `components/admin/AdminProductWizard.tsx` (selector de unidad para insumos de reventa) — sigue funcionando igual porque el campo subyacente sigue siendo `String`; no se conecta al catálogo nuevo en este plan.
