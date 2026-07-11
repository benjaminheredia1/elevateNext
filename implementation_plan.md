# Implementation Plan — Horario de Trabajadores (`/admin/horarios-trabajadores`)

> Estado: **PLANIFICACIÓN** (sin código todavía). Documento de diseño técnico para
> incorporar la sección "Horario de Trabajadores" al panel de administración de Elevate.
> Branch: `feat/horario-trabajadores`.

---

## 1. Objetivo y alcance

Incorporar en el panel de administrador una nueva sección **"Horario de Trabajadores"**
que permita a `DUENO`/`ADMIN`:

- Visualizar y **editar en formato de celdas (tipo hoja de cálculo)** los días laborales
  del personal (trabajadores = usuarios con rol `CAJERO`, opcionalmente `ADMIN`/`DUENO`).
- Gestionar por cada trabajador y día de la semana: **día libre**, **hora de entrada** y
  **hora de salida**.
- Gestionar **días feriados** (fecha + nombre), globales o por sucursal.
- Mostrar, junto al trabajador, la **sucursal** y el **negocio** (marca) correspondientes.

El requerimiento (imagen 2) resume: *"un botón de horarios de trabajadores que permita
visualizar los días laborales del personal, así como la sucursal y el negocio
correspondientes. Esta sección debe ser editable en formato de celdas, similar a una hoja
de cálculo, con el fin de gestionar los días libres, los horarios de entrada y salida, y
los días feriados."*

### Fuera de alcance (v1)
- Cálculo de nómina / horas trabajadas reales (fichaje/check-in).
- Turnos rotativos por semana específica (el modelo actual es un patrón semanal fijo).
- Notificaciones al trabajador.

---

## 2. Estado actual del código (auditoría previa)

Lo que **ya existe** en el repositorio (no rehacer):

| Pieza | Estado | Ubicación |
|---|---|---|
| Modelo `HorarioTrabajador` | ✅ Existe | `prisma/schema.prisma:659` |
| Modelo `DiaFeriado` | ✅ Existe | `prisma/schema.prisma:673` |
| Migración de tablas | ✅ Aplicada | `prisma/migrations/20260711053402_sync_schema_drift/migration.sql` |
| Relación `Usuario.horarios` | ✅ Existe | `prisma/schema.prisma:120` |
| Relación `Sucursal.diasFeriados` | ✅ Existe | `prisma/schema.prisma:439` |

Lo que **falta construir** (foco de este plan): DTO/validación, rutas API, hooks de
cliente, página UI tipo hoja de cálculo, y el ítem de navegación en el sidebar.

> ⚠️ **Nota de BD compartida.** Según el histórico del proyecto (BD Supabase única para
> dev/prod, incidente de drift 2026-07-05), **las tablas ya están creadas** vía la
> migración de sync. **Este plan NO requiere cambios de schema** salvo los índices
> opcionales de §5.2, que de aplicarse deben ir por SQL aditivo + `migrate resolve`,
> nunca `migrate dev`.

### Modelos relevantes (ya en schema)

```prisma
model HorarioTrabajador {
  id           Int      @id @default(autoincrement())
  usuario_id   Int
  dia_semana   Int      // 1=lunes ... 7=domingo (ISO 8601)
  es_libre     Boolean  @default(false)
  hora_entrada String?  // "HH:MM", null cuando es_libre = true
  hora_salida  String?  // "HH:MM", null cuando es_libre = true
  usuario      Usuario  @relation(fields: [usuario_id], references: [id], onDelete: Cascade)
  @@unique([usuario_id, dia_semana])
}

model DiaFeriado {
  id          Int       @id @default(autoincrement())
  fecha       DateTime  @db.Date
  nombre      String
  sucursal_id Int?
  sucursal    Sucursal? @relation(fields: [sucursal_id], references: [id])
  @@unique([fecha, sucursal_id])
}
```

---

## 3. Arquitectura y convenciones a seguir

El módulo debe replicar los patrones ya establecidos en el codebase (consistencia = menor
superficie de bug y de revisión):

- **Auth server-side**: `requireAuth(req)` + `requireRole(session, [...])` desde
  `lib/server/auth/session.ts`. Sesión por cookie httpOnly (JWT), rol viene del usuario en BD.
- **Validación**: Zod DTO en `lib/server/dto/*.dto.ts`, `schema.parse(await req.json())`.
- **Errores**: `try { ... } catch (e) { return handleApiError(e); }` (`lib/server/errors.ts`).
  Usar `NotFoundError`, `ConflictError`, `ValidationError`.
- **Auditoría**: `logAudit({ usuarioId, rol, accion, entidad, entidadId, detalle, ip, userAgent })`
  en toda mutación (crear/editar/eliminar), como en `app/api/admin/usuarios/route.ts`.
- **Cliente**: React Query (`@tanstack/react-query`) + `apiClient` (axios) en `hooks/`.
- **UI**: `AdminPanel` wrapper, componentes `ui/` (`DataTable`, `KpiCard`, `EmptyState`,
  `StatusBadge`), clases CSS `admin-*` de `app/admin/admin.css`.
- **Protección de ruta en cliente**: el `AdminLayout` ya envuelve todo `/admin` con
  `ProtectedRoute roles={['DUENO','ADMIN']}` — la nueva página queda protegida automáticamente.

---

## 4. Diseño de la API (backend)

Se crean **dos recursos** bajo `/api/admin/`, coherentes con el resto del panel.

### 4.1 `app/api/admin/horarios-trabajadores/route.ts`

Gestiona la parrilla semanal de horarios.

| Método | Descripción | Rol |
|---|---|---|
| `GET` | Devuelve trabajadores + su matriz de 7 días + sucursal/marca. | `DUENO`, `ADMIN` |
| `PUT` | **Upsert por lote** de celdas editadas (una o varias). | `DUENO`, `ADMIN` |

**`GET`** — respuesta pensada para pintar la hoja de cálculo directamente:

```jsonc
{
  "trabajadores": [
    {
      "usuario_id": 4,
      "nombre": "Juan Pérez",
      "rol": "CAJERO",
      "sucursal": { "id": 1, "nombre": "Sucursal Centro" },
      "negocio": "Elevate",          // marca/negocio (ver §7)
      "dias": {
        "1": { "es_libre": false, "hora_entrada": "08:00", "hora_salida": "16:00" },
        "2": { "es_libre": true,  "hora_entrada": null,    "hora_salida": null },
        // ... 3..7 (los días sin registro se devuelven con defaults)
      }
    }
  ]
}
```

- Query: `prisma.usuario.findMany({ where: { activo: true, rol: { in: ROLES_TRABAJADOR } }, include: { horarios: true, sucursal: true } })`.
- El backend **normaliza** siempre los 7 días (rellena huecos con `{ es_libre:false, ... }`)
  para que el frontend no tenga que adivinar celdas faltantes.
- `ROLES_TRABAJADOR = ['CAJERO', 'ADMIN', 'DUENO']` (configurable; por defecto el personal
  operativo son cajeros — decidir con el usuario si `ADMIN/DUENO` deben aparecer).

**`PUT`** — recibe un lote de celdas. Upsert atómico en transacción:

```jsonc
{
  "cambios": [
    { "usuario_id": 4, "dia_semana": 1, "es_libre": false, "hora_entrada": "08:00", "hora_salida": "16:00" },
    { "usuario_id": 4, "dia_semana": 2, "es_libre": true }
  ]
}
```

- Implementación: `prisma.$transaction(cambios.map(c => prisma.horarioTrabajador.upsert({ where: { usuario_id_dia_semana: {...} }, create, update })))`.
  Usa el índice único `@@unique([usuario_id, dia_semana])`.
- **Regla de negocio**: si `es_libre === true` ⇒ forzar `hora_entrada=null`, `hora_salida=null`.
  Si `es_libre === false` ⇒ ambas horas obligatorias y `hora_salida > hora_entrada`.
- Validar que cada `usuario_id` exista, esté activo y sea un rol trabajador (evita crear
  horarios para clientes por manipulación del payload).
- `logAudit` con `accion: 'MODIFICO'`, `entidad: 'HorarioTrabajador'`, detalle resumido
  (ej. `"Actualizó 2 celdas de horario (usuario 4)"`).

### 4.2 `app/api/admin/dias-feriados/route.ts`

| Método | Descripción | Rol |
|---|---|---|
| `GET` | Lista feriados (opcional `?sucursal_id=`, `?anio=`). | `DUENO`, `ADMIN` |
| `POST` | Crea un feriado. | `DUENO`, `ADMIN` |
| `DELETE` | Elimina un feriado (`?id=`). | `DUENO`, `ADMIN` |

- `POST` valida `fecha` (ISO date), `nombre`, `sucursal_id?`. Colisión con
  `@@unique([fecha, sucursal_id])` ⇒ atrapar y lanzar `ConflictError('Ya existe un feriado para esa fecha')`.
- `sucursal_id = null` ⇒ feriado **global** (aplica a todas las sucursales).
- `logAudit` con `accion: 'CREO' | 'ELIMINO'`, `entidad: 'DiaFeriado'`.
- (Opcional) `PUT` para editar nombre; v1 puede resolverse con delete + create.

### 4.3 DTO — `lib/server/dto/horarios-trabajadores.dto.ts`

```ts
import { z } from 'zod';

const horaRegex = /^([01]\d|2[0-3]):[0-5]\d$/; // "HH:MM" 24h

export const celdaHorarioSchema = z.object({
  usuario_id: z.coerce.number().int().positive(),
  dia_semana: z.coerce.number().int().min(1).max(7),
  es_libre: z.boolean().default(false),
  hora_entrada: z.string().regex(horaRegex).nullable().optional(),
  hora_salida: z.string().regex(horaRegex).nullable().optional(),
}).refine(c => c.es_libre || (c.hora_entrada && c.hora_salida), {
  message: 'Si no es día libre, hora de entrada y salida son obligatorias',
}).refine(c => c.es_libre || (c.hora_entrada! < c.hora_salida!), {
  message: 'La hora de salida debe ser posterior a la de entrada',
});

export const horariosBatchSchema = z.object({
  cambios: z.array(celdaHorarioSchema).min(1).max(200), // cota anti-abuso
});

export const feriadoCreateSchema = z.object({
  fecha: z.coerce.date(),
  nombre: z.string().trim().min(2).max(120),
  sucursal_id: z.coerce.number().int().positive().nullable().optional(),
});

export const idSchema = z.object({ id: z.coerce.number().int().positive() });
```

> Comparación de horas como string `"HH:MM"` es válida lexicográficamente (orden = orden
> cronológico dentro del mismo día). Documentar la asunción "mismo día" (no turnos nocturnos
> que crucen medianoche en v1).

---

## 5. Seguridad (ciberseguridad)

Tratado como requisito de primer nivel, no como añadido.

### 5.1 Control de acceso
- **Todas** las rutas: `requireAuth` + `requireRole(['DUENO','ADMIN'])`. Un `CAJERO` no
  puede leer ni editar horarios de otros (solo lectura de su propio horario podría ser una
  feature futura, fuera de v1).
- La página `/admin/horarios-trabajadores` queda protegida por el `ProtectedRoute` del
  `AdminLayout` — pero **la autorización real vive en el servidor** (nunca confiar en el guard
  de cliente; es solo UX).

### 5.2 Integridad de datos / validación
- **Input validation estricta** con Zod (regex de hora, rango 1–7 de día, cota de tamaño de
  lote para prevenir payloads gigantes / DoS).
- **Verificación de pertenencia de rol**: antes de upsert, confirmar que cada `usuario_id`
  es un trabajador activo. Impide inyectar horarios a `CLIENTE` u otros usuarios vía payload.
- **Transacción** para el batch upsert: o se aplican todos los cambios o ninguno (consistencia).
- El `@@unique([usuario_id, dia_semana])` protege a nivel BD contra duplicados aun con
  requests concurrentes (carrera).
- (Opcional, mejora) índices para lectura: `@@index([usuario_id])` en `HorarioTrabajador` y
  `@@index([fecha])` en `DiaFeriado`. **Aplicar solo por SQL aditivo + `migrate resolve`**
  (regla de BD compartida). No bloqueante para v1.

### 5.3 Auditoría y trazabilidad
- Registrar toda mutación en `RegistroAuditoria` (append-only) con IP y user-agent, igual que
  el resto del panel. Permite responder "¿quién cambió el día libre de X y cuándo?".

### 5.4 Otras consideraciones
- **No exponer** campos sensibles del usuario en el `GET` (nunca `password`/`token`; usar
  `select` explícito con solo `id, nombre, apellido_*, rol, sucursal`).
- **CSRF**: al usar cookie httpOnly + JWT, mantener el patrón existente (mutaciones vía
  `apiClient` con métodos no-GET; el proyecto ya opera así). Si se endurece a futuro,
  considerar `SameSite=Strict` en la cookie (fuera de alcance de esta feature).
- **Rate/size limits**: `.max(200)` en el batch acota el peor caso.

---

## 6. Frontend — UI tipo hoja de cálculo

### 6.1 Página `app/admin/horarios-trabajadores/page.tsx`
`'use client'`, envuelta en `<AdminPanel>`. Dos bloques:

**A) Parrilla semanal (spreadsheet)**
- Tabla: **filas = trabajadores**, **columnas = Lun…Dom** (7) + columnas informativas
  **Sucursal** y **Negocio** (fijadas a la izquierda, solo lectura).
- Cada celda día es **editable in-place**:
  - Toggle **"Libre"** (chip). Si libre ⇒ celda muestra "Libre" y oculta inputs de hora.
  - Si no libre ⇒ dos inputs `type="time"` (entrada / salida).
- Edición optimista local: se acumulan celdas modificadas en estado (`dirtyCells`), botón
  **"Guardar cambios"** dispara `PUT` en lote. Indicador visual de celdas sin guardar.
- Encabezado con `KpiCard`: nº trabajadores, nº días libres esta semana, nº feriados próximos.
- Estados `EmptyState` para loading / error / sin trabajadores (patrón de `usuarios/page.tsx`).

**B) Panel de días feriados**
- Lista/tabla de feriados (`DataTable`) con fecha, nombre, sucursal (o "Global").
- Formulario rápido (fecha + nombre + selector de sucursal opcional) → `POST`.
- Botón eliminar por fila → `DELETE`.

**Consideración UX/accesibilidad**: navegación por teclado entre celdas (tab), inputs
`type="time"` nativos (validación de formato gratis), y confirmación al salir con cambios sin
guardar (`beforeunload` o guard simple).

> Nota de diseño: mantener el estilo del panel (paleta verde/naranja, clases `admin-*`).
> Para una grilla densa se puede reutilizar `DataTable` con celdas custom, o una `<table>`
> propia con clases `admin-table`. Evaluar PrimeReact DataTable con edición de celda si se
> quiere una experiencia de hoja de cálculo más rica (ya es dependencia del proyecto).

### 6.2 Hooks — `hooks/admin-horarios-trabajadores.ts`
Replicando `hooks/admin-usuarios.ts`:

```ts
export function useHorariosTrabajadores()      // GET  /api/admin/horarios-trabajadores
export function useGuardarHorarios()           // PUT  (batch de celdas) + invalidate
export function useDiasFeriados(params?)        // GET  /api/admin/dias-feriados
export function useCrearFeriado()               // POST + invalidate
export function useEliminarFeriado()            // DELETE + invalidate
```

Tipos exportados: `CeldaHorario`, `TrabajadorHorario`, `Feriado`.

### 6.3 Navegación — `components/admin/AdminPanel.tsx`
Añadir el ítem al grupo **"Gestión"** (`NAV_GROUPS`), junto a "Horarios" (promociones) y
"Usuarios". Reutilizar/duplicar un icono de calendario (existe `Icons.horarios` = reloj;
se puede agregar `Icons.calendarWorkers` con el SVG de calendario de la imagen 1):

```ts
{ to: '/admin/horarios-trabajadores', label: 'Horario de Trabajadores', icon: Icons.calendarWorkers },
```

> Ojo con la detección de activo: `pathname.startsWith('/admin/horarios-trabajadores')`.
> El ítem existente "Horarios" apunta a `/admin/reglasHorarias`, así que no hay colisión de prefijo.

---

## 7. "Negocio" (marca) — resolución del dato

La imagen pide mostrar el **negocio** de cada trabajador. En el schema, el negocio ≈ **Marca**
(`Marca`: "elevate" | "fitbull"), pero **la marca se relaciona a `Producto`, no a `Usuario`**.
No existe hoy un vínculo trabajador→negocio.

**Opciones (decisión de producto, ver §10):**
1. **v1 simple**: mostrar el negocio derivado de la **sucursal** (si el negocio se asume 1:1
   con sucursal) o un valor fijo "Elevate". Cero cambios de schema.
2. **v2**: añadir `negocio`/`marca_id` a `Usuario` (o a `Sucursal`) — requiere SQL aditivo
   (columna nullable) + `migrate resolve`. Recomendado si de verdad hay multi-negocio por
   trabajador.

El plan asume **opción 1** para no tocar schema; el `GET` devuelve `negocio` derivado de la
sucursal/config. Se deja el enganche listo para migrar a opción 2.

---

## 8. Archivos a crear / modificar

**Nuevos:**
- `lib/server/dto/horarios-trabajadores.dto.ts`
- `app/api/admin/horarios-trabajadores/route.ts`
- `app/api/admin/dias-feriados/route.ts`
- `hooks/admin-horarios-trabajadores.ts`
- `app/admin/horarios-trabajadores/page.tsx`

**Modificados:**
- `components/admin/AdminPanel.tsx` (nuevo ítem de nav + icono)

**Sin cambios de schema** (tablas ya migradas). Índices opcionales de §5.2 solo si se decide,
vía SQL aditivo + `migrate resolve`.

---

## 9. Plan de pruebas (obligatorio — verificar flujo y funcionalidades)

Toda la feature debe entregarse **con pruebas que demuestren que el flujo funciona de
extremo a extremo**, no solo que compila. Stack actual del repo (confirmado en
`package.json`): **Vitest** (`npm test` → `vitest run`) con **BD de prueba real** vía
`.env.test` (el script `pretest` hace `prisma db push` + `prisma db seed` sobre esa BD).
**No hay framework E2E de navegador instalado** (Playwright/Cypress) — ver §9.4 para la
decisión.

> ⚠️ **Regla de oro (BD compartida)**: las pruebas de integración/BD corren **solo** contra
> la BD de `.env.test`, **nunca** contra la Supabase de dev/prod. Confirmar que
> `.env.test` apunta a una base desechable antes de correr `npm test`.

### 9.1 Estrategia — pirámide de pruebas

```
        ▲  E2E (navegador)      → §9.4: manual `verify` ahora; Playwright opcional a futuro
       ▲▲▲ Integración (API+BD) → §9.3: rutas reales contra .env.test, con auth+audit
      ▲▲▲▲ Unitarias (lógica)   → §9.2: reglas de negocio puras + Zod, sin BD
```

**Principio de diseño para testabilidad** (patrón ya usado en el repo, ej.
`faltantesPublicacion` / `assertPublicable` en `lib/server/productos/publicacion.ts`):
**extraer la lógica de negocio pura a funciones sin I/O** para poder testearla sin montar BD.
Crear:

- `lib/server/horarios/reglas.ts` con funciones puras:
  - `validarCelda(celda): string[]` → lista de errores (día libre sin horas, salida ≤ entrada, formato).
  - `normalizarCelda(celda)` → si `es_libre`, fuerza horas a `null`.
  - `normalizarSemana(horarios): Record<1..7, Celda>` → rellena los 7 días con defaults.
  - `esRolTrabajador(rol): boolean`.
- Estas funciones se testean directo en `lib/server/horarios/reglas.test.ts` (Vitest, sin BD),
  y se **reutilizan** dentro de las rutas API y del componente de UI (una sola fuente de verdad).

### 9.2 Pruebas unitarias (Vitest, sin BD) — `reglas.test.ts` + DTO

Casos mínimos:

| # | Caso | Esperado |
|---|---|---|
| 1 | Hora con formato inválido (`"8:0"`, `"25:00"`, `"12:60"`) | error/422 |
| 2 | `es_libre=false` sin `hora_entrada`/`hora_salida` | error "horas obligatorias" |
| 3 | `hora_salida <= hora_entrada` (`"16:00"`→`"08:00"`) | error "salida posterior" |
| 4 | `es_libre=true` con horas cargadas | `normalizarCelda` deja horas en `null` |
| 5 | `dia_semana` fuera de 1–7 (`0`, `8`) | error de rango |
| 6 | `normalizarSemana` con solo 3 días registrados | devuelve 7 días (4 con defaults) |
| 7 | `esRolTrabajador('CLIENTE')` | `false`; `'CAJERO'` → `true` |
| 8 | Batch > 200 celdas | Zod rechaza (cota anti-abuso) |
| 9 | Feriado: `nombre` vacío / fecha inválida | Zod rechaza |

### 9.3 Pruebas de integración (Vitest + BD `.env.test`)

Ejercitan las funciones handler reales (`GET`/`PUT`/`POST`/`DELETE`) con Prisma sobre la BD
de prueba. Se construye un `NextRequest` con cookie/token de un usuario semilla y se asertan
status + efectos en BD. Archivos: `app/api/admin/horarios-trabajadores/route.test.ts`,
`app/api/admin/dias-feriados/route.test.ts`.

**Horarios:**
- `GET` como `ADMIN` ⇒ 200 y devuelve trabajadores con los 7 días normalizados + sucursal/negocio.
- `PUT` crea celda nueva ⇒ 201/200, fila presente en BD con valores correctos.
- `PUT` **idempotente**: mismo `(usuario_id, dia_semana)` dos veces ⇒ **una sola fila**
  (verifica el `@@unique` y el `upsert`).
- `PUT` marcando `es_libre=true` ⇒ horas quedan `null` en BD.
- `PUT` en **transacción**: si una celda del lote es inválida ⇒ **ninguna** se aplica (rollback).
- `PUT` con `usuario_id` de un `CLIENTE` ⇒ 4xx (verificación de rol, no se crea nada).
- Cada mutación deja un registro en `RegistroAuditoria` (assert append-only).

**Feriados:**
- `POST` crea feriado global (`sucursal_id=null`) ⇒ presente en BD.
- `POST` duplicado (misma `fecha`+`sucursal_id`) ⇒ **409** (`ConflictError`, atrapa el unique).
- `DELETE ?id=` elimina y audita.

**Autorización (transversal, ambas rutas):**
- Sin token ⇒ **401**.
- Token de `CAJERO` ⇒ **403** en GET y en toda mutación.

### 9.4 Pruebas E2E / de flujo (UI)

No hay runner de navegador instalado. Dos niveles:

1. **Ahora (bloqueante para el merge)** — verificación manual guiada con la skill `verify`
   / `run` (levantar la app y ejercitar el flujo real navegador → API → BD → respuesta):
   - Entrar a `/admin/horarios-trabajadores` como `ADMIN` (y confirmar que un `CAJERO` es
     redirigido/bloqueado).
   - Editar una celda (poner entrada/salida), marcar otra como **Libre**, pulsar
     **"Guardar cambios"**, **refrescar** la página ⇒ los cambios **persisten**.
   - Intentar salir con cambios sin guardar ⇒ aparece la confirmación.
   - Crear un feriado y eliminarlo ⇒ se refleja en la tabla.
   - El ítem **"Horario de Trabajadores"** aparece en el sidebar, navega y queda activo.

2. **Opcional (mejora futura, fuera de v1)** — añadir **Playwright** como dependencia para
   automatizar el flujo anterior en CI. Es la única pieza que introduce una dependencia
   nueva; se propone como decisión aparte (ver §10.5) para no ampliar el alcance sin acuerdo.

### 9.5 Criterios de aceptación / "Definition of Done"

La feature se considera terminada **solo si**:
- `npm test` pasa (unitarias + integración) en verde.
- `npm run build` compila sin errores de TypeScript ni de ESLint (§6 de AGENTS.md).
- El flujo manual de §9.4.1 queda verificado y evidenciado (persistencia real tras refresh).
- Toda mutación genera su registro de auditoría.
- Ningún endpoint responde 2xx a un rol no autorizado.

---

## 10. Decisiones abiertas (requieren confirmación del usuario)

1. **¿Qué roles cuentan como "trabajadores"?** ¿Solo `CAJERO`, o también `ADMIN`/`DUENO`?
2. **"Negocio"**: ¿derivarlo de la sucursal / valor fijo (v1, sin schema), o agregar campo a
   `Usuario` (v2, SQL aditivo)? (§7)
3. **Feriados**: ¿globales, por sucursal, o ambos? (el modelo ya soporta ambos).
4. **¿Turnos que cruzan medianoche** (ej. 22:00–06:00)? v1 asume mismo día; si se necesita,
   cambia la validación `hora_salida > hora_entrada`.
5. **¿Automatizar E2E con Playwright** en CI (§9.4.2)? Introduce una dependencia nueva; por
   defecto v1 usa verificación manual con `verify`/`run` y deja Playwright como mejora futura.

---

## 11. Secuencia de implementación sugerida

1. **Lógica pura + DTO** (`lib/server/horarios/reglas.ts`, `horarios-trabajadores.dto.ts`)
   **con sus tests unitarios** (§9.2) — enfoque TDD: escribir `reglas.test.ts` en paralelo.
2. API `horarios-trabajadores/route.ts` (GET + PUT batch) con auth + audit
   **+ tests de integración** (§9.3) contra `.env.test`.
3. API `dias-feriados/route.ts` (GET/POST/DELETE) con auth + audit **+ tests de integración**.
4. Hooks React Query.
5. Página UI (grilla editable + panel feriados), reutilizando las funciones puras de §9.1.
6. Ítem de navegación en `AdminPanel`.
7. **Verificación de flujo** (§9.4.1) con `verify`/`run` + `npm test` verde + `npm run build`
   (typecheck/eslint limpio). Cerrar contra la "Definition of Done" (§9.5).
