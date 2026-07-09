# Diseño: Gestión de tipos de unidad para insumos

## Contexto

Hoy `Insumo.unidad_medida` es un enum fijo de Prisma (`Unidad_medida`: `KG, GR, UNIDAD, LT, ML`), también hardcodeado en el frontend (`UNITS` en `components/admin/AdminInsumos.tsx`). Un enum de Prisma no se puede extender desde la UI en tiempo de ejecución — cada unidad nueva requiere migración de base de datos y despliegue de código.

Objetivo: permitir que un administrador cree y administre tipos de unidad (paquete, caja, sobre, bandeja, sacos, etc.) desde la UI del módulo de Insumos, sin necesitar cambios de código.

Se referencia `unidad_medida` como string en ~18 archivos (recetas, movimientos, insumos mixtos, productos de reventa, dashboard, reportes, alertas WhatsApp). El diseño evita tocar esos archivos.

## Decisiones de alcance (confirmadas con el usuario)

1. **Tabla dinámica administrable**, no solo extender el enum fijo — el admin agrega/edita/desactiva unidades sin despliegues.
2. **Sin conversión entre unidades** — la unidad es una etiqueta descriptiva (igual que hoy con KG/GR/etc.), no hay factores de conversión a una unidad base.
3. **Acceso rápido en el modal de insumo** — botón "+ Nueva unidad" dentro del formulario de crear/editar insumo, más una pestaña "Unidades" dedicada para listar/editar/desactivar todas.
4. **Catálogo simple, sin llave foránea** — `Insumo.unidad_medida` sigue siendo `String` libre; la tabla `UnidadMedida` es solo el catálogo que alimenta el selector. Renombrar una unidad no actualiza en cascada los insumos existentes.

## 1. Modelo de datos (`prisma/schema.prisma`)

Nuevo modelo:

```prisma
model UnidadMedida {
  id         Int      @id @default(autoincrement())
  nombre     String   @unique
  activo     Boolean  @default(true)
  created_at DateTime @default(now())
  update_at  DateTime @updatedAt
}
```

Cambios al modelo `Insumo`:
- `unidad_medida` cambia de tipo `Unidad_medida` (enum) a `String`.
- Se elimina el enum `Unidad_medida` del schema (ya no se usa en ningún otro modelo).

Aplicar con `npx prisma db push` (el proyecto no usa `prisma migrate`, solo `db push` + `generate`; no hay carpeta de migraciones activa, solo `migration_lock.toml`).

Nota de compatibilidad: el `ALTER COLUMN` de enum a texto conserva los valores actuales tal cual (los labels del enum ya son el texto: `"KG"`, `"GR"`, etc.), por lo que los datos existentes no se pierden ni cambian.

## 2. Seed de unidades existentes

En `prisma/seed.ts` (patrón ya idempotente vía `upsert`), agregar un bloque que haga upsert de las 5 unidades actuales como filas del catálogo:

```ts
const unidadesBase = ['KG', 'GR', 'UNIDAD', 'LT', 'ML']
for (const nombre of unidadesBase) {
  await prisma.unidadMedida.upsert({
    where: { nombre },
    update: {},
    create: { nombre },
  })
}
```

Esto asegura que el selector no arranque vacío y que los insumos existentes sigan mostrando una unidad reconocible en el catálogo.

## 3. API — nuevos endpoints

Sigue el mismo patrón que `app/api/categoria/route.ts` (guard de rol, sin capas extra innecesarias).

### `app/api/unidades-medida/route.ts`
- `GET`: lista unidades. Soporta `?activo=true` para filtrar solo activas (usado por el selector del modal de insumo). Sin guard (lectura pública dentro del panel admin, igual que `/api/categoria` GET).
- `POST` (guard `ADMIN`): crea `{ nombre }`.
  - Valida `nombre` no vacío.
  - Rechaza duplicados case-insensitive (comparar contra nombres existentes antes de crear) con 409.

### `app/api/unidades-medida/[id]/route.ts`
- `PUT` (guard `ADMIN`): actualiza `nombre` y/o `activo`. Misma validación de duplicado case-insensitive si cambia `nombre`.
- `DELETE` (guard `ADMIN`): antes de eliminar, cuenta `prisma.insumo.count({ where: { unidad_medida: unidad.nombre, activo: true } })`. Si es mayor a 0, responde 409 (`ConflictError`, mismo patrón que `DELETE /api/insumo/[id]`) indicando que está en uso y sugiriendo desactivar en vez de eliminar.

## 4. Frontend (`components/admin/AdminInsumos.tsx`)

- Nuevo tipo de tab: `Tab = 'insumos' | 'movimientos' | 'recetas' | 'unidades'`.
- Nuevo estado: `unidades: UnidadMedida[]`, cargado en el mismo `Promise.all` de `load()` vía `apiClient.get('/api/unidades-medida')`.
- El `<select>` de "Unidad" en los modales de crear/editar insumo reemplaza el arreglo fijo `UNITS` por `unidades.filter(u => u.activo)`.
- Junto al `<select>`, un botón "+ Nueva" abre un mini-modal superpuesto (overlay con z-index mayor al modal de insumo) con un solo campo `nombre`. Al guardar:
  - `POST /api/unidades-medida`
  - refresca la lista de `unidades`
  - autoselecciona la unidad recién creada en el formulario de insumo activo
  - cierra el mini-modal sin cerrar el modal de insumo
- Nueva pestaña "Unidades": tabla con columnas Nombre, Estado (activo/inactivo), Acciones (editar, activar/desactivar, eliminar). Reutiliza el modal genérico existente (`admin-modal`) para crear/editar, con un formulario de un solo campo (`nombre`) más el toggle de `activo` en edición.
- Manejo de errores: reutilizar `errorMsg()` existente para mostrar mensajes de 401/403/409 de forma consistente con el resto del módulo.

## 5. Validaciones y bordes

- Nombre de unidad: requerido, trim, sin duplicados case-insensitive.
- Desactivar (`activo=false`) saca la unidad del selector para insumos nuevos; no afecta insumos existentes que ya la usan (siguen mostrando el texto guardado).
- Eliminar (hard delete) solo permitido si ningún insumo activo usa esa unidad; si no, el usuario debe desactivarla en su lugar.

## Fuera de alcance

- Conversión/factor entre unidades (ej. 1 caja = 24 unidades).
- Migración retroactiva de nombre en insumos existentes cuando se renombra una unidad del catálogo.
- Cambios a los ~18 archivos que ya consumen `insumo.unidad_medida` como string (recetas, movimientos, insumos mixtos, productos reventa, dashboard, reportes, alertas WhatsApp) — no requieren cambios porque el campo sigue siendo `String`.
