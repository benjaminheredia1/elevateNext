# FASE 5 · A — Schema de inventario avanzado

> Extiende inventario/productos para paridad con el zip. Depende de Fase 0.
> Ref: `docs/MODULO_INVENTARIO.md` §B, `docs/BASE_DE_DATOS.md`.
> (Equivale a la antigua "Fase 0" del MODULO_INVENTARIO.)

## PASO 1 — Enums
```prisma
enum ProductoTipo { ELABORADO REVENTA }
enum EstadoPublicacion { BORRADOR PUBLICADO ARCHIVADO }
```
Y extender `Tipo_movimiento` con: `VENTA`, `MERMA`, `AJUSTE` (mantener
INGRESO/EGRESO/PRODUCCION).

## PASO 2 — Extender `Insumo`
Agregar: `punto_critico Float @default(0)`, `categoria_insumo String?`,
`rendimiento Float?` (yield de insumos mixtos/sub-recetas), `proveedor String?`,
`proveedor_telefono String?`, `uso_diario_promedio Float?`, y la relación inversa
`productos_reventa Producto[] @relation("InsumoReventa")`.

## PASO 3 — Extender `MovimientoInterno`
Agregar: `costo_unitario Float?`, `responsable String?`, `transaccion_id Int?` +
relación `transaccion Transaccion? @relation(fields:[transaccion_id], references:[id])`.
En `Transaccion` agregar la inversa `movimientos_internos MovimientoInterno[]`.

## PASO 4 — Extender `Producto`
Agregar: `tipo ProductoTipo @default(ELABORADO)`, `estado_publicacion
EstadoPublicacion @default(BORRADOR)`, `insumo_reventa_id Int?` + relación
`insumo_reventa Insumo? @relation("InsumoReventa", fields:[insumo_reventa_id],
references:[id])`, `ventas_acumuladas Int @default(0)`, `calorias Int?`,
`proteina String?`, y `marcas ProductoMarca[]`.

## PASO 5 — Modelos nuevos (al final)
```prisma
model Marca {
  id         Int             @id @default(autoincrement())
  key        String          @unique // "elevate" | "fitbull"
  nombre     String
  color      String?
  productos  ProductoMarca[]
  created_at DateTime        @default(now())
  update_at  DateTime        @updatedAt
}
model ProductoMarca {
  id          Int      @id @default(autoincrement())
  producto_id Int
  marca_id    Int
  producto    Producto @relation(fields: [producto_id], references: [id], onDelete: Cascade)
  marca       Marca    @relation(fields: [marca_id], references: [id], onDelete: Cascade)
  @@unique([producto_id, marca_id])
}
model ConfiguracionAlertas {
  id                   Int      @id @default(1)
  whatsapp_habilitado  Boolean  @default(false)
  destinatarios        String[] @default([])
  hora_silencio_desde  String   @default("22:00")
  hora_silencio_hasta  String   @default("07:00")
  intervalo_minimo_min Int      @default(60)
  plantilla_mensaje    String   @default("Elevate - Alerta de inventario: {count} insumos bajo umbral.\n{list}")
  created_at           DateTime @default(now())
  update_at            DateTime @updatedAt
}
model RegistroAlerta {
  id         Int      @id @default(autoincrement())
  enviado_at DateTime @default(now())
  canal      String   @default("whatsapp")
  insumo_ids Int[]    @default([])
  estado     String   // sent | failed | simulated
  preview    String
}
```

## PASO 6 — Migrar + seed
`npx prisma format && npx prisma validate && npx prisma migrate dev --name fase5_inventario`.
Seed: sembrar marcas `elevate` y `fitbull` (upsert por `key`). Asociar productos
existentes a marca por defecto si aplica.

## Criterios de aceptación
- [ ] `validate` ok; migración aplicada.
- [ ] Marcas elevate/fitbull sembradas.
- [ ] Tablas Marca, ProductoMarca, ConfiguracionAlertas, RegistroAlerta presentes.

> Sigue 5B (backend de inventario). Decisión de diseño: sub-recetas se modelan con
> `Insumo.es_mixto` + `InsumoMixtoDetalle` + `rendimiento` (no tabla nueva).
