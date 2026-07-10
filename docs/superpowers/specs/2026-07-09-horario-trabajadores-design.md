# Diseño: Horario de Trabajadores

## Contexto

Requerimiento: "incorporar, en el perfil de administrador, un botón de horarios de trabajadores que permita visualizar los días laborales del personal, así como la sucursal y el negocio correspondientes. Esta sección debe ser editable en formato de celdas, similar a una hoja de cálculo, con el fin de gestionar los días libres, los horarios de entrada y salida, y los días feriados."

## Decisiones de alcance (confirmadas con el usuario)

1. **Personal = `Usuario` existentes** con rol `DUENO`/`ADMIN`/`CAJERO` (los mismos ya usados en `/admin/usuarios`). No se crea un modelo "Empleado" separado; `CLIENTE` queda excluido.
2. **Modelo de horario = plantilla semanal + feriados como lista aparte**, no un calendario completo por fecha:
   - "Días libres" y "horarios de entrada/salida" viven en una plantilla semanal recurrente (Lunes a Domingo, un renglón por usuario).
   - "Días feriados" es una lista simple y compartida (fecha + nombre + sucursal opcional), no parte de la grilla de celdas — los feriados aplican a todo el personal de una sucursal (o a todas), no se editan por-empleado-por-celda.
3. **"Sucursal y negocio correspondiente"** = se muestra la `Sucursal` ya asociada a cada `Usuario` (`Usuario.sucursal_id`). No existe (ni se crea) un modelo "Negocio" separado — el sistema es de una sola empresa (Elevate) con múltiples sucursales.
4. Fuera de alcance explícito: excepciones puntuales por fecha específica para un empleado individual (ej. "Juan libra el 15 de marzo aunque su plantilla diga que trabaja los miércoles") — no lo pide el requerimiento tal cual, y agregarlo requeriría un sistema de calendario completo, mucho más grande.

## Modelo de datos (nuevo)

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
  sucursal_id Int?      // null = aplica a todas las sucursales
  sucursal    Sucursal? @relation(fields: [sucursal_id], references: [id])
  created_at  DateTime  @default(now())

  @@unique([fecha, sucursal_id])
}
```

`hora_entrada`/`hora_salida` como `String` (formato "HH:MM") siguiendo el mismo patrón ya usado en `ConfiguracionAlertas.hora_silencio_desde/hasta` — no se introduce un tipo de hora nuevo.

Se agregan las relaciones inversas `Usuario.horarios HorarioTrabajador[]` y `Sucursal.diasFeriados DiaFeriado[]`.

No hay fila por defecto: un usuario sin filas en `HorarioTrabajador` simplemente se muestra con celdas vacías/"Sin definir" en la grilla hasta que un admin las complete.

## API

Sigue el patrón de `app/api/admin/usuarios/route.ts` (validación Zod, `requireAuth`/`requireRole(['DUENO','ADMIN'])`, `logAudit`, `handleApiError`) — no el patrón `guard()` más simple, porque esta es una entidad de "Gestión" con las mismas necesidades de auditoría que Usuarios.

### `app/api/admin/horario-trabajadores/route.ts`
- `GET`: lista todas las filas de `HorarioTrabajador`, incluyendo `usuario: { select: { id, nombre, apellido_paterno, rol, sucursal: { select: { nombre: true } } } }`.
- `PUT`: upsert de una celda. Body: `{ usuario_id, dia_semana, es_libre, hora_entrada?, hora_salida? }`.
  - Validación Zod: `dia_semana` entero 1-7; si `es_libre` es `true`, `hora_entrada`/`hora_salida` se ignoran y se guardan como `null`; si `es_libre` es `false`, ambos son requeridos, formato `/^([01]\d|2[0-3]):[0-5]\d$/`, y `hora_entrada < hora_salida` (comparación de string funciona para este formato de 24h).
  - `prisma.horarioTrabajador.upsert({ where: { usuario_id_dia_semana: { usuario_id, dia_semana } }, ... })`.

### `app/api/admin/dias-feriados/route.ts`
- `GET`: lista todos los `DiaFeriado`, incluyendo `sucursal: { select: { nombre: true } }`.
- `POST`: crea uno. Body: `{ fecha, nombre, sucursal_id? }`.

### `app/api/admin/dias-feriados/[id]/route.ts`
- `DELETE`: elimina uno por id.

## Frontend

- Nuevo item en `components/admin/AdminPanel.tsx`, grupo "Gestión" (junto a Usuarios/Auditoría): `{ to: '/admin/horario-trabajadores', label: 'Horario de Trabajadores', icon: Icons.horarios }` (reutiliza el ícono ya existente de "Horarios", sin crear uno nuevo).
- Nueva página `app/admin/horario-trabajadores/page.tsx` (envuelve en `<AdminPanel>`, sigue el patrón de `app/admin/usuarios/page.tsx`).
- Nuevo componente `components/admin/HorarioTrabajadores.tsx`:
  - Reutiliza `useAdminUsuarios()` (ya existe en `hooks/admin-usuarios.ts`) para las filas, filtrado client-side a roles `['DUENO','ADMIN','CAJERO']`.
  - Nuevos hooks en `hooks/admin-horario-trabajadores.ts`: `useHorariosTrabajadores()`, `useGuardarCeldaHorario()`, `useDiasFeriados()`, `useCrearDiaFeriado()`, `useEliminarDiaFeriado()` — mismo estilo que `hooks/admin-usuarios.ts` (TanStack Query).
  - **Grilla**: tabla con una fila por usuario (nombre + sucursal) y 7 columnas (Lunes...Domingo). Cada celda muestra `"09:00–18:00"` o `"Libre"` o `"Sin definir"`, y al hacer click abre un popover pequeño con un checkbox "Libre" + (si no está marcado) dos inputs de hora; al guardar, llama a `useGuardarCeldaHorario()`.
  - **Sección de feriados**: lista simple debajo de la grilla (fecha, nombre, sucursal o "Todas"), botón "+ Feriado" (modal con fecha + nombre + sucursal opcional) y botón eliminar por fila — mismo patrón visual que `ReglasHorarias.tsx`.

## Fuera de alcance

- Excepciones por fecha específica para un empleado individual (solo la plantilla semanal + feriados compartidos).
- Cálculo de horas trabajadas, integración con nómina, o reportes — solo visualización y edición del horario.
- Notificaciones a los empleados sobre cambios de horario.
