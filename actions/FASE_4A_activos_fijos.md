# FASE 4 · A — Activos Fijos

> Módulo independiente (paralelizable). Depende solo de Fase 0. Rol DUENO/ADMIN.
> Ref: `docs/MODULO_ADMINISTRADOR.md` §3.7, `docs/BASE_DE_DATOS.md` §4.4.

## PASO 1 — Schema
Agregar (si no existe) y migrar `npx prisma migrate dev --name fase4_activos_fijos`:
```prisma
model ActivoFijo {
  id               Int       @id @default(autoincrement())
  nombre           String
  categoria        String    // Refrigeración, Mobiliario, Tecnología, Vehículos, Equipos de cocina, Otros
  fecha_compra     DateTime
  valor_original   Decimal   @db.Decimal(12, 2)
  valor_actual     Decimal   @db.Decimal(12, 2)
  depreciacion_pct Decimal?  @db.Decimal(5, 2)
  notas            String?
  activo           Boolean   @default(true)
  creado_por_id    Int
  created_at       DateTime  @default(now())
  update_at        DateTime  @updatedAt
}
```

## PASO 2 — Backend
- `lib/server/admin/activos.service.ts`: CRUD + agregados (valor total original/actual,
  por categoría). DELETE = soft (`activo:false`).
- DTO Zod (`nombre`, `categoria`, `fecha_compra`, `valor_original≥0`,
  `valor_actual≥0`, `depreciacion_pct?`, `notas?`).
- Endpoints `GET/POST/PUT/DELETE /api/admin/activos-fijos` (rol DUENO/ADMIN). Auditar.

## PASO 3 — Front: `app/admin/activos-fijos/page.tsx`
- KpiCards por categoría (Equipos de cocina, Refrigeración, Mobiliario, Tecnología,
  Vehículos, Otros) + total (valor original/actual).
- Tabla (activo, categoría, fecha compra, depreciación, valor original, valor actual).
- Modal alta/edición (`FormModal`). Búsqueda. Export Excel. `EmptyState`.
- Agregar el item "Activos Fijos" al grupo ADMINISTRACIÓN del sidebar admin.

## Criterios de aceptación
- [ ] CRUD funcional; totales por categoría correctos.
- [ ] Soft delete; auditoría en mutaciones; rol validado en servidor.
- [ ] CAJERO/CLIENTE → 403.
