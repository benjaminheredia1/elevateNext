# FASE 3 · C — Gastos Fijos + Dashboard ejecutivo

> Depende de 3A (helpers de rango) y Fase 0. Ref: `docs/MODULO_ADMINISTRADOR.md`
> §3.1, §3.6, `docs/BASE_DE_DATOS.md` §4.3.

## Parte 1 — Gastos Fijos (CRUD)

### Schema (si no existe aún) — `prisma/schema.prisma`
Agregar (ver `docs/BASE_DE_DATOS.md` §4.3):
```prisma
enum Frecuencia { MENSUAL QUINCENAL SEMANAL ANUAL }

model GastoFijo {
  id            Int        @id @default(autoincrement())
  concepto      String
  categoria     String
  monto         Decimal    @db.Decimal(12, 2)
  frecuencia    Frecuencia @default(MENSUAL)
  activo        Boolean    @default(true)
  creado_por_id Int
  created_at    DateTime   @default(now())
  update_at     DateTime   @updatedAt
}
```
Migrar: `npx prisma migrate dev --name fase3_gastos_fijos`.

### Backend
- `lib/server/finanzas/gastos-fijos.service.ts`: CRUD + cálculo de **equivalente
  mensual** (normalizar por frecuencia: semanal×4.33, quincenal×2, anual÷12) y
  **equivalente diario** (mensual÷30).
- Endpoints `GET/POST/PUT/DELETE /api/admin/gastos-fijos` (rol DUENO/ADMIN; DELETE =
  soft con `activo:false`). DTO Zod. Auditar create/update/delete.

### Front: `app/admin/gastos-fijos/page.tsx`
KpiCards (Total mensual [destacado], Equivalente diario). Tabla (concepto, categoría,
frecuencia, monto, equiv./mes). Modal alta/edición (`FormModal`). `EmptyState`.

## Parte 2 — Dashboard ejecutivo

### Backend: `app/api/admin/dashboard/route.ts`
`GET ?sucursal=&fecha=` → KPIs del día: ganancia, ventas, # pedidos, ticket promedio;
más vendidos hoy; alertas de inventario (insumos críticos/bajos); contabilidad de hoy
(ingresos, CMV, otros gastos, utilidad); estado del turno de caja activo.
Calcular desde `Transaccion`/`MovimientoCaja`/`Insumo`. Rol DUENO/ADMIN.

### Front: `app/admin/page.tsx` (enriquecer el dashboard actual)
- KpiCards (Ganancia hoy [destacada], Ventas, Pedidos, Ticket promedio).
- Paneles: Más vendidos hoy, Alertas de inventario, Contabilidad de hoy.
- Indicador de turno de caja (abierto/cerrado).
- Conservar gráfico de pedidos por hora y tabla de pedidos recientes existentes.

## Criterios de aceptación
- [ ] Gastos fijos: CRUD + equivalente mensual/diario correctos; soft delete.
- [ ] Dashboard muestra KPIs reales del día y alertas de inventario.
- [ ] Todo auditado donde hay mutación; rol validado en servidor.

> Con esto **cierra la Fase 3** (finanzas del administrador).
