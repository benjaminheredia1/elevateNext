# Horario de Trabajadores Implementation Plan

> Plan de implementación por tareas; los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Goal:** Agregar una sección de administración donde se define y edita, en formato de celdas (tipo hoja de cálculo), el horario semanal de cada usuario de staff (Lunes-Domingo: horario o "Libre"), más una lista simple de días feriados.

**Architecture:** Dos modelos nuevos en Prisma (`HorarioTrabajador` para la plantilla semanal, `DiaFeriado` para la lista de feriados). Endpoints REST siguiendo el patrón ya usado en `app/api/admin/usuarios/route.ts` (Zod + `requireAuth`/`requireRole` + `logAudit` + `handleApiError`). Frontend: un nuevo item de navegación, una página delgada que envuelve un componente, y ese componente reutiliza el hook `useAdminUsuarios()` ya existente para las filas.

**Tech Stack:** Next.js App Router (route handlers), Prisma 7, PostgreSQL, TanStack Query, Zod.

## Global Constraints

- Personal = `Usuario` con rol `DUENO`/`ADMIN`/`CAJERO` únicamente (no `CLIENTE`, no se crea un modelo "Empleado" nuevo).
- Modelo de horario = plantilla semanal recurrente (día de la semana 1-7) + feriados como lista aparte — NO un calendario de excepciones por fecha específica por empleado (fuera de alcance).
- `hora_entrada`/`hora_salida` son `String` formato "HH:MM" (mismo patrón que `ConfiguracionAlertas.hora_silencio_desde/hasta`), no un tipo de hora nuevo.
- Aplicar cambios de schema con `npx prisma db push` (este proyecto no usa `prisma migrate` para su evolución de schema reciente — ver `lib/prisma.ts` y el histórico de esta sesión).
- Base de datos local: contenedor Docker `elevate_postgres` (puerto 5433, db `elevate_db`) debe estar corriendo (`docker compose up -d postgres`).
- Login de prueba (admin/DUEÑO, ya sembrado): `benjaherediaruiz@gmail.com` / `benja122`.
- Sin test framework para rutas API de este tipo en el resto del proyecto salvo donde ya se agregó Vitest (`app/api/admin/productos`) — para esta feature, verificación manual vía curl/tsc, consistente con `app/api/admin/usuarios` (que tampoco tiene tests).

---

## File Structure

- **Modificar** `prisma/schema.prisma` — nuevos modelos `HorarioTrabajador`, `DiaFeriado`; relaciones inversas en `Usuario` y `Sucursal`.
- **Crear** `lib/server/dto/horario-trabajadores.dto.ts` — schemas Zod para la celda de horario y el feriado.
- **Crear** `app/api/admin/horario-trabajadores/route.ts` — `GET` (lista todas las celdas) y `PUT` (upsert de una celda).
- **Crear** `app/api/admin/dias-feriados/route.ts` — `GET` (lista) y `POST` (crear).
- **Crear** `app/api/admin/dias-feriados/[id]/route.ts` — `DELETE`.
- **Crear** `hooks/admin-horario-trabajadores.ts` — hooks de TanStack Query para ambos recursos.
- **Modificar** `components/admin/AdminPanel.tsx` — nuevo item de navegación en el grupo "Gestión".
- **Crear** `app/admin/horario-trabajadores/page.tsx` — página delgada (envuelve `AdminPanel` + el componente).
- **Crear** `components/admin/HorarioTrabajadores.tsx` — la grilla editable + la sección de feriados.

---

### Task 1: Modelo de datos — HorarioTrabajador y DiaFeriado

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: modelos Prisma `HorarioTrabajador { id, usuario_id, dia_semana, es_libre, hora_entrada, hora_salida, usuario }` y `DiaFeriado { id, fecha, nombre, sucursal_id, sucursal }`; `Usuario.horarios HorarioTrabajador[]`; `Sucursal.diasFeriados DiaFeriado[]`.

- [ ] **Step 1: Agregar la relación inversa en `Usuario`**

En `prisma/schema.prisma`, dentro de `model Usuario { ... }`, reemplaza:

```prisma
  auditorias           RegistroAuditoria[]
  created_at           DateTime            @default(now())
  update_at            DateTime            @updatedAt
}
```

por:

```prisma
  auditorias           RegistroAuditoria[]
  horarios             HorarioTrabajador[]
  created_at           DateTime            @default(now())
  update_at            DateTime            @updatedAt
}
```

- [ ] **Step 2: Agregar la relación inversa en `Sucursal`**

Reemplaza:

```prisma
model Sucursal {
  id         Int                @id @default(autoincrement())
  nombre     String
  direccion  String?
  lat        Float?
  lng        Float?
  activa     Boolean            @default(true)
  usuarios   Usuario[]
  cuentas    CuentaFinanciera[]
  turnos     CajaTurno[]
  created_at DateTime           @default(now())
  update_at  DateTime           @updatedAt
}
```

por:

```prisma
model Sucursal {
  id           Int                @id @default(autoincrement())
  nombre       String
  direccion    String?
  lat          Float?
  lng          Float?
  activa       Boolean            @default(true)
  usuarios     Usuario[]
  cuentas      CuentaFinanciera[]
  turnos       CajaTurno[]
  diasFeriados DiaFeriado[]
  created_at   DateTime           @default(now())
  update_at    DateTime           @updatedAt
}
```

- [ ] **Step 3: Agregar los dos modelos nuevos al final del archivo**

Al final de `prisma/schema.prisma` (después de `model RegistroAlerta { ... }`), agrega:

```prisma

model HorarioTrabajador {
  id           Int      @id @default(autoincrement())
  usuario_id   Int
  dia_semana   Int      // 1=lunes ... 7=domingo (ISO 8601)
  es_libre     Boolean  @default(false)
  hora_entrada String?  // "HH:MM", null cuando es_libre = true
  hora_salida  String?  // "HH:MM", null cuando es_libre = true
  usuario      Usuario  @relation(fields: [usuario_id], references: [id], onDelete: Cascade)
  created_at   DateTime @default(now())
  update_at    DateTime @updatedAt

  @@unique([usuario_id, dia_semana])
}

model DiaFeriado {
  id          Int       @id @default(autoincrement())
  fecha       DateTime  @db.Date
  nombre      String
  sucursal_id Int?
  sucursal    Sucursal? @relation(fields: [sucursal_id], references: [id])
  created_at  DateTime  @default(now())

  @@unique([fecha, sucursal_id])
}
```

- [ ] **Step 4: Aplicar el cambio a la base de datos**

```bash
docker compose up -d postgres
npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema. Done in ...ms`, sin errores.

- [ ] **Step 5: Verificar el cambio directamente en la base**

```bash
docker exec elevate_postgres psql -U elevate_user -d elevate_db -c '\d "HorarioTrabajador"'
docker exec elevate_postgres psql -U elevate_user -d elevate_db -c '\d "DiaFeriado"'
```

Expected: la primera muestra columnas `id, usuario_id, dia_semana, es_libre, hora_entrada, hora_salida, created_at, update_at` con un índice único sobre `(usuario_id, dia_semana)`; la segunda muestra `id, fecha, nombre, sucursal_id, created_at` con índice único sobre `(fecha, sucursal_id)`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: agregar modelos HorarioTrabajador y DiaFeriado"
```

---

### Task 2: API — Horario semanal (GET lista + PUT celda)

**Files:**
- Create: `lib/server/dto/horario-trabajadores.dto.ts`
- Create: `app/api/admin/horario-trabajadores/route.ts`

**Interfaces:**
- Consumes: `prisma.horarioTrabajador` (Task 1); `requireAuth`, `requireRole`, `getClientIp` de `@/lib/server/auth/session`; `logAudit` de `@/lib/server/audit/audit.service`; `handleApiError` de `@/lib/server/errors`.
- Produces: `GET /api/admin/horario-trabajadores` → array de celdas con `usuario` incluido; `PUT /api/admin/horario-trabajadores` con body `{ usuario_id, dia_semana, es_libre, hora_entrada?, hora_salida? }` → celda creada/actualizada (200).

- [ ] **Step 1: Crear el DTO Zod**

Crea `lib/server/dto/horario-trabajadores.dto.ts`:

```ts
import { z } from 'zod';

const horaRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const horarioCeldaSchema = z.object({
  usuario_id: z.coerce.number().int().positive(),
  dia_semana: z.coerce.number().int().min(1).max(7),
  es_libre: z.boolean(),
  hora_entrada: z.string().regex(horaRegex).optional().nullable(),
  hora_salida: z.string().regex(horaRegex).optional().nullable(),
}).refine(
  (data) => data.es_libre || (!!data.hora_entrada && !!data.hora_salida),
  { message: 'hora_entrada y hora_salida son requeridos cuando es_libre es false' },
).refine(
  (data) => data.es_libre || !data.hora_entrada || !data.hora_salida || data.hora_entrada < data.hora_salida,
  { message: 'hora_entrada debe ser antes que hora_salida' },
);

export const diaFeriadoCreateSchema = z.object({
  fecha: z.coerce.date(),
  nombre: z.string().trim().min(1),
  sucursal_id: z.coerce.number().int().positive().optional().nullable(),
});

export type HorarioCeldaInput = z.infer<typeof horarioCeldaSchema>;
export type DiaFeriadoCreateInput = z.infer<typeof diaFeriadoCreateSchema>;
```

- [ ] **Step 2: Crear el route handler**

Crea `app/api/admin/horario-trabajadores/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { horarioCeldaSchema } from '@/lib/server/dto/horario-trabajadores.dto';
import prisma from '@/lib/prisma';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const horarios = await prisma.horarioTrabajador.findMany({
      include: {
        usuario: {
          select: { id: true, nombre: true, apellido_paterno: true, rol: true, sucursal: { select: { nombre: true } } },
        },
      },
      orderBy: [{ usuario_id: 'asc' }, { dia_semana: 'asc' }],
    });
    return NextResponse.json(horarios);
  } catch (e) { return handleApiError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = horarioCeldaSchema.parse(await req.json());

    const horario = await prisma.horarioTrabajador.upsert({
      where: { usuario_id_dia_semana: { usuario_id: input.usuario_id, dia_semana: input.dia_semana } },
      update: {
        es_libre: input.es_libre,
        hora_entrada: input.es_libre ? null : input.hora_entrada,
        hora_salida: input.es_libre ? null : input.hora_salida,
      },
      create: {
        usuario_id: input.usuario_id,
        dia_semana: input.dia_semana,
        es_libre: input.es_libre,
        hora_entrada: input.es_libre ? null : input.hora_entrada,
        hora_salida: input.es_libre ? null : input.hora_salida,
      },
    });

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'HorarioTrabajador',
      entidadId: horario.id,
      detalle: `Actualizó horario del usuario #${input.usuario_id} (${DIAS[input.dia_semana]}): ${input.es_libre ? 'Libre' : `${input.hora_entrada}-${input.hora_salida}`}`,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json(horario);
  } catch (e) { return handleApiError(e); }
}
```

- [ ] **Step 3: Levantar el servidor de dev (si no está corriendo) y verificar con curl**

```bash
npm run dev
```

En otra terminal:

```bash
curl -s -c /tmp/cookies-horarios.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"benjaherediaruiz@gmail.com","password":"benja122"}' -o /dev/null -w "login: %{http_code}\n"

USER_ID=$(curl -s -b /tmp/cookies-horarios.txt http://localhost:3000/api/admin/usuarios | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "usuario id: $USER_ID"

curl -s -b /tmp/cookies-horarios.txt -X PUT http://localhost:3000/api/admin/horario-trabajadores \
  -H "Content-Type: application/json" \
  -d "{\"usuario_id\":$USER_ID,\"dia_semana\":1,\"es_libre\":false,\"hora_entrada\":\"09:00\",\"hora_salida\":\"18:00\"}"
```

Expected: `200` con la celda creada (`"dia_semana":1,"es_libre":false,"hora_entrada":"09:00","hora_salida":"18:00"`).

Verifica que marcar "Libre" fuerza las horas a `null`:

```bash
curl -s -b /tmp/cookies-horarios.txt -X PUT http://localhost:3000/api/admin/horario-trabajadores \
  -H "Content-Type: application/json" \
  -d "{\"usuario_id\":$USER_ID,\"dia_semana\":7,\"es_libre\":true}"
```

Expected: `200` con `"dia_semana":7,"es_libre":true,"hora_entrada":null,"hora_salida":null`.

Verifica el `GET`:

```bash
curl -s -b /tmp/cookies-horarios.txt http://localhost:3000/api/admin/horario-trabajadores
```

Expected: array con las 2 celdas creadas, cada una con `usuario` incluido (`nombre`, `apellido_paterno`, `rol`, `sucursal`).

Verifica que `hora_entrada > hora_salida` se rechaza:

```bash
curl -s -b /tmp/cookies-horarios.txt -X PUT http://localhost:3000/api/admin/horario-trabajadores \
  -H "Content-Type: application/json" \
  -d "{\"usuario_id\":$USER_ID,\"dia_semana\":2,\"es_libre\":false,\"hora_entrada\":\"18:00\",\"hora_salida\":\"09:00\"}"
```

Expected: `422` (error de validación Zod).

- [ ] **Step 4: Commit**

```bash
git add lib/server/dto/horario-trabajadores.dto.ts app/api/admin/horario-trabajadores/route.ts
git commit -m "feat: endpoint GET/PUT para el horario semanal de trabajadores"
```

---

### Task 3: API — Días feriados (GET lista + POST crear + DELETE)

**Files:**
- Create: `app/api/admin/dias-feriados/route.ts`
- Create: `app/api/admin/dias-feriados/[id]/route.ts`

No se modifica `lib/server/dto/horario-trabajadores.dto.ts` — ya tiene `diaFeriadoCreateSchema` desde la Task 2, solo se importa.

**Interfaces:**
- Consumes: `diaFeriadoCreateSchema` de `lib/server/dto/horario-trabajadores.dto.ts` (Task 2); `prisma.diaFeriado`.
- Produces: `GET /api/admin/dias-feriados` → array de feriados con `sucursal` incluida; `POST /api/admin/dias-feriados` con body `{ fecha, nombre, sucursal_id? }` → feriado creado (201); `DELETE /api/admin/dias-feriados/:id` → `{ ok: true }` (200) o 404.

- [ ] **Step 1: Crear el route handler de lista/creación**

Crea `app/api/admin/dias-feriados/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { diaFeriadoCreateSchema } from '@/lib/server/dto/horario-trabajadores.dto';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const feriados = await prisma.diaFeriado.findMany({
      include: { sucursal: { select: { nombre: true } } },
      orderBy: { fecha: 'asc' },
    });
    return NextResponse.json(feriados);
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = diaFeriadoCreateSchema.parse(await req.json());

    const feriado = await prisma.diaFeriado.create({
      data: {
        fecha: input.fecha,
        nombre: input.nombre,
        sucursal_id: input.sucursal_id ?? null,
      },
    });

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'CREO',
      entidad: 'DiaFeriado',
      entidadId: feriado.id,
      detalle: `Creó feriado "${feriado.nombre}" (${input.fecha.toISOString().slice(0, 10)})`,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json(feriado, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
```

- [ ] **Step 2: Crear el route handler de eliminación**

Crea `app/api/admin/dias-feriados/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, NotFoundError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const feriadoId = Number(id);

    const feriado = await prisma.diaFeriado.findUnique({ where: { id: feriadoId } });
    if (!feriado) throw new NotFoundError('Feriado no encontrado');

    await prisma.diaFeriado.delete({ where: { id: feriadoId } });

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'ELIMINO',
      entidad: 'DiaFeriado',
      entidadId: feriadoId,
      detalle: `Eliminó feriado "${feriado.nombre}"`,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}
```

- [ ] **Step 3: Verificar con curl**

Con el servidor de dev corriendo y `/tmp/cookies-horarios.txt` de la Task 2 (o repite el login si expiró):

```bash
curl -s -b /tmp/cookies-horarios.txt -X POST http://localhost:3000/api/admin/dias-feriados \
  -H "Content-Type: application/json" \
  -d '{"fecha":"2026-12-25","nombre":"Navidad"}'
```

Expected: `201` con `"nombre":"Navidad"`, `"sucursal_id":null`.

```bash
curl -s -b /tmp/cookies-horarios.txt http://localhost:3000/api/admin/dias-feriados
```

Expected: array con el feriado creado, `sucursal: null` (porque `sucursal_id` es null).

Anota el `id` devuelto (ej. `1`) y verifica el `DELETE`:

```bash
curl -s -b /tmp/cookies-horarios.txt -X DELETE http://localhost:3000/api/admin/dias-feriados/1
```

Expected: `{"ok":true}`.

Verifica `DELETE` de un id inexistente:

```bash
curl -s -b /tmp/cookies-horarios.txt -X DELETE http://localhost:3000/api/admin/dias-feriados/999999
```

Expected: `404` con `{"error":"Feriado no encontrado"}`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/admin/dias-feriados/route.ts" "app/api/admin/dias-feriados/[id]/route.ts"
git commit -m "feat: endpoint GET/POST/DELETE para dias feriados"
```

---

### Task 4: Frontend — nav, hooks, página y grilla editable

**Files:**
- Modify: `components/admin/AdminPanel.tsx`
- Create: `hooks/admin-horario-trabajadores.ts`
- Create: `app/admin/horario-trabajadores/page.tsx`
- Create: `components/admin/HorarioTrabajadores.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/admin/horario-trabajadores`, `GET/POST /api/admin/dias-feriados`, `DELETE /api/admin/dias-feriados/:id` (Tasks 2-3); `useAdminUsuarios()` de `@/hooks/admin-usuarios` (ya existe, devuelve `{ items: Usuario[] }` donde cada usuario incluye `sucursal: { nombre }`); `EmptyState` de `@/components/ui/EmptyState` (props `{ title: string; hint?: string }`).
- Produces: página navegable en `/admin/horario-trabajadores`.

- [ ] **Step 1: Agregar el item de navegación**

En `components/admin/AdminPanel.tsx`, dentro del grupo `'Gestión'`, reemplaza:

```tsx
  {
    label: 'Gestión',
    items: [
      { to: '/admin/clientes', label: 'Clientes', icon: Icons.clientes },
      { to: '/admin/privilegios', label: 'Privilegios', icon: Icons.privilegios },
      { to: '/admin/reglasHorarias', label: 'Horarios', icon: Icons.horarios },
      { to: '/admin/usuarios', label: 'Usuarios', icon: Icons.usuarios },
      { to: '/admin/auditoria', label: 'Auditoría', icon: Icons.auditoria },
    ],
  },
```

por:

```tsx
  {
    label: 'Gestión',
    items: [
      { to: '/admin/clientes', label: 'Clientes', icon: Icons.clientes },
      { to: '/admin/privilegios', label: 'Privilegios', icon: Icons.privilegios },
      { to: '/admin/reglasHorarias', label: 'Horarios', icon: Icons.horarios },
      { to: '/admin/usuarios', label: 'Usuarios', icon: Icons.usuarios },
      { to: '/admin/horario-trabajadores', label: 'Horario de Trabajadores', icon: Icons.horarios },
      { to: '/admin/auditoria', label: 'Auditoría', icon: Icons.auditoria },
    ],
  },
```

- [ ] **Step 2: Crear los hooks de datos**

Crea `hooks/admin-horario-trabajadores.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export interface HorarioCelda {
  id: number;
  usuario_id: number;
  dia_semana: number;
  es_libre: boolean;
  hora_entrada: string | null;
  hora_salida: string | null;
}

export interface CeldaPayload {
  usuario_id: number;
  dia_semana: number;
  es_libre: boolean;
  hora_entrada?: string | null;
  hora_salida?: string | null;
}

export interface DiaFeriado {
  id: number;
  fecha: string;
  nombre: string;
  sucursal_id: number | null;
  sucursal?: { nombre: string } | null;
}

export interface DiaFeriadoPayload {
  fecha: string;
  nombre: string;
  sucursal_id?: number | null;
}

export function useHorariosTrabajadores() {
  return useQuery({
    queryKey: ['admin', 'horario-trabajadores'],
    queryFn: async () => (await apiClient.get<HorarioCelda[]>('/api/admin/horario-trabajadores')).data,
  });
}

export function useGuardarCeldaHorario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CeldaPayload) => (await apiClient.put<HorarioCelda>('/api/admin/horario-trabajadores', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'horario-trabajadores'] }),
  });
}

export function useDiasFeriados() {
  return useQuery({
    queryKey: ['admin', 'dias-feriados'],
    queryFn: async () => (await apiClient.get<DiaFeriado[]>('/api/admin/dias-feriados')).data,
  });
}

export function useCrearDiaFeriado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DiaFeriadoPayload) => (await apiClient.post<DiaFeriado>('/api/admin/dias-feriados', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'dias-feriados'] }),
  });
}

export function useEliminarDiaFeriado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`/api/admin/dias-feriados/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'dias-feriados'] }),
  });
}
```

- [ ] **Step 3: Crear la página**

Crea `app/admin/horario-trabajadores/page.tsx`:

```tsx
'use client';

import AdminPanel from '@/components/admin/AdminPanel';
import HorarioTrabajadores from '@/components/admin/HorarioTrabajadores';

export default function HorarioTrabajadoresPage() {
  return (
    <AdminPanel>
      <HorarioTrabajadores />
    </AdminPanel>
  );
}
```

- [ ] **Step 4: Crear el componente de la grilla**

Crea `components/admin/HorarioTrabajadores.tsx`:

```tsx
'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useAdminUsuarios } from '@/hooks/admin-usuarios';
import {
  type CeldaPayload,
  type DiaFeriadoPayload,
  useCrearDiaFeriado,
  useDiasFeriados,
  useEliminarDiaFeriado,
  useGuardarCeldaHorario,
  useHorariosTrabajadores,
} from '@/hooks/admin-horario-trabajadores';
import EmptyState from '@/components/ui/EmptyState';

interface UsuarioStaff {
  id: number;
  nombre: string;
  apellido_paterno: string;
  rol: string;
  sucursal?: { nombre: string } | null;
}

const DIAS: { numero: number; label: string }[] = [
  { numero: 1, label: 'Lunes' },
  { numero: 2, label: 'Martes' },
  { numero: 3, label: 'Miércoles' },
  { numero: 4, label: 'Jueves' },
  { numero: 5, label: 'Viernes' },
  { numero: 6, label: 'Sábado' },
  { numero: 7, label: 'Domingo' },
];

const ROLES_STAFF = ['DUENO', 'ADMIN', 'CAJERO'];

function fmtFecha(value: string) {
  return new Date(value).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface CeldaEditorProps {
  usuarioId: number;
  diaSemana: number;
  actual: { es_libre: boolean; hora_entrada: string | null; hora_salida: string | null } | null;
  onClose: () => void;
  onSubmit: (payload: CeldaPayload) => void;
  saving: boolean;
}

function CeldaEditor({ usuarioId, diaSemana, actual, onClose, onSubmit, saving }: CeldaEditorProps) {
  const [esLibre, setEsLibre] = useState(actual?.es_libre ?? false);
  const [horaEntrada, setHoraEntrada] = useState(actual?.hora_entrada ?? '09:00');
  const [horaSalida, setHoraSalida] = useState(actual?.hora_salida ?? '18:00');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      usuario_id: usuarioId,
      dia_semana: diaSemana,
      es_libre: esLibre,
      hora_entrada: esLibre ? null : horaEntrada,
      hora_salida: esLibre ? null : horaSalida,
    });
  };

  return (
    <div
      style={{
        position: 'absolute', top: '100%', left: 0, zIndex: 30, minWidth: 220,
        background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-md)', padding: 12,
      }}
      onClick={event => event.stopPropagation()}
    >
      <form onSubmit={submit}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={esLibre} onChange={event => setEsLibre(event.target.checked)} />
          <span>Libre</span>
        </label>
        {!esLibre && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input type="time" value={horaEntrada} onChange={event => setHoraEntrada(event.target.value)} required />
            <input type="time" value={horaSalida} onChange={event => setHoraSalida(event.target.value)} required />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>Guardar</button>
        </div>
      </form>
    </div>
  );
}

function NuevoFeriadoModal({
  onClose,
  onSubmit,
  saving,
  sucursales,
}: {
  onClose: () => void;
  onSubmit: (payload: DiaFeriadoPayload) => void;
  saving: boolean;
  sucursales: { id: number; nombre: string }[];
}) {
  const [form, setForm] = useState<DiaFeriadoPayload>({ fecha: '', nombre: '', sucursal_id: null });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="admin-modal-overlay">
      <form onSubmit={submit} className="admin-modal">
        <div className="admin-modal-header">
          <h2>Nuevo feriado</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={event => setForm({ ...form, fecha: event.target.value })} required />
            </div>
            <div className="form-group">
              <label>Nombre</label>
              <input value={form.nombre} onChange={event => setForm({ ...form, nombre: event.target.value })} placeholder="Ej. Año Nuevo" required />
            </div>
            <div className="form-group full">
              <label>Sucursal</label>
              <select
                value={form.sucursal_id ?? ''}
                onChange={event => setForm({ ...form, sucursal_id: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">Todas las sucursales</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>Guardar</button>
        </div>
      </form>
    </div>
  );
}

export default function HorarioTrabajadores() {
  const usuariosQuery = useAdminUsuarios();
  const horariosQuery = useHorariosTrabajadores();
  const feriadosQuery = useDiasFeriados();
  const guardarCelda = useGuardarCeldaHorario();
  const crearFeriado = useCrearDiaFeriado();
  const eliminarFeriado = useEliminarDiaFeriado();

  const [editingCelda, setEditingCelda] = useState<{ usuarioId: number; diaSemana: number } | null>(null);
  const [showFeriadoModal, setShowFeriadoModal] = useState(false);

  const usuarios: UsuarioStaff[] = useMemo(
    () => (usuariosQuery.data?.items ?? []).filter((u: UsuarioStaff) => ROLES_STAFF.includes(u.rol)),
    [usuariosQuery.data],
  );

  const horarioPorCelda = useMemo(() => {
    const map = new Map<string, { es_libre: boolean; hora_entrada: string | null; hora_salida: string | null }>();
    for (const h of horariosQuery.data ?? []) {
      map.set(`${h.usuario_id}-${h.dia_semana}`, h);
    }
    return map;
  }, [horariosQuery.data]);

  const sucursalesUnicas = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of usuarios as (UsuarioStaff & { sucursal_id?: number | null })[]) {
      if (u.sucursal_id && u.sucursal?.nombre) map.set(u.sucursal_id, u.sucursal.nombre);
    }
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [usuarios]);

  if (usuariosQuery.isLoading || horariosQuery.isLoading) {
    return <EmptyState title="Cargando horarios..." />;
  }

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Horario de Trabajadores</h1>
          <p>Plantilla semanal por usuario: días laborales, horarios y días libres.</p>
        </div>
      </div>

      {usuarios.length === 0 ? (
        <EmptyState title="Sin usuarios de staff registrados" hint="Crea usuarios con rol DUEÑO, ADMIN o CAJERO en /admin/usuarios." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Sucursal</th>
                {DIAS.map(d => <th key={d.numero}>{d.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {usuarios.map(usuario => (
                <tr key={usuario.id}>
                  <td>{usuario.nombre} {usuario.apellido_paterno}</td>
                  <td>{usuario.sucursal?.nombre ?? '—'}</td>
                  {DIAS.map(dia => {
                    const celda = horarioPorCelda.get(`${usuario.id}-${dia.numero}`);
                    const isEditing = editingCelda?.usuarioId === usuario.id && editingCelda?.diaSemana === dia.numero;
                    return (
                      <td key={dia.numero} style={{ position: 'relative' }}>
                        <button
                          className="admin-btn ghost"
                          type="button"
                          onClick={() => setEditingCelda({ usuarioId: usuario.id, diaSemana: dia.numero })}
                        >
                          {!celda ? 'Sin definir' : celda.es_libre ? 'Libre' : `${celda.hora_entrada}–${celda.hora_salida}`}
                        </button>
                        {isEditing && (
                          <CeldaEditor
                            usuarioId={usuario.id}
                            diaSemana={dia.numero}
                            actual={celda ?? null}
                            onClose={() => setEditingCelda(null)}
                            saving={guardarCelda.isPending}
                            onSubmit={payload => guardarCelda.mutate(payload, { onSuccess: () => setEditingCelda(null) })}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-page-header" style={{ marginTop: 32 }}>
        <div>
          <h2>Días feriados</h2>
          <p>Fechas que no cuentan como día laboral para el personal.</p>
        </div>
        <button className="admin-btn primary" type="button" onClick={() => setShowFeriadoModal(true)}>+ Feriado</button>
      </div>

      {(feriadosQuery.data ?? []).length === 0 ? (
        <EmptyState title="Sin feriados registrados" />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Nombre</th>
                <th>Sucursal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(feriadosQuery.data ?? []).map(feriado => (
                <tr key={feriado.id}>
                  <td>{fmtFecha(feriado.fecha)}</td>
                  <td>{feriado.nombre}</td>
                  <td>{feriado.sucursal?.nombre ?? 'Todas'}</td>
                  <td>
                    <button
                      className="admin-btn ghost"
                      type="button"
                      disabled={eliminarFeriado.isPending}
                      onClick={() => eliminarFeriado.mutate(feriado.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showFeriadoModal && (
        <NuevoFeriadoModal
          sucursales={sucursalesUnicas}
          onClose={() => setShowFeriadoModal(false)}
          saving={crearFeriado.isPending}
          onSubmit={payload => crearFeriado.mutate(payload, { onSuccess: () => setShowFeriadoModal(false) })}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Chequeo de tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores relacionados a `HorarioTrabajadores.tsx`, `admin-horario-trabajadores.ts`, `AdminPanel.tsx`, o las rutas nuevas.

- [ ] **Step 6: Verificación manual en el navegador**

Con `npm run dev` corriendo y sesión iniciada como `benjaherediaruiz@gmail.com` / `benja122`:

1. Ve a `http://localhost:3000/admin` y confirma que el sidebar (grupo "Gestión") ahora muestra **"Horario de Trabajadores"** entre "Usuarios" y "Auditoría".
2. Click en ese item — debe cargar la grilla con una fila por cada usuario de rol DUEÑO/ADMIN/CAJERO, mostrando su sucursal, y 7 columnas (Lunes a Domingo) con "Sin definir" en cada celda si no hay datos previos.
3. Click en una celda — debe abrir el editor con el checkbox "Libre" y, si no está marcado, dos campos de hora (por defecto 09:00–18:00).
4. Guarda una celda con horario — debe cerrarse el editor y la celda debe mostrar `"09:00–18:00"`.
5. Edita esa misma celda y marca "Libre" — debe guardar y mostrar `"Libre"`.
6. Debajo de la grilla, en "Días feriados", click **"+ Feriado"**, completa fecha + nombre, guarda — debe aparecer en la lista.
7. Click "Eliminar" en ese feriado — debe desaparecer de la lista.

- [ ] **Step 7: Commit**

```bash
git add components/admin/AdminPanel.tsx hooks/admin-horario-trabajadores.ts app/admin/horario-trabajadores/page.tsx components/admin/HorarioTrabajadores.tsx
git commit -m "feat: pagina de Horario de Trabajadores (grilla semanal + dias feriados)"
```

---

## Fuera de alcance (recordatorio del spec)

- Excepciones por fecha específica para un empleado individual (solo la plantilla semanal + feriados compartidos).
- Cálculo de horas trabajadas, integración con nómina, o reportes.
- Notificaciones a los empleados sobre cambios de horario.
- Modelo "Empleado" separado de `Usuario` (el personal sigue siendo exactamente los usuarios de staff ya existentes).
