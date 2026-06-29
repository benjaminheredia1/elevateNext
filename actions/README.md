# actions/ — Plan de ejecución por tandas

Cada archivo es una **tanda autocontenida** lista para delegar a un agente. Se
ejecutan **en orden** (respetando dependencias). Contexto y contratos están en
`../docs/`. Convenciones de código ya establecidas en las Fases 0–1 (RBAC,
`requireAuth`/`requireRole`, `logAudit`, `handleApiError`, DTOs Zod, servicios con
`$transaction`).

## Estado y orden

| # | Tanda | Estado | Depende de |
|---|-------|--------|-----------|
| 0 | Fase 0 · A (schema RBAC/Sucursal/Auditoría) | ✅ hecho | — |
| 0 | Fase 0 · B (autorización + login por rol) | ✅ hecho | 0A |
| 1 | Fase 1 · A (schema caja) | ✅ hecho | 0 |
| 1 | Fase 1 · B (servicios + endpoints caja) | ✅ hecho (en `../action.md`) | 1A |
| 1 | [Fase 1 · C — venta física (POS) backend](FASE_1C_venta_fisica.md) | ⬜ | 1B |
| 2 | [Fase 2 · A — layout cajero + componentes](FASE_2A_caja_layout_componentes.md) | ⬜ | 1C |
| 2 | [Fase 2 · B — pantallas operación caja](FASE_2B_caja_pantallas_operacion.md) | ⬜ | 2A |
| 2 | [Fase 2 · C — venta, cierre, historial](FASE_2C_caja_venta_cierre_historial.md) | ⬜ | 2B |
| 3 | [Fase 3 · A — backend finanzas](FASE_3A_backend_finanzas.md) | ⬜ | 1 |
| 3 | [Fase 3 · B — front contabilidad + flujo](FASE_3B_front_contabilidad_flujo.md) | ⬜ | 3A |
| 3 | [Fase 3 · C — gastos fijos + dashboard](FASE_3C_gastos_fijos_dashboard.md) | ⬜ | 3A |
| 4 | [Fase 4 · A — activos fijos](FASE_4A_activos_fijos.md) | ⬜ | 0 |
| 4 | [Fase 4 · B — cuentas por cobrar/pagar](FASE_4B_cuentas_cobrar_pagar.md) | ⬜ | 0 |
| 4 | [Fase 4 · C — clientes + usuarios + auditoría (UI)](FASE_4C_clientes_usuarios_auditoria.md) | ✅ hecho | 0 |
| 5 | [Fase 5 · A — schema inventario](FASE_5A_schema_inventario.md) | ✅ hecho | 0 |
| 5 | [Fase 5 · B — backend inventario](FASE_5B_backend_inventario.md) | ✅ hecho | 5A |
| 5 | [Fase 5 · C — front inventario + analítica](FASE_5C_front_inventario_analytics.md) | ✅ hecho | 5B |
| 6 | [Fase 6 · A — integraciones](FASE_6A_integraciones.md) | ⬜ | 5 |
| 6 | [Fase 6 · B — hardening de seguridad](FASE_6B_hardening.md) | ⬜ | todas |
| 6 | [Fase 6 · C — deploy](FASE_6C_deploy.md) | ⬜ | 6B |

## Reglas para el agente ejecutor
- Aplicar EXACTAMENTE lo descrito; no inventar campos ni rutas.
- Tras cada tanda: `npm run dev` debe compilar sin errores de TypeScript.
- Reutilizar componentes/servicios existentes antes de crear nuevos.
- Toda mutación sensible audita (`logAudit`) y valida rol en el servidor.
- Reportar al terminar: qué se creó/editó, salida de pruebas, y cualquier error.

## Paralelización
- Las Fases **4A, 4B, 4C** y **5A** son independientes entre sí (sobre la base de la
  Fase 0) → se pueden repartir a agentes distintos en ramas separadas.
- Las cadenas verticales (2A→2B→2C, 5A→5B→5C) van con **un mismo agente** en orden.
- El schema (`prisma/schema.prisma`) lo toca **un agente a la vez** para evitar
  conflictos de migración.
